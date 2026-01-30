import { forwardRef } from 'react';
import { SearchIcon, XIcon } from '@/components/icons';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  ({ value, onChange, placeholder = 'Search sounds...' }, ref) => {
    return (
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted">
          <SearchIcon size={20} />
        </div>
        <input
          ref={ref}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full pl-12 pr-10 py-3 bg-surface-input border border-border rounded-lg text-text-primary text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all placeholder:text-text-muted"
          placeholder={placeholder}
          aria-label="Search sounds"
        />
        {value && (
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-primary transition-all"
            onClick={() => onChange('')}
            aria-label="Clear search"
          >
            <XIcon size={16} />
          </button>
        )}
      </div>
    );
  }
);

SearchBar.displayName = 'SearchBar';
