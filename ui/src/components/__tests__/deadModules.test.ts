import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * These five things had no effect on anything the app renders, and each one
 * actively misled a reader:
 *
 * - `UserSounds.tsx` (53 lines) and `ServerSelector.tsx` — components with zero
 *   importers. `ServerSelector` was superseded by the header's `GuildPicker`.
 * - `header/UserDisplay.tsx` — a zero-byte file. TypeScript treats it as a
 *   module with no exports; a reader treats it as a component that must be
 *   wired up somewhere.
 * - `tabs/admin/shared.ts` — a module whose entire contents was a comment
 *   saying it was intentionally empty because deletion had been blocked.
 * - `STAT_VALUE_CLAMP` in `StatsSummary.tsx` — an empty-string constant under a
 *   12-line comment describing clamping it does not do, spread across all five
 *   `StatCard`s. The clamp it describes really does exist, but in
 *   `common/StatCard.tsx`, which applies it to every tile in the app.
 *
 * None of that is observable through the DOM, which is exactly why it survived
 * so long: no render test can fail on it. So this asserts it at the source
 * level. It is a guard against re-introduction, not a behaviour test — the
 * behaviour cover for the tiles is in `StatsSummary.test.tsx`.
 */
const uiSrc = resolve(__dirname, '../..');

describe('dead modules stay deleted', () => {
  it.each([
    'components/UserSounds.tsx',
    'components/ServerSelector.tsx',
    'components/header/UserDisplay.tsx',
    'components/tabs/admin/shared.ts',
  ])('%s does not exist', (relative) => {
    expect(existsSync(resolve(uiSrc, relative))).toBe(false);
  });

  /**
   * Two files had the same defect with different names: an empty-string
   * constant under a long comment describing clamping/truncation it does not
   * do, spread across the `StatCard`s of that section. Both are covered here
   * so neither comes back on its own.
   */
  it.each([
    ['components/tabs/stats/components/StatsSummary.tsx', 'STAT_VALUE_CLAMP'],
    ['components/tabs/stats/components/ErrorsStats.tsx', 'TRUNCATE_VALUE'],
  ])('%s carries no empty pass-through class constant', (relative, identifier) => {
    const source = readFileSync(resolve(uiSrc, relative), 'utf8');

    expect(source).not.toContain(identifier);
  });
});
