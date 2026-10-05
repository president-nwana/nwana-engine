/**
 * Garmin Connector for NWANA Engine — STRUCTURE ONLY (not active)
 *
 * Status: PENDING — Garmin Connect Developer Program has paused new API access
 * requests (as of 2026). The application form is removed, no waitlist, no ETA.
 *
 * When the program reopens:
 * 1. Apply at developer.garmin.com as NWANA (legal entity, 501c3)
 * 2. Obtain Consumer Key + Consumer Secret (OAuth 1.0a for Health API)
 *    OR Client ID + Client Secret (OAuth 2.0 for Connect API)
 * 3. Configure callback URL: https://nwana-engine.nwana-engine.workers.dev/api/garmin/callback
 * 4. Store credentials as Worker secrets (never in code)
 * 5. Implement the TODO sections below
 *
 * APIs needed for challenge activities:
 * - Activity API: pull completed activities (date, distance, duration, sport type)
 * - Required permissions: activity read access
 *
 * Architecture:
 *   Garmin → OAuth link (per user) → Engine polls/pushes activities →
 *   normalize → map to challenge/event → deduplicate → submit via
 *   existing challenge.ts activity flow (same as manual/FIT/GPX)
 *
 * DO NOT fake data or simulate a working integration until production
 * API access is granted and verified.
 */

// TODO: Implement when Garmin API access is granted

export interface GarminConfig {
  // Set via Worker secrets when available
  consumerKey: string | null;
  consumerSecret: string | null;
  // OAuth 1.0a endpoints (Health API) or OAuth 2.0 (Connect API)
  // To be determined based on which API Garmin grants
}

export interface GarminActivity {
  activityId: string;       // Garmin's unique activity ID (for deduplication)
  startTime: string;        // ISO 8601
  distanceMeters: number | null;
  durationSeconds: number | null;
  sportType: string | null; // e.g. "walking", "running", "cycling"
}

export interface NormalizedActivity {
  date: string;             // YYYY-MM-DD
  distanceM: number | null;
  timeS: number | null;
  sourceActivityId: string; // For deduplication
  source: 'garmin';
}

/**
 * Step 1: OAuth account linking
 * User clicks "Connect Garmin" → redirect to Garmin OAuth →
 * callback exchanges code for tokens → store per-user tokens in D1
 */
// TODO: Implement OAuth flow when credentials available

/**
 * Step 2: Fetch activities for a linked user
 * Called on-demand (user clicks "Sync") or via webhook if Garmin supports push
 */
// TODO: Implement activity fetching

/**
 * Step 3: Normalize Garmin activity to Engine format
 */
export function normalizeGarminActivity(g: GarminActivity): NormalizedActivity {
  return {
    date: g.startTime.slice(0, 10),
    distanceM: g.distanceMeters,
    timeS: g.durationSeconds,
    sourceActivityId: `garmin:${g.activityId}`,
    source: 'garmin',
  };
}

/**
 * Step 4: Deduplication check
 * Before submitting, check D1 challenge_activities for existing
 * sourceActivityId to prevent duplicate imports
 */
// TODO: Implement deduplication query
// SELECT 1 FROM challenge_activities WHERE source_activity_id = ?

/**
 * Step 5: Submit via existing challenge.ts flow
 * Reuse the same submitActivity logic as manual entry,
 * with source tracking for the activity
 */
// TODO: Wire into challenge.ts submit endpoint

/**
 * Database migration needed (when activating):
 *
 * ALTER TABLE challenge_activities ADD COLUMN source TEXT DEFAULT 'manual';
 * ALTER TABLE challenge_activities ADD COLUMN source_activity_id TEXT;
 * CREATE INDEX idx_challenge_activities_source ON challenge_activities(source_activity_id);
 *
 * -- For OAuth tokens (new table):
 * CREATE TABLE garmin_tokens (
 *   rsu_user_id TEXT PRIMARY KEY,
 *   access_token TEXT NOT NULL,
 *   token_secret TEXT NOT NULL,  -- OAuth 1.0a
 *   -- OR --
 *   access_token TEXT NOT NULL,
 *   refresh_token TEXT NOT NULL, -- OAuth 2.0
 *   expires_at INTEGER,
 *   linked_at INTEGER NOT NULL,
 *   last_sync_at INTEGER
 * );
 */

export const GARMIN_STATUS = {
  apiAccess: 'PENDING_PROGRAM_REOPEN',
  connectorBuilt: false,
  note: 'Structure prepared 2026-10-05. Awaiting Garmin Connect Developer Program to reopen applications.',
} as const;
