import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { act } from '@testing-library/react';
import BotOperations from '../BotOperations';
import CommandRunner from '../CommandRunner';
import GrokVoiceSettings from '../GrokVoiceSettings';
import PersonaManager from '../PersonaManager';
import SoundLibraryMaintenance from '../SoundLibraryMaintenance';
import YoutubeIngestSettings from '../YoutubeIngestSettings';
import { useGuildStore } from '@/stores/guildStore';
import { renderWithQuery } from '@/test/renderWithQuery';

/**
 * Guard against the two class-name failures this app has actually shipped, both
 * of which `tsc` and prettier are blind to:
 *
 *  1. ~24 controls referencing `.btn` / `.btn-primary` / `.input` — class names
 *     defined nowhere in the app or in either design-system package, so they
 *     carried no style at all.
 *  2. Three Tailwind colour names used in `text-*` / `bg-*` utilities that were
 *     absent from `tailwind.config.js`, so those utilities were never generated.
 *
 * Checked two ways, because neither alone is enough:
 *
 *  - against each component's SOURCE TEXT, which is what Tailwind's own content
 *    scanner reads, and which covers branches a test never renders (the error
 *    line that only appears after a failed request, for instance);
 *  - against what the components actually RENDER, which covers a class name
 *    assembled at runtime rather than written as a literal.
 */

vi.mock('@/lib/api', () => ({
  adminApi: {
    deployCommands: vi.fn(),
    grokChat: vi.fn(),
    getConversationMode: vi.fn(),
    setConversationMode: vi.fn(),
    getGrokVoice: vi.fn(),
    setGrokVoice: vi.fn(),
    getGrokPersona: vi.fn(),
    setGrokPersona: vi.fn(),
    getPersonas: vi.fn(),
    getPersona: vi.fn(),
    createPersona: vi.fn(),
    updatePersona: vi.fn(),
    deletePersona: vi.fn(),
  },
  botApi: { clearQueue: vi.fn() },
  playbackApi: {
    play: vi.fn(),
    soundboard: vi.fn(),
    speak: vi.fn(),
    stop: vi.fn(),
    skip: vi.fn(),
    pause: vi.fn(),
    replay: vi.fn(),
  },
  soundsApi: {
    list: vi.fn(),
    sweepTranscode: vi.fn(),
    sweepStripVideo: vi.fn(),
    analyzeSweep: vi.fn(),
  },
  settingsApi: {
    getYoutubeCookies: vi.fn(),
    uploadYoutubeCookies: vi.fn(),
    deleteYoutubeCookies: vi.fn(),
    getYoutubeProxy: vi.fn(),
    setYoutubeProxy: vi.fn(),
    deleteYoutubeProxy: vi.fn(),
  },
}));

const { adminApi, soundsApi, settingsApi } = await import('@/lib/api');

const PANELS: [string, () => ReactElement][] = [
  ['BotOperations', () => <BotOperations />],
  ['CommandRunner', () => <CommandRunner />],
  ['GrokVoiceSettings', () => <GrokVoiceSettings />],
  ['PersonaManager', () => <PersonaManager />],
  ['SoundLibraryMaintenance', () => <SoundLibraryMaintenance />],
  ['YoutubeIngestSettings', () => <YoutubeIngestSettings />],
];

/** Utility prefixes that take a colour as their value. */
const COLOUR_PREFIXES = [
  'text',
  'bg',
  'border',
  'ring',
  'divide',
  'outline',
  'decoration',
  'shadow',
  'from',
  'via',
  'to',
  'fill',
  'stroke',
  'accent',
  'caret',
  'placeholder',
];

/**
 * Class names the app used to reference and that resolve to nothing. Anything
 * matching these as a whole token is a styling no-op.
 */
const PHANTOM_CLASSES = [
  'btn',
  'btn-primary',
  'btn-secondary',
  'btn-danger',
  'btn-ghost',
  'btn-sm',
  'btn-lg',
  'input',
  'input-field',
  'card',
  'stats-error',
];

type ColourTree = Record<string, string | Record<string, string>>;

let colours: ColourTree;
/** Top-level names in the config's custom palette, e.g. `danger`, `surface`. */
let colourRoots: Set<string>;

beforeAll(async () => {
  // @ts-expect-error tailwind.config.js is plain JS with no type declarations,
  // and `allowJs` is off for the app project.
  const mod = await import('../../../../../tailwind.config.js');
  colours = mod.default.theme.extend.colors as ColourTree;
  colourRoots = new Set(Object.keys(colours));
  // Premise check: if the config stops shaping like this the assertions below
  // would silently stop checking anything.
  expect(colourRoots.size).toBeGreaterThan(5);
  expect(colourRoots).toContain('danger');
});

beforeEach(() => {
  useGuildStore.setState({ selectedGuildId: '111222333' });
  vi.mocked(adminApi.getConversationMode).mockResolvedValue({
    data: { enabled: false },
  } as never);
  vi.mocked(adminApi.getGrokVoice).mockResolvedValue({ data: { voice: null } } as never);
  vi.mocked(adminApi.getGrokPersona).mockResolvedValue({ data: { personaId: null } } as never);
  vi.mocked(adminApi.getPersonas).mockResolvedValue({
    data: { personas: [{ id: 'custom-1', name: 'Dour accountant', isBuiltIn: false }] },
  } as never);
  vi.mocked(soundsApi.list).mockResolvedValue({ data: [{ name: 'airhorn' }] } as never);
  vi.mocked(settingsApi.getYoutubeCookies).mockResolvedValue({
    data: { hasCookies: true },
  } as never);
  vi.mocked(settingsApi.getYoutubeProxy).mockResolvedValue({
    data: { hasProxy: true, proxyUrl: 'socks5://p' },
  } as never);
});

