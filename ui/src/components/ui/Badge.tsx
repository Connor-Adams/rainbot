import type { HTMLAttributes } from 'react'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'info'
  size?: 'sm' | 'md'
}

export default function Badge({
  variant = 'default',
  size = 'md',
  className = '',
  children,
  ...props
}: BadgeProps) {
  const variants = {
    default: 'bg-gradient-to-r from-primary to-primary-dark text-white shadow-glow',
    success: 'bg-gradient-to-r from-success to-success-dark text-white shadow-glow-success',
    danger: 'bg-gradient-to-r from-danger to-danger-dark text-white shadow-glow-danger',
    warning: 'bg-gradient-to-r from-warning to-warning-dark text-white',
    info: 'bg-gradient-to-r from-info to-info-dark text-white',
  }

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
  }

  return (
    <span
      className={`
        inline-flex items-center justify-center
        rounded-full font-bold tracking-wide
        ${variants[variant]} ${sizes[size]} ${className}
      `}
      {...props}
    >
      {children}
    </span>
  )
}
