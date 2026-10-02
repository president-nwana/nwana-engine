-- 0062-ventures.sql — internal ventures: ideas growing into companies inside the Engine.
-- MVP: capture and structure venture ideas. Each venture can later become a tenant.
-- NWANA (nonprofit) stays untouched; ventures are separate (future for-profit entities).

CREATE TABLE IF NOT EXISTS ventures (
	venture_id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	kind TEXT NOT NULL DEFAULT 'other',
	-- idea | forming | active | operating | archived
	stage TEXT NOT NULL DEFAULT 'idea'
		CHECK (stage IN ('idea', 'forming', 'active', 'operating', 'archived')),
	summary TEXT,
	-- Set when the venture becomes a real tenant of the Engine.
	tenant_id TEXT REFERENCES tenants(tenant_id),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ventures_stage ON ventures(stage);
CREATE INDEX IF NOT EXISTS idx_ventures_tenant ON ventures(tenant_id);

-- Seed: Albert's six venture ideas (2026-10-02). All start as ideas.
INSERT OR IGNORE INTO ventures (venture_id, name, kind, stage, summary, created_at, updated_at) VALUES
('venture-league', 'Commercial League', 'league', 'idea',
 'Commercial Nordic walking league — the first money. Sponsorship sellers advised: NWANA (nonprofit, early stage, few participants) cannot be sold yet; a commercial league attracts the first revenue, then sponsors come.',
 '2026-10-02T18:00:00Z', '2026-10-02T18:00:00Z'),
('venture-academy', 'Academy', 'academy', 'idea',
 'Commercial academy product — training, certification, education as a business.',
 '2026-10-02T18:00:00Z', '2026-10-02T18:00:00Z'),
('venture-engine', 'Engine', 'engine', 'idea',
 'NWANA Engine as a commercial software product company — the platform sold to external sports organizations. NWANA and sister ventures are its first test clients.',
 '2026-10-02T18:00:00Z', '2026-10-02T18:00:00Z'),
('venture-rights', 'Rights', 'rights', 'idea',
 'Commercial rights product — media/sponsorship rights as a business.',
 '2026-10-02T18:00:00Z', '2026-10-02T18:00:00Z'),
('venture-marketplace', 'Marketplace', 'marketplace', 'idea',
 'Marketplace product — commercial marketplace for the Nordic walking ecosystem.',
 '2026-10-02T18:00:00Z', '2026-10-02T18:00:00Z'),
('venture-holdco', 'HoldCo', 'holdco', 'idea',
 'Holding company above all ventures — owns the portfolio; investors enter at HoldCo or venture level.',
 '2026-10-02T18:00:00Z', '2026-10-02T18:00:00Z');
