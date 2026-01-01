import { ExternalLinkIcon } from '../icons'

interface TrackInfoProps {
  title: string
  source: string
  sourceLink: string | null
}

/**
 * Track information display with title, source, and optional external link.
 */
export default function TrackInfo({ title, source, sourceLink }: TrackInfoProps) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-3xl font-bold text-text-primary overflow-hidden text-ellipsis whitespace-nowrap">
        {title}
      </h3>
      <p className="text-lg text-text-secondary font-medium overflow-hidden text-ellipsis whitespace-nowrap">
        {source}
      </p>
      {sourceLink && (
        <a
          href={sourceLink}
          className="flex items-center gap-2 mt-1 text-sm text-primary no-underline transition-all w-fit px-3 py-1.5 rounded-lg hover:text-primary-light hover:bg-primary/10"
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
