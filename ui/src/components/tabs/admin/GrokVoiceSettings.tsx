import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { useAdminRunGuildId } from './shared';

const GROK_VOICES = [
  { value: 'Ara', label: 'Ara (female, warm)' },
  { value: 'Rex', label: 'Rex (male, professional)' },
  { value: 'Sal', label: 'Sal (neutral, smooth)' },
  { value: 'Eve', label: 'Eve (female, energetic)' },
  { value: 'Leo', label: 'Leo (male, authoritative)' },
] as const;

export default function GrokVoiceSettings() {
  const queryClient = useQueryClient();
  const [runGuildId] = useAdminRunGuildId();

  const { data: conversationMode } = useQuery({
    queryKey: ['conversation-mode', runGuildId],
    queryFn: () => adminApi.getConversationMode(runGuildId!).then((res) => res.data),
    enabled: !!runGuildId,
  });
  const { data: grokVoice } = useQuery({
    queryKey: ['grok-voice', runGuildId],
    queryFn: () => adminApi.getGrokVoice(runGuildId!).then((res) => res.data),
    enabled: !!runGuildId,
  });
  const { data: personasData } = useQuery({
    queryKey: ['personas'],
    queryFn: () => adminApi.getPersonas().then((res) => res.data),
  });
  const { data: grokPersona } = useQuery({
    queryKey: ['grok-persona', runGuildId],
    queryFn: () => adminApi.getGrokPersona(runGuildId!).then((res) => res.data),
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

  return (
    <div className="rounded-xl border border-border bg-surface-input p-4">
      <div className="text-sm font-semibold text-text-primary mb-1">
        Grok conversation mode (voice)
      </div>
      <div className="text-xs text-text-secondary mb-4">
        For the server selected in Run commands: when on, everyone in the active voice channel can
        talk to Grok in real time (Voice Agent). Turning on also enables voice listening for this
        server. Join a voice channel with the bot and speak; ensure GROK_API_KEY is set on the voice
        worker. If nothing happens, try turning off then on again.
      </div>
      {runGuildId ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="text-xs text-text-secondary">
              Currently:{' '}
              <strong>
                {conversationMode === undefined ? '…' : conversationMode.enabled ? 'On' : 'Off'}
              </strong>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-primary"
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
              </button>
              <button
                type="button"
                className="btn btn-secondary"
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
              </button>
            </div>
            {conversationModeMutation.isError && (
              <div className="text-xs text-danger-light">
                {(conversationModeMutation.error as Error)?.message ?? 'Failed to update'}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Grok voice</label>
            <select
              value={grokVoice?.voice ?? 'Ara'}
              onChange={(e) =>
                grokVoiceMutation.mutate({ guildId: runGuildId, voice: e.target.value })
              }
              disabled={grokVoiceMutation.isPending}
              className="w-full px-4 py-3 bg-surface-input border border-border rounded-lg text-text-primary text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            >
              {GROK_VOICES.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
            <div className="text-xs text-text-secondary mt-1">
              Voice for the Grok Voice Agent. Takes effect for your next conversation.
            </div>
            {grokVoiceMutation.isError && (
              <div className="text-xs text-danger-light mt-1">
                {(
                  grokVoiceMutation.error as {
                    response?: { data?: { error?: string } };
                    message?: string;
                  }
                )?.response?.data?.error ??
                  (grokVoiceMutation.error as Error)?.message ??
                  'Failed to update voice'}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Grok persona
            </label>
            <select
              value={grokPersona?.personaId ?? ''}
              onChange={(e) =>
                grokPersonaMutation.mutate({
                  guildId: runGuildId,
                  personaId: e.target.value || null,
                })
              }
              disabled={grokPersonaMutation.isPending}
              className="w-full px-4 py-3 bg-surface-input border border-border rounded-lg text-text-primary text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
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
            </select>
            <div className="text-xs text-text-secondary mt-1">
              Persona for chat and voice. Change in &quot;Manage personas&quot; below.
            </div>
            {grokPersonaMutation.isError && (
              <div className="text-xs text-danger-light mt-1">
                {(
                  grokPersonaMutation.error as {
                    response?: { data?: { error?: string } };
                    message?: string;
                  }
                )?.response?.data?.error ??
                  (grokPersonaMutation.error as Error)?.message ??
                  'Failed to update persona'}
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-text-secondary">
          Select a server in Run commands above to turn Grok conversation on or off.
        </p>
      )}
    </div>
  );
}
