import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import GrokVoiceSettings from '../GrokVoiceSettings';
import { useGuildStore } from '@/stores/guildStore';
import { renderWithQuery } from '@/test/renderWithQuery';

/**
 * CHARACTERIZATION TESTS — see the header comment on BotOperations.test.tsx.
 * Assertions marked ACCESSIBILITY GAP describe markup that is wrong today and
 * are expected to be deleted by the rewrite.
 */

vi.mock('@/lib/api', () => ({
  adminApi: {
    getConversationMode: vi.fn(),
    setConversationMode: vi.fn(),
    getGrokVoice: vi.fn(),
    setGrokVoice: vi.fn(),
    getGrokPersona: vi.fn(),
    setGrokPersona: vi.fn(),
    getPersonas: vi.fn(),
  },
}));

const { adminApi } = await import('@/lib/api');

const GUILD_ID = '111222333';

const VOICE_LABELS = [
  'Ara (female, warm)',
  'Rex (male, professional)',
  'Sal (neutral, smooth)',
  'Eve (female, energetic)',
  'Leo (male, authoritative)',
];

/** The two `<select>`s have no accessible name, so they are found by position. */
function voiceSelect(): HTMLSelectElement {
  return screen.getAllByRole('combobox')[0] as HTMLSelectElement;
}
function personaSelect(): HTMLSelectElement {
  return screen.getAllByRole('combobox')[1] as HTMLSelectElement;
}

beforeEach(() => {
  useGuildStore.setState({ selectedGuildId: GUILD_ID });
  vi.mocked(adminApi.getConversationMode).mockResolvedValue({
    data: { enabled: false },
  } as never);
  vi.mocked(adminApi.getGrokVoice).mockResolvedValue({ data: { voice: null } } as never);
  vi.mocked(adminApi.getGrokPersona).mockResolvedValue({ data: { personaId: null } } as never);
  vi.mocked(adminApi.getPersonas).mockResolvedValue({
    data: {
      personas: [
        { id: 'default', name: 'Convenience store philosopher', isBuiltIn: true },
        { id: 'pirate', name: 'Pirate', isBuiltIn: true },
        { id: 'custom-1', name: 'Dour accountant', isBuiltIn: false },
      ],
    },
  } as never);
  vi.mocked(adminApi.setConversationMode).mockResolvedValue({
    data: { enabled: true },
  } as never);
  vi.mocked(adminApi.setGrokVoice).mockResolvedValue({ data: { voice: 'Rex' } } as never);
  vi.mocked(adminApi.setGrokPersona).mockResolvedValue({
    data: { personaId: 'custom-1' },
  } as never);
});

afterEach(() => {
  useGuildStore.setState({ selectedGuildId: null });
});

describe('GrokVoiceSettings — no server selected', () => {
  it('replaces the whole panel with an empty state and issues no guild queries', () => {
    useGuildStore.setState({ selectedGuildId: null });
    renderWithQuery(<GrokVoiceSettings />);

    expect(screen.getByText('No server selected')).toBeInTheDocument();
    expect(screen.getByText('Pick a server from the menu in the header.')).toBeInTheDocument();
    expect(adminApi.getConversationMode).not.toHaveBeenCalled();
    expect(adminApi.getGrokVoice).not.toHaveBeenCalled();
    expect(adminApi.getGrokPersona).not.toHaveBeenCalled();
  });
});

