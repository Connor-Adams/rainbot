import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { playbackApi, botApi } from '@/lib/api';
import { useGuildStore } from '@/stores/guildStore';
import { useQueueEvents } from '@/hooks/useQueueEvents';
import { useStatusEvents } from '@/hooks/useStatusEvents';
import { EmptyState, Slider, Switch } from '@connor-adams/designsystem';
import NowPlayingCard from '../NowPlayingCard';
import { Button } from '@/components/ui';

type BotType = 'rainbot' | 'pranjeet' | 'hungerbot';

export default function PlayerTab() {
  const { selectedGuildId } = useGuildStore();
  const [urlInput, setUrlInput] = useState('');
  const [ttsInput, setTtsInput] = useState('');
  const [localVolumes, setLocalVolumes] = useState<{
    rainbot: number | null;
    pranjeet: number | null;
    hungerbot: number | null;
  }>({ rainbot: null, pranjeet: null, hungerbot: null }); // Only set while dragging
  // Optimistic override for the autoplay toggle, held until fresh server state
  // arrives (same shape as localVolumes — see volumeMutation for why).
  const [localAutoplay, setLocalAutoplay] = useState<boolean | null>(null);
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

  const autoplayEnabled = localAutoplay ?? queueData?.isAutoplay ?? false;

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
    mutationFn: (payload: { level: number; botType: BotType }) =>
      playbackApi.volume(selectedGuildId!, payload.level, payload.botType),
    // The optimistic value is held until fresh server state has actually
    // arrived. Awaiting the invalidation matters: clearing the override the
    // moment the request is fired drops the slider back to the last polled
    // value — which can be up to 5s stale — so the handle visibly snaps back
    // and then jumps again when the poll catches up.
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['bot-status'] });
      setLocalVolumes((prev) => ({ ...prev, [variables.botType]: null }));
    },
    // On failure, drop the override so the slider returns to the truth the
    // server last reported, rather than sitting on a value that never applied.
    onError: (_error, variables) => {
      setLocalVolumes((prev) => ({ ...prev, [variables.botType]: null }));
    },
  });

  const autoplayMutation = useMutation({
    mutationFn: (enabled: boolean) => playbackApi.autoplay(selectedGuildId!, enabled),
    // Same shape as volumeMutation: hold the optimistic value until the queue
    // query has actually refetched, instead of clearing it the moment the
    // request fires (which would snap the switch back to stale polled state).
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['queue', selectedGuildId] });
      setLocalAutoplay(null);
    },
    // On failure, drop the override so the switch reflects the truth the
    // server last reported, rather than sitting on a value that never applied.
    onError: () => {
      setLocalAutoplay(null);
    },
  });

  const handleAutoplayChange = (enabled: boolean) => {
    setLocalAutoplay(enabled);
    autoplayMutation.mutate(enabled);
  };

  // A debounce timer that survives unmount fires a mutation and a setState on a
  // component that no longer exists — most visible when switching guilds mid-drag.
  useEffect(() => {
    const refs = volumeDebounceRefs.current;
    return () => {
      for (const timer of Object.values(refs)) {
        if (timer) clearTimeout(timer);
      }
    };
  }, []);

  const handleVolumeChange = (botType: BotType, newVolume: number) => {
    setLocalVolumes((prev) => ({ ...prev, [botType]: newVolume }));

    // Debounced so dragging the slider doesn't fire a request per pixel. The
    // override is deliberately NOT cleared here — see the mutation's callbacks.
    const ref = volumeDebounceRefs.current;
    if (ref[botType]) clearTimeout(ref[botType]!);
    ref[botType] = setTimeout(() => {
      volumeMutation.mutate({ level: newVolume, botType });
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

  if (!selectedGuildId) {
    return (
      <EmptyState
        title="No server selected"
        description="Pick a server from the menu in the header to control playback."
      />
    );
  }

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
            <Button
              variant="primary"
              className="w-full sm:w-auto"
              onClick={handlePlay}
              disabled={playMutation.isPending || !selectedGuildId}
              icon="▶"
            >
              Add to Queue
            </Button>
            <Button
              variant="danger"
              className="w-full sm:w-auto"
              onClick={() => stopMutation.mutate()}
              disabled={stopMutation.isPending || !selectedGuildId}
              icon="■"
            >
              Stop
            </Button>
          </div>
          <div className="flex items-center justify-between gap-3 pt-1">
            <div>
              <span className="text-sm text-text-primary">Autoplay</span>
              <p className="text-xs text-text-muted">
                Automatically play related tracks when the queue is empty.
              </p>
            </div>
            <Switch
              checked={autoplayEnabled}
              onCheckedChange={handleAutoplayChange}
              disabled={!selectedGuildId || autoplayMutation.isPending}
            />
          </div>
          {autoplayMutation.isError && (
            <p className="text-xs text-danger">
              {(
                autoplayMutation.error as {
                  response?: { data?: { error?: string } };
                  message?: string;
                }
              )?.response?.data?.error ??
                (autoplayMutation.error as Error)?.message ??
                'Failed to toggle autoplay'}
            </p>
          )}
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
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto shrink-0"
              onClick={() => {
                const t = ttsInput.trim();
                if (t && selectedGuildId) speakMutation.mutate(t);
              }}
              disabled={speakMutation.isPending || !ttsInput.trim() || !selectedGuildId}
            >
              {speakMutation.isPending ? '…' : 'Say'}
            </Button>
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
              <Slider
                min={0}
                max={100}
                value={volumes.rainbot}
                onValueChange={(v) => handleVolumeChange('rainbot', v)}
                disabled={!selectedGuildId}
              />
            </div>
            <div>
              <div className="flex items-center justify-between text-xs text-text-secondary mb-2">
                <span>Pranjeet Volume</span>
                <span>{volumes.pranjeet}%</span>
              </div>
              <Slider
                min={0}
                max={100}
                value={volumes.pranjeet}
                onValueChange={(v) => handleVolumeChange('pranjeet', v)}
                disabled={!selectedGuildId}
              />
            </div>
            <div>
              <div className="flex items-center justify-between text-xs text-text-secondary mb-2">
                <span>Hungerbot Volume</span>
                <span>{volumes.hungerbot}%</span>
              </div>
              <Slider
                min={0}
                max={100}
                value={volumes.hungerbot}
                onValueChange={(v) => handleVolumeChange('hungerbot', v)}
                disabled={!selectedGuildId}
              />
            </div>
          </div>
          {volumeMutation.isError && (
            <p className="text-xs text-danger mt-3">
              {(
                volumeMutation.error as {
                  response?: { data?: { error?: string } };
                  message?: string;
                }
              )?.response?.data?.error ??
                (volumeMutation.error as Error)?.message ??
                'Failed to set volume'}
            </p>
          )}
        </div>
      </section>
    </>
  );
}
