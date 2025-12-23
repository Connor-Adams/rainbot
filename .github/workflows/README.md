# GitHub Actions Workflows

This directory contains CI/CD workflows for the Rainbot project.

## Workflows

### 🔍 `lint.yml` - Linting
**Triggers:** Push/PR to main/master/develop, Manual dispatch

**Jobs:**
- **Backend**: Runs ESLint on Node.js backend code
- **Frontend**: Runs ESLint + TypeScript type checking on React app
- **Summary**: Reports overall lint status

**Status Badge:**
```markdown
![Lint](https://github.com/YOUR_USERNAME/YOUR_REPO/workflows/Lint/badge.svg)
```

### 🔄 `ci.yml` - Continuous Integration
**Triggers:** Push/PR to main/master/develop

**Jobs:**
- **Backend**: Lints Node.js backend code
- **Frontend**: Lints, type-checks, and builds React app
- **Build Test**: Verifies full build process works

**Status Badge:**
```markdown
![CI](https://github.com/YOUR_USERNAME/YOUR_REPO/workflows/CI/badge.svg)
```

### 🚀 `deploy.yml` - Pre-Deploy Build Check
**Triggers:** Push to main/master, Manual dispatch

**What it does:**
- Builds frontend React app
- Verifies build output exists
- **Railway auto-deploys** via Git integration after this check passes

**Note:** Railway automatically deploys when you push to main/master. This workflow acts as a safety check to catch build failures before Railway tries to deploy.

### 🔒 `codeql.yml` - Security Analysis
**Triggers:** Push/PR to main/master, Weekly schedule

**What it does:**
- Runs GitHub's CodeQL security analysis
- Scans for vulnerabilities in JavaScript/TypeScript
- Reports security findings

### 🤖 `dependabot-auto-merge.yml` - Auto-merge Dependencies
**Triggers:** Dependabot PRs

**What it does:**
- Runs CI checks on Dependabot PRs
- Auto-merges if all checks pass
- Keeps dependencies up to date automatically

## Setup

### Required Secrets (if using manual Railway deployment)
- `RAILWAY_TOKEN` - Railway API token (optional, Railway auto-deploys via Git)

### Enable Dependabot
Dependabot is configured via `.github/dependabot.yml`. It will:
- Check for updates weekly
- Create PRs for backend and frontend dependencies separately
- Use auto-merge workflow if checks pass

## Workflow Status

View workflow runs: `https://github.com/YOUR_USERNAME/YOUR_REPO/actions`