/** Every distinct class token in the rendered tree. */
async function renderedClassTokens(element: ReactElement): Promise<Set<string>> {
  const { container } = renderWithQuery(element);
  // Let the queries settle so conditionally rendered branches (the "Remove
  // proxy" button, the personas list) are included in the harvest.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  const tokens = new Set<string>();
  for (const node of container.querySelectorAll<HTMLElement>('[class]')) {
    for (const token of node.className.split(/\s+/)) {
      if (token) tokens.add(token);
    }
  }
  return tokens;
}

/**
 * The six panels' source text, keyed by filename. This is the same input
 * Tailwind's `content` glob reads, so a class name that appears here and
 * resolves to nothing in the config is a utility Tailwind never generates.
 */
const PANEL_SOURCES = import.meta.glob('../*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Every whitespace-separated word inside a string or template literal. */
function sourceClassTokens(source: string): Set<string> {
  const tokens = new Set<string>();
  for (const match of source.matchAll(/(?:'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`)/g)) {
    const literal = match[1] ?? match[2] ?? match[3] ?? '';
    for (const token of literal.split(/\s+/)) {
      if (token) tokens.add(token);
    }
  }
  return tokens;
}

/**
 * Split a utility into its colour path, or null if it is not a colour utility
 * using the app's own palette. `text-danger-light` -> ['danger', 'light'].
 */
function colourPath(token: string): string[] | null {
  // Strip any variant prefixes (`hover:`, `focus:`, `md:`) and an `!important`
  // marker, then the leading `-` of a negative utility.
  const base = token.split(':').pop()!.replace(/^!/, '');
  const parts = base.split('-');
  if (parts.length < 2) return null;
  if (!COLOUR_PREFIXES.includes(parts[0])) return null;
  const rest = parts.slice(1);
  // Only names from the app's own palette are checkable here; Tailwind's
  // built-in scales and non-colour values (`text-xs`, `border-2`) fall through.
  if (!colourRoots.has(rest[0])) return null;
  // Drop an opacity modifier (`bg-primary/40`).
  return [rest[0], ...rest.slice(1)].map((p) => p.split('/')[0]);
}

/** True when the token names a palette colour the config does not define. */
function isUnresolvedColour(token: string): boolean {
  const path = colourPath(token);
  if (!path) return false;
  const [root, ...shade] = path;
  const group = colours[root];
  if (shade.length === 0) {
    // `text-danger` needs a DEFAULT, or a plain string value.
    return !(typeof group === 'string' || 'DEFAULT' in group);
  }
  const key = shade.join('-');
  return typeof group === 'string' || !(key in group);
}

describe.each(PANELS)('%s — rendered class names', (_name, render) => {
  it('references no class name that resolves to nothing', async () => {
    const tokens = await renderedClassTokens(render());

    const phantoms = [...tokens].filter((t) => PHANTOM_CLASSES.includes(t.split(':').pop()!));
    expect(phantoms).toEqual([]);
  });

  it('only uses colour names the Tailwind config actually defines', async () => {
    const tokens = await renderedClassTokens(render());

    const unresolved = [...tokens].filter(isUnresolvedColour);

    expect(unresolved).toEqual([]);
  });

  it('actually found colour utilities to check', async () => {
    // Without this the two tests above would pass on an empty set, which is the
    // failure mode the whole exercise is about.
    const tokens = await renderedClassTokens(render());

    expect([...tokens].filter((t) => colourPath(t) !== null).length).toBeGreaterThan(0);
  });
});

describe('admin panel source text', () => {
  it('picked up all six panels', () => {
    expect(
      Object.keys(PANEL_SOURCES)
        .map((k) => k.split('/').pop())
        .sort()
    ).toEqual([
      'BotOperations.tsx',
      'CommandRunner.tsx',
      'GrokVoiceSettings.tsx',
      'PersonaManager.tsx',
      'SoundLibraryMaintenance.tsx',
      'YoutubeIngestSettings.tsx',
    ]);
  });

  it.each(Object.entries(PANEL_SOURCES))(
    '%s references no class name that resolves to nothing',
    (_path, source) => {
      const tokens = sourceClassTokens(source);

      const phantoms = [...tokens].filter((t) => PHANTOM_CLASSES.includes(t.split(':').pop()!));
      expect(phantoms).toEqual([]);
    }
  );

  it.each(Object.entries(PANEL_SOURCES))(
    '%s only uses colour names the Tailwind config defines, on every branch',
    (_path, source) => {
      const unresolved = [...sourceClassTokens(source)].filter(isUnresolvedColour);

      expect(unresolved).toEqual([]);
    }
  );

  it.each(Object.entries(PANEL_SOURCES))(
    '%s actually yielded colour utilities to check',
    (_path, source) => {
      const checked = [...sourceClassTokens(source)].filter((t) => colourPath(t) !== null);

      expect(checked.length).toBeGreaterThan(0);
    }
  );
});
