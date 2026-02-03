import { useState, useEffect } from 'react';

interface NowPlayingArtworkProps {
  isPlaying: boolean;
  /** Thumbnail URL (e.g. track artwork or YouTube thumbnail). When set, shown instead of placeholder. */
  thumbnailUrl?: string | null;
}

function PlaceholderSvg() {
  return (
    <svg viewBox="0 0 280 280" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="280" height="280" fill="url(#gradient)" />
      <defs>
        <linearGradient id="gradient" x1="0" y1="0" x2="280" y2="280">
          <stop offset="0%" style={{ stopColor: '#3b82f6', stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: '#8b5cf6', stopOpacity: 1 }} />
        </linearGradient>
      </defs>
      <path d="M110 80L190 140L110 200V80Z" fill="white" opacity="0.9" />
    </svg>
  );
}

/**
 * Display track artwork or placeholder with animated equalizer bars.
 * When thumbnailUrl is provided and loads, shows the image; otherwise or on error, shows gradient + play icon.
 *
 * @param isPlaying - Whether audio is currently playing (shows equalizer animation)
 * @param thumbnailUrl - Optional thumbnail URL (e.g. from API or derived from YouTube URL)
 */
export default function NowPlayingArtwork({ isPlaying, thumbnailUrl }: NowPlayingArtworkProps) {
  const [imageError, setImageError] = useState(false);
  useEffect(() => {
    setImageError(false);
  }, [thumbnailUrl]);
  const showThumbnail = thumbnailUrl && !imageError;

  return (
    <div className="relative w-full max-w-[240px] sm:max-w-[280px] aspect-square flex-shrink-0 rounded-2xl overflow-hidden shadow-2xl bg-surface">
      {showThumbnail ? (
        <img
          src={thumbnailUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setImageError(true)}
        />
      ) : (
        <div className="artwork-placeholder">
          <PlaceholderSvg />
        </div>
      )}
      {isPlaying && (
        <div className="artwork-overlay">
          <div className="equalizer">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      )}
    </div>
  );
}
