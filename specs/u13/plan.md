# Plan: U13 — Optional Thin Backend (GitHub URL, Cache & Share Links)

## 1. Technical Approach
- Create `apps/server` using `hono` and `@hono/node-server`, depending on `@gitstory/core` and `@gitstory/extractor`.
- Separate pure route factory (`createApp(deps)`) from server bootstrap (`index.ts`) so Hono routes can be unit-tested in-process via `app.request(...)` without opening sockets or hitting live GitHub during CI.
- Wire `apps/web` to read optional `VITE_API_BASE_URL` (or user-entered backend URL in the GitHub URL tab), support `?repo=<id>` loading on boot, and clearly label network requests as opt-in.
