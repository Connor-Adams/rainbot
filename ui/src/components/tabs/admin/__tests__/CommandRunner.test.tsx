import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import CommandRunner from '../CommandRunner';
import { useGuildStore } from '@/stores/guildStore';
import { renderWithQuery } from '@/test/renderWithQuery';

/**
 * CHARACTERIZATION TESTS — see the header comment on BotOperations.test.tsx.
 *
 * The ACCESSIBILITY GAP assertions this file used to carry (labels with no
 * associated control) were retired when the panel moved onto the design
 * system's `Field`, which wires `htmlFor` for every control. They now assert the
 * accessible name is present.
 */

vi.mock('@/lib/api', () => ({
  soundsApi: { list: vi.fn() },
  adminApi: { grokChat: vi.fn() },
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
}));

const { soundsApi, adminApi, botApi, playbackApi } = await import('@/lib/api');

const GUILD_ID = '111222333';

/** All nine commands, in the order the `<select>` lists them. */
const COMMAND_LABELS = [
  'Play (URL or query)',
  'Soundboard',
  'Speak (TTS)',
  'Chat (Grok)',
  'Stop',
  'Skip',
  'Pause / Resume',
  'Clear queue',
  'Replay last track',
];

function commandSelect(): HTMLSelectElement {
  // `Field` associates the visible "Command" label with the `<select>`, so it is
  // reachable by name rather than positionally.
  return screen.getByLabelText('Command') as HTMLSelectElement;
}

function runButton(): HTMLElement {
  return screen.getByRole('button', { name: /Run command|Running\.\.\./ });
}

beforeEach(() => {
  useGuildStore.setState({ selectedGuildId: GUILD_ID });
  vi.mocked(soundsApi.list).mockResolvedValue({
    data: [{ name: 'airhorn' }, { name: 'bruh' }],
  } as never);
  for (const fn of [
    playbackApi.play,
    playbackApi.soundboard,
    playbackApi.speak,
    playbackApi.stop,
    playbackApi.skip,
    playbackApi.pause,
    playbackApi.replay,
    botApi.clearQueue,
  ]) {
    vi.mocked(fn).mockResolvedValue({ data: { message: 'Command sent.' } } as never);
  }
  vi.mocked(adminApi.grokChat).mockResolvedValue({
    data: { reply: 'I am a convenience store philosopher.' },
  } as never);
});

afterEach(() => {
  useGuildStore.setState({ selectedGuildId: null });
});

