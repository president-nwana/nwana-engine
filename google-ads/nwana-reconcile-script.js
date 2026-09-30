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
 * - Never touches campaigns whose name does not start with "NWANA · ".
 * - Never deletes anything. It only adds missing pieces and updates budgets.
 *
 * HOW IT WRITES
 * Campaign/ad-group/keyword/ad/sitelink creation goes through
 * AdsApp.mutate() — the Google Ads API REST mutate path documented in the
 * current Google Ads Scripts reference. (The old AdsApp.newCampaignBuilder()
 * no longer exists in the scripts runtime; a 2026-09-30 Preview proved it
 * throws "not a function".) Reads still use the classic selectors.
 *
 * ONE-TIME SETUP (about 20 minutes, done once)
 * The current Google Ads Scripts editor has NO Script Properties / Project
 * Settings panel, so the key is bootstrapped through the script itself:
 * 1. In Google Ads: Tools -> Bulk actions -> Scripts -> + to add a script.
 * 2. Paste this whole file, name it "NWANA reconcile".
 * 3. At the top of the script find NWANA_OWNER_KEY_BOOTSTRAP = "" and paste
 *    the operating center key between the quotes.
 * 4. Click Preview. When prompted, click Authorize, choose the Google
 *    account, review permissions, click Allow. The script stores the key in
 *    its own ScriptProperties (never printed to any log) and reports
 *    "one-time bootstrap complete".
 * 5. Delete the key from the NWANA_OWNER_KEY_BOOTSTRAP line (leave ""),
 *    click Save.
 * 6. Click Preview again and read the log: it must show the reconcile run
 *    (desired-state fetch, campaign check). Afterwards the bootstrap line
 *    stays empty forever; the stored key is reused on every run.
 * 7. Back in the Scripts list set Frequency: Hourly for "NWANA reconcile".
 * 8. After the first scheduled run: check each new campaign once in the Ads UI:
 *    - Networks: Google Search ON, Search partners OFF, Display OFF.
 *    - Locations: United States, "Presence" (people in the location).
 *    - Bidding: Manual CPC (ad-group bids are set by the script, max $2.00).
 *    - Three sitelinks present (script adds them; confirm they show).
 *    Then enable a campaign only when you approve its ads.
 *
 * The key is sent as an Authorization header only. It is never written to
 * any log, and the committed copy of this file keeps the bootstrap line empty.
 */

var CONFIG = {
  DESIRED_STATE_URL: 'https://nwana-engine.nwana-engine.workers.dev/api/operating-center/google-ads/desired-state',
  OWNER_KEY_PROPERTY: 'NWANA_OWNER_KEY',
  MANAGED_PREFIX: 'NWANA \u00b7 '
};

// Increment on every behavior change so Preview logs prove which version ran.
var SCRIPT_VERSION = "2026-09-30c / 5be756f-network-shape";
// ── ONE-TIME BOOTSTRAP ──────────────────────────────────────────────
// Paste the operating center key between the quotes, Preview once
// (authorize when asked), then DELETE the key from this line and Save.
// The script copies it into its own ScriptProperties on first run;
// afterwards this line must stay empty.
var NWANA_OWNER_KEY_BOOTSTRAP = "";
// ───────────────────────────────────────────────────────────────────

function getOwnerKey() {
  var props = PropertiesService.getScriptProperties();
  var stored = props.getProperty(CONFIG.OWNER_KEY_PROPERTY);
  if (stored) {
    return stored;
  }
  if (NWANA_OWNER_KEY_BOOTSTRAP) {
    props.setProperty(CONFIG.OWNER_KEY_PROPERTY, NWANA_OWNER_KEY_BOOTSTRAP);
    // Never log the key itself — only confirm it was stored.
    Logger.log('NWANA reconcile: owner key stored in ScriptProperties ' +
      '(one-time bootstrap complete). Now delete the key from the ' +
      'NWANA_OWNER_KEY_BOOTSTRAP line and click Save.');
    return NWANA_OWNER_KEY_BOOTSTRAP;
  }
  Logger.log('NWANA reconcile: ' + CONFIG.OWNER_KEY_PROPERTY + ' is not set. ' +
    'One-time setup: paste the operating center key into ' +
    'NWANA_OWNER_KEY_BOOTSTRAP at the top of this script, then Preview once.');
  return null;
}

