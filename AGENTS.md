# NWANA Engine — Mandatory Project Context

Before changing code, Registry data, D1, adapters, processing logic, distribution rules, or architecture:

1. Read `MACHINE_PURPOSE.md`.
2. Read `OPERATING_PLAN.md`. Its current execution contract supersedes older chronological progress notes when they conflict.
3. Read `SYSTEM_STATE.md`.
4. Read `registry/README.md` only when Registry or external-object facts are relevant.
5. Read `registry/objects.yaml` only when Registry or external-object facts are relevant.
6. Read relevant files in `docs/adr/`.
7. Then read the technical instructions below.

## Product Direction Rule

`MACHINE_PURPOSE.md` is the canonical statement of what NWANA Machine must accomplish.

Registry reconciliation is supporting work, not the product goal. Do not mass-populate Registry objects unless they are required by a real processing, rule, distribution, revenue, sponsorship, funding, or next-object path.

Before committing, explain in plain language how the change advances the machine's operating loop.

The owner-facing definition of done is binding: the project owner must be able to create or connect an object, choose a required business result, approve consequential actions, and observe outcomes from a normal control page without terminal commands or dependence on a chat session.

Do not substitute backend endpoints, Registry entries, plans, drafts, or generic architecture for that operational result. Do not omit participants, Academy students, instructors, donors, sponsors, sellers, partners, press, Google Ads Grants, email, or verified free distribution channels from the operating design.

Before new integration code, verify the actual access status, permissions, cost, and limitations recorded in `OPERATING_PLAN.md`. An application submission is not proof of approval.

## Canonical Truth Rule

Do not reconstruct NWANA Engine from chat memory.

Do not infer RunSignup/TicketSignup object meaning from:

- titles;
- URLs;
- internal object IDs;
- hierarchy;
- similar-looking objects;
- platform naming conventions.

If a factual platform property is not verified in the canonical Registry, treat it as `UNKNOWN`.

External source identity, NWANA semantic meaning, object capabilities, processing profiles, and distribution rules are separate layers.

Do not modify remote D1 Registry data while `SYSTEM_STATE.md` says Registry reconciliation is blocking remote seeding.

At the end of a meaningful development session, update the canonical project memory described in `SYSTEM_STATE.md`.

---
# Cloudflare Workers

STOP. Your knowledge of Cloudflare Workers APIs and limits may be outdated. Always retrieve current documentation before any Workers, KV, R2, D1, Durable Objects, Queues, Vectorize, AI, or Agents SDK task.

## Docs

- https://developers.cloudflare.com/workers/
- MCP: `https://docs.mcp.cloudflare.com/mcp`

For all limits and quotas, retrieve from the product's `/platform/limits/` page. eg. `/workers/platform/limits`

## Commands

| Command | Purpose |
|---------|---------|
| `npx wrangler dev` | Local development |
| `npx wrangler deploy` | Deploy to Cloudflare |
| `npx wrangler types` | Generate TypeScript types |

Run `wrangler types` after changing bindings in wrangler.jsonc.

## Node.js Compatibility

https://developers.cloudflare.com/workers/runtime-apis/nodejs/

## Errors

- **Error 1102** (CPU/Memory exceeded): Retrieve limits from `/workers/platform/limits/`
- **All errors**: https://developers.cloudflare.com/workers/observability/errors/

## Product Docs

Retrieve API references and limits from:
`/kv/` · `/r2/` · `/d1/` · `/durable-objects/` · `/queues/` · `/vectorize/` · `/workers-ai/` · `/agents/`

## Best Practices (conditional)

If the application uses Durable Objects or Workflows, refer to the relevant best practices:

- Durable Objects: https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/
- Workflows: https://developers.cloudflare.com/workflows/build/rules-of-workflows/
