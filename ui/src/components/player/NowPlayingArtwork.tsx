interface NowPlayingArtworkProps {
  isPlaying: boolean;
}

/**
 * Display artwork placeholder with animated equalizer bars.
 * Shows a gradient background with a play symbol and animated bars when playing.
 *
 * @param isPlaying - Whether audio is currently playing (shows equalizer animation)
 */
export default function NowPlayingArtwork({ isPlaying }: NowPlayingArtworkProps) {
  return (
    <div className="relative w-full max-w-[240px] sm:max-w-[280px] aspect-square flex-shrink-0 rounded-2xl overflow-hidden shadow-2xl bg-surface">
      <div className="artwork-placeholder">
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
      </div>
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
