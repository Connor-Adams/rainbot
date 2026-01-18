import { ExternalLinkIcon } from '@/components/icons'

interface TrackInfoProps {
  title: string
  source: string
  sourceLink?: string | null
}

/**
 * Display track title, source platform, and external link.
 * Shows the currently playing track information with optional link to source platform.
 * Handles overflow gracefully with text ellipsis.
 * 
 * @param title - Track title or name
 * @param source - Source platform name (e.g., "YouTube", "Spotify", "Local Sound")
 * @param sourceLink - Optional URL to open track in source platform
 */
export default function TrackInfo({ title, source, sourceLink }: TrackInfoProps) {
  return (
    <div className="track-info flex flex-col gap-3">
      <h2 className="track-title text-2xl sm:text-3xl font-bold text-text-primary overflow-hidden text-ellipsis whitespace-nowrap">
        {title}
      </h2>
      <p className="track-artist text-base sm:text-lg text-text-secondary font-medium overflow-hidden text-ellipsis whitespace-nowrap">
        {source}
      </p>
      {sourceLink && (
        <a
          href={sourceLink}
          className="track-link flex items-center gap-2 mt-1 text-sm text-primary no-underline transition-all w-fit px-3 py-1.5 rounded-lg hover:text-primary-light hover:bg-primary/10"
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLinkIcon size={16} className="flex-shrink-0" />
          <span className="font-medium">Open in source</span>
        </a>
      )}
    </div>
  )
}
