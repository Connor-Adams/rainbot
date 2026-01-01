import type { InputHTMLAttributes } from 'react'
import { forwardRef } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        <input
          ref={ref}
          className={`
            w-full px-4 py-2 rounded-lg
            bg-surface-elevated border border-border
            text-text-primary placeholder:text-text-muted
            font-sans text-base
            transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary
            hover:border-border-hover
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? 'border-danger focus:ring-danger' : ''}
            ${className}
          `}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-danger">{error}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'

export default Input