describe('GrokVoiceSettings — conversation mode', () => {
  it('shows an ellipsis and disables both buttons until the mode has loaded', () => {
    vi.mocked(adminApi.getConversationMode).mockReturnValue(new Promise<never>(() => {}) as never);
    renderWithQuery(<GrokVoiceSettings />);

    expect(screen.getByText('…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Turn off' })).toBeDisabled();
  });

  it('reads "Off" and offers only "Turn on" when the mode is off', async () => {
    renderWithQuery(<GrokVoiceSettings />);

    expect(await screen.findByText('Off')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Turn off' })).toBeDisabled();
  });

  it('reads "On" and offers only "Turn off" when the mode is on', async () => {
    vi.mocked(adminApi.getConversationMode).mockResolvedValue({
      data: { enabled: true },
    } as never);
    renderWithQuery(<GrokVoiceSettings />);

    expect(await screen.findByText('On')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Turn off' })).toBeEnabled();
  });

  it('calls setConversationMode with enabled=true on "Turn on"', async () => {
    renderWithQuery(<GrokVoiceSettings />);
    await screen.findByText('Off');

    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));

    await waitFor(() => expect(adminApi.setConversationMode).toHaveBeenCalledWith(GUILD_ID, true));
  });

  it('calls setConversationMode with enabled=false on "Turn off"', async () => {
    vi.mocked(adminApi.getConversationMode).mockResolvedValue({
      data: { enabled: true },
    } as never);
    renderWithQuery(<GrokVoiceSettings />);
    await screen.findByText('On');

    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));

    await waitFor(() => expect(adminApi.setConversationMode).toHaveBeenCalledWith(GUILD_ID, false));
  });

  it('surfaces the Error message when the toggle fails', async () => {
    vi.mocked(adminApi.setConversationMode).mockRejectedValue(
      new Error('Voice worker unreachable')
    );
    renderWithQuery(<GrokVoiceSettings />);
    await screen.findByText('Off');

    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));

    expect(await screen.findByText('Voice worker unreachable')).toBeInTheDocument();
  });

  it('falls back to "Failed to update" when the rejection has no message', async () => {
    vi.mocked(adminApi.setConversationMode).mockRejectedValue({});
    renderWithQuery(<GrokVoiceSettings />);
    await screen.findByText('Off');

    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));

    expect(await screen.findByText('Failed to update')).toBeInTheDocument();
  });
});

describe('GrokVoiceSettings — Grok voice', () => {
  it('ACCESSIBILITY GAP: the "Grok voice" label is not associated with its select', async () => {
    renderWithQuery(<GrokVoiceSettings />);
    await screen.findByText('Off');

    expect(screen.getByText('Grok voice')).toBeInTheDocument();
    expect(() => screen.getByLabelText('Grok voice')).toThrow(
      /no form control was found associated/
    );
    expect(voiceSelect()).not.toHaveAccessibleName();
  });

  it('lists the five voices and defaults to Ara when the server has none set', async () => {
    renderWithQuery(<GrokVoiceSettings />);
    await screen.findByText('Off');

    await waitFor(() =>
      expect(
        within(voiceSelect())
          .getAllByRole('option')
          .map((o) => o.textContent)
      ).toEqual(VOICE_LABELS)
    );
    expect(voiceSelect().value).toBe('Ara');
  });

  it('shows the stored voice when the server has one', async () => {
    vi.mocked(adminApi.getGrokVoice).mockResolvedValue({ data: { voice: 'Leo' } } as never);
    renderWithQuery(<GrokVoiceSettings />);

    await waitFor(() => expect(voiceSelect().value).toBe('Leo'));
  });

  it('saves on change, with no separate confirm step', async () => {
    renderWithQuery(<GrokVoiceSettings />);
    await waitFor(() => expect(voiceSelect().value).toBe('Ara'));

    fireEvent.change(voiceSelect(), { target: { value: 'Rex' } });

    await waitFor(() => expect(adminApi.setGrokVoice).toHaveBeenCalledWith(GUILD_ID, 'Rex'));
    expect(adminApi.setGrokVoice).toHaveBeenCalledTimes(1);
  });

  it('updates the select optimistically, before the request settles', async () => {
    vi.mocked(adminApi.setGrokVoice).mockReturnValue(new Promise<never>(() => {}) as never);
    renderWithQuery(<GrokVoiceSettings />);
    await waitFor(() => expect(voiceSelect().value).toBe('Ara'));

    fireEvent.change(voiceSelect(), { target: { value: 'Sal' } });

    await waitFor(() => expect(voiceSelect().value).toBe('Sal'));
    expect(voiceSelect()).toBeDisabled();
  });

  it('rolls the select back to the previous voice when the save fails', async () => {
    vi.mocked(adminApi.getGrokVoice).mockResolvedValue({ data: { voice: 'Leo' } } as never);
    vi.mocked(adminApi.setGrokVoice).mockRejectedValue(new Error('nope'));
    renderWithQuery(<GrokVoiceSettings />);
    await waitFor(() => expect(voiceSelect().value).toBe('Leo'));

    fireEvent.change(voiceSelect(), { target: { value: 'Eve' } });

    await waitFor(() => expect(voiceSelect().value).toBe('Leo'));
  });

  it('prefers the API error body over the Error message', async () => {
    vi.mocked(adminApi.setGrokVoice).mockRejectedValue({
      response: { data: { error: 'Unknown voice' } },
      message: 'Request failed with status code 400',
    });
    renderWithQuery(<GrokVoiceSettings />);
    await waitFor(() => expect(voiceSelect().value).toBe('Ara'));

    fireEvent.change(voiceSelect(), { target: { value: 'Rex' } });

    expect(await screen.findByText('Unknown voice')).toBeInTheDocument();
  });

  it('falls back to "Failed to update voice" when the rejection is bare', async () => {
    vi.mocked(adminApi.setGrokVoice).mockRejectedValue({});
    renderWithQuery(<GrokVoiceSettings />);
    await waitFor(() => expect(voiceSelect().value).toBe('Ara'));

    fireEvent.change(voiceSelect(), { target: { value: 'Rex' } });

    expect(await screen.findByText('Failed to update voice')).toBeInTheDocument();
  });
});

