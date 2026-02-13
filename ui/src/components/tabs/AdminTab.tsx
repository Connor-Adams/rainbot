import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { soundsApi, adminApi, botApi, playbackApi } from '@/lib/api';
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
  const [grokSpeakReply, setGrokSpeakReply] = useState(false);
  const [soundboardSound, setSoundboardSound] = useState('');
  const [runResult, setRunResult] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

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
  const guilds = botStatus?.guilds ?? [];
  const sounds = soundsData ?? [];

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
