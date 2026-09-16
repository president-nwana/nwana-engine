# NWANA Engine — Mandatory Project Context

Before changing code, Registry data, D1, adapters, processing logic, distribution rules, or architecture:

1. Read `SYSTEM_STATE.md`.
2. Read `registry/README.md`.
3. Read `registry/objects.yaml`.
4. Read relevant files in `docs/adr/`.
5. Then read the technical instructions below.

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
