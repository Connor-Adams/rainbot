import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import SoundLibraryMaintenance from '../SoundLibraryMaintenance';
import { createTestQueryClient, renderWithQuery } from '@/test/renderWithQuery';

/** CHARACTERIZATION TESTS — see the header comment on BotOperations.test.tsx. */

vi.mock('@/lib/api', () => ({
  soundsApi: {
    sweepTranscode: vi.fn(),
    sweepStripVideo: vi.fn(),
    analyzeSweep: vi.fn(),
  },
}));

const { soundsApi } = await import('@/lib/api');

function pendingForever() {
  return new Promise<never>(() => {}) as never;
}

/** Click the confirm button of the open dialog (it is the last one rendered). */
function confirmDialog(label: string) {
  const buttons = screen.getAllByRole('button', { name: label });
  fireEvent.click(buttons[buttons.length - 1]);
}

beforeEach(() => {
  vi.mocked(soundsApi.sweepTranscode).mockResolvedValue({
    data: { converted: 4, deleted: 4, skipped: 11 },
  } as never);
  vi.mocked(soundsApi.sweepStripVideo).mockResolvedValue({
    data: { stripped: 18, archived: 18, skipped: 200, failed: 0 },
  } as never);
  vi.mocked(soundsApi.analyzeSweep).mockResolvedValue({
    data: { analyzed: 12, skipped: 3, failed: 1 },
  } as never);
});

describe('SoundLibraryMaintenance — layout', () => {
  it('renders exactly three cards, each with one action', () => {
    renderWithQuery(<SoundLibraryMaintenance />);

    expect(screen.getByText('Transcode and Cleanup')).toBeInTheDocument();
    expect(screen.getByText('Search Analysis')).toBeInTheDocument();
    expect(screen.getByText('Strip Hidden Video')).toBeInTheDocument();

    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Run Transcode Sweep',
      'Analyze sounds for search',
      'Strip video from sounds',
    ]);
  });

  it('shows no results before anything has run', () => {
    renderWithQuery(<SoundLibraryMaintenance />);

    expect(screen.queryByText(/Converted:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Analyzed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Rewrote/)).not.toBeInTheDocument();
  });
});

describe('SoundLibraryMaintenance — transcode sweep', () => {
  it('confirms before running, and does not run on cancel', async () => {
    renderWithQuery(<SoundLibraryMaintenance />);

    fireEvent.click(screen.getByRole('button', { name: 'Run Transcode Sweep' }));

    expect(await screen.findByText('Run the transcode sweep?')).toBeInTheDocument();
    expect(
      screen.getByText(
        'This rewrites sound files and deletes the originals. This cannot be undone.'
      )
    ).toBeInTheDocument();
    expect(soundsApi.sweepTranscode).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByText('Run the transcode sweep?')).not.toBeInTheDocument()
    );
    expect(soundsApi.sweepTranscode).not.toHaveBeenCalled();
  });

  it('runs with deleteOriginal: true on confirm', async () => {
    renderWithQuery(<SoundLibraryMaintenance />);

    fireEvent.click(screen.getByRole('button', { name: 'Run Transcode Sweep' }));
    await screen.findByText('Run the transcode sweep?');
    confirmDialog('Run sweep');

    await waitFor(() =>
      expect(soundsApi.sweepTranscode).toHaveBeenCalledWith({ deleteOriginal: true })
    );
  });

  it('shows "Working..." and disables the button while sweeping', async () => {
    vi.mocked(soundsApi.sweepTranscode).mockReturnValue(pendingForever());
    renderWithQuery(<SoundLibraryMaintenance />);

    fireEvent.click(screen.getByRole('button', { name: 'Run Transcode Sweep' }));
    await screen.findByText('Run the transcode sweep?');
    confirmDialog('Run sweep');

    const button = await screen.findByRole('button', { name: 'Working...' });
    expect(button).toBeDisabled();
  });

  it('keeps the button disabled across an unmount and remount', async () => {
    // The mutation key exists so switching admin sub-tabs mid-sweep cannot
    // re-enable the button and let a second concurrent pass start.
    vi.mocked(soundsApi.sweepTranscode).mockReturnValue(pendingForever());
    const queryClient = createTestQueryClient();
    const first = renderWithQuery(<SoundLibraryMaintenance />, { queryClient });

    fireEvent.click(screen.getByRole('button', { name: 'Run Transcode Sweep' }));
    await screen.findByText('Run the transcode sweep?');
    confirmDialog('Run sweep');
    await screen.findByRole('button', { name: 'Working...' });
    first.unmount();

    renderWithQuery(<SoundLibraryMaintenance />, { queryClient });

    expect(await screen.findByRole('button', { name: 'Working...' })).toBeDisabled();
  });

  it('renders the three counters on success', async () => {
    renderWithQuery(<SoundLibraryMaintenance />);

    fireEvent.click(screen.getByRole('button', { name: 'Run Transcode Sweep' }));
    await screen.findByText('Run the transcode sweep?');
    confirmDialog('Run sweep');

    expect(await screen.findByText(/Converted: 4/)).toHaveTextContent(
      'Converted: 4 | Deleted: 4 | Skipped: 11'
    );
  });

  it('renders a fixed sentence on failure, discarding the reason', async () => {
    // Unlike the other two sweeps this one does not read the error at all.
    vi.mocked(soundsApi.sweepTranscode).mockRejectedValue({
      response: { data: { error: 'ffmpeg is not installed' } },
    });
    renderWithQuery(<SoundLibraryMaintenance />);

    fireEvent.click(screen.getByRole('button', { name: 'Run Transcode Sweep' }));
    await screen.findByText('Run the transcode sweep?');
    confirmDialog('Run sweep');

    expect(await screen.findByText('Failed to start sweep.')).toBeInTheDocument();
    expect(screen.queryByText('ffmpeg is not installed')).not.toBeInTheDocument();
  });

  it('refreshes the sounds list after a successful sweep', async () => {
    const { queryClient } = renderWithQuery(<SoundLibraryMaintenance />);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    fireEvent.click(screen.getByRole('button', { name: 'Run Transcode Sweep' }));
    await screen.findByText('Run the transcode sweep?');
    confirmDialog('Run sweep');

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['sounds'] }));
  });
});

