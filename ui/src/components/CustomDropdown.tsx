import { useState, useEffect, useRef, ReactNode } from 'react'

interface CustomDropdownProps<T> {
  items: T[]
  selectedValue: string | null
  onSelect: (value: string | null) => void
  getItemId: (item: T) => string
  getItemLabel: (item: T) => string
  renderItem: (item: T) => ReactNode
  placeholder?: string
  disabled?: boolean
  emptyMessage?: string
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
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedItem = items.find((item) => getItemId(item) === selectedValue)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (itemId: string | null) => {
    onSelect(itemId)
    setIsOpen(false)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled || items.length === 0}
        className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between"
      >
        <span>
          {selectedItem ? getItemLabel(selectedItem) : items.length > 0 ? placeholder : emptyMessage}
        </span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path fill="#a1a1b0" d="M6 8L1 3h10z" />
        </svg>
      </button>
      {isOpen && items.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-gray-900 border border-gray-700 rounded-lg shadow-lg overflow-hidden">
          <div className="max-h-96 overflow-y-auto">
            {items.map((item) => {
              const itemId = getItemId(item)
              return (
                <button
                  key={itemId}
                  type="button"
                  onClick={() => handleSelect(itemId)}
                  className={`w-full text-left p-4 hover:bg-gray-800 transition-colors ${
                    selectedValue === itemId ? 'bg-gray-800' : ''
                  }`}
                >
                  {renderItem(item)}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

