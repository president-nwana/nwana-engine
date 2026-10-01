/**
 * Multi-tenant layer — tenants + business units (ADR-0046).
 *
 * Converts NWANA Engine from a single-organization operating system into a
 * reusable multi-tenant sports operating platform. NWANA remains the first
 * live tenant; its existing production tables and flows are untouched.
 *
 * Design rules:
 * - Additive only. Legacy NWANA tables stay legacy-scoped; no destructive
 *   migration, no backfill.
 * - Tenant isolation is enforced in EVERY data-access function below: reads
 *   are always scoped by tenant_id, and getBusinessUnit returns null when
 *   the unit belongs to a different tenant. Never bypass these helpers with
 *   raw cross-tenant queries.
 * - business_units.unit_type is an OPEN vocabulary (no CHECK in the schema,
 *   no closed union here): future unit types must not require a code change.
 * - Money is NEVER stored per business unit. Summaries are derived at read
 *   time from canonical money_events via the linked revenue_objects
 *   (ADR-0044). Unknown stays UNKNOWN — never zero-filled, never simulated.
 * - The demo tenant is a configuration/schema proof only: zero assets,
 *   zero money linkage, zero audience.
 */

import {
	getRevenueObject,
	type RevenueMoneyRollup,
	type RevenueObjectWithMoney,
} from "./revenue-inventory";

