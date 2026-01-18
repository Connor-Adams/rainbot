import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { forwardRef } from 'react'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  icon?: ReactNode
  children: ReactNode
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      icon,
      children,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed'

    const variants = {
      primary:
        'bg-gradient-to-r from-primary to-primary-dark text-text-primary shadow-sm hover:shadow-glow hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm',
      secondary:
        'bg-surface-elevated text-text-primary border border-border hover:bg-surface-hover hover:border-primary hover:shadow-sm hover:-translate-y-0.5 active:translate-y-0',
      danger:
        'bg-gradient-to-r from-danger to-danger-dark text-text-primary shadow-sm hover:shadow-glow-danger hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm',
      ghost:
        'bg-transparent text-text-secondary hover:text-text-primary hover:bg-surface-elevated',
    }

    const sizes = {
      sm: 'px-3 py-1.5 text-sm min-h-[32px]',
      md: 'px-4 py-2 text-base min-h-[40px]',
      lg: 'px-6 py-3 text-lg min-h-[48px]',
    }

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className} ${
          isLoading ? 'relative !text-transparent' : ''
        }`}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="w-4 h-4 border-2 border-text-primary/30 border-t-text-primary rounded-full animate-spin" />
          </span>
        )}
        {icon && <span className="flex-shrink-0">{icon}</span>}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'

export default Button
