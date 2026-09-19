-- Encrypted long-lived OAuth credentials for owner-connected integrations.
-- Ciphertext is unusable without the separate GOOGLE_ADS_TOKEN_KEY Worker secret.
CREATE TABLE IF NOT EXISTS integration_credentials (
  provider TEXT PRIMARY KEY,
  encrypted_refresh_token TEXT NOT NULL,
  iv TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
