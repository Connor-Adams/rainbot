import { forwardRef } from 'react';
import { Icon, Input } from '@connor-adams/designsystem';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * Sound search field.
 *
 * The design system's `Input` owns the leading icon, the conditional clear
 * button, and the space both occupy - reserved in `Input.css` off
 * `data-leading` / `data-trailing` rather than measured in JS - so this is now
 * just a controlled wrapper over it.
 *
 * Two details this relies on:
 * - `Input` forwards its ref to the native `<input>`, never to the adornment
 *   wrapper, which is what SoundboardTab's `searchInputRef` "/" focus shortcut
 *   needs.
 * - `clearable` renders a real `<button>` with an accessible name that is
 *   `disabled` (and so out of the tab order) while there is nothing to clear,
 *   replacing the old conditionally-rendered clear button.
 */
export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  ({ value, onChange, placeholder = 'Search sounds...' }, ref) => (
    <Input
      ref={ref}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label="Search sounds"
      className="w-full"
      leadingIcon={<Icon name="search" size={20} />}
      clearable
      onClear={() => onChange('')}
      clearLabel="Clear search"
    />
  )
);

SearchBar.displayName = 'SearchBar';
