#!/usr/bin/env node

// Content-addressed identity for each deployable image. A service's hash is
// derived from the git object ids of its build-context inputs, so it changes
// iff something that actually lands in the image changes. build-images.yml
// builds a service only when its :tree-<hash> tag is absent; release-promote.yml
// resolves each service by the same hash. Both call THIS module, so they can
// never disagree about what a given commit should build or promote.

const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');

// Bump to force a rebuild of ALL services when something outside the source
// tree changes the image (base image `node:22-slim` moving, an apt package, a
// change to how the workflow invokes the build). Kept as a constant — NOT an
// env var — so build and promote can never compute different hashes for the
// same commit.
const EPOCH = '1';

// Every workspace manifest is copied into every build context: `yarn install
// --immutable` resolves the whole workspace graph from the lockfile, so a
// missing workspace package.json fails the install. That means a version bump
// in ANY app's manifest legitimately changes every image's install layer.
const WORKSPACE_MANIFESTS = [
  'apps/raincloud/package.json',
  'apps/rainbot/package.json',
  'apps/pranjeet/package.json',
  'apps/hungerbot/package.json',
  'ui/package.json',
];

// Shared by all four images. `packages/` in full because each app's build runs
// `turbo run build --filter=<app>...`, which compiles its dependency packages
// from source inside the image.
const COMMON = [
  'package.json',
  'yarn.lock',
  '.yarnrc.yml',
  'turbo.json',
  'tsconfig.json',
  '.dockerignore',
  'packages',
  ...WORKSPACE_MANIFESTS,
];

// Each service's build inputs, as git pathspecs. `apps/<svc>` covers that app's
// source, its tsconfigs and its Dockerfile.
const INPUTS = {
  raincloud: [...COMMON, 'apps/raincloud'],
  rainbot: [...COMMON, 'apps/rainbot'],
  pranjeet: [...COMMON, 'apps/pranjeet'],
  hungerbot: [...COMMON, 'apps/hungerbot'],
};

const SERVICES = Object.keys(INPUTS);

function serviceContentHash(service, ref = 'HEAD', { cwd } = {}) {
  const paths = INPUTS[service];
  if (!paths) {
    throw new Error(`unknown service: ${service}`);
  }
  // `git rev-parse <ref>:<path>` yields the tree (dir) or blob (file) object id
  // for that path at that commit. Throws if the path is missing — fail loud.
  const lines = [`epoch:${EPOCH}`];
  for (const p of paths) {
    const oid = execFileSync('git', ['rev-parse', `${ref}:${p}`], {
      cwd,
      encoding: 'utf8',
    }).trim();
    lines.push(`${p}:${oid}`);
  }
  return createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 16);
}

module.exports = { serviceContentHash, SERVICES, INPUTS, EPOCH };

if (require.main === module) {
  const [service, ref] = process.argv.slice(2);
  if (!service) {
    console.error('usage: node scripts/service-content-hash.cjs <service> [ref]');
    process.exit(1);
  }
  process.stdout.write(`${serviceContentHash(service, ref || 'HEAD')}\n`);
}
