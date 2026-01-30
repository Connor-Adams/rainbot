import type { Sound } from '@/types';
import { formatSize } from '@/lib/utils';
import type { SoundCustomization } from '@/hooks/useSoundCustomization';
import { MenuIcon } from '@/components/icons';

interface SoundCardProps {
  sound: Sound;
  customization?: SoundCustomization;
  isPlaying: boolean;
  isPreviewing: boolean;
  isDisabled: boolean;
  onPlay: (sound: Sound) => void;
  onMenuToggle: (soundName: string) => void;
  isMenuOpen: boolean;
}

export function SoundCard({
  sound,
  customization,
  isPlaying,
  isPreviewing,
  isDisabled,
  onPlay,
  onMenuToggle,
  isMenuOpen,
}: SoundCardProps) {
  const displayName = customization?.displayName || sound.name.replace(/\.[^/.]+$/, '');
  const emoji = customization?.emoji || '🎵';

  return (
    <div
      onClick={() => !isDisabled && onPlay(sound)}
      className={`
        relative bg-surface-elevated border border-border rounded-xl p-4 
        flex flex-col items-center gap-3 cursor-pointer select-none 
        transition-all duration-200
        hover:border-primary hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/20 hover:bg-surface-hover
        active:scale-95
        ${isPlaying ? 'border-primary bg-surface-hover animate-pulse' : ''}
        ${isPreviewing ? 'border-secondary bg-secondary/10' : ''}
        ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !isDisabled) {
          e.preventDefault();
          onPlay(sound);
        }
      }}
      aria-label={`Play ${displayName}`}
      aria-disabled={isDisabled}
    >
      {/* Menu Button */}
      <button
        className="absolute top-2 right-2 p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors z-10"
        onClick={(e) => {
          e.stopPropagation();
          onMenuToggle(sound.name);
        }}
        aria-label="Sound options"
        aria-expanded={isMenuOpen}
      >
        <MenuIcon size={16} />
      </button>

      {/* Emoji Icon */}
      <div className="text-4xl" role="img" aria-label={emoji}>
        {emoji}
      </div>

      {/* Sound Info */}
      <div className="text-center w-full">
        <div
          className="text-sm font-medium text-text-primary whitespace-nowrap overflow-hidden text-ellipsis"
          title={sound.name}
        >
          {displayName}
        </div>
        <div className="text-xs text-text-muted font-mono mt-1">{formatSize(sound.size)}</div>
      </div>

      {/* Playing indicator */}
      {isPlaying && (
        <div className="absolute bottom-2 right-2">
          <span className="flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-light opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
          </span>
        </div>
      )}

      {/* Preview indicator */}
      {isPreviewing && (
        <div className="absolute bottom-2 left-2 text-xs text-secondary-light flex items-center gap-1">
          <span className="animate-pulse">▶</span>
        </div>
      )}
    </div>
  );
}
