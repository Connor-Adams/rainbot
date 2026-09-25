import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import PersonaManager from '../PersonaManager';
import { renderWithQuery } from '@/test/renderWithQuery';

/**
 * CHARACTERIZATION TESTS — see the header comment on BotOperations.test.tsx.
 *
 * The ACCESSIBILITY GAP assertion about the two unassociated field labels was
 * retired when the panel moved onto the design system's `Field`. The row-level
 * Edit/Delete gap (controls named without their persona) is unchanged and still
 * asserted below.
 */

vi.mock('@/lib/api', () => ({
  adminApi: {
    getPersonas: vi.fn(),
    getPersona: vi.fn(),
    createPersona: vi.fn(),
    updatePersona: vi.fn(),
    deletePersona: vi.fn(),
  },
}));

const { adminApi } = await import('@/lib/api');

const PERSONAS = [
  { id: 'default', name: 'Convenience store philosopher', isBuiltIn: true },
  { id: 'pirate', name: 'Pirate', isBuiltIn: true },
  { id: 'custom-1', name: 'Dour accountant', isBuiltIn: false },
  { id: 'custom-2', name: 'Overcaffeinated intern', isBuiltIn: false },
];

/** `Field` labels both controls, so they are reachable by name. */
function nameField(): HTMLElement {
  return screen.getByLabelText('Name');
}
function promptField(): HTMLElement {
  return screen.getByLabelText('System prompt');
}

beforeEach(() => {
  vi.mocked(adminApi.getPersonas).mockResolvedValue({ data: { personas: PERSONAS } } as never);
  vi.mocked(adminApi.getPersona).mockResolvedValue({
    data: {
      id: 'custom-1',
      name: 'Dour accountant',
      isBuiltIn: false,
      systemPrompt: 'Answer only in double-entry bookkeeping.',
    },
  } as never);
  vi.mocked(adminApi.createPersona).mockResolvedValue({
    data: { id: 'custom-3', name: 'New one' },
  } as never);
  vi.mocked(adminApi.updatePersona).mockResolvedValue({
    data: { id: 'custom-1', name: 'Dour accountant' },
  } as never);
  vi.mocked(adminApi.deletePersona).mockResolvedValue({ data: {} } as never);
});

