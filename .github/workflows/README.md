# GitHub Actions Workflows

CI/CD for the Rainbot monorepo. Shared setup is centralized in **composite actions** to avoid duplication and keep workflows DRY.

## Composite actions (`.github/actions/`)

- **`setup-node-monorepo`** — Node, Corepack (Yarn 4), Yarn + Turbo cache, `yarn install`. Used by CI and Dependabot.
- **`verify-release-tag`** — Ensures release tag is on default branch and CI passed. Used by both release workflows.
- **`dokploy-deploy`** — `POST /api/application.deploy` for one application, then polls `project.all` until that application's `applicationStatus` settles. Fails on a missing secret, a non-2xx response, `applicationStatus=error`, or an id that matches no application.

## Workflows

### 🔄 `ci.yml` - Continuous Integration

**Triggers:** Push/PR to main, master, develop, dev (and all PRs)

**Jobs:** Format check, Type check, Test, Build (all use `setup-node-monorepo`), then a gate job.

**Turbo cache:** Local cache in `.turbo`; optional **Turbo Remote Cache** via secrets `TURBO_TEAM` and `TURBO_TOKEN` (Vercel).

### 🔒 `codeql.yml` - Security Analysis

**Triggers:** Push/PR to main/master, weekly schedule

CodeQL analysis for JavaScript/TypeScript.

### 📦 `build-images.yml` - Build & push images (GHCR)

**Triggers:** Push to `main`, weekly schedule, workflow_dispatch (optional force)

Builds five images — one per bot from `apps/<svc>/Dockerfile`, plus the dashboard from `ui/Dockerfile` — and pushes each to `ghcr.io/<owner>/rainbot-<svc>`. Build context is the repo root in every case.

The `ui` image is nginx, not node: no bot serves the dashboard (raincloud's express 404s unmatched routes), so it ships standalone. It reads no `VITE_*` at build time — `ui/30-runtime-config.sh` rewrites `runtime-config.js` from `VITE_API_BASE_URL` / `VITE_AUTH_BASE_URL` / `VITE_DEBUG_LOGS` on every container start, so one image works in every environment. It listens on `$PORT`, defaulting to 8080 (unprivileged nginx cannot bind below 1024).

A service is rebuilt only when its **content hash** — [`scripts/service-content-hash.cjs`](../../scripts/service-content-hash.cjs), the git object ids of everything that lands in its build context — has no `:tree-<hash>` tag in GHCR yet. The detect job asks the registry with `skopeo`, so unchanged services cost no buildx boot and no build job at all.

Tags pushed per build: `:tree-<hash>` (the identity `release-promote.yml` resolves by), `:sha-<commit>` and `:main` (traceability/rollback only).

The **weekly schedule** force-rebuilds everything. That exists for `yt-dlp`, which raincloud's and rainbot's images install at build time and which breaks against YouTube within weeks of a release — under content-hash gating an untouched app would otherwise never get a fresh binary. Removing the schedule silently rots those two images.

Bump `EPOCH` in `service-content-hash.cjs` to force a rebuild of all five when something outside the source tree changes the image (base image moves, apt package, build logic).

### 🚀 `release-promote.yml` - Promote images to `:prod`

**Triggers:** Release published, workflow_dispatch (tag + optional force)

Builds nothing. Checks out the released commit, recomputes each service's content hash with the **same module** `build-images.yml` used, waits (bounded) for `:tree-<hash>` to exist, then re-tags it as `:<release-tag>` and `:prod` with `docker buildx imagetools create` — a registry-side manifest copy, so `:prod` is byte-identical to the image CI built. Uses `verify-release-tag`.

### 🚀 `release-deploy.yml` - Deploy to Dokploy

**Triggers:** Release published, workflow_dispatch (optional force)

Plans changed services from the tag-to-tag diff, waits for `release-promote.yml` to
finish, then deploys each changed service through the `dokploy-deploy` composite
action. Uses `verify-release-tag`.

Deploys are **pushed** from CI, not pulled by Dokploy. Dokploy's registry
auto-deploy webhook only parses DockerHub payloads and GHCR emits no equivalent,
so the [documented path](https://docs.dokploy.com/docs/core/auto-deploy) for other
registries is its API. Pushing is also what makes the ordering below expressible —
a registry watcher would restart all five services at once.

Order is not cosmetic: **raincloud first**, gated on `/health/ready`, then the three
workers. Workers give up permanently after four failed registrations, so starting
them against a still-booting orchestrator leaves them at `registered=0`. `ui` is
independent — no bot serves the dashboard — so a `ui/`-only change deploys nothing
else, and `packages/` or a root manifest change deploys everything.

The `await-promotion` job exists because Dokploy pulls `:prod`, which
`release-promote.yml` moves on the same `release: published` event. Deploying first
would ship the _previous_ release's image and report success.

**A missing secret fails the job.** The Railway workflow this replaced `exit 0`ed on
an unset webhook, so for months every release showed a green deploy that had done
nothing — that is the failure mode the loud check is there to prevent.

### 🤖 `dependabot-auto-merge.yml` - Auto-merge Dependabot PRs

**Triggers:** Dependabot PRs (opened/synchronize)

Runs same checks as CI via `setup-node-monorepo`, then auto-merges with `fastify/github-action-merge-dependabot`.

### Other

- **`release-drafter.yml`** — Drafts release notes.
- **`dependabot.yml`** — Dependabot config (not a workflow).

## Setup

### Required secrets (release deploys)

`release-deploy.yml` fails loudly without these:

- `DOKPLOY_URL` — Dokploy base URL, no trailing slash.
- `DOKPLOY_API_KEY` — from Dokploy's profile settings, sent as `x-api-key`.
- `DOKPLOY_APP_ID_RAINCLOUD`, `DOKPLOY_APP_ID_RAINBOT`, `DOKPLOY_APP_ID_PRANJEET`,
  `DOKPLOY_APP_ID_HUNGERBOT`, `DOKPLOY_APP_ID_UI` — each application's
  `applicationId`, listed by `GET /api/project.all`.

### Optional secrets

- **Turbo Remote Cache:** `TURBO_TEAM`, `TURBO_TOKEN` (Vercel) for faster CI.
- `RAINCLOUD_HEALTH_URL` — orchestrator `/health/ready`. Unset only warns, and the
  workers then deploy without confirming raincloud came back up.

### Leveraging GitHub CI

- Concurrency on `ci-${{ github.ref }}` so only the latest run per ref is active.
- Single definition for Node/Yarn/Turbo setup → one place to change Node or cache keys.
- Release workflows rely on **existing CI status** for the tag (no re-running CI on release).

## Workflow status

Actions: `https://github.com/YOUR_USERNAME/YOUR_REPO/actions`
