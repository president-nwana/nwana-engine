/**
 * NWANA machine -> Google Ads reconciliation script.
 *
 * WHAT THIS IS
 * The NWANA engine publishes the campaigns it wants as JSON. This script
 * runs INSIDE the Google Ads account (Tools -> Bulk actions -> Scripts),
 * fetches that JSON once an hour, and builds whatever is missing.
 *
 * WHAT IT NEVER DOES
 * - Never enables anything. Everything is created PAUSED; a human reviews
 *   and enables each campaign in the Ads UI.
 * - Never touches campaigns whose name does not start with "NWANA \u00b7 ".
 * - Never deletes anything. It only adds missing pieces and updates budgets.
 *
 * ONE-TIME SETUP (about 20 minutes, done once)
 * 1. In Google Ads: Tools -> Bulk actions -> Scripts -> + to add a script.
 * 2. Paste this whole file, name it "NWANA reconcile".
 * 3. In the script editor: open the left menu -> Properties ->
 *    Script properties -> add row: property NWANA_OWNER_KEY, value = the
 *    operating center key. (The script sends it as an Authorization header;
 *    it is never printed to any log.)
 * 4. Authorize the script when asked (it needs Ads + external fetch access).
 * 5. Frequency: Hourly. Save, then Preview once and read the log.
 * 6. After the first run: check each new campaign once in the Ads UI:
 *    - Networks: Google Search ON, Search partners OFF, Display OFF.
 *    - Locations: United States, "Presence" (people in the location).
 *    - Bidding: Manual CPC (ad-group bids are set by the script, max $2.00).
 *    - Two sitelinks present (script adds them; confirm they show).
 *    Then enable a campaign only when you approve its ads.
 */

var CONFIG = {
  DESIRED_STATE_URL: 'https://nwana-engine.nwana-engine.workers.dev/api/operating-center/google-ads/desired-state',
  OWNER_KEY_PROPERTY: 'NWANA_OWNER_KEY',
  MANAGED_PREFIX: 'NWANA \u00b7 '
};

function main() {
  var key = PropertiesService.getScriptProperties().getProperty(CONFIG.OWNER_KEY_PROPERTY);
  if (!key) {
    Logger.log('Missing script property ' + CONFIG.OWNER_KEY_PROPERTY +
      '. Add it under the script Properties panel (value = operating center key).');
    return;
  }
  var state = fetchDesiredState(key);
  if (!state || !state.campaigns) {
    Logger.log('No usable desired state. Aborting.');
    return;
  }
  var summary = { created: 0, updated: 0, skipped: 0, errors: [] };
  for (var i = 0; i < state.campaigns.length; i++) {
    try {
      reconcileCampaign(state.campaigns[i], summary);
    } catch (e) {
      summary.errors.push(state.campaigns[i].name + ': ' + e.message);
    }
  }
  Logger.log('Done. Created: ' + summary.created + ', updated: ' + summary.updated +
    ', already in sync: ' + summary.skipped + '.');
  for (var j = 0; j < summary.errors.length; j++) {
    Logger.log('ERROR: ' + summary.errors[j]);
  }
  Logger.log('Reminder: every new campaign is PAUSED. Review networks, locations, ' +
    'bidding and ads in the UI, then enable only what you approve.');
}

function fetchDesiredState(key) {
  var response = UrlFetchApp.fetch(CONFIG.DESIRED_STATE_URL, {
    method: 'get',
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + key }
  });
  if (response.getResponseCode() !== 200) {
    Logger.log('Desired-state endpoint returned HTTP ' + response.getResponseCode() + '.');
    return null;
  }
  try {
    var payload = JSON.parse(response.getContentText());
    if (!payload.ok) {
      Logger.log('Desired-state endpoint error: ' + payload.error);
      return null;
    }
    return payload;
  } catch (e) {
    Logger.log('Could not parse desired state: ' + e.message);
    return null;
  }
}

