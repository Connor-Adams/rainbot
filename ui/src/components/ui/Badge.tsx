import type { HTMLAttributes } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'info';
  size?: 'sm' | 'md';
}

export default function Badge({
  variant = 'default',
  size = 'md',
  className = '',
  children,
  ...props
}: BadgeProps) {
  const variants = {
    default: 'bg-primary/20 text-primary-light border border-primary/30 shadow-none',
    success: 'bg-success/15 text-success-light border border-success/30 shadow-none',
    danger: 'bg-danger/15 text-danger-light border border-danger/30 shadow-none',
    warning: 'bg-warning/15 text-warning-light border border-warning/30 shadow-none',
    info: 'bg-info/15 text-info-light border border-info/30 shadow-none',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
  };

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
  );
}
