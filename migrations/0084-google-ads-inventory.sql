-- 0084: Google Ads account inventory snapshots (read-only).
-- Collected hourly by the in-account Google Ads Script ("NWANA reconcile"),
-- which POSTs the snapshot to /api/operating-center/google-ads/inventory
-- with the owner key. The Engine NEVER writes to Google Ads; this table is
-- the machine-readable record of what actually exists in the account
-- (campaigns, ad groups, keywords, ads, sitelinks, stats) so cleanup
-- decisions (KEEP/PAUSE/MERGE/REBUILD/RETIRE) are made on real data, not
-- guesses. One row per snapshot; history is kept for trend comparison.

CREATE TABLE IF NOT EXISTS google_ads_account_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_at TEXT NOT NULL,
  script_version TEXT,
  customer_id TEXT,
  campaign_count INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_ads_inventory_snapshot_at
  ON google_ads_account_inventory(snapshot_at DESC);
