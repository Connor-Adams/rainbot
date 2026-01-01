interface EmptyStateProps {
  hasSearch: boolean
  searchQuery?: string
}

export function EmptyState({ hasSearch, searchQuery }: EmptyStateProps) {
  return (
    <div className="col-span-full py-12 px-6">
      <div className="text-center space-y-4">
        <div className="text-6xl opacity-40">{hasSearch ? '🔍' : '📭'}</div>
        <div>
          <h3 className="text-text-secondary font-medium mb-1">
            {hasSearch ? 'No matching sounds' : 'No sounds uploaded yet'}
          </h3>
          {hasSearch && searchQuery && (
            <p className="text-text-muted text-sm">
              Try adjusting your search for &quot;{searchQuery}&quot;
            </p>
          )}
          {!hasSearch && (
            <p className="text-text-muted text-sm">Upload your first sound to get started</p>
          )}
        </div>
      </div>
    </div>
  )
}
