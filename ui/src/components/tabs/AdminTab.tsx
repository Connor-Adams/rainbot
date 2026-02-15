import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { soundsApi, adminApi, botApi, playbackApi, settingsApi } from '@/lib/api';
import type { Guild } from '@/types';
import CustomDropdown from '../CustomDropdown';
import DisplayCard from '../Displaycard';

type SweepResult = {
  converted: number;
  deleted: number;
  skipped: number;
};

type RunCommandType =
  | 'play'
  | 'soundboard'
  | 'speak'
  | 'grok'
  | 'stop'
  | 'skip'
  | 'pause'
  | 'clear'
  | 'replay';

const GROK_VOICES = [
  { value: 'Ara', label: 'Ara (female, warm)' },
  { value: 'Rex', label: 'Rex (male, professional)' },
  { value: 'Sal', label: 'Sal (neutral, smooth)' },
  { value: 'Eve', label: 'Eve (female, energetic)' },
  { value: 'Leo', label: 'Leo (male, authoritative)' },
] as const;

const RUN_COMMAND_LABELS: Record<RunCommandType, string> = {
  play: 'Play (URL or query)',
  soundboard: 'Soundboard',
  speak: 'Speak (TTS)',
  grok: 'Chat (Grok)',
  stop: 'Stop',
  skip: 'Skip',
  pause: 'Pause / Resume',
  clear: 'Clear queue',
  replay: 'Replay last track',
};

