-- 0060: public social images (Instagram/Facebook post artwork served by the Worker)
CREATE TABLE IF NOT EXISTS social_images (
	slug TEXT PRIMARY KEY,
	jpeg_b64 TEXT NOT NULL,
	content_type TEXT NOT NULL DEFAULT 'image/jpeg',
	width INTEGER,
	height INTEGER,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
