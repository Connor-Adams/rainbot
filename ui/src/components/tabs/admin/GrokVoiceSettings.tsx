import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, EmptyState, Field, NativeSelect } from '@connor-adams/designsystem';
import { adminApi } from '@/lib/api';
import { useGuildStore } from '@/stores/guildStore';
import { Button } from '@/components/ui';

const GROK_VOICES = [
  { value: 'Ara', label: 'Ara (female, warm)' },
  { value: 'Rex', label: 'Rex (male, professional)' },
  { value: 'Sal', label: 'Sal (neutral, smooth)' },
  { value: 'Eve', label: 'Eve (female, energetic)' },
  { value: 'Leo', label: 'Leo (male, authoritative)' },
] as const;

type ApiError = { response?: { data?: { error?: string } }; message?: string };

export default function GrokVoiceSettings() {
  const queryClient = useQueryClient();
  const { selectedGuildId: runGuildId } = useGuildStore();

  const { data: conversationMode } = useQuery({
    queryKey: ['conversation-mode', runGuildId],
    queryFn: ({ signal }) =>
      adminApi.getConversationMode(runGuildId!, { signal }).then((res) => res.data),
    enabled: !!runGuildId,
  });
  const { data: grokVoice } = useQuery({
    queryKey: ['grok-voice', runGuildId],
    queryFn: ({ signal }) => adminApi.getGrokVoice(runGuildId!, { signal }).then((res) => res.data),
    enabled: !!runGuildId,
  });
  const { data: personasData } = useQuery({
    queryKey: ['personas'],
    queryFn: ({ signal }) => adminApi.getPersonas({ signal }).then((res) => res.data),
  });
  const { data: grokPersona } = useQuery({
    queryKey: ['grok-persona', runGuildId],
    queryFn: ({ signal }) =>
      adminApi.getGrokPersona(runGuildId!, { signal }).then((res) => res.data),
    enabled: !!runGuildId,
  });
  const personas = personasData?.personas ?? [];

  const conversationModeMutation = useMutation({
    mutationFn: ({ guildId, enabled }: { guildId: string; enabled: boolean }) =>
      adminApi.setConversationMode(guildId, enabled),
    onSuccess: (_data, { guildId }) => {
      queryClient.invalidateQueries({ queryKey: ['conversation-mode', guildId] });
    },
  });
  const grokVoiceMutation = useMutation({
    mutationFn: ({ guildId, voice }: { guildId: string; voice: string }) => {
      if (!guildId) return Promise.reject(new Error('Select a server first.'));
      return adminApi.setGrokVoice(guildId, voice);
    },
    onMutate: async ({ guildId, voice }) => {
      await queryClient.cancelQueries({ queryKey: ['grok-voice', guildId] });
      const previous = queryClient.getQueryData<{ voice: string | null }>(['grok-voice', guildId]);
      queryClient.setQueryData(['grok-voice', guildId], { voice });
      return { previous };
    },
    onError: (_err, { guildId }, context) => {
      if (context?.previous != null) {
        queryClient.setQueryData(['grok-voice', guildId], context.previous);
      }
    },
    onSuccess: (_data, { guildId }) => {
      queryClient.invalidateQueries({ queryKey: ['grok-voice', guildId] });
    },
  });
  const grokPersonaMutation = useMutation({
    mutationFn: ({ guildId, personaId }: { guildId: string; personaId: string | null }) => {
      if (!guildId) return Promise.reject(new Error('Select a server first.'));
      return adminApi.setGrokPersona(guildId, personaId);
    },
    onMutate: async ({ guildId, personaId }) => {
      await queryClient.cancelQueries({ queryKey: ['grok-persona', guildId] });
      const previous = queryClient.getQueryData<{ personaId: string | null }>([
        'grok-persona',
        guildId,
      ]);
      queryClient.setQueryData(['grok-persona', guildId], { personaId });
      return { previous };
    },
    onError: (_err, { guildId }, context) => {
      if (context?.previous != null) {
        queryClient.setQueryData(['grok-persona', guildId], context.previous);
      }
    },
    onSuccess: (_data, { guildId }) => {
      queryClient.invalidateQueries({ queryKey: ['grok-persona', guildId] });
    },
  });

  // Derived once, so the same message can drive `Field`'s `error` (which wires
  // `aria-describedby` and `aria-invalid` on the control) instead of a loose
  // `<div>` the select is not associated with. Same precedence as before: API
  // error body, then the Error message, then the fixed fallback.
  const grokVoiceError = grokVoiceMutation.isError
    ? ((grokVoiceMutation.error as ApiError)?.response?.data?.error ??
      (grokVoiceMutation.error as Error)?.message ??
      'Failed to update voice')
    : undefined;
  const grokPersonaError = grokPersonaMutation.isError
    ? ((grokPersonaMutation.error as ApiError)?.response?.data?.error ??
      (grokPersonaMutation.error as Error)?.message ??
      'Failed to update persona')
    : undefined;

  if (!runGuildId) {
    return (
      <EmptyState
        title="No server selected"
        description="Pick a server from the menu in the header."
      />
    );
  }

  return (
    <Card variant="nested" padding="sm" radius="xl">
      <div className="text-sm font-semibold text-text-primary mb-1">
        Grok conversation mode (voice)
      </div>
      <div className="text-xs text-text-secondary mb-4">
        For the server selected in the header: when on, everyone in the active voice channel can
        talk to Grok in real time (Voice Agent). Turning on also enables voice listening for this
        server. Join a voice channel with the bot and speak; ensure GROK_API_KEY is set on the voice
        worker. If nothing happens, try turning off then on again.
      </div>
      <div className="space-y-3">
        <div className="space-y-2">
          <div className="text-xs text-text-secondary">
            Currently:{' '}
            <strong>
              {conversationMode === undefined ? '…' : conversationMode.enabled ? 'On' : 'Off'}
            </strong>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="primary"
              disabled={
                conversationMode === undefined ||
                conversationModeMutation.isPending ||
                conversationMode.enabled === true
              }
              onClick={() =>
                conversationModeMutation.mutate({ guildId: runGuildId, enabled: true })
              }
            >
              {conversationModeMutation.isPending ? '…' : 'Turn on'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={
                conversationMode === undefined ||
                conversationModeMutation.isPending ||
                conversationMode.enabled === false
              }
              onClick={() =>
                conversationModeMutation.mutate({ guildId: runGuildId, enabled: false })
              }
            >
              {conversationModeMutation.isPending ? '…' : 'Turn off'}
            </Button>
          </div>
          {conversationModeMutation.isError && (
            <div className="text-xs text-danger-light">
              {(conversationModeMutation.error as Error)?.message ?? 'Failed to update'}
            </div>
          )}
        </div>
        <Field
          label="Grok voice"
          hint="Voice for the Grok Voice Agent. Takes effect for your next conversation."
          error={grokVoiceError}
        >
          <NativeSelect
            className="w-full"
            value={grokVoice?.voice ?? 'Ara'}
            onChange={(e) =>
              grokVoiceMutation.mutate({ guildId: runGuildId, voice: e.target.value })
            }
            disabled={grokVoiceMutation.isPending}
          >
            {GROK_VOICES.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          label="Grok persona"
          hint="Persona for chat and voice. Change in the Personas sub-tab."
          error={grokPersonaError}
        >
          <NativeSelect
            className="w-full"
            value={grokPersona?.personaId ?? ''}
            onChange={(e) =>
              grokPersonaMutation.mutate({
                guildId: runGuildId,
                personaId: e.target.value || null,
              })
            }
            disabled={grokPersonaMutation.isPending}
          >
            <option value="">Default (Convenience store philosopher)</option>
            {personas
              .filter((p) => p.id !== 'default')
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.isBuiltIn ? ' (built-in)' : ''}
                </option>
              ))}
          </NativeSelect>
        </Field>
      </div>
    </Card>
  );
}