describe('CommandRunner — no server selected', () => {
  it('replaces the whole form with an empty state', () => {
    useGuildStore.setState({ selectedGuildId: null });
    renderWithQuery(<CommandRunner />);

    expect(screen.getByText('No server selected')).toBeInTheDocument();
    expect(screen.getByText('Pick a server from the menu in the header.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('CommandRunner — initial render with a server selected', () => {
  it('renders the heading and explanation', () => {
    renderWithQuery(<CommandRunner />);

    expect(screen.getByText('Run commands')).toBeInTheDocument();
    expect(screen.getByText(/You must be in a voice channel/)).toBeInTheDocument();
  });

  it('lists all nine commands, in order, with "play" selected', () => {
    renderWithQuery(<CommandRunner />);

    const options = within(commandSelect()).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(COMMAND_LABELS);
    expect(commandSelect().value).toBe('play');
  });

  it('associates the "Command" label with the select', () => {
    // Was an ACCESSIBILITY GAP test: the label used to be a bare `<label>` with
    // neither `htmlFor` nor the control nested inside it, so the `<select>` had
    // no accessible name at all. `Field` supplies both.
    renderWithQuery(<CommandRunner />);

    expect(screen.getByText('Command')).toBeInTheDocument();
    expect(screen.getByLabelText('Command').tagName).toBe('SELECT');
    expect(commandSelect()).toHaveAccessibleName('Command');
  });

  it('shows the play input, reachable only by placeholder, and disables Run', () => {
    renderWithQuery(<CommandRunner />);

    expect(screen.getByText('URL or search query')).toBeInTheDocument();
    // Was only findable by placeholder; `Field` now associates the label too.
    expect(screen.getByLabelText('URL or search query')).toBe(
      screen.getByPlaceholderText('YouTube, Spotify, or search...')
    );
    expect(runButton()).toBeDisabled();
  });
});

describe('CommandRunner — "play"', () => {
  it('enables Run once the field is non-blank, and not for whitespace alone', () => {
    renderWithQuery(<CommandRunner />);
    const input = screen.getByPlaceholderText('YouTube, Spotify, or search...');

    fireEvent.change(input, { target: { value: '   ' } });
    expect(runButton()).toBeDisabled();

    fireEvent.change(input, { target: { value: 'never gonna give you up' } });
    expect(runButton()).toBeEnabled();
  });

  it('calls playbackApi.play with the guild id and the trimmed source', async () => {
    renderWithQuery(<CommandRunner />);

    fireEvent.change(screen.getByPlaceholderText('YouTube, Spotify, or search...'), {
      target: { value: '  https://youtu.be/dQw4w9WgXcQ  ' },
    });
    fireEvent.click(runButton());

    await waitFor(() =>
      expect(playbackApi.play).toHaveBeenCalledWith(GUILD_ID, 'https://youtu.be/dQw4w9WgXcQ')
    );
  });

  it('relabels the button "Running..." and disables it while in flight', async () => {
    vi.mocked(playbackApi.play).mockReturnValue(new Promise<never>(() => {}) as never);
    renderWithQuery(<CommandRunner />);

    fireEvent.change(screen.getByPlaceholderText('YouTube, Spotify, or search...'), {
      target: { value: 'a song' },
    });
    fireEvent.click(runButton());

    const button = await screen.findByRole('button', { name: 'Running...' });
    expect(button).toBeDisabled();
  });
});

describe('CommandRunner — "soundboard"', () => {
  function selectSoundboard() {
    fireEvent.change(commandSelect(), { target: { value: 'soundboard' } });
  }

  it('offers the sounds from the API behind a placeholder option', async () => {
    renderWithQuery(<CommandRunner />);
    selectSoundboard();

    const soundSelect = await waitFor(() => {
      const selects = screen.getAllByRole('combobox');
      expect(selects).toHaveLength(2);
      return selects[1];
    });
    await waitFor(() =>
      expect(
        within(soundSelect)
          .getAllByRole('option')
          .map((o) => o.textContent)
      ).toEqual(['Select or type below...', 'airhorn', 'bruh'])
    );
  });

  it('names both soundboard controls', async () => {
    // The visible "Sound name" label belongs to the dropdown, so the free-text
    // field carries an `aria-label` instead of a second, duplicate visible one.
    renderWithQuery(<CommandRunner />);
    selectSoundboard();

    expect(screen.getByLabelText('Sound name').tagName).toBe('SELECT');
    expect(await screen.findByLabelText('Or type sound name')).toBe(
      screen.getByPlaceholderText('Or type sound name')
    );
  });

  it('binds the free-text field and the dropdown to the same value', async () => {
    // Both controls write `soundboardSound`, so typing a name moves the
    // dropdown too (and typing a name that is not in the list empties it).
    renderWithQuery(<CommandRunner />);
    selectSoundboard();

    const typed = await screen.findByPlaceholderText('Or type sound name');
    fireEvent.change(typed, { target: { value: 'bruh' } });

    const soundSelect = screen.getAllByRole('combobox')[1] as HTMLSelectElement;
    await waitFor(() => expect(soundSelect.value).toBe('bruh'));
  });

  it('calls playbackApi.soundboard with the trimmed sound name', async () => {
    renderWithQuery(<CommandRunner />);
    selectSoundboard();

    fireEvent.change(await screen.findByPlaceholderText('Or type sound name'), {
      target: { value: '  airhorn  ' },
    });
    fireEvent.click(runButton());

    await waitFor(() => expect(playbackApi.soundboard).toHaveBeenCalledWith(GUILD_ID, 'airhorn'));
  });
});

describe('CommandRunner — "speak"', () => {
  it('calls playbackApi.speak with the trimmed text', async () => {
    renderWithQuery(<CommandRunner />);
    fireEvent.change(commandSelect(), { target: { value: 'speak' } });

    expect(screen.getByText('Text to speak (TTS)')).toBeInTheDocument();
    expect(screen.getByLabelText('Text to speak (TTS)')).toBe(
      screen.getByPlaceholderText('What should the bot say?')
    );
    fireEvent.change(screen.getByPlaceholderText('What should the bot say?'), {
      target: { value: '  hello world  ' },
    });
    fireEvent.click(runButton());

    await waitFor(() => expect(playbackApi.speak).toHaveBeenCalledWith(GUILD_ID, 'hello world'));
  });
});

describe('CommandRunner — "grok"', () => {
  function selectGrok() {
    fireEvent.change(commandSelect(), { target: { value: 'grok' } });
  }

  it('associates the "Message for Grok" label with its input', () => {
    renderWithQuery(<CommandRunner />);
    selectGrok();

    expect(screen.getByLabelText('Message for Grok')).toBe(
      screen.getByPlaceholderText('Ask Grok anything...')
    );
  });

  it('offers a "speak reply" checkbox, checked by default, with a real label', () => {
    // This label DOES wrap its control, so unlike the others it has an
    // accessible name. Kept as a contrast case with the GAP tests above.
    renderWithQuery(<CommandRunner />);
    selectGrok();

    const checkbox = screen.getByLabelText('Speak reply in voice channel (Pranjeet TTS)');
    expect(checkbox).toBeChecked();
  });

  it('calls adminApi.grokChat with the trimmed text and speakReply=true', async () => {
    renderWithQuery(<CommandRunner />);
    selectGrok();

    fireEvent.change(screen.getByPlaceholderText('Ask Grok anything...'), {
      target: { value: '  what is a hot dog  ' },
    });
    fireEvent.click(runButton());

    await waitFor(() =>
      expect(adminApi.grokChat).toHaveBeenCalledWith(GUILD_ID, 'what is a hot dog', true)
    );
  });

  it('passes speakReply=false once the checkbox is cleared', async () => {
    renderWithQuery(<CommandRunner />);
    selectGrok();

    fireEvent.click(screen.getByLabelText('Speak reply in voice channel (Pranjeet TTS)'));
    fireEvent.change(screen.getByPlaceholderText('Ask Grok anything...'), {
      target: { value: 'hi' },
    });
    fireEvent.click(runButton());

    await waitFor(() => expect(adminApi.grokChat).toHaveBeenCalledWith(GUILD_ID, 'hi', false));
  });

  it('prefixes the reply with "Grok: "', async () => {
    renderWithQuery(<CommandRunner />);
    selectGrok();

    fireEvent.change(screen.getByPlaceholderText('Ask Grok anything...'), {
      target: { value: 'hi' },
    });
    fireEvent.click(runButton());

    expect(
      await screen.findByText('Grok: I am a convenience store philosopher.')
    ).toBeInTheDocument();
  });

  it('falls back to the message when Grok returns no reply', async () => {
    vi.mocked(adminApi.grokChat).mockResolvedValue({
      data: { message: 'Queued for the voice worker.' },
    } as never);
    renderWithQuery(<CommandRunner />);
    selectGrok();

    fireEvent.change(screen.getByPlaceholderText('Ask Grok anything...'), {
      target: { value: 'hi' },
    });
    fireEvent.click(runButton());

    expect(await screen.findByText('Queued for the voice worker.')).toBeInTheDocument();
  });
});

describe('CommandRunner — commands that take no input', () => {
  const cases = [
    ['stop', () => playbackApi.stop],
    ['skip', () => playbackApi.skip],
    ['pause', () => playbackApi.pause],
    ['replay', () => playbackApi.replay],
    ['clear', () => botApi.clearQueue],
  ] as const;

  it.each(cases)(
    '%s enables Run immediately and calls its API with the guild id',
    async (command, getFn) => {
      renderWithQuery(<CommandRunner />);
      fireEvent.change(commandSelect(), { target: { value: command } });

      expect(runButton()).toBeEnabled();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

      fireEvent.click(runButton());

      await waitFor(() => expect(getFn()).toHaveBeenCalledWith(GUILD_ID));
    }
  );
});

describe('CommandRunner — result and error rendering', () => {
  it('falls back to "Command sent." when the API returns no message', async () => {
    vi.mocked(playbackApi.stop).mockResolvedValue({ data: {} } as never);
    renderWithQuery(<CommandRunner />);
    fireEvent.change(commandSelect(), { target: { value: 'stop' } });

    fireEvent.click(runButton());

    expect(await screen.findByText('Command sent.')).toBeInTheDocument();
  });

  it('prefers the API error body over the Error message', async () => {
    vi.mocked(playbackApi.stop).mockRejectedValue({
      response: { data: { error: 'Bot is not in a voice channel.' } },
      message: 'Request failed with status code 409',
    });
    renderWithQuery(<CommandRunner />);
    fireEvent.change(commandSelect(), { target: { value: 'stop' } });

    fireEvent.click(runButton());

    expect(await screen.findByText('Bot is not in a voice channel.')).toBeInTheDocument();
    expect(screen.queryByText(/status code 409/)).not.toBeInTheDocument();
  });

  it('falls back to "Command failed." when the rejection carries nothing readable', async () => {
    vi.mocked(playbackApi.stop).mockRejectedValue({});
    renderWithQuery(<CommandRunner />);
    fireEvent.change(commandSelect(), { target: { value: 'stop' } });

    fireEvent.click(runButton());

    expect(await screen.findByText('Command failed.')).toBeInTheDocument();
  });

  it('clears a previous error when the next run succeeds', async () => {
    vi.mocked(playbackApi.stop).mockRejectedValueOnce({ message: 'Network Error' });
    renderWithQuery(<CommandRunner />);
    fireEvent.change(commandSelect(), { target: { value: 'stop' } });

    fireEvent.click(runButton());
    await screen.findByText('Network Error');

    fireEvent.click(runButton());

    await waitFor(() => expect(screen.queryByText('Network Error')).not.toBeInTheDocument());
  });

  it('invalidates the queue and bot-status queries after a successful run', async () => {
    const { queryClient } = renderWithQuery(<CommandRunner />);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    fireEvent.change(commandSelect(), { target: { value: 'stop' } });

    fireEvent.click(runButton());

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['queue', GUILD_ID] }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['bot-status'] });
  });
});
