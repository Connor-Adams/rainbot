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

### 🚀 `release-ghcr.yml` - Build & push images (GHCR)

**Triggers:** Release published, workflow_dispatch (optional force)

Plans changed apps from previous tag, builds only changed images with Railpack, pushes to GHCR. Uses `verify-release-tag` in plan; build job no longer re-runs CI verification.

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
