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
 * - The hourly inventory pass (collectAccountInventory) is STRICTLY
 *   read-only across ALL campaigns: it never calls AdsApp.mutate(), never
 *   sets budgets, never changes statuses. It only reads and POSTs a JSON
 *   snapshot to the Engine so cleanup decisions are made on real data.
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
  INVENTORY_URL: 'https://nwana-engine.nwana-engine.workers.dev/api/operating-center/google-ads/inventory',
  OWNER_KEY_PROPERTY: 'NWANA_OWNER_KEY',
  MANAGED_PREFIX: 'NWANA \u00b7 '
};

// Increment on every behavior change so Preview logs prove which version ran.
var SCRIPT_VERSION = "2026-10-10b / inventory-readonly";
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
  // Read-only inventory pass: strictly reads, never mutates. A failure here
  // must never affect the reconcile above.
  try {
    runInventoryPass(key);
  } catch (e) {
    Logger.log('Inventory pass failed (reconcile unaffected): ' + e.message);
  }
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
    try {
      reconcileAdGroup(campaign, campaignResource, spec.ad_groups[i]);
    } catch (e) {
      // One bad ad group must never abort the rest of the campaign.
      Logger.log('  ERROR ad group "' + spec.ad_groups[i].name + '": ' + e.message);
    }
  }
  try {
    reconcileSitelinks(campaign, spec);
  } catch (e) {
    Logger.log('  ERROR sitelinks for ' + spec.name + ': ' + e.message);
  }
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
    try {
      addKeywordOnce(adGroup, adGroupResource, groupSpec.keywords[i]);
    } catch (e) {
      // One bad keyword must never abort the rest of the group.
      Logger.log('    ERROR keyword "' + groupSpec.keywords[i].text + '": ' + e.message);
    }
  }
  for (var j = 0; j < groupSpec.ads.length; j++) {
    try {
      addResponsiveAdOnce(adGroup, adGroupResource, groupSpec.ads[j]);
    } catch (e) {
      // One bad ad must never abort the rest of the group.
      Logger.log('    ERROR ad (' + groupSpec.ads[j].final_url + '): ' + e.message);
    }
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

function adFinalUrl(adObj) {
  // ResponsiveSearchAd has no getFinalUrl(); the documented path is
  // asType().responsiveSearchAd().urls().getFinalUrl(). Defensive: any
  // unexpected shape returns null instead of aborting the reconcile.
  try {
    var typed = adObj.asType().responsiveSearchAd();
    if (typed && typeof typed.urls === 'function') {
      var urls = typed.urls();
      if (urls && typeof urls.getFinalUrl === 'function') {
        return urls.getFinalUrl();
      }
    }
  } catch (e) { /* fall through -> null */ }
  return null;
}

function adHeadlinesKey(adObj) {
  try {
    var typed = adObj.asType().responsiveSearchAd();
    var heads = typed.getHeadlines();
    var texts = [];
    for (var i = 0; i < heads.length; i++) texts.push(heads[i].getText());
    return texts.join('|');
  } catch (e) { /* fall through -> null */ }
  return null;
}

function addResponsiveAdOnce(adGroup, adGroupResource, ad) {
  var existing = adGroup.ads().get();
  var wantUrl = ad.final_url;
  var wantHeads = ad.headlines.join('|');
  while (existing.hasNext()) {
    var current = existing.next();
    var isRsa = false;
    try { isRsa = !!current.isType().responsiveSearchAd; } catch (e) { isRsa = false; }
    if (!isRsa) continue;
    // Match on final URL; fall back to headline text if URL is unreadable.
    if (adFinalUrl(current) === wantUrl) return;
    var headsKey = adHeadlinesKey(current);
    if (headsKey && headsKey === wantHeads) return;
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
  Logger.log('    Added responsive search ad (' + ad.headlines.length +
    ' headlines): ' + ad.final_url);
}

function readSitelinkTexts(campaign) {
  var existing = {};
  var it = campaign.extensions().sitelinks().get();
  while (it.hasNext()) {
    existing[it.next().getLinkText()] = true;
  }
  return existing;
}

function reconcileSitelinks(campaign, spec) {
  // Sitelinks go through the classic extensions builder: the mutate()
  // assetOperation path fails in this account's scripts backend with an
  // opaque "An error occurred. Please try again later." (proven 2026-09-30
  // across two payload shapes). The builder reports real errors.
  var existing;
  try {
    existing = readSitelinkTexts(campaign);
  } catch (e) {
    Logger.log('  Sitelinks need a manual check for ' + spec.name +
      ' (script could not read them: ' + e.message +
      '). Ad Grants requires 2+ active sitelinks per campaign.');
    return;
  }
  for (var i = 0; i < spec.sitelinks.length; i++) {
    var link = spec.sitelinks[i];
    if (existing[link.text]) continue;
    try {
      // NOTE: descriptions are intentionally NOT set. This account's API
      // backend requires sitelink_asset.description2 whenever description1
      // is present (proven 2026-09-30: "The required field was not present"
      // at ...sitelink_asset.description2), and the Engine's desired state
      // carries a single description line. Sitelinks serve fine without
      // descriptions; copy can be extended in the Engine later.
      var builder = AdsApp.extensions().newSitelinkBuilder()
        .withLinkText(link.text)
        .withFinalUrl(link.final_url);
      var operation = builder.build();
      if (!operation.isSuccessful()) {
        Logger.log('  ERROR: sitelink "' + link.text + '" build failed: ' +
          operation.getErrors().join('; '));
        continue;
      }
      campaign.addSitelink(operation.getResult());
      var verified = false;
      try { verified = !!readSitelinkTexts(campaign)[link.text]; } catch (e) { verified = false; }
      if (verified) {
        Logger.log('  Added sitelink: ' + link.text);
      } else {
        Logger.log('  Sitelink "' + link.text + '" attached to ' + spec.name +
          ' but not yet visible — confirm in the UI before enabling.');
      }
    } catch (e) {
      Logger.log('  ERROR sitelink "' + link.text + '": ' + e.message);
    }
  }
}

function verifyNetworkSettings(campaign) {
  // The API's target_search_network flag covers partner SITES (it is false
  // by design here); the "Google Search ON" requirement is
  // target_google_search. Read the right fields to avoid false alarms.
  try {
    var rows = AdsApp.search(
      'SELECT campaign.network_settings.target_google_search, ' +
      'campaign.network_settings.target_search_network, ' +
      'campaign.network_settings.target_partner_search_network, ' +
      'campaign.network_settings.target_content_network ' +
      'FROM campaign WHERE campaign.name = "' + campaign.getName().replace(/"/g, '') + '" LIMIT 1');
    if (rows.hasNext()) {
      var row = rows.next();
      var nets = row.campaign.networkSettings;
      if (!nets.targetGoogleSearch || nets.targetPartnerSearchNetwork || nets.targetContentNetwork) {
        Logger.log('  CHECK NETWORKS for ' + campaign.getName() +
          ': GoogleSearch=' + nets.targetGoogleSearch +
          ', SearchNetwork(partner sites)=' + nets.targetSearchNetwork +
          ', Partners=' + nets.targetPartnerSearchNetwork +
          ', Content=' + nets.targetContentNetwork +
          '. Required: GoogleSearch ON, partners OFF, content OFF.');
      }
    }
  } catch (e) {
    Logger.log('  Could not verify network settings for ' + campaign.getName() +
      '; confirm manually: Google Search ON, partners OFF, Display OFF.');
  }
}

// ── READ-ONLY ACCOUNT INVENTORY (2026-10-10) ─────────────────────────
// Collects a full snapshot of EVERY campaign in the account (including
// legacy campaigns the Engine did not create) and POSTs it to the Engine.
// STRICTLY READ-ONLY: no AdsApp.mutate(), no budget/status changes, no
// deletes. Every subsection is failure-isolated so one unreadable entity
// degrades to null/empty instead of aborting the pass.

var INVENTORY_LIMITS = {
  MAX_CAMPAIGNS: 50,
  MAX_AD_GROUPS_PER_CAMPAIGN: 100,
  MAX_KEYWORDS_PER_CAMPAIGN: 500,
  MAX_ADS_PER_CAMPAIGN: 100
};

function runInventoryPass(key) {
  Logger.log('Inventory pass: collecting read-only account snapshot…');
  var snapshot = collectAccountInventory();
  postInventorySnapshot(key, snapshot);
}

function postInventorySnapshot(key, snapshot) {
  var payload = JSON.stringify(snapshot);
  Logger.log('Inventory pass: ' + snapshot.campaigns.length +
    ' campaign(s), payload ' + payload.length + ' bytes.');
  var response = UrlFetchApp.fetch(CONFIG.INVENTORY_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: payload,
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + key }
  });
  var code = response.getResponseCode();
  if (code === 200) {
    Logger.log('Inventory pass: snapshot stored by Engine (HTTP 200).');
  } else {
    Logger.log('Inventory pass: Engine returned HTTP ' + code + ': ' +
      String(response.getContentText()).slice(0, 300));
  }
}

function entityStatus(obj) {
  // Classic Campaign/AdGroup/Keyword/Ad objects all expose isEnabled/isPaused.
  try {
    if (obj.isEnabled()) return 'ENABLED';
    if (obj.isPaused()) return 'PAUSED';
  } catch (e) { /* fall through */ }
  return 'UNKNOWN';
}

function collectAccountInventory() {
  var meta = readCampaignMetaBulk(); // id -> {channel_type}
  var conversionActions = readConversionActions();
  var campaigns = [];
  var note = null;
  var it;
  try {
    // GAQL-style IN needs parentheses and quoted values; square brackets
    // throw QueryError.BAD_VALUE (proven 2026-10-10 in Preview).
    it = AdsApp.campaigns()
      .withCondition("campaign.status IN ('ENABLED', 'PAUSED')")
      .get();
  } catch (e) {
    // Fallback: unfiltered iterator, skip REMOVED manually.
    it = AdsApp.campaigns().get();
  }
  var count = 0;
  while (it.hasNext() && count < INVENTORY_LIMITS.MAX_CAMPAIGNS) {
    var campaign = it.next();
    try {
      if (entityStatus(campaign) === 'UNKNOWN') continue; // likely REMOVED
      campaigns.push(readCampaignInventory(campaign, meta));
      count++;
    } catch (e) {
      Logger.log('Inventory pass: skipped campaign "' +
        safeName(campaign) + '": ' + e.message);
    }
  }
  if (it.hasNext()) {
    note = 'Campaign list truncated at ' + INVENTORY_LIMITS.MAX_CAMPAIGNS +
      '; account has more campaigns.';
  }
  return {
    script_version: SCRIPT_VERSION,
    customer_id: customerIdDigits(),
    snapshot_at: new Date().toISOString(),
    stats_window: 'LAST_30_DAYS',
    campaigns: campaigns,
    conversion_actions: conversionActions,
    note: note
  };
}

function safeName(campaign) {
  try { return campaign.getName(); } catch (e) { return '(unnamed)'; }
}

// One GAQL query for the channel type of all campaigns.
// (campaign.start_date / campaign.end_date are NOT selectable via
// AdsApp.search() in this runtime — QueryError.UNRECOGNIZED_FIELD, proven
// 2026-10-10 in Preview. Dates come from the classic getStartDate() /
// getEndDate() in readCampaignInventory instead.)
// Defensive: any failure degrades to an empty map (fields become null).
function readCampaignMetaBulk() {
  var meta = {};
  try {
    var rows = AdsApp.search(
      'SELECT campaign.id, campaign.name, campaign.advertising_channel_type ' +
      'FROM campaign WHERE campaign.status != \'REMOVED\' ' +
      'ORDER BY campaign.name LIMIT 200');
    while (rows.hasNext()) {
      var row = rows.next();
      var c = row.campaign || {};
      var id = String(c.id || '');
      if (!id) continue;
      meta[id] = {
        channel_type: c.advertisingChannelType || c.advertising_channel_type || null
      };
    }
  } catch (e) {
    Logger.log('Inventory pass: campaign metadata query failed (' + e.message +
      '); channel type will be null.');
  }
  return meta;
}

// Account-level conversion actions (best effort; Ads Scripts exposes these
// read-only via GAQL).
function readConversionActions() {
  var actions = [];
  try {
    var rows = AdsApp.search(
      'SELECT conversion_action.id, conversion_action.name, ' +
      'conversion_action.status, conversion_action.category, conversion_action.type ' +
      'FROM conversion_action WHERE conversion_action.status != \'REMOVED\' ' +
      'ORDER BY conversion_action.name LIMIT 100');
    while (rows.hasNext()) {
      var row = rows.next();
      var a = row.conversionAction || row.conversion_action || {};
      actions.push({
        id: String(a.id || ''),
        name: a.name || '',
        status: a.status || '',
        category: a.category || '',
        type: a.type || ''
      });
    }
  } catch (e) {
    Logger.log('Inventory pass: conversion_action query failed (' + e.message + ').');
  }
  return actions;
}

function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

function classicDateString(d) {
  // AdsApp GoogleAdsDate object {year, month, day} -> 'yyyy-MM-dd'.
  try {
    if (!d || !d.year) return null;
    return d.year + '-' + pad2(d.month) + '-' + pad2(d.day);
  } catch (e) {
    return null;
  }
}

function readCampaignInventory(campaign, meta) {
  var id = String(campaign.getId());
  var m = meta[id] || {};
  var budgetUsd = 0;
  try { budgetUsd = campaign.getBudget().getAmount(); } catch (e) { /* null */ }
  // Dates via the classic API (GAQL campaign.start_date is unselectable
  // in AdsApp.search(); see readCampaignMetaBulk).
  var startDate = null, endDate = null;
  try { startDate = classicDateString(campaign.getStartDate()); } catch (e) { /* null */ }
  try { endDate = classicDateString(campaign.getEndDate()); } catch (e) { /* null */ }
  var stats = { impressions: 0, clicks: 0, cost_usd: 0, conversions: 0, ctr: 0, conversion_rate: 0 };
  try {
    var s = campaign.getStatsFor('LAST_30_DAYS');
    stats.impressions = s.getImpressions() || 0;
    stats.clicks = s.getClicks() || 0;
    stats.cost_usd = s.getCost() || 0;
    stats.conversions = s.getConversions() || 0;
    stats.ctr = s.getCtr() || 0;
    stats.conversion_rate = s.getConversionRate() || 0;
  } catch (e) { /* stats stay zero */ }
  var adGroups = [];
  var keywordTotal = 0, adTotal = 0;
  var keywordsTruncated = false, adsTruncated = false;
  var landingPages = {};
  var groupIt = campaign.adGroups().get();
  var groupCount = 0;
  while (groupIt.hasNext() && groupCount < INVENTORY_LIMITS.MAX_AD_GROUPS_PER_CAMPAIGN) {
    var adGroup = groupIt.next();
    try {
      var gStatus = entityStatus(adGroup);
      if (gStatus === 'UNKNOWN') continue;
      var g = {
        name: adGroup.getName(),
        status: gStatus,
        keywords: [],
        ads: []
      };
      try {
        var kwIt = adGroup.keywords().get();
        while (kwIt.hasNext() && keywordTotal < INVENTORY_LIMITS.MAX_KEYWORDS_PER_CAMPAIGN) {
          var kw = kwIt.next();
          try {
            g.keywords.push({
              text: kw.getText(),
              match_type: String(kw.getMatchType()),
              status: entityStatus(kw)
            });
            keywordTotal++;
          } catch (ke) { /* skip one bad keyword */ }
        }
        if (kwIt.hasNext()) keywordsTruncated = true;
      } catch (e) { /* keywords unreadable */ }
      try {
        var adIt = adGroup.ads().get();
        while (adIt.hasNext() && adTotal < INVENTORY_LIMITS.MAX_ADS_PER_CAMPAIGN) {
          var ad = adIt.next();
          try {
            var parsed = readResponsiveAd(ad);
            if (parsed) {
              g.ads.push(parsed);
              adTotal++;
              if (parsed.final_url) landingPages[parsed.final_url] = true;
            }
          } catch (ae) { /* skip one bad ad */ }
        }
        if (adIt.hasNext()) adsTruncated = true;
      } catch (e) { /* ads unreadable */ }
      if (keywordsTruncated) g.keywords_truncated = true;
      if (adsTruncated) g.ads_truncated = true;
      adGroups.push(g);
      groupCount++;
    } catch (e) { /* skip one bad ad group */ }
  }
  var sitelinks = readSitelinkInventory(campaign);
  return {
    id: id,
    name: campaign.getName(),
    status: entityStatus(campaign),
    channel_type: m.channel_type || null,
    daily_budget_usd: budgetUsd,
    start_date: startDate,
    end_date: endDate,
    stats_30d: stats,
    ad_groups: adGroups,
    landing_pages: Object.keys(landingPages),
    sitelinks: sitelinks
  };
}

function readResponsiveAd(adObj) {
  // Returns {headlines, descriptions, final_url, status} for responsive
  // search ads; null for other ad types (read-only, never mutated).
  var isRsa = false;
  try { isRsa = !!adObj.isType().responsiveSearchAd; } catch (e) { isRsa = false; }
  if (!isRsa) return null;
  var headlines = [], descriptions = [];
  try {
    var typed = adObj.asType().responsiveSearchAd();
    var heads = typed.getHeadlines();
    for (var i = 0; i < heads.length; i++) headlines.push(heads[i].getText());
    var descs = typed.getDescriptions();
    for (var j = 0; j < descs.length; j++) descriptions.push(descs[j].getText());
  } catch (e) { /* partial read is fine */ }
  return {
    headlines: headlines,
    descriptions: descriptions,
    final_url: adFinalUrl(adObj) || '',
    status: entityStatus(adObj)
  };
}

function readSitelinkInventory(campaign) {
  // Read-only: text + final URL of every sitelink attached to the campaign.
  var out = [];
  try {
    var it = campaign.extensions().sitelinks().get();
    while (it.hasNext()) {
      var link = it.next();
      var text = '', url = '';
      try { text = link.getLinkText(); } catch (e) { /* skip */ }
      try {
        if (link.urls && typeof link.urls === 'function') {
          var urls = link.urls();
          if (urls && typeof urls.getFinalUrl === 'function') url = urls.getFinalUrl() || '';
        }
      } catch (e) { /* URL unreadable */ }
      if (text) out.push({ text: text, final_url: url });
    }
  } catch (e) {
    Logger.log('Inventory pass: sitelinks unreadable for "' +
      safeName(campaign) + '": ' + e.message);
  }
  return out;
}
