-- 0063-tenant-wall.sql — logical tenant isolation for operational tables.
-- MVP: add tenant_id with DEFAULT 'nwana'. Existing rows automatically belong to
-- the NWANA tenant; zero data changes, zero behavior change.
-- Queries will be scoped by session tenant in a follow-up change.
-- Demo tables (demo_*) stay as-is (isolated, working).

-- Core money truth
ALTER TABLE money_events ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'nwana';
ALTER TABLE revenue_objects ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'nwana';
ALTER TABLE revenue_object_actions ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'nwana';

-- News & content
ALTER TABLE site_news ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'nwana';
ALTER TABLE media_articles ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'nwana';
ALTER TABLE social_images ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'nwana';
ALTER TABLE auto_news_settings ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'nwana';

-- Sponsorship / fundraising
ALTER TABLE funds ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'nwana';
ALTER TABLE fund_prospects ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'nwana';

-- Race results (operational truth for news)
ALTER TABLE race_event_results ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'nwana';

CREATE INDEX IF NOT EXISTS idx_money_events_tenant ON money_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_site_news_tenant ON site_news(tenant_id);
CREATE INDEX IF NOT EXISTS idx_media_articles_tenant ON media_articles(tenant_id);