export default function AdminTab() {
  const queryClient = useQueryClient();
  const [lastResult, setLastResult] = useState<SweepResult | null>(null);
  const [deployMessage, setDeployMessage] = useState<string | null>(null);
  const [runGuildId, setRunGuildId] = useState<string | null>(null);
  const [runCommand, setRunCommand] = useState<RunCommandType>('play');
  const [playSource, setPlaySource] = useState('');
  const [speakText, setSpeakText] = useState('');
  const [grokText, setGrokText] = useState('');
  const [grokSpeakReply, setGrokSpeakReply] = useState(true);
  const [soundboardSound, setSoundboardSound] = useState('');
  const [runResult, setRunResult] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [personaFormOpen, setPersonaFormOpen] = useState(false);
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);
  const [personaName, setPersonaName] = useState('');
  const [personaSystemPrompt, setPersonaSystemPrompt] = useState('');

  const sweepMutation = useMutation({
    mutationFn: () => soundsApi.sweepTranscode({ deleteOriginal: true }),
    onSuccess: (res) => {
      setLastResult(res.data || null);
      queryClient.invalidateQueries({ queryKey: ['sounds'] });
    },
  });

  const deployCommandsMutation = useMutation({
    mutationFn: () => adminApi.deployCommands(),
    onSuccess: (res) => {
      setDeployMessage(res.data?.message ?? `Deployed ${res.data?.count ?? 0} command(s).`);
    },
    onError: (err: { response?: { data?: { error?: string } }; message?: string }) => {
      setDeployMessage(err.response?.data?.error ?? err.message ?? 'Deploy failed.');
    },
  });

  const { data: botStatus } = useQuery({
    queryKey: ['bot-status'],
    queryFn: () => botApi.getStatus().then((res) => res.data),
    refetchInterval: 10000,
  });
  const { data: soundsData } = useQuery({
    queryKey: ['sounds'],
    queryFn: () => soundsApi.list().then((res) => res.data),
  });
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
  const { data: youtubeCookies } = useQuery({
    queryKey: ['youtube-cookies'],
    queryFn: () => settingsApi.getYoutubeCookies().then((res) => res.data),
  });
  const guilds = botStatus?.guilds ?? [];
  const sounds = soundsData ?? [];
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

  const cookiesFileRef = useRef<HTMLInputElement>(null);
  const uploadCookiesMutation = useMutation({
    mutationFn: (file: File) => settingsApi.uploadYoutubeCookies(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['youtube-cookies'] });
    },
  });
  const deleteCookiesMutation = useMutation({
    mutationFn: () => settingsApi.deleteYoutubeCookies(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['youtube-cookies'] });
    },
  });

  const runCommandMutation = useMutation({
    mutationFn: async () => {
      if (!runGuildId) throw new Error('Select a server first.');
      switch (runCommand) {
        case 'play':
          if (!playSource.trim()) throw new Error('Enter a URL or search query.');
          return playbackApi.play(runGuildId, playSource.trim());
        case 'soundboard':
          if (!soundboardSound.trim()) throw new Error('Enter or select a sound name.');
          return playbackApi.soundboard(runGuildId, soundboardSound.trim());
        case 'speak':
          if (!speakText.trim()) throw new Error('Enter text to speak.');
          return playbackApi.speak(runGuildId, speakText.trim());
        case 'stop':
          return playbackApi.stop(runGuildId);
        case 'skip':
          return playbackApi.skip(runGuildId);
        case 'pause':
          return playbackApi.pause(runGuildId);
        case 'clear':
          return botApi.clearQueue(runGuildId);
        case 'replay':
          return playbackApi.replay(runGuildId);
        case 'grok':
          if (!grokText.trim()) throw new Error('Enter a message for Grok.');
          return adminApi.grokChat(runGuildId, grokText.trim(), grokSpeakReply);
        default:
          throw new Error('Unknown command');
      }
    },
    onSuccess: (res) => {
      setRunError(null);
      const data = res.data as { message?: string; reply?: string };
      const msg =
        runCommand === 'grok' && data.reply
          ? `Grok: ${data.reply}`
          : (data.message ?? 'Command sent.');
      setRunResult(msg);
      queryClient.invalidateQueries({ queryKey: ['queue', runGuildId] });
      queryClient.invalidateQueries({ queryKey: ['bot-status'] });
    },
    onError: (err: { response?: { data?: { error?: string } }; message?: string }) => {
      setRunResult(null);
      setRunError(err.response?.data?.error ?? err.message ?? 'Command failed.');
    },
  });

  const handleSweep = () => {
    if (!window.confirm('Transcode all sounds to Ogg Opus and archive originals?')) return;
    sweepMutation.mutate();
  };

  const handleDeployCommands = () => {
    setDeployMessage(null);
    deployCommandsMutation.mutate();
  };

  const handleRunCommand = () => {
    setRunResult(null);
    setRunError(null);
    runCommandMutation.mutate();
  };

  const needsInput =
    runCommand === 'play' ||
    runCommand === 'soundboard' ||
    runCommand === 'speak' ||
    runCommand === 'grok';
  const canRun =
    runGuildId &&
    (needsInput
      ? (runCommand === 'play' && playSource.trim()) ||
        (runCommand === 'soundboard' && soundboardSound.trim()) ||
        (runCommand === 'speak' && speakText.trim()) ||
        (runCommand === 'grok' && grokText.trim())
      : true);

  return (
    <section className="panel bg-surface rounded-2xl border border-border p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Admin Tasks</h2>
          <p className="text-sm text-text-secondary">
            Maintenance actions that affect shared storage.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-surface-input p-4">
          <div className="text-sm font-semibold text-text-primary mb-1">
            Redeploy slash commands
          </div>
          <div className="text-xs text-text-secondary mb-4">
            Re-register Discord slash commands with Discord. Use this after adding or changing
            commands so they appear in your server (e.g. after a new chat command).
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleDeployCommands}
            disabled={deployCommandsMutation.isPending}
          >
            {deployCommandsMutation.isPending ? 'Deploying...' : 'Redeploy commands'}
          </button>
          {deployCommandsMutation.isError && deployMessage && (
            <div className="mt-3 text-xs text-danger-light">{deployMessage}</div>
          )}
          {deployCommandsMutation.isSuccess && deployMessage && (
            <div className="mt-3 text-xs text-text-secondary">{deployMessage}</div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface-input p-4">
          <div className="text-sm font-semibold text-text-primary mb-1">YouTube cookies</div>
          <div className="text-xs text-text-secondary mb-4">
            Fixes &quot;Sign in to confirm you&apos;re not a bot&quot; errors when playing YouTube.
            Export cookies from your browser (extension like &quot;Get cookies.txt LOCALLY&quot;)
            while logged into YouTube, then upload the .txt file. Cookies last a few weeks—re-upload
            when playback fails again.
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={cookiesFileRef}
              type="file"
              accept=".txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  uploadCookiesMutation.mutate(file);
                  e.target.value = '';
                }
              }}
              aria-label="Upload cookies file"
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => cookiesFileRef.current?.click()}
              disabled={uploadCookiesMutation.isPending}
            >
              {uploadCookiesMutation.isPending ? 'Uploading...' : 'Upload cookies (.txt)'}
            </button>
            {youtubeCookies?.hasCookies && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => deleteCookiesMutation.mutate()}
                disabled={deleteCookiesMutation.isPending}
              >
                {deleteCookiesMutation.isPending ? 'Removing...' : 'Remove cookies'}
              </button>
            )}
            <span className="text-xs text-text-secondary">
              {youtubeCookies?.hasCookies ? '✓ Cookies configured' : 'No cookies set'}
            </span>
          </div>
          {uploadCookiesMutation.isSuccess && (
            <div className="mt-2 text-xs text-text-secondary">
              Cookies saved. Rainbot will use them on next startup or fetch.
            </div>
          )}
          {uploadCookiesMutation.isError && (
            <div className="mt-2 text-xs text-danger-light">
              {(
                uploadCookiesMutation.error as {
                  response?: { data?: { error?: string } };
                  message?: string;
                }
              )?.response?.data?.error ??
                (uploadCookiesMutation.error as Error)?.message ??
                'Upload failed'}
            </div>
          )}
          {deleteCookiesMutation.isError && (
            <div className="mt-2 text-xs text-danger-light">
              {(deleteCookiesMutation.error as Error)?.message ?? 'Delete failed'}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface-input p-4">
          <div className="text-sm font-semibold text-text-primary mb-1">Run commands</div>
          <div className="text-xs text-text-secondary mb-4">
            Run bot actions from the UI. Pick a server and command, then run. You must be in a voice
            channel for playback commands to take effect.
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Server</label>
              <CustomDropdown<Guild>
                items={guilds}
                selectedValue={runGuildId}
                onSelect={setRunGuildId}
                getItemId={(g) => g.id}
                getItemLabel={(g) => g.name}
                renderItem={(g) => <DisplayCard name={g.name} />}
                placeholder="Select a server..."
                emptyMessage="No servers"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Command</label>
              <select
                value={runCommand}
                onChange={(e) => setRunCommand(e.target.value as RunCommandType)}
                className="w-full px-4 py-3 bg-surface-input border border-border rounded-lg text-text-primary text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              >
                {(Object.keys(RUN_COMMAND_LABELS) as RunCommandType[]).map((cmd) => (
                  <option key={cmd} value={cmd}>
                    {RUN_COMMAND_LABELS[cmd]}
                  </option>
                ))}
              </select>
            </div>
            {runCommand === 'play' && (
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  URL or search query
                </label>
                <input
                  type="text"
                  value={playSource}
                  onChange={(e) => setPlaySource(e.target.value)}
                  placeholder="YouTube, Spotify, or search..."
                  className="w-full px-4 py-3 bg-surface-input border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}
            {runCommand === 'soundboard' && (
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Sound name
                </label>
                <select
                  value={soundboardSound}
                  onChange={(e) => setSoundboardSound(e.target.value)}
                  className="w-full px-4 py-3 bg-surface-input border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select or type below...</option>
                  {sounds.map((s: { name: string }) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={soundboardSound}
                  onChange={(e) => setSoundboardSound(e.target.value)}
                  placeholder="Or type sound name"
                  className="mt-2 w-full px-4 py-2 bg-surface-input border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}
            {runCommand === 'speak' && (
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Text to speak (TTS)
                </label>
                <input
                  type="text"
                  value={speakText}
                  onChange={(e) => setSpeakText(e.target.value)}
                  placeholder="What should the bot say?"
                  className="w-full px-4 py-3 bg-surface-input border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}
            {runCommand === 'grok' && (
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">
                    Message for Grok
                  </label>
                  <input
                    type="text"
                    value={grokText}
                    onChange={(e) => setGrokText(e.target.value)}
                    placeholder="Ask Grok anything..."
                    className="w-full px-4 py-3 bg-surface-input border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={grokSpeakReply}
                    onChange={(e) => setGrokSpeakReply(e.target.checked)}
                    className="rounded border-border"
                  />
                  Speak reply in voice channel (Pranjeet TTS)
                </label>
              </div>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleRunCommand}
              disabled={runCommandMutation.isPending || !canRun}
            >
              {runCommandMutation.isPending ? 'Running...' : 'Run command'}
            </button>
            {runError && <div className="text-xs text-danger-light">{runError}</div>}
            {runResult && <div className="text-xs text-text-secondary">{runResult}</div>}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface-input p-4">
          <div className="text-sm font-semibold text-text-primary mb-1">
            Grok conversation mode (voice)
          </div>
          <div className="text-xs text-text-secondary mb-4">
            For the server selected in Run commands: when on, your voice is sent to Grok in real
            time (Voice Agent). Turning on also enables voice listening for this server. Join a
            voice channel with the bot and speak; ensure GROK_API_KEY is set on the voice worker. If
            nothing happens, try turning off then on again.
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
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Grok voice
                </label>
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
                  Voice for the Grok Voice Agent. Takes effect on your next conversation.
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

        <div className="rounded-xl border border-border bg-surface-input p-4">
          <div className="text-sm font-semibold text-text-primary mb-1">Manage personas</div>
          <div className="text-xs text-text-secondary mb-4">
            Create custom personas (name + system prompt) for Grok. Custom personas appear in the
            Grok persona dropdown above when a server is selected.
          </div>
          {!personaFormOpen && !editingPersonaId && (
            <button
              type="button"
              className="btn btn-primary mb-4"
              onClick={() => {
                setPersonaFormOpen(true);
                setPersonaName('');
                setPersonaSystemPrompt('');
              }}
            >
              Create persona
            </button>
          )}
          {(personaFormOpen || editingPersonaId) && (
            <div className="mb-4 space-y-2 rounded-lg border border-border p-3 bg-surface-elevated">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Name</label>
                <input
                  type="text"
                  value={personaName}
                  onChange={(e) => setPersonaName(e.target.value)}
                  placeholder="e.g. Friendly assistant"
                  className="w-full px-3 py-2 bg-surface-input border border-border rounded-lg text-text-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  System prompt
                </label>
                <textarea
                  value={personaSystemPrompt}
                  onChange={(e) => setPersonaSystemPrompt(e.target.value)}
                  placeholder="Instructions for how the AI should behave..."
                  rows={5}
                  className="w-full px-3 py-2 bg-surface-input border border-border rounded-lg text-text-primary text-sm resize-y"
                />
              </div>
              <div className="flex gap-2">
                {editingPersonaId ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-primary"
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
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setEditingPersonaId(null);
                        setPersonaName('');
                        setPersonaSystemPrompt('');
                      }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn btn-primary"
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
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setPersonaFormOpen(false);
                        setPersonaName('');
                        setPersonaSystemPrompt('');
                      }}
                    >
                      Cancel
                    </button>
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
                    ((createPersonaMutation.error || updatePersonaMutation.error) as Error)
                      ?.message ??
                    'Failed'}
                </div>
              )}
            </div>
          )}
          <div className="space-y-2">
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
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
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
                        </button>
                        <button
                          type="button"
                          className="text-xs text-danger-light hover:underline"
                          disabled={deletePersonaMutation.isPending}
                          onClick={() => {
                            if (window.confirm(`Delete persona "${p.name}"?`)) {
                              deletePersonaMutation.mutate(p.id);
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface-input p-4">
          <div className="text-sm font-semibold text-text-primary mb-1">Transcode and Cleanup</div>
          <div className="text-xs text-text-secondary mb-4">
            Re-encode all sounds to Ogg Opus and archive non-Ogg originals.
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSweep}
            disabled={sweepMutation.isPending}
          >
            {sweepMutation.isPending ? 'Working...' : 'Run Transcode Sweep'}
          </button>
          {sweepMutation.isError && (
            <div className="mt-3 text-xs text-danger-light">Failed to start sweep.</div>
          )}
          {lastResult && (
            <div className="mt-3 text-xs text-text-secondary">
              Converted: {lastResult.converted} | Deleted: {lastResult.deleted} | Skipped:{' '}
              {lastResult.skipped}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
