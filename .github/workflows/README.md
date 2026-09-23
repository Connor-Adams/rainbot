# GitHub Actions Workflows

CI/CD for the Rainbot monorepo. Shared setup is centralized in **composite actions** to avoid duplication and keep workflows DRY.

## Composite actions (`.github/actions/`)

- **`setup-node-monorepo`** — Node, Corepack (Yarn 4), Yarn + Turbo cache, `yarn install`. Used by CI and Dependabot.
- **`verify-release-tag`** — Ensures release tag is on default branch and CI passed. Used by both release workflows.

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

Builds one image per bot from `apps/<svc>/Dockerfile` (build context = repo root) and pushes to `ghcr.io/<owner>/rainbot-<svc>`.

A service is rebuilt only when its **content hash** — [`scripts/service-content-hash.cjs`](../../scripts/service-content-hash.cjs), the git object ids of everything that lands in its build context — has no `:tree-<hash>` tag in GHCR yet. The detect job asks the registry with `skopeo`, so unchanged services cost no buildx boot and no build job at all.

Tags pushed per build: `:tree-<hash>` (the identity `release-promote.yml` resolves by), `:sha-<commit>` and `:main` (traceability/rollback only).

The **weekly schedule** force-rebuilds everything. That exists for `yt-dlp`, which raincloud's and rainbot's images install at build time and which breaks against YouTube within weeks of a release — under content-hash gating an untouched app would otherwise never get a fresh binary. Removing the schedule silently rots those two images.

Bump `EPOCH` in `service-content-hash.cjs` to force a rebuild of all four when something outside the source tree changes the image (base image moves, apt package, build logic).

### 🚀 `release-promote.yml` - Promote images to `:prod`

**Triggers:** Release published, workflow_dispatch (tag + optional force)

Builds nothing. Checks out the released commit, recomputes each service's content hash with the **same module** `build-images.yml` used, waits (bounded) for `:tree-<hash>` to exist, then re-tags it as `:<release-tag>` and `:prod` with `docker buildx imagetools create` — a registry-side manifest copy, so `:prod` is byte-identical to the image CI built. Uses `verify-release-tag`.

### ⚠️ `release-ghcr.yml` - DEPRECATED

Superseded by the two workflows above. It built the same image names with Railpack, which never invokes a Dockerfile and so shipped no ffmpeg/yt-dlp. Its `release: published` trigger has been removed so it cannot race over `:prod`. **Delete this file.**

### 🚀 `release-deploy.yml` - Deploy to Railway

**Triggers:** Release published, workflow_dispatch (optional force)

Plans changed services, triggers Railway webhooks for changed apps only. Uses `verify-release-tag`.

### 🤖 `dependabot-auto-merge.yml` - Auto-merge Dependabot PRs

**Triggers:** Dependabot PRs (opened/synchronize)

Runs same checks as CI via `setup-node-monorepo`, then auto-merges with `fastify/github-action-merge-dependabot`.

### Other

- **`release-drafter.yml`** — Drafts release notes.
- **`dependabot.yml`** — Dependabot config (not a workflow).

## Setup

### Optional secrets

- **Turbo Remote Cache:** `TURBO_TEAM`, `TURBO_TOKEN` (Vercel) for faster CI.
- **Railway:** `RAILWAY_WEBHOOK_*`, `*_HEALTH_URL` for release deploys.

### Leveraging GitHub CI

- Concurrency on `ci-${{ github.ref }}` so only the latest run per ref is active.
- Single definition for Node/Yarn/Turbo setup → one place to change Node or cache keys.
- Release workflows rely on **existing CI status** for the tag (no re-running CI on release).

## Workflow status

Actions: `https://github.com/YOUR_USERNAME/YOUR_REPO/actions`