describe('GrokVoiceSettings — Grok persona', () => {
  it('ACCESSIBILITY GAP: the "Grok persona" label is not associated with its select', async () => {
    renderWithQuery(<GrokVoiceSettings />);
    await screen.findByText('Off');

    expect(screen.getByText('Grok persona')).toBeInTheDocument();
    expect(() => screen.getByLabelText('Grok persona')).toThrow(
      /no form control was found associated/
    );
    expect(personaSelect()).not.toHaveAccessibleName();
  });

  it('hides the "default" persona behind a hardcoded option and tags built-ins', async () => {
    renderWithQuery(<GrokVoiceSettings />);
    await screen.findByText('Off');

    await waitFor(() =>
      expect(
        within(personaSelect())
          .getAllByRole('option')
          .map((o) => o.textContent)
      ).toEqual(['Default (Convenience store philosopher)', 'Pirate (built-in)', 'Dour accountant'])
    );
    expect(personaSelect().value).toBe('');
  });

  it('saves the chosen persona id', async () => {
    renderWithQuery(<GrokVoiceSettings />);
    // Wait for the personas list, not just the select: a `<select>` silently
    // refuses a value that is not yet one of its options, so changing it before
    // the list loads leaves the value at '' and saves `null` instead.
    await screen.findByRole('option', { name: 'Dour accountant' });

    fireEvent.change(personaSelect(), { target: { value: 'custom-1' } });

    await waitFor(() => expect(adminApi.setGrokPersona).toHaveBeenCalledWith(GUILD_ID, 'custom-1'));
  });

  it('sends null, not an empty string, when the default option is chosen', async () => {
    vi.mocked(adminApi.getGrokPersona).mockResolvedValue({
      data: { personaId: 'custom-1' },
    } as never);
    renderWithQuery(<GrokVoiceSettings />);
    await waitFor(() => expect(personaSelect().value).toBe('custom-1'));

    fireEvent.change(personaSelect(), { target: { value: '' } });

    await waitFor(() => expect(adminApi.setGrokPersona).toHaveBeenCalledWith(GUILD_ID, null));
  });

  it('rolls the select back to the previous persona when the save fails', async () => {
    vi.mocked(adminApi.getGrokPersona).mockResolvedValue({
      data: { personaId: 'custom-1' },
    } as never);
    vi.mocked(adminApi.setGrokPersona).mockRejectedValue(new Error('nope'));
    renderWithQuery(<GrokVoiceSettings />);
    await waitFor(() => expect(personaSelect().value).toBe('custom-1'));

    fireEvent.change(personaSelect(), { target: { value: '' } });

    await waitFor(() => expect(personaSelect().value).toBe('custom-1'));
  });

  it('falls back to "Failed to update persona" when the rejection is bare', async () => {
    vi.mocked(adminApi.setGrokPersona).mockRejectedValue({});
    renderWithQuery(<GrokVoiceSettings />);
    await screen.findByRole('option', { name: 'Dour accountant' });

    fireEvent.change(personaSelect(), { target: { value: 'custom-1' } });

    expect(await screen.findByText('Failed to update persona')).toBeInTheDocument();
  });
});
