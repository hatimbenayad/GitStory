# Spec: U13 — Optional Thin Backend (GitHub URL, Cache & Share Links)

## 1. Purpose & Why
Users who want to paste a public GitHub URL without running the CLI (`FR-5`) or share a short permalink for a public repository (`FR-27`) can optionally run `apps/server` (Node + Hono). The backend is strictly optional: all local workflows in `apps/web` and `apps/cli` work 100% offline without it.

## 2. Functional Requirements Covered
- `FR-5`: Web app accepts a public GitHub URL via the optional backend using partial blobless clone (`git clone --filter=blob:none --no-checkout`).
- `FR-27`: Shareable link (`?repo=<id>`) for a processed public repo when the backend is enabled.

## 3. API Endpoints (`apps/server`)
- `GET /api/health` -> `{ ok: true, service: 'gitstory-server' }`
- `POST /api/repos` with JSON body `{ url: string, firstParent?: boolean }`
  - Strictly validates `url` against `^https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\.git)?/?$` (rejects non-GitHub hosts, SSH URLs, local paths, shell metacharacters -> `400 Bad Request`).
  - Clones into a temp directory via `execFile('git', ['clone', '--filter=blob:none', '--no-checkout', '--quiet', canonicalUrl, tmpDir])` (read-only, no checkout, timeout enforced).
  - Extracts `History` via `@gitstory/extractor`, caches JSON on disk under `CACHE_DIR/<id>.json`, removes temp clone directory in `finally`, and returns `{ id, cached, history }`.
- `GET /api/repos/:id/history` -> returns cached `History` JSON or `404`.

## 4. Security & Privacy
- Strict allowlist prevents SSRF and arbitrary filesystem access.
- Subprocess args passed as arrays only (`execFile`), never shell strings.
- CORS configurable via `CORS_ORIGIN` env var (defaults to `*` for local dev).
- Never logs or accepts auth tokens; public GitHub repos only.
