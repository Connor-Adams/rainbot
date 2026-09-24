import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState } from '@connor-adams/designsystem';
import { soundsApi, adminApi, botApi, playbackApi } from '@/lib/api';
import { useGuildStore } from '@/stores/guildStore';
import { Button } from '@/components/ui';

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

export default function CommandRunner() {
  const queryClient = useQueryClient();
  const { selectedGuildId: runGuildId } = useGuildStore();
  const [runCommand, setRunCommand] = useState<RunCommandType>('play');
  const [playSource, setPlaySource] = useState('');
  const [speakText, setSpeakText] = useState('');
  const [grokText, setGrokText] = useState('');
  const [grokSpeakReply, setGrokSpeakReply] = useState(true);
  const [soundboardSound, setSoundboardSound] = useState('');
  const [runResult, setRunResult] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const { data: soundsData } = useQuery({
    queryKey: ['sounds'],
    queryFn: () => soundsApi.list().then((res) => res.data),
  });
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

  if (!runGuildId) {
    return (
      <EmptyState
        title="No server selected"
        description="Pick a server from the menu in the header."
      />
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface-input p-4">
      <div className="text-sm font-semibold text-text-primary mb-1">Run commands</div>
      <div className="text-xs text-text-secondary mb-4">
        Run bot actions from the UI. Pick a command, then run. You must be in a voice channel for
        playback commands to take effect.
      </div>
      <div className="space-y-3">
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
            <label className="block text-xs font-medium text-text-secondary mb-1">Sound name</label>
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
        <Button
          type="button"
          variant="primary"
          onClick={handleRunCommand}
          disabled={runCommandMutation.isPending || !canRun}
        >
          {runCommandMutation.isPending ? 'Running...' : 'Run command'}
        </Button>
        {runError && <div className="text-xs text-danger-light">{runError}</div>}
        {runResult && <div className="text-xs text-text-secondary">{runResult}</div>}
      </div>
    </div>
  );
}
