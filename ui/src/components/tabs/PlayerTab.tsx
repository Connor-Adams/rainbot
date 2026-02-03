import { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { playbackApi, botApi } from '@/lib/api';
import { useGuildStore } from '@/stores/guildStore';
import { useQueueEvents } from '@/hooks/useQueueEvents';
import { useStatusEvents } from '@/hooks/useStatusEvents';
import NowPlayingCard from '../NowPlayingCard';

export default function PlayerTab() {
  const { selectedGuildId } = useGuildStore();
  const [urlInput, setUrlInput] = useState('');
  const [ttsInput, setTtsInput] = useState('');
  const [localVolumes, setLocalVolumes] = useState<{
    rainbot: number | null;
    pranjeet: number | null;
    hungerbot: number | null;
  }>({ rainbot: null, pranjeet: null, hungerbot: null }); // Only set while dragging
  const volumeDebounceRefs = useRef<{
    rainbot: ReturnType<typeof setTimeout> | null;
    pranjeet: ReturnType<typeof setTimeout> | null;
    hungerbot: ReturnType<typeof setTimeout> | null;
  }>({ rainbot: null, pranjeet: null, hungerbot: null });
  const queryClient = useQueryClient();

  const { connected: isQueueSSEConnected } = useQueueEvents(selectedGuildId ?? null);
  const { connected: isStatusSSEConnected } = useStatusEvents();

  const { data: queueData } = useQuery({
    queryKey: ['queue', selectedGuildId],
    queryFn: () => botApi.getQueue(selectedGuildId!).then((res) => res.data),
    enabled: !!selectedGuildId,
    refetchInterval: isQueueSSEConnected ? false : 5000,
  });

  const { data: botStatus } = useQuery({
    queryKey: ['bot-status'],
    queryFn: () => botApi.getStatus().then((res) => res.data),
    refetchInterval: isStatusSSEConnected ? false : 5000,
  });

  const connection = (() => {
    if (botStatus?.connections && selectedGuildId) {
      return botStatus.connections.find((c: { guildId: string }) => c.guildId === selectedGuildId);
    }
    return null;
  })();

  const serverVolumes = {
    rainbot: connection?.workers?.rainbot?.volume ?? connection?.volume ?? 100,
    pranjeet: connection?.workers?.pranjeet?.volume ?? 80,
    hungerbot: connection?.workers?.hungerbot?.volume ?? 70,
  };

  const volumes = {
    rainbot: localVolumes.rainbot ?? serverVolumes.rainbot,
    pranjeet: localVolumes.pranjeet ?? serverVolumes.pranjeet,
    hungerbot: localVolumes.hungerbot ?? serverVolumes.hungerbot,
  };

  const playMutation = useMutation({
    mutationFn: (source: string) => playbackApi.play(selectedGuildId!, source),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue', selectedGuildId] });
      queryClient.invalidateQueries({ queryKey: ['bot-status'] });
      setUrlInput('');
    },
  });

  const speakMutation = useMutation({
    mutationFn: (text: string) => playbackApi.speak(selectedGuildId!, text),
    onSuccess: () => {
      setTtsInput('');
    },
  });

  const stopMutation = useMutation({
    mutationFn: () => playbackApi.stop(selectedGuildId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue', selectedGuildId] });
      queryClient.invalidateQueries({ queryKey: ['bot-status'] });
    },
  });

  const volumeMutation = useMutation({
    mutationFn: (payload: { level: number; botType: 'rainbot' | 'pranjeet' | 'hungerbot' }) =>
      playbackApi.volume(selectedGuildId!, payload.level, payload.botType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-status'] });
    },
    onError: () => {
      setLocalVolumes((prev) => ({ ...prev }));
    },
  });

  const handleVolumeChange = (
    botType: 'rainbot' | 'pranjeet' | 'hungerbot',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const newVolume = parseInt(e.target.value);
    setLocalVolumes((prev) => ({ ...prev, [botType]: newVolume }));

    // Debounce API call
    const ref = volumeDebounceRefs.current;
    if (ref[botType]) clearTimeout(ref[botType]!);
    ref[botType] = setTimeout(() => {
      volumeMutation.mutate({ level: newVolume, botType });
      setLocalVolumes((prev) => ({ ...prev, [botType]: null }));
    }, 150);
  };

  const handlePlay = () => {
    const url = urlInput.trim();
    if (!url) {
      alert('Please enter a URL');
      return;
    }
    if (!selectedGuildId) {
      alert('Please select a server first');
      return;
    }
    playMutation.mutate(url);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handlePlay();
    }
  };

  return (
    <>
      {selectedGuildId && queueData?.nowPlaying && (
        <NowPlayingCard queueData={queueData} guildId={selectedGuildId} />
      )}

      <section className="panel player-panel bg-surface rounded-2xl border border-border p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4 flex items-center gap-2">
          <span className="w-1 h-4 bg-gradient-to-b from-primary to-secondary rounded shadow-glow"></span>
          Add to Queue
        </h2>
        <div className="url-player space-y-4">
          <div className="input-group flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1 px-4 py-3 bg-surface-input border border-border rounded-lg text-text-primary text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all placeholder:text-text-muted"
              placeholder="YouTube, Spotify, SoundCloud, or direct URL..."
            />
          </div>
          <div className="player-controls flex flex-col sm:flex-row gap-3">
            <button
              className="btn btn-primary w-full sm:w-auto"
              onClick={handlePlay}
              disabled={playMutation.isPending || !selectedGuildId}
            >
              <span className="btn-icon">▶</span> Add to Queue
            </button>
            <button
              className="btn btn-danger w-full sm:w-auto"
              onClick={() => stopMutation.mutate()}
              disabled={stopMutation.isPending || !selectedGuildId}
            >
              <span className="btn-icon">■</span> Stop
            </button>
          </div>
        </div>

        {/* Say (TTS) - Pranjeet speaks whatever you type */}
        <div className="tts-speak mt-6 pt-6 border-t border-border">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
            Say (TTS)
          </h3>
          <p className="text-xs text-text-muted mb-3">
            Type something and Pranjeet will say it in your voice channel. You must be in a voice
            channel.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={ttsInput}
              onChange={(e) => setTtsInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const t = ttsInput.trim();
                  if (t && selectedGuildId) speakMutation.mutate(t);
                }
              }}
              className="flex-1 px-4 py-3 bg-surface-input border border-border rounded-lg text-text-primary text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all placeholder:text-text-muted"
              placeholder="Type what you want the bot to say..."
              disabled={!selectedGuildId}
            />
            <button
              type="button"
              className="btn btn-secondary w-full sm:w-auto shrink-0"
              onClick={() => {
                const t = ttsInput.trim();
                if (t && selectedGuildId) speakMutation.mutate(t);
              }}
              disabled={speakMutation.isPending || !ttsInput.trim() || !selectedGuildId}
            >
              {speakMutation.isPending ? '…' : 'Say'}
            </button>
          </div>
          {speakMutation.isError && (
            <p className="text-xs text-red-500 mt-2">
              {(
                speakMutation.error as {
                  response?: { data?: { error?: string } };
                  message?: string;
                }
              )?.response?.data?.error ??
                (speakMutation.error as Error)?.message ??
                'Failed to speak'}
            </p>
          )}
        </div>

        {/* Volume Control */}
        <div className="volume-control mt-6 pt-6 border-t border-border">
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs text-text-secondary mb-2">
                <span>Rainbot Volume</span>
                <span>{volumes.rainbot}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={volumes.rainbot}
                onChange={(e) => handleVolumeChange('rainbot', e)}
                disabled={!selectedGuildId}
                className="w-full"
              />
            </div>
            <div>
              <div className="flex items-center justify-between text-xs text-text-secondary mb-2">
                <span>Pranjeet Volume</span>
                <span>{volumes.pranjeet}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={volumes.pranjeet}
                onChange={(e) => handleVolumeChange('pranjeet', e)}
                disabled={!selectedGuildId}
                className="w-full"
              />
            </div>
            <div>
              <div className="flex items-center justify-between text-xs text-text-secondary mb-2">
                <span>Hungerbot Volume</span>
                <span>{volumes.hungerbot}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={volumes.hungerbot}
                onChange={(e) => handleVolumeChange('hungerbot', e)}
                disabled={!selectedGuildId}
                className="w-full"
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
