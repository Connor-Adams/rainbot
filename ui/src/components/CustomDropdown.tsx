import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { ChevronDownIcon } from './icons';

interface CustomDropdownProps<T> {
  items: T[];
  selectedValue: string | null;
  onSelect: (value: string | null) => void;
  getItemId: (item: T) => string;
  getItemLabel: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  placeholder?: string;
  disabled?: boolean;
  emptyMessage?: string;
}

export default function CustomDropdown<T>({
  items,
  selectedValue,
  onSelect,
  getItemId,
  getItemLabel,
  renderItem,
  placeholder = 'Select an option...',
  disabled = false,
  emptyMessage = 'No options available',
}: CustomDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedItem = items.find((item) => getItemId(item) === selectedValue);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (itemId: string | null) => {
    onSelect(itemId);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled || items.length === 0}
        className="w-full px-4 py-3 bg-surface-input border border-border rounded-lg text-text-primary text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all duration-200 hover:border-border-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between"
      >
        <span>
          {selectedItem
            ? getItemLabel(selectedItem)
            : items.length > 0
              ? placeholder
              : emptyMessage}
        </span>
        <ChevronDownIcon
          className={`w-4 h-4 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
          size={16}
        />
      </button>
      {isOpen && items.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-surface-elevated border border-border rounded-lg shadow-lg overflow-hidden">
          <div className="max-h-96 overflow-y-auto">
            {items.map((item) => {
              const itemId = getItemId(item);
              return (
                <button
                  key={itemId}
                  type="button"
                  onClick={() => handleSelect(itemId)}
                  className={`w-full text-left p-4 hover:bg-surface-hover transition-colors ${
                    selectedValue === itemId ? 'bg-surface-hover' : ''
                  }`}
                >
                  {renderItem(item)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
