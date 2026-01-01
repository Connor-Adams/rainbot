import { useState, useRef, useCallback, useEffect } from 'react';

const PREVIEW_VOLUME = 0.5;

export function useAudioPreview() {
  const [previewingSound, setPreviewingSound] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopPreview = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    setPreviewingSound(null);
  }, []);

  const playPreview = useCallback(
    (soundName: string, url: string) => {
      // Toggle if already playing this sound
      if (previewingSound === soundName) {
        stopPreview();
        return;
      }

      // Stop any currently playing preview
      stopPreview();

      // Start new preview
      const audio = new Audio(url);
      audio.volume = PREVIEW_VOLUME;
      audioRef.current = audio;
      setPreviewingSound(soundName);

      audio.play().catch((error) => {
        console.error('Error playing preview:', error);
        stopPreview();
      });

      audio.onended = stopPreview;
      audio.onerror = () => {
        console.error('Error loading audio');
        stopPreview();
      };
    },
    [previewingSound, stopPreview]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPreview();
    };
  }, [stopPreview]);

  return { previewingSound, playPreview, stopPreview };
}
