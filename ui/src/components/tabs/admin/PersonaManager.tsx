import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Field, Textarea } from '@connor-adams/designsystem';
import { adminApi } from '@/lib/api';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Button, Input } from '@/components/ui';

export default function PersonaManager() {
  const queryClient = useQueryClient();
  const [personaFormOpen, setPersonaFormOpen] = useState(false);
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);
  const [personaName, setPersonaName] = useState('');
  const [personaSystemPrompt, setPersonaSystemPrompt] = useState('');
  const [personaPendingDeleteId, setPersonaPendingDeleteId] = useState<string | null>(null);

  // A confirmed delete unmounts the row (and the Delete button that opened the
  // dialog), so focus has no trigger to return to. Fall back to the list itself.
  const personaListRef = useRef<HTMLDivElement>(null);

  const { data: personasData } = useQuery({
    queryKey: ['personas'],
    queryFn: ({ signal }) => adminApi.getPersonas({ signal }).then((res) => res.data),
  });
  const personas = personasData?.personas ?? [];
  const personaPendingDelete = personas.find((p) => p.id === personaPendingDeleteId) ?? null;

  const createPersonaMutation = useMutation({
    mutationFn: (data: { name: string; systemPrompt: string }) => adminApi.createPersona(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personas'] });
      setPersonaFormOpen(false);
      setPersonaName('');
      setPersonaSystemPrompt('');
    },
  });
  const updatePersonaMutation = useMutation({
    mutationFn: ({
      id,
      name,
      systemPrompt,
    }: {
      id: string;
      name?: string;
      systemPrompt?: string;
    }) => adminApi.updatePersona(id, { name, systemPrompt }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personas'] });
      setEditingPersonaId(null);
      setPersonaName('');
      setPersonaSystemPrompt('');
    },
  });
  const deletePersonaMutation = useMutation({
    mutationFn: (id: string) => adminApi.deletePersona(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personas'] });
      queryClient.invalidateQueries({ queryKey: ['grok-persona'] });
    },
  });

  return (
    <Card variant="nested" padding="sm" radius="xl">
      <div className="text-sm font-semibold text-text-primary mb-1">Manage personas</div>
      <div className="text-xs text-text-secondary mb-4">
        Create custom personas (name + system prompt) for Grok. Custom personas appear in the Grok
        persona dropdown in the Grok sub-tab when a server is selected.
      </div>
      {!personaFormOpen && !editingPersonaId && (
        <Button
          type="button"
          variant="primary"
          className="mb-4"
          onClick={() => {
            setPersonaFormOpen(true);
            setPersonaName('');
            setPersonaSystemPrompt('');
          }}
        >
          Create persona
        </Button>
      )}
      {(personaFormOpen || editingPersonaId) && (
        <div className="mb-4 space-y-2 rounded-lg border border-border p-3 bg-surface-elevated">
          <Field label="Name">
            <Input
              type="text"
              value={personaName}
              onChange={(e) => setPersonaName(e.target.value)}
              placeholder="e.g. Friendly assistant"
            />
          </Field>
          <Field label="System prompt">
            <Textarea
              value={personaSystemPrompt}
              onChange={(e) => setPersonaSystemPrompt(e.target.value)}
              placeholder="Instructions for how the AI should behave..."
              rows={5}
            />
          </Field>
          <div className="flex gap-2">
            {editingPersonaId ? (
              <>
                <Button
                  type="button"
                  variant="primary"
                  disabled={
                    updatePersonaMutation.isPending ||
                    !personaName.trim() ||
                    personaSystemPrompt.length === 0
                  }
                  onClick={() =>
                    updatePersonaMutation.mutate({
                      id: editingPersonaId,
                      name: personaName.trim(),
                      systemPrompt: personaSystemPrompt,
                    })
                  }
                >
                  {updatePersonaMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setEditingPersonaId(null);
                    setPersonaName('');
                    setPersonaSystemPrompt('');
                  }}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="primary"
                  disabled={
                    createPersonaMutation.isPending ||
                    !personaName.trim() ||
                    !personaSystemPrompt.trim()
                  }
                  onClick={() =>
                    createPersonaMutation.mutate({
                      name: personaName.trim(),
                      systemPrompt: personaSystemPrompt.trim(),
                    })
                  }
                >
                  {createPersonaMutation.isPending ? 'Creating...' : 'Create'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setPersonaFormOpen(false);
                    setPersonaName('');
                    setPersonaSystemPrompt('');
                  }}
                >
                  Cancel
                </Button>
              </>
            )}
          </div>
          {(createPersonaMutation.isError || updatePersonaMutation.isError) && (
            <div className="text-xs text-danger-light">
              {(
                (createPersonaMutation.error || updatePersonaMutation.error) as {
                  response?: { data?: { error?: string } };
                  message?: string;
                }
              )?.response?.data?.error ??
                ((createPersonaMutation.error || updatePersonaMutation.error) as Error)?.message ??
                'Failed'}
            </div>
          )}
        </div>
      )}
      <div ref={personaListRef} tabIndex={-1} className="space-y-2">
        <div className="text-xs font-medium text-text-secondary">Your custom personas</div>
        {personas.filter((p) => !p.isBuiltIn).length === 0 ? (
          <p className="text-xs text-text-secondary">No custom personas yet.</p>
        ) : (
          <ul className="space-y-2">
            {personas
              .filter((p) => !p.isBuiltIn)
              .map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-surface-elevated px-3 py-2"
                >
                  <span className="text-sm text-text-primary">{p.name}</span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        try {
                          const res = await adminApi.getPersona(p.id);
                          setEditingPersonaId(p.id);
                          setPersonaName(res.data.name);
                          setPersonaSystemPrompt(res.data.systemPrompt ?? '');
                        } catch {
                          // ignore
                        }
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="!text-danger-light"
                      disabled={deletePersonaMutation.isPending}
                      onClick={() => setPersonaPendingDeleteId(p.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={personaPendingDeleteId !== null}
        title="Delete this persona?"
        description={
          personaPendingDelete
            ? `"${personaPendingDelete.name}" will be permanently deleted. This cannot be undone.`
            : 'This cannot be undone.'
        }
        confirmLabel="Delete"
        restoreFocusRef={personaListRef}
        onCancel={() => setPersonaPendingDeleteId(null)}
        onConfirm={() => {
          if (!personaPendingDeleteId) return;
          const id = personaPendingDeleteId;
          setPersonaPendingDeleteId(null);
          deletePersonaMutation.mutate(id);
        }}
      />
    </Card>
  );
}