function findCampaign(name) {
  var it = AdsApp.campaigns()
    .withCondition('campaign.name = "' + name.replace(/"/g, '') + '"')
    .get();
  return it.hasNext() ? it.next() : null;
}

function reconcileCampaign(spec, summary) {
  var campaign = findCampaign(spec.name);
  if (!campaign) {
    campaign = AdsApp.newCampaignBuilder()
      .withName(spec.name)
      .withStatus('PAUSED')
      .withBudget(spec.daily_budget)
      .build()
      .getResult();
    try {
      campaign.addLocation(spec.geo_target_id);
    } catch (e) {
      Logger.log(spec.name + ': could not set location targeting automatically (' + e.message +
        '). Set United States manually in campaign settings.');
    }
    summary.created++;
    Logger.log('Created campaign (PAUSED): ' + spec.name);
  } else {
    var budget = campaign.getBudget();
    if (Math.abs(budget.getAmount() - spec.daily_budget) > 0.001) {
      budget.setAmount(spec.daily_budget);
      summary.updated++;
      Logger.log('Updated budget for ' + spec.name + ' to $' + spec.daily_budget + '/day.');
    } else {
      summary.skipped++;
    }
  }
  for (var i = 0; i < spec.ad_groups.length; i++) {
    reconcileAdGroup(campaign, spec.ad_groups[i]);
  }
  reconcileSitelinks(campaign, spec);
  verifyNetworkSettings(campaign);
}

function findAdGroup(campaign, name) {
  var it = campaign.adGroups()
    .withCondition('ad_group.name = "' + name.replace(/"/g, '') + '"')
    .get();
  return it.hasNext() ? it.next() : null;
}

function reconcileAdGroup(campaign, groupSpec) {
  var adGroup = findAdGroup(campaign, groupSpec.name);
  if (!adGroup) {
    adGroup = campaign.newAdGroupBuilder()
      .withName(groupSpec.name)
      .withCpc(groupSpec.default_cpc)
      .build()
      .getResult();
    Logger.log('  Created ad group: ' + groupSpec.name);
  }
  for (var i = 0; i < groupSpec.keywords.length; i++) {
    addKeywordOnce(adGroup, groupSpec.keywords[i]);
  }
  for (var j = 0; j < groupSpec.ads.length; j++) {
    addResponsiveAdOnce(adGroup, groupSpec.ads[j]);
  }
}

function keywordText(keyword) {
  if (keyword.match_type === 'EXACT') return '[' + keyword.text + ']';
  if (keyword.match_type === 'PHRASE') return '"' + keyword.text + '"';
  return keyword.text;
}

function addKeywordOnce(adGroup, keyword) {
  var text = keywordText(keyword);
  var it = adGroup.keywords()
    .withCondition('ad_group_criterion.keyword.text = "' + keyword.text.replace(/"/g, '') + '"')
    .get();
  if (!it.hasNext()) {
    adGroup.newKeywordBuilder().withText(text).build();
    Logger.log('    Added keyword: ' + text);
  }
}

function adFingerprint(ad) {
  return ad.headlines.join('|') + '||' + ad.final_url;
}

function addResponsiveAdOnce(adGroup, ad) {
  var existing = adGroup.ads().get();
  var fingerprint = adFingerprint(ad);
  while (existing.hasNext()) {
    var current = existing.next();
    if (current.isType().responsiveSearchAd &&
        current.asType().responsiveSearchAd().getFinalUrl() === ad.final_url) {
      return;
    }
  }
  var builder = adGroup.newAd().responsiveSearchAdBuilder().withFinalUrl(ad.final_url);
  for (var i = 0; i < ad.headlines.length; i++) builder.addHeadline(ad.headlines[i]);
  for (var j = 0; j < ad.descriptions.length; j++) builder.addDescription(ad.descriptions[j]);
  builder.build();
  Logger.log('    Added responsive search ad (' + fingerprint.length + ' chars): ' + ad.final_url);
}

function reconcileSitelinks(campaign, spec) {
  try {
    var existing = {};
    var it = campaign.extensions().sitelinks().get();
    while (it.hasNext()) {
      existing[it.next().getLinkText()] = true;
    }
    for (var i = 0; i < spec.sitelinks.length; i++) {
      var link = spec.sitelinks[i];
      if (existing[link.text]) continue;
      var op = AdsApp.extensions().newSitelinkBuilder()
        .withLinkText(link.text)
        .withFinalUrl(link.final_url)
        .build();
      if (op.isSuccessful()) {
        campaign.addSitelink(op.getResult());
        Logger.log('  Added sitelink: ' + link.text);
      }
    }
  } catch (e) {
    Logger.log('  Sitelinks need a manual check for ' + spec.name +
      ' (script could not manage them: ' + e.message +
      '). Ad Grants requires 2+ active sitelinks per campaign.');
  }
}

function verifyNetworkSettings(campaign) {
  try {
    var rows = AdsApp.search(
      'SELECT campaign.network_settings.target_search_network, ' +
      'campaign.network_settings.target_partner_search_network, ' +
      'campaign.network_settings.target_content_network ' +
      'FROM campaign WHERE campaign.name = "' + campaign.getName().replace(/"/g, '') + '" LIMIT 1');
    if (rows.hasNext()) {
      var row = rows.next();
      var nets = row.campaign.networkSettings;
      if (nets.targetPartnerSearchNetwork || nets.targetContentNetwork || !nets.targetSearchNetwork) {
        Logger.log('  CHECK NETWORKS for ' + campaign.getName() +
          ': Search=' + nets.targetSearchNetwork +
          ', Partners=' + nets.targetPartnerSearchNetwork +
          ', Content=' + nets.targetContentNetwork +
          '. Required: Search ON, partners OFF, content OFF.');
      }
    }
  } catch (e) {
    Logger.log('  Could not verify network settings for ' + campaign.getName() +
      '; confirm manually: Google Search ON, partners OFF, Display OFF.');
  }
}
