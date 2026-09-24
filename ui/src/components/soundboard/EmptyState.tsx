import { EmptyState as DSEmptyState } from '@connor-adams/designsystem';

interface EmptyStateProps {
  hasSearch: boolean;
  searchQuery?: string;
}

export function EmptyState({ hasSearch, searchQuery }: EmptyStateProps) {
  return (
    <div className="col-span-full">
      <DSEmptyState
        className="text-center"
        title={
          <>
            <span className="block text-4xl mb-2 opacity-60" aria-hidden="true">
              {hasSearch ? '🔍' : '📭'}
            </span>
            {hasSearch ? 'No matching sounds' : 'No sounds uploaded yet'}
          </>
        }
        description={
          hasSearch
            ? searchQuery && `Try adjusting your search for "${searchQuery}"`
            : 'Upload your first sound to get started'
        }
      />
    </div>
  );
}