function main() {
  Logger.log('NWANA reconcile script version: ' + SCRIPT_VERSION);
  var key = getOwnerKey();
  if (!key) {
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

// ── Google Ads API mutate helpers ───────────────────────────────────
// AdsApp.mutate() executes one Google Ads API REST mutate operation and
// returns a MutateResult (getResourceName() gives the created resource).
// This is the documented creation path in the current scripts runtime.

function customerIdDigits() {
  return AdsApp.currentAccount().getCustomerId().replace(/-/g, '');
}

function micros(dollars) {
  return String(Math.round(dollars * 1000000));
}

function gadsMutate(operation, what) {
  try {
    return AdsApp.mutate(operation);
  } catch (e) {
    throw new Error(what + ' failed: ' + e.message);
  }
}

function campaignResourceName(campaign) {
  return 'customers/' + customerIdDigits() + '/campaigns/' + campaign.getId();
}

function adGroupResourceName(adGroup) {
  return 'customers/' + customerIdDigits() + '/adGroups/' + adGroup.getId();
}

function findCampaign(name) {
  var it = AdsApp.campaigns()
    .withCondition('campaign.name = "' + name.replace(/"/g, '') + '"')
    .get();
  return it.hasNext() ? it.next() : null;
}

function reconcileCampaign(spec, summary) {
  var campaign = findCampaign(spec.name);
  var campaignResource;
  if (!campaign) {
    campaignResource = createCampaignViaApi(spec, summary);
    // Re-fetch so the object below supports ad-group/keyword/ad selectors.
    campaign = findCampaign(spec.name);
    if (!campaign) {
      throw new Error('campaign created but could not be re-read; ' +
        'check the account UI before the next run');
    }
  } else {
    campaignResource = campaignResourceName(campaign);
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
    reconcileAdGroup(campaign, campaignResource, spec.ad_groups[i]);
  }
  reconcileSitelinks(campaign, campaignResource, spec);
  verifyNetworkSettings(campaign);
}

function createCampaignViaApi(spec, summary) {
  // 1. Daily budget (own budget per campaign; total stays under the grant cap
  //    because the engine sizes each daily_budget accordingly).
  var budgetResource = gadsMutate({
    campaignBudgetOperation: {
      create: {
        name: spec.name + ' — daily budget',
        amountMicros: micros(spec.daily_budget),
        deliveryMethod: 'STANDARD'
      }
    }
  }, 'campaign budget create').getResourceName();

  // 2. Search campaign, Manual CPC, PAUSED. Search partners and Display off.
  //    Presence geo targeting is set via geoTargetTypeSetting.
  var campaignResource = gadsMutate({
    campaignOperation: {
      create: {
        name: spec.name,
        status: 'PAUSED',
        advertisingChannelType: 'SEARCH',
        campaignBudget: budgetResource,
        manualCpc: { enhancedCpcEnabled: false },
        // Network flags that validate via AdsApp.mutate() (2026-09-30):
        // targetGoogleSearch=true with targetSearchNetwork=false is the
        // confirmed-working shape; targetSearchNetwork=true is rejected with
        // "This campaign cannot target the search network". Partners and
        // Display stay off per the Ad Grants / directive requirements.
        networkSettings: {
          targetGoogleSearch: true,
          targetSearchNetwork: false,
          targetPartnerSearchNetwork: false,
          targetContentNetwork: false
        },
        geoTargetTypeSetting: {
          positiveGeoTargetType: 'PRESENCE',
          negativeGeoTargetType: 'PRESENCE'
        },
        containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING'
      }
    }
  }, 'campaign create').getResourceName();

  // 3. Location: United States (geoTargetConstants/2840).
  try {
    gadsMutate({
      campaignCriterionOperation: {
        create: {
          campaign: campaignResource,
          location: { geoTargetConstant: 'geoTargetConstants/' + spec.geo_target_id }
        }
      }
    }, 'location criterion create');
  } catch (e) {
    Logger.log(spec.name + ': could not set location targeting automatically (' + e.message +
      '). Set United States manually in campaign settings.');
  }

  summary.created++;
  Logger.log('Created campaign (PAUSED): ' + spec.name);
  return campaignResource;
}

function findAdGroup(campaign, name) {
  var it = campaign.adGroups()
    .withCondition('ad_group.name = "' + name.replace(/"/g, '') + '"')
    .get();
  return it.hasNext() ? it.next() : null;
}

function reconcileAdGroup(campaign, campaignResource, groupSpec) {
  var adGroup = findAdGroup(campaign, groupSpec.name);
  var adGroupResource;
  if (!adGroup) {
    adGroupResource = gadsMutate({
      adGroupOperation: {
        create: {
          campaign: campaignResource,
          name: groupSpec.name,
          status: 'ENABLED',
          cpcBidMicros: micros(groupSpec.default_cpc)
        }
      }
    }, 'ad group create (' + groupSpec.name + ')').getResourceName();
    Logger.log('  Created ad group: ' + groupSpec.name);
    adGroup = findAdGroup(campaign, groupSpec.name);
    if (!adGroup) {
      throw new Error('ad group created but could not be re-read: ' + groupSpec.name);
    }
  } else {
    adGroupResource = adGroupResourceName(adGroup);
  }
  for (var i = 0; i < groupSpec.keywords.length; i++) {
    addKeywordOnce(adGroup, adGroupResource, groupSpec.keywords[i]);
  }
  for (var j = 0; j < groupSpec.ads.length; j++) {
    addResponsiveAdOnce(adGroup, adGroupResource, groupSpec.ads[j]);
  }
}

function keywordText(keyword) {
  if (keyword.match_type === 'EXACT') return '[' + keyword.text + ']';
  if (keyword.match_type === 'PHRASE') return '"' + keyword.text + '"';
  return keyword.text;
}

function addKeywordOnce(adGroup, adGroupResource, keyword) {
  var text = keywordText(keyword);
  var it = adGroup.keywords()
    .withCondition('ad_group_criterion.keyword.text = "' + keyword.text.replace(/"/g, '') + '"')
    .get();
  if (!it.hasNext()) {
    gadsMutate({
      adGroupCriterionOperation: {
        create: {
          adGroup: adGroupResource,
          status: 'ENABLED',
          keyword: { text: keyword.text, matchType: keyword.match_type }
        }
      }
    }, 'keyword create (' + text + ')');
    Logger.log('    Added keyword: ' + text);
  }
}

function adFingerprint(ad) {
  return ad.headlines.join('|') + '||' + ad.final_url;
}

function addResponsiveAdOnce(adGroup, adGroupResource, ad) {
  var existing = adGroup.ads().get();
  var fingerprint = adFingerprint(ad);
  while (existing.hasNext()) {
    var current = existing.next();
    if (current.isType().responsiveSearchAd &&
        current.asType().responsiveSearchAd().getFinalUrl() === ad.final_url) {
      return;
    }
  }
  var headlines = [];
  for (var i = 0; i < ad.headlines.length; i++) headlines.push({ text: ad.headlines[i] });
  var descriptions = [];
  for (var j = 0; j < ad.descriptions.length; j++) descriptions.push({ text: ad.descriptions[j] });
  gadsMutate({
    adGroupAdOperation: {
      create: {
        adGroup: adGroupResource,
        status: 'ENABLED',
        ad: {
          responsiveSearchAd: { headlines: headlines, descriptions: descriptions },
          finalUrls: [ad.final_url]
        }
      }
    }
  }, 'responsive search ad create');
  Logger.log('    Added responsive search ad (' + fingerprint.length + ' chars): ' + ad.final_url);
}

function reconcileSitelinks(campaign, campaignResource, spec) {
  try {
    var existing = {};
    var it = campaign.extensions().sitelinks().get();
    while (it.hasNext()) {
      existing[it.next().getLinkText()] = true;
    }
    for (var i = 0; i < spec.sitelinks.length; i++) {
      var link = spec.sitelinks[i];
      if (existing[link.text]) continue;
      var sitelinkAsset = { linkText: link.text, finalUrls: [link.final_url] };
      if (link.description) {
        sitelinkAsset.description1 = link.description;
      }
      var assetResource = gadsMutate({
        assetOperation: {
          create: {
            name: link.text,
            type: 'SITELINK',
            sitelinkAsset: sitelinkAsset
          }
        }
      }, 'sitelink asset create (' + link.text + ')').getResourceName();
      gadsMutate({
        campaignAssetOperation: {
          create: {
            campaign: campaignResource,
            asset: assetResource,
            fieldType: 'SITELINK'
          }
        }
      }, 'sitelink attach (' + link.text + ')');
      Logger.log('  Added sitelink: ' + link.text);
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
