# Node telemetry — SDD progress

Plan: docs/superpowers/plans/2026-09-23-telemetry-node.md
Branch: claude/telemetry-node
Task 1: complete (commits 2b0e455..0eb540d, review clean)
Minor (for final review): semconv.test.ts pins only 3 of 12 attribute values
against exact strings; a typo in the other 9 would pass. Plan-level gap —
tighten to `expect(RainbotAttr).toEqual({...})`.
Note for all later tasks: `yarn workspace <pkg> test` fails repo-wide
(jest not on the workspace PATH). Use `yarn turbo run test --filter=<pkg>`.
Task 2: complete — src/node/sdk.ts + src/node/index.ts + sdk.test.ts, per
task-2-report.md. yarn validate green repo-wide. No peer-dep fallout from
auto-instrumentations-node despite Task 1's flagged risk.
