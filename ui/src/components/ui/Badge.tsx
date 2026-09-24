import type { HTMLAttributes } from 'react';
import { Badge as DSBadge } from '@connor-adams/designsystem';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'info';
  size?: 'sm' | 'md';
}

// Rainbot's variant/size names predate the design system; map them onto its API
// rather than touching every call site.
const VARIANT_MAP = {
  default: 'default',
  success: 'success',
  danger: 'destructive',
  warning: 'outline',
  info: 'secondary',
} as const;

const SIZE_CLASSES = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
} as const;

/**
 * Thin wrapper around the design system's Badge that keeps rainbot's existing
 * variant/size names so call sites don't need to change.
 */
export default function Badge({
  variant = 'default',
  size = 'md',
  className = '',
  children,
  ...props
}: BadgeProps) {
  return (
    <DSBadge
      variant={VARIANT_MAP[variant]}
      className={`${SIZE_CLASSES[size]} ${className}`.trim()}
      {...props}
    >
      {children}
    </DSBadge>
  );
}
