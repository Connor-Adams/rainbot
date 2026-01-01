/**
 * Album artwork display component with animated equalizer overlay.
 * Shows a gradient placeholder with play icon and animated bars.
 */
export default function AlbumArtwork() {
  return (
    <div className="relative w-[280px] h-[280px] flex-shrink-0 rounded-2xl overflow-hidden shadow-2xl bg-surface">
      {/* Gradient background with play icon */}
      <svg viewBox="0 0 280 280" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <rect width="280" height="280" fill="url(#artwork-gradient)" />
        <defs>
          <linearGradient id="artwork-gradient" x1="0" y1="0" x2="280" y2="280">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity={1} />
          </linearGradient>
        </defs>
        <path d="M110 80L190 140L110 200V80Z" fill="white" opacity="0.9" />
      </svg>
      
      {/* Animated equalizer overlay */}
      <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-70">
        <span className="w-1 h-8 bg-white rounded-full animate-pulse-dot" style={{ animationDelay: '0s' }} />
        <span className="w-1 h-12 bg-white rounded-full animate-pulse-dot" style={{ animationDelay: '0.2s' }} />
        <span className="w-1 h-6 bg-white rounded-full animate-pulse-dot" style={{ animationDelay: '0.4s' }} />
        <span className="w-1 h-10 bg-white rounded-full animate-pulse-dot" style={{ animationDelay: '0.6s' }} />
      </div>
    </div>
  )
}