export const TENANT_STATUSES = ["active", "suspended", "archived", "demo"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const PLAN_LICENSE_STATUSES = ["owner", "trial", "active", "expired", "none"] as const;
export type PlanLicenseStatus = (typeof PLAN_LICENSE_STATUSES)[number];

export const BU_OPERATING_STATUSES = [
	"operating",
	"pilot",
	"not_operating",
	"unknown",
] as const;
export type BuOperatingStatus = (typeof BU_OPERATING_STATUSES)[number];

export const BU_LEGAL_ENTITY_STATUSES = ["NOT_FORMED", "PLANNED", "ACTIVE"] as const;
export type BuLegalEntityStatus = (typeof BU_LEGAL_ENTITY_STATUSES)[number];

/**
 * Suggested unit types. Informational only — unit_type accepts any
 * non-empty string so new sports organizations can define custom units
 * (Events, Media, Membership, Clubs/Groups, Sponsorship, Fundraising,
 * Education, Commerce, Professional League, ...) without a schema change.
 */
export const KNOWN_UNIT_TYPES = [
	"GOVERNING_BODY",
	"ACADEMY",
	"TECHNOLOGY",
	"LEAGUE_COMPETITION",
	"SALES_DISTRIBUTION",
	"MARKETPLACE",
	"MEMBERSHIP",
	"EVENTS",
	"MEDIA",
	"SPONSORSHIP",
	"FUNDRAISING",
	"EDUCATION",
	"COMMERCE",
	"PROFESSIONAL_LEAGUE",
] as const;

export interface IntegrationRef {
	integration: string;
	status: string;
	note?: string | null;
}

export interface Tenant {
	tenant_id: string;
	legal_name: string;
	display_name: string;
	organization_type: string;
	sport_domain: string | null;
	status: TenantStatus;
	branding: Record<string, unknown> | null;
	owner_admin: Record<string, unknown> | null;
	external_systems: IntegrationRef[];
	plan_license_status: PlanLicenseStatus;
	enabled_modules: string[];
	license_start: string | null;
	license_end: string | null;
	billing_model: string | null;
	white_label: boolean;
	created_at: string;
	updated_at: string;
}

export interface BusinessUnit {
	business_unit_id: string;
	tenant_id: string;
	unit_type: string;
	name: string;
	operating_status: BuOperatingStatus;
	legal_entity_status: BuLegalEntityStatus;
	owner_legal_ref: string | null;
	revenue_model: string | null;
	connected_assets: string[];
	connected_integrations: IntegrationRef[];
	money_state: string | null;
	audience_state: string | null;
	next_actions: string[];
	created_at: string;
	updated_at: string;
}

export interface BusinessUnitDetail extends BusinessUnit {
	assets: RevenueObjectWithMoney[];
	/** Summed across linked assets; null when no linked asset has money truth. */
	money: RevenueMoneyRollup | null;
	/** Honest audience signal where a canonical source exists; else null. */
	audience: { label: string; value: string; source: string } | null;
}

export interface TenantWithUnits extends Tenant {
	/** Derived at read time from business_units — never stored redundantly. */
	business_units: BusinessUnit[];
}

const ID_RE = /^[a-z0-9][a-z0-9-]{1,60}$/;

function parseJsonObject(raw: string | null): Record<string, unknown> | null {
	if (!raw) return null;
	try {
		const v = JSON.parse(raw) as unknown;
		return v && typeof v === "object" && !Array.isArray(v)
			? (v as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

function parseStringArray(raw: string | null): string[] {
	if (!raw) return [];
	try {
		const v = JSON.parse(raw) as unknown;
		return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
	} catch {
		return [];
	}
}

function parseIntegrations(raw: string | null): IntegrationRef[] {
	if (!raw) return [];
	try {
		const v = JSON.parse(raw) as unknown;
		if (!Array.isArray(v)) return [];
		return v
			.filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
			.map((x) => ({
				// The NWANA seed uses "system"; accept both keys (no data rewrite).
				integration: String(x.integration ?? x.system ?? "unknown"),
				status: String(x.status ?? "unknown"),
				note: typeof x.note === "string" ? x.note : null,
			}));
	} catch {
		return [];
	}
}

function rowToTenant(row: Record<string, unknown>): Tenant {
	return {
		tenant_id: String(row.tenant_id),
		legal_name: String(row.legal_name),
		display_name: String(row.display_name),
		organization_type: String(row.organization_type ?? "unknown"),
		sport_domain: (row.sport_domain as string | null) ?? null,
		status: row.status as TenantStatus,
		branding: parseJsonObject(row.branding as string | null),
		owner_admin: parseJsonObject(row.owner_admin as string | null),
		external_systems: parseIntegrations(row.external_systems as string | null),
		plan_license_status: row.plan_license_status as PlanLicenseStatus,
		enabled_modules: parseStringArray(row.enabled_modules as string | null),
		license_start: (row.license_start as string | null) ?? null,
		license_end: (row.license_end as string | null) ?? null,
		billing_model: (row.billing_model as string | null) ?? null,
		white_label: Number(row.white_label ?? 0) === 1,
		created_at: String(row.created_at),
		updated_at: String(row.updated_at),
	};
}

function rowToBusinessUnit(row: Record<string, unknown>): BusinessUnit {
	return {
		business_unit_id: String(row.business_unit_id),
		tenant_id: String(row.tenant_id),
		unit_type: String(row.unit_type),
		name: String(row.name),
		operating_status: row.operating_status as BuOperatingStatus,
		legal_entity_status: row.legal_entity_status as BuLegalEntityStatus,
		owner_legal_ref: (row.owner_legal_ref as string | null) ?? null,
		revenue_model: (row.revenue_model as string | null) ?? null,
		connected_assets: parseStringArray(row.connected_assets as string | null),
		connected_integrations: parseIntegrations(row.connected_integrations as string | null),
		money_state: (row.money_state as string | null) ?? null,
		audience_state: (row.audience_state as string | null) ?? null,
		next_actions: parseStringArray(row.next_actions as string | null),
		created_at: String(row.created_at),
		updated_at: String(row.updated_at),
	};
}

/** List all tenants (summary; no cross-tenant data leaks by construction). */
export async function listTenants(db: D1Database): Promise<Tenant[]> {
	const rows = await db
		.prepare("SELECT * FROM tenants ORDER BY status, tenant_id")
		.all<Record<string, unknown>>();
	return (rows.results ?? []).map(rowToTenant);
}

/** Tenant detail with business units derived at read time. */
export async function getTenant(
	db: D1Database,
	tenantId: string,
): Promise<TenantWithUnits | null> {
	const row = await db
		.prepare("SELECT * FROM tenants WHERE tenant_id = ?")
		.bind(tenantId)
		.first<Record<string, unknown>>();
	if (!row) return null;
	return { ...rowToTenant(row), business_units: await listBusinessUnits(db, tenantId) };
}

/**
 * Business units of ONE tenant. Tenant isolation: the tenant_id filter is
 * mandatory — there is no unscoped list.
 */
export async function listBusinessUnits(
	db: D1Database,
	tenantId: string,
): Promise<BusinessUnit[]> {
	const rows = await db
		.prepare("SELECT * FROM business_units WHERE tenant_id = ? ORDER BY business_unit_id")
		.bind(tenantId)
		.all<Record<string, unknown>>();
	return (rows.results ?? []).map(rowToBusinessUnit);
}

/**
 * Single business unit. Tenant isolation: returns null when the unit does
 * not exist OR belongs to a different tenant — callers must not distinguish
 * the two cases to outside parties.
 */
export async function getBusinessUnit(
	db: D1Database,
	tenantId: string,
	unitId: string,
): Promise<BusinessUnit | null> {
	const row = await db
		.prepare("SELECT * FROM business_units WHERE business_unit_id = ? AND tenant_id = ?")
		.bind(unitId, tenantId)
		.first<Record<string, unknown>>();
	return row ? rowToBusinessUnit(row) : null;
}

function sumRollups(rollups: RevenueMoneyRollup[]): RevenueMoneyRollup | null {
	const present = rollups.filter(Boolean);
	if (present.length === 0) return null;
	let net: number | null = null;
	let sawNet = false;
	for (const r of present) {
		if (r.net_cents !== null && r.net_cents !== undefined) {
			net = (net ?? 0) + r.net_cents;
			sawNet = true;
		}
	}
	return {
		transaction_count: present.reduce((a, r) => a + r.transaction_count, 0),
		gross_cents: present.reduce((a, r) => a + r.gross_cents, 0),
		refund_cents: present.reduce((a, r) => a + r.refund_cents, 0),
		// Honest UNKNOWN when no linked asset carries settlement truth.
		net_cents: sawNet ? net : null,
		revenue_7d_cents: present.reduce((a, r) => a + r.revenue_7d_cents, 0),
		revenue_30d_cents: present.reduce((a, r) => a + r.revenue_30d_cents, 0),
		revenue_90d_cents: present.reduce((a, r) => a + r.revenue_90d_cents, 0),
	};
}

/**
 * Honest audience signals keyed by unit type. Only canonical Engine tables
 * are read; anything without a verified source returns null (UNKNOWN).
 */
async function deriveAudience(
	db: D1Database,
	unit: BusinessUnit,
): Promise<BusinessUnitDetail["audience"]> {
	if (unit.audience_state) {
		return { label: "Audience note", value: unit.audience_state, source: "business_units.audience_state" };
	}
	if (unit.unit_type === "LEAGUE_COMPETITION") {
		try {
			const row = await db
				.prepare("SELECT COUNT(*) AS n FROM series_registrations")
				.first<Record<string, unknown>>();
			const n = Number(row?.n ?? 0);
			return {
				label: "Series registrations",
				value: String(n),
				source: "series_registrations (canonical)",
			};
		} catch {
			return null;
		}
	}
	return null;
}

/**
 * Full business-unit screen model: identity, status, linked real assets
 * (with their money rollups), summed money, audience where available,
 * integrations, next actions. Tenant-scoped — see getBusinessUnit.
 */
export async function getBusinessUnitDetail(
	db: D1Database,
	tenantId: string,
	unitId: string,
): Promise<BusinessUnitDetail | null> {
	const unit = await getBusinessUnit(db, tenantId, unitId);
	if (!unit) return null;
	const assets: RevenueObjectWithMoney[] = [];
	for (const key of unit.connected_assets) {
		// getRevenueObject returns the object without actions when the
		// actions field is stripped; money rollup is derived, never stored.
		const full = await getRevenueObject(db, key);
		if (full) {
			const { actions: _actions, ...rest } = full;
			assets.push(rest);
		}
	}
	const money = unit.money_state
		? null // explicit override note present; surfaced as money_state text
		: sumRollups(assets.map((a) => a.money).filter((m): m is RevenueMoneyRollup => m !== null));
	return {
		...unit,
		assets,
		money,
		audience: await deriveAudience(db, unit),
	};
}

export interface CreateTenantInput {
	tenant_id: string;
	legal_name: string;
	display_name: string;
	organization_type?: string;
	sport_domain?: string | null;
	status?: TenantStatus;
	branding?: Record<string, unknown> | null;
	owner_admin?: Record<string, unknown> | null;
	external_systems?: IntegrationRef[];
	plan_license_status?: PlanLicenseStatus;
	enabled_modules?: string[];
	license_start?: string | null;
	license_end?: string | null;
	billing_model?: string | null;
	white_label?: boolean;
}

/**
 * Create a new tenant WITHOUT writing sport-specific architecture:
 * one reusable path — create tenant → enable business units → connect
 * objects/integrations → Engine operates on them.
 */
export async function createTenant(
	db: D1Database,
	input: CreateTenantInput,
): Promise<Tenant> {
	if (!ID_RE.test(input.tenant_id)) {
		throw new Error(
			`invalid tenant_id "${input.tenant_id}": use lowercase letters, digits, dashes`,
		);
	}
	if (!input.legal_name?.trim() || !input.display_name?.trim()) {
		throw new Error("legal_name and display_name are required");
	}
	const status = input.status ?? "active";
	if (!TENANT_STATUSES.includes(status)) throw new Error(`invalid status: ${status}`);
	const plan = input.plan_license_status ?? "none";
	if (!PLAN_LICENSE_STATUSES.includes(plan)) throw new Error(`invalid plan_license_status: ${plan}`);
	const existing = await db
		.prepare("SELECT tenant_id FROM tenants WHERE tenant_id = ?")
		.bind(input.tenant_id)
		.first();
	if (existing) throw new Error(`tenant already exists: ${input.tenant_id}`);
	await db
		.prepare(
			`INSERT INTO tenants (
				tenant_id, legal_name, display_name, organization_type, sport_domain,
				status, branding, owner_admin, external_systems,
				plan_license_status, enabled_modules, license_start, license_end,
				billing_model, white_label
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			input.tenant_id,
			input.legal_name.trim(),
			input.display_name.trim(),
			input.organization_type ?? "unknown",
			input.sport_domain ?? null,
			status,
			input.branding ? JSON.stringify(input.branding) : null,
			input.owner_admin ? JSON.stringify(input.owner_admin) : null,
			input.external_systems ? JSON.stringify(input.external_systems) : "[]",
			plan,
			input.enabled_modules ? JSON.stringify(input.enabled_modules) : "[]",
			input.license_start ?? null,
			input.license_end ?? null,
			input.billing_model ?? null,
			input.white_label ? 1 : 0,
		)
		.run();
	const created = await getTenant(db, input.tenant_id);
	if (!created) throw new Error("tenant creation failed unexpectedly");
	const { business_units: _u, ...tenant } = created;
	return tenant;
}

export interface CreateBusinessUnitInput {
	business_unit_id: string;
	/** Open vocabulary: any non-empty string. No closed enum. */
	unit_type: string;
	name: string;
	operating_status?: BuOperatingStatus;
	legal_entity_status?: BuLegalEntityStatus;
	owner_legal_ref?: string | null;
	revenue_model?: string | null;
	connected_assets?: string[];
	connected_integrations?: IntegrationRef[];
	next_actions?: string[];
}

/** Enable a business unit on an existing tenant. Tenant must exist first. */
export async function createBusinessUnit(
	db: D1Database,
	tenantId: string,
	input: CreateBusinessUnitInput,
): Promise<BusinessUnit> {
	const tenant = await db
		.prepare("SELECT tenant_id FROM tenants WHERE tenant_id = ?")
		.bind(tenantId)
		.first();
	if (!tenant) throw new Error(`unknown tenant: ${tenantId}`);
	if (!ID_RE.test(input.business_unit_id)) {
		throw new Error(
			`invalid business_unit_id "${input.business_unit_id}": use lowercase letters, digits, dashes`,
		);
	}
	if (!input.unit_type?.trim() || !input.name?.trim()) {
		throw new Error("unit_type and name are required");
	}
	const operating = input.operating_status ?? "unknown";
	if (!BU_OPERATING_STATUSES.includes(operating)) {
		throw new Error(`invalid operating_status: ${operating}`);
	}
	const legal = input.legal_entity_status ?? "NOT_FORMED";
	if (!BU_LEGAL_ENTITY_STATUSES.includes(legal)) {
		throw new Error(`invalid legal_entity_status: ${legal}`);
	}
	const dup = await db
		.prepare("SELECT business_unit_id FROM business_units WHERE business_unit_id = ?")
		.bind(input.business_unit_id)
		.first();
	if (dup) throw new Error(`business unit already exists: ${input.business_unit_id}`);
	await db
		.prepare(
			`INSERT INTO business_units (
				business_unit_id, tenant_id, unit_type, name,
				operating_status, legal_entity_status, owner_legal_ref, revenue_model,
				connected_assets, connected_integrations, next_actions
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			input.business_unit_id,
			tenantId,
			input.unit_type.trim(),
			input.name.trim(),
			operating,
			legal,
			input.owner_legal_ref ?? null,
			input.revenue_model ?? null,
			JSON.stringify(input.connected_assets ?? []),
			JSON.stringify(input.connected_integrations ?? []),
			JSON.stringify(input.next_actions ?? []),
		)
		.run();
	const created = await getBusinessUnit(db, tenantId, input.business_unit_id);
	if (!created) throw new Error("business unit creation failed unexpectedly");
	return created;
}