describe('PersonaManager — list', () => {
  it('renders the heading and explanation', () => {
    renderWithQuery(<PersonaManager />);

    expect(screen.getByText('Manage personas')).toBeInTheDocument();
    expect(
      screen.getByText(/Create custom personas \(name \+ system prompt\)/)
    ).toBeInTheDocument();
    expect(screen.getByText('Your custom personas')).toBeInTheDocument();
  });

  it('lists only the non-built-in personas', async () => {
    renderWithQuery(<PersonaManager />);

    expect(await screen.findByText('Dour accountant')).toBeInTheDocument();
    expect(screen.getByText('Overcaffeinated intern')).toBeInTheDocument();
    expect(screen.queryByText('Pirate')).not.toBeInTheDocument();
    expect(screen.queryByText('Convenience store philosopher')).not.toBeInTheDocument();
  });

  it('shows the empty sentence when every persona is built in', async () => {
    vi.mocked(adminApi.getPersonas).mockResolvedValue({
      data: { personas: [PERSONAS[0], PERSONAS[1]] },
    } as never);
    renderWithQuery(<PersonaManager />);

    expect(await screen.findByText('No custom personas yet.')).toBeInTheDocument();
  });

  it('gives each listed persona Edit and Delete controls', async () => {
    renderWithQuery(<PersonaManager />);
    await screen.findByText('Dour accountant');

    // ACCESSIBILITY GAP: both controls are named only "Edit" / "Delete", with no
    // indication of which persona they act on, so they can only be told apart
    // positionally.
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(2);
  });

  it('hides the form until "Create persona" is pressed', () => {
    renderWithQuery(<PersonaManager />);

    expect(screen.getByRole('button', { name: 'Create persona' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('e.g. Friendly assistant')).not.toBeInTheDocument();
  });
});

describe('PersonaManager — create', () => {
  function openCreateForm() {
    renderWithQuery(<PersonaManager />);
    fireEvent.click(screen.getByRole('button', { name: 'Create persona' }));
  }

  it('associates both field labels with their controls', () => {
    // Was an ACCESSIBILITY GAP test: both labels were bare `<label>`s with
    // neither `htmlFor` nor the control nested inside, so both controls were
    // reachable only by placeholder. `Field` wires them.
    openCreateForm();

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('System prompt')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBe(
      screen.getByPlaceholderText('e.g. Friendly assistant')
    );
    expect(screen.getByLabelText('System prompt')).toBe(
      screen.getByPlaceholderText('Instructions for how the AI should behave...')
    );
    expect(nameField()).toHaveAccessibleName('Name');
    expect(promptField()).toHaveAccessibleName('System prompt');
  });

  it('replaces the "Create persona" trigger with a Create/Cancel pair', () => {
    openCreateForm();

    expect(screen.queryByRole('button', { name: 'Create persona' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('renders the prompt as a five-row textarea', () => {
    openCreateForm();

    expect(promptField().tagName).toBe('TEXTAREA');
    expect(promptField()).toHaveAttribute('rows', '5');
  });

  it('keeps Create disabled until both fields have non-blank content', () => {
    openCreateForm();
    const create = screen.getByRole('button', { name: 'Create' });

    expect(create).toBeDisabled();

    fireEvent.change(nameField(), { target: { value: 'Dour accountant' } });
    expect(create).toBeDisabled();

    fireEvent.change(promptField(), { target: { value: '   ' } });
    // Create trims the prompt before checking it, so whitespace is not content.
    expect(create).toBeDisabled();

    fireEvent.change(promptField(), { target: { value: 'Be dour.' } });
    expect(create).toBeEnabled();
  });

  it('treats a whitespace-only name as blank', () => {
    openCreateForm();

    fireEvent.change(nameField(), { target: { value: '   ' } });
    fireEvent.change(promptField(), { target: { value: 'Be dour.' } });

    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('posts both fields trimmed', async () => {
    openCreateForm();

    fireEvent.change(nameField(), { target: { value: '  Dour accountant  ' } });
    fireEvent.change(promptField(), { target: { value: '  Be dour.  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(adminApi.createPersona).toHaveBeenCalledWith({
        name: 'Dour accountant',
        systemPrompt: 'Be dour.',
      })
    );
  });

  it('closes the form and clears it on success', async () => {
    openCreateForm();

    fireEvent.change(nameField(), { target: { value: 'Dour accountant' } });
    fireEvent.change(promptField(), { target: { value: 'Be dour.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('button', { name: 'Create persona' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('e.g. Friendly assistant')).not.toBeInTheDocument();
  });

  it('shows "Creating..." while in flight', async () => {
    vi.mocked(adminApi.createPersona).mockReturnValue(new Promise<never>(() => {}) as never);
    openCreateForm();

    fireEvent.change(nameField(), { target: { value: 'Dour accountant' } });
    fireEvent.change(promptField(), { target: { value: 'Be dour.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    const button = await screen.findByRole('button', { name: 'Creating...' });
    expect(button).toBeDisabled();
  });

  it('Cancel closes the form without calling the API', () => {
    openCreateForm();

    fireEvent.change(nameField(), { target: { value: 'Dour accountant' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(adminApi.createPersona).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Create persona' })).toBeInTheDocument();
  });

  it('prefers the API error body, then the Error message, then "Failed"', async () => {
    vi.mocked(adminApi.createPersona).mockRejectedValueOnce({
      response: { data: { error: 'A persona with that name exists' } },
      message: 'Request failed with status code 409',
    });
    openCreateForm();

    fireEvent.change(nameField(), { target: { value: 'Dour accountant' } });
    fireEvent.change(promptField(), { target: { value: 'Be dour.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('A persona with that name exists')).toBeInTheDocument();
    expect(screen.queryByText(/status code 409/)).not.toBeInTheDocument();
  });

  it('falls back to "Failed" when the rejection carries nothing readable', async () => {
    vi.mocked(adminApi.createPersona).mockRejectedValueOnce({});
    openCreateForm();

    fireEvent.change(nameField(), { target: { value: 'Dour accountant' } });
    fireEvent.change(promptField(), { target: { value: 'Be dour.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('Failed')).toBeInTheDocument();
  });
});

describe('PersonaManager — edit', () => {
  async function openEditFormForFirstPersona() {
    renderWithQuery(<PersonaManager />);
    await screen.findByText('Dour accountant');
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    await screen.findByDisplayValue('Dour accountant');
  }

  it('fetches the full persona and fills both fields', async () => {
    await openEditFormForFirstPersona();

    expect(adminApi.getPersona).toHaveBeenCalledWith('custom-1');
    expect(nameField()).toHaveValue('Dour accountant');
    expect(promptField()).toHaveValue('Answer only in double-entry bookkeeping.');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('treats a null systemPrompt as an empty prompt', async () => {
    vi.mocked(adminApi.getPersona).mockResolvedValue({
      data: { id: 'custom-1', name: 'Dour accountant', isBuiltIn: false, systemPrompt: null },
    } as never);
    await openEditFormForFirstPersona();

    expect(promptField()).toHaveValue('');
  });

  it('swallows a failed fetch silently, leaving the list as it was', async () => {
    // The Edit handler has a bare `catch {}` — no message is shown and the form
    // never opens. Pinned because it is a real (if deliberate) silent failure.
    vi.mocked(adminApi.getPersona).mockRejectedValue(new Error('boom'));
    renderWithQuery(<PersonaManager />);
    await screen.findByText('Dour accountant');

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);

    await waitFor(() => expect(adminApi.getPersona).toHaveBeenCalled());
    expect(screen.queryByPlaceholderText('e.g. Friendly assistant')).not.toBeInTheDocument();
    expect(screen.queryByText('Failed')).not.toBeInTheDocument();
  });

  it('accepts a whitespace-only prompt on edit, unlike create', async () => {
    // The two gates differ: create tests `!systemPrompt.trim()`, edit tests
    // `systemPrompt.length === 0`. A prompt of spaces is therefore rejected by
    // Create and accepted by Save. This asymmetry is current behaviour, not a
    // recommendation.
    await openEditFormForFirstPersona();

    fireEvent.change(promptField(), { target: { value: '   ' } });

    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('disables Save only when the prompt is completely empty', async () => {
    await openEditFormForFirstPersona();

    fireEvent.change(promptField(), { target: { value: '' } });

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('sends the name trimmed but the prompt untrimmed', async () => {
    await openEditFormForFirstPersona();

    fireEvent.change(nameField(), { target: { value: '  Renamed  ' } });
    fireEvent.change(promptField(), { target: { value: '  padded prompt  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(adminApi.updatePersona).toHaveBeenCalledWith('custom-1', {
        name: 'Renamed',
        systemPrompt: '  padded prompt  ',
      })
    );
  });

  it('closes the form on success', async () => {
    await openEditFormForFirstPersona();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('button', { name: 'Create persona' })).toBeInTheDocument();
  });

  it('Cancel leaves the persona untouched', async () => {
    await openEditFormForFirstPersona();

    fireEvent.change(nameField(), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(adminApi.updatePersona).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Create persona' })).toBeInTheDocument();
  });
});

describe('PersonaManager — delete', () => {
  async function openDeleteDialogForFirstPersona() {
    renderWithQuery(<PersonaManager />);
    await screen.findByText('Dour accountant');
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
  }

  it('asks for confirmation, naming the persona, before deleting', async () => {
    await openDeleteDialogForFirstPersona();

    expect(await screen.findByText('Delete this persona?')).toBeInTheDocument();
    expect(
      screen.getByText('"Dour accountant" will be permanently deleted. This cannot be undone.')
    ).toBeInTheDocument();
    expect(adminApi.deletePersona).not.toHaveBeenCalled();
  });

  it('deletes on confirm', async () => {
    await openDeleteDialogForFirstPersona();
    await screen.findByText('Delete this persona?');

    // The dialog's confirm button is labelled "Delete", same as the row trigger
    // that opened it; it is the last such button in the document.
    const deletes = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(deletes[deletes.length - 1]);

    await waitFor(() => expect(adminApi.deletePersona).toHaveBeenCalledWith('custom-1'));
  });

  it('does not delete on cancel, and closes the dialog', async () => {
    await openDeleteDialogForFirstPersona();
    await screen.findByText('Delete this persona?');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByText('Delete this persona?')).not.toBeInTheDocument());
    expect(adminApi.deletePersona).not.toHaveBeenCalled();
  });
});
