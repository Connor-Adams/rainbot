import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import BotOperations from '../BotOperations';
import { createTestQueryClient, renderWithQuery } from '@/test/renderWithQuery';

/**
 * CHARACTERIZATION TESTS — these describe what `BotOperations` does today, not
 * what it ought to do. The admin forms are about to be rewritten; anything
 * asserted here that the rewrite changes should be changed here deliberately,
 * in the same commit, with the change visible in review.
 *
 * Where the current markup is wrong (a label with no accessible name, a control
 * only reachable by placeholder) the test asserts the wrong thing on purpose and
 * says so, so the rewrite has to come back and delete the assertion rather than
 * quietly passing either way.
 */

vi.mock('@/lib/api', () => ({
  adminApi: {
    deployCommands: vi.fn(),
  },
}));

const { adminApi } = await import('@/lib/api');
const deployCommands = vi.mocked(adminApi.deployCommands);

/** A never-settling response, to hold the component in its pending state. */
function pendingForever() {
  return new Promise<never>(() => {});
}

beforeEach(() => {
  deployCommands.mockResolvedValue({
    data: { message: 'Deployed 12 command(s).', count: 12, guildId: null },
    // The component only reads `res.data`; the rest of the Axios envelope is
    // irrelevant to it, so the stub does not build one.
  } as never);
});

describe('BotOperations — initial render', () => {
  it('renders the section heading and explanation', () => {
    renderWithQuery(<BotOperations />);

    expect(screen.getByText('Redeploy slash commands')).toBeInTheDocument();
    expect(screen.getByText(/Re-register Discord slash commands with Discord/)).toBeInTheDocument();
  });

  it('exposes exactly one enabled button, named "Redeploy commands"', () => {
    renderWithQuery(<BotOperations />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName('Redeploy commands');
    expect(buttons[0]).toBeEnabled();
  });

  it('shows no result message before anything has been run', () => {
    renderWithQuery(<BotOperations />);

    expect(screen.queryByText(/Deployed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
  });
});

describe('BotOperations — running the deploy', () => {
  it('calls adminApi.deployCommands once, with no arguments', async () => {
    renderWithQuery(<BotOperations />);

    fireEvent.click(screen.getByRole('button', { name: 'Redeploy commands' }));

    await waitFor(() => expect(deployCommands).toHaveBeenCalledTimes(1));
    expect(deployCommands).toHaveBeenCalledWith();
  });

  it('relabels the button "Deploying..." and disables it while in flight', async () => {
    deployCommands.mockReturnValue(pendingForever() as never);
    renderWithQuery(<BotOperations />);

    fireEvent.click(screen.getByRole('button', { name: 'Redeploy commands' }));

    const button = await screen.findByRole('button', { name: 'Deploying...' });
    expect(button).toBeDisabled();
  });

  it('ignores a second click while a deploy is in flight', async () => {
    deployCommands.mockReturnValue(pendingForever() as never);
    renderWithQuery(<BotOperations />);

    fireEvent.click(screen.getByRole('button', { name: 'Redeploy commands' }));
    const button = await screen.findByRole('button', { name: 'Deploying...' });
    fireEvent.click(button);

    expect(deployCommands).toHaveBeenCalledTimes(1);
  });

  it('keeps the button disabled after the section is unmounted and remounted', async () => {
    // The mutation carries a stable `mutationKey` specifically so an in-flight
    // redeploy survives switching admin sub-tabs (which unmounts this section).
    // `useIsMutating` reads it back out of the shared mutation cache.
    deployCommands.mockReturnValue(pendingForever() as never);
    const queryClient = createTestQueryClient();
    const first = renderWithQuery(<BotOperations />, { queryClient });

    fireEvent.click(screen.getByRole('button', { name: 'Redeploy commands' }));
    await screen.findByRole('button', { name: 'Deploying...' });
    first.unmount();

    renderWithQuery(<BotOperations />, { queryClient });

    const remounted = await screen.findByRole('button', { name: 'Deploying...' });
    expect(remounted).toBeDisabled();
  });
});

describe('BotOperations — success path', () => {
  it('renders the message the API returned', async () => {
    deployCommands.mockResolvedValue({ data: { message: 'Deployed 12 command(s).' } } as never);
    renderWithQuery(<BotOperations />);

    fireEvent.click(screen.getByRole('button', { name: 'Redeploy commands' }));

    expect(await screen.findByText('Deployed 12 command(s).')).toBeInTheDocument();
  });

  it('falls back to a count-derived sentence when the API sends no message', async () => {
    deployCommands.mockResolvedValue({ data: { count: 7 } } as never);
    renderWithQuery(<BotOperations />);

    fireEvent.click(screen.getByRole('button', { name: 'Redeploy commands' }));

    expect(await screen.findByText('Deployed 7 command(s).')).toBeInTheDocument();
  });

  it('reports zero commands when the API sends no data at all', async () => {
    deployCommands.mockResolvedValue({} as never);
    renderWithQuery(<BotOperations />);

    fireEvent.click(screen.getByRole('button', { name: 'Redeploy commands' }));

    expect(await screen.findByText('Deployed 0 command(s).')).toBeInTheDocument();
  });

  it('re-enables the button once the deploy settles', async () => {
    renderWithQuery(<BotOperations />);

    fireEvent.click(screen.getByRole('button', { name: 'Redeploy commands' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Redeploy commands' })).toBeEnabled()
    );
  });
});

describe('BotOperations — error path', () => {
  it('prefers the API error body over the Error message', async () => {
    deployCommands.mockRejectedValue({
      response: { data: { error: 'Missing DISCORD_TOKEN' } },
      message: 'Request failed with status code 500',
    });
    renderWithQuery(<BotOperations />);

    fireEvent.click(screen.getByRole('button', { name: 'Redeploy commands' }));

    expect(await screen.findByText('Missing DISCORD_TOKEN')).toBeInTheDocument();
    expect(screen.queryByText('Request failed with status code 500')).not.toBeInTheDocument();
  });

  it('falls back to the Error message when the API sends no error body', async () => {
    deployCommands.mockRejectedValue({ message: 'Network Error' });
    renderWithQuery(<BotOperations />);

    fireEvent.click(screen.getByRole('button', { name: 'Redeploy commands' }));

    expect(await screen.findByText('Network Error')).toBeInTheDocument();
  });

  it('falls back to "Deploy failed." when the rejection carries nothing readable', async () => {
    deployCommands.mockRejectedValue({});
    renderWithQuery(<BotOperations />);

    fireEvent.click(screen.getByRole('button', { name: 'Redeploy commands' }));

    expect(await screen.findByText('Deploy failed.')).toBeInTheDocument();
  });

  it('clears the previous message when a new deploy starts', async () => {
    deployCommands.mockRejectedValueOnce({ message: 'Network Error' });
    renderWithQuery(<BotOperations />);

    fireEvent.click(screen.getByRole('button', { name: 'Redeploy commands' }));
    await screen.findByText('Network Error');

    fireEvent.click(screen.getByRole('button', { name: 'Redeploy commands' }));

    await waitFor(() => expect(screen.queryByText('Network Error')).not.toBeInTheDocument());
  });
});
