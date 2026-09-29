-- Result card PNG storage for GitHub Actions rasterization pipeline.
-- Canonical SVG generator (buildResultCardSvg) stays in Worker.
-- GitHub Action renders SVG -> PNG and POSTs it here.
-- Worker serves PNG from D1 at stable public URL.
-- D1 BLOB limit is 2MB; cards are ~400KB. $0 (existing D1 free tier).
CREATE TABLE IF NOT EXISTS result_card_images (
	publication_key TEXT PRIMARY KEY,
	png BLOB NOT NULL,
	width INTEGER NOT NULL DEFAULT 1080,
	height INTEGER NOT NULL DEFAULT 1080,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_result_card_images_updated
	ON result_card_images(updated_at);