describe('SoundLibraryMaintenance — search analysis', () => {
  it('runs immediately, with no confirmation step', async () => {
    renderWithQuery(<SoundLibraryMaintenance />);

    fireEvent.click(screen.getByRole('button', { name: 'Analyze sounds for search' }));

    await waitFor(() => expect(soundsApi.analyzeSweep).toHaveBeenCalledWith({ force: false }));
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('shows "Analyzing..." while in flight', async () => {
    vi.mocked(soundsApi.analyzeSweep).mockReturnValue(pendingForever());
    renderWithQuery(<SoundLibraryMaintenance />);

    fireEvent.click(screen.getByRole('button', { name: 'Analyze sounds for search' }));

    expect(await screen.findByRole('button', { name: 'Analyzing...' })).toBeDisabled();
  });

  it('renders the three counters on success', async () => {
    renderWithQuery(<SoundLibraryMaintenance />);

    fireEvent.click(screen.getByRole('button', { name: 'Analyze sounds for search' }));

    expect(await screen.findByText('Analyzed 12, skipped 3, failed 1.')).toBeInTheDocument();
  });

  it('prefers the API error body over the Error message', async () => {
    vi.mocked(soundsApi.analyzeSweep).mockRejectedValue({
      response: { data: { error: 'GROK_API_KEY is not set' } },
      message: 'Request failed with status code 500',
    });
    renderWithQuery(<SoundLibraryMaintenance />);

    fireEvent.click(screen.getByRole('button', { name: 'Analyze sounds for search' }));

    expect(await screen.findByText('GROK_API_KEY is not set')).toBeInTheDocument();
  });

  it('falls back to "Analysis sweep failed." for a bare rejection', async () => {
    vi.mocked(soundsApi.analyzeSweep).mockRejectedValue({});
    renderWithQuery(<SoundLibraryMaintenance />);

    fireEvent.click(screen.getByRole('button', { name: 'Analyze sounds for search' }));

    expect(await screen.findByText('Analysis sweep failed.')).toBeInTheDocument();
  });

  it('refreshes the sound-search index, not the sounds list', async () => {
    const { queryClient } = renderWithQuery(<SoundLibraryMaintenance />);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    fireEvent.click(screen.getByRole('button', { name: 'Analyze sounds for search' }));

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['sound-search'] }));
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['sounds'] });
  });
});

describe('SoundLibraryMaintenance — strip hidden video', () => {
  it('confirms before running', async () => {
    renderWithQuery(<SoundLibraryMaintenance />);

    fireEvent.click(screen.getByRole('button', { name: 'Strip video from sounds' }));

    expect(await screen.findByText('Strip video from all sounds?')).toBeInTheDocument();
    expect(
      screen.getByText(
        'This rewrites every sound in the library. Originals are archived, not kept in place.'
      )
    ).toBeInTheDocument();
    expect(soundsApi.sweepStripVideo).not.toHaveBeenCalled();
  });

  it('runs with no arguments on confirm', async () => {
    renderWithQuery(<SoundLibraryMaintenance />);

    fireEvent.click(screen.getByRole('button', { name: 'Strip video from sounds' }));
    await screen.findByText('Strip video from all sounds?');
    confirmDialog('Strip video');

    await waitFor(() => expect(soundsApi.sweepStripVideo).toHaveBeenCalledWith());
  });

  it('renders the four counters on success', async () => {
    renderWithQuery(<SoundLibraryMaintenance />);

    fireEvent.click(screen.getByRole('button', { name: 'Strip video from sounds' }));
    await screen.findByText('Strip video from all sounds?');
    confirmDialog('Strip video');

    expect(
      await screen.findByText('Rewrote 18, archived 18, left alone 200, failed 0.')
    ).toBeInTheDocument();
  });

  it('renders the failure reason in the same slot as the success counters', async () => {
    vi.mocked(soundsApi.sweepStripVideo).mockRejectedValue({
      response: { data: { error: 'ffmpeg exited 1' } },
    });
    renderWithQuery(<SoundLibraryMaintenance />);

    fireEvent.click(screen.getByRole('button', { name: 'Strip video from sounds' }));
    await screen.findByText('Strip video from all sounds?');
    confirmDialog('Strip video');

    expect(await screen.findByText('ffmpeg exited 1')).toBeInTheDocument();
  });

  it('falls back to "Video strip sweep failed." for a bare rejection', async () => {
    vi.mocked(soundsApi.sweepStripVideo).mockRejectedValue({});
    renderWithQuery(<SoundLibraryMaintenance />);

    fireEvent.click(screen.getByRole('button', { name: 'Strip video from sounds' }));
    await screen.findByText('Strip video from all sounds?');
    confirmDialog('Strip video');

    expect(await screen.findByText('Video strip sweep failed.')).toBeInTheDocument();
  });
});
