import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';
import { Button as DSButton, Spinner } from '@connor-adams/designsystem';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  /** `icon` is a square control for icon-only buttons with no visible label. */
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
  icon?: ReactNode;
  /** Optional so icon-only buttons can pass just `icon`, or an icon as children. */
  children?: ReactNode;
}

// Rainbot's variant/size names predate the design system; map them onto its API
// rather than touching every call site.
const VARIANT_MAP = {
  primary: 'primary',
  secondary: 'secondary',
  danger: 'danger',
  ghost: 'ghost',
} as const;

const SIZE_MAP = {
  sm: 'sm',
  md: 'default',
  lg: 'lg',
  // The design system's 40x40 square — the icon-only affordance.
  icon: 'icon',
} as const;

/**
 * Thin wrapper around the design system's Button that keeps rainbot's existing
 * `isLoading` / `icon` convenience props so call sites don't need to change.
 */
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
    return (
      <DSButton
        ref={ref}
        variant={VARIANT_MAP[variant]}
        size={SIZE_MAP[size]}
        disabled={disabled || isLoading}
        className={isLoading ? `relative !text-transparent ${className}` : className}
        {...props}
      >
        {isLoading && (
          <span className="absolute inset-0 flex items-center justify-center">
            <Spinner size="sm" tone="current" />
          </span>
        )}
        {icon && <span className="flex-shrink-0">{icon}</span>}
        {children}
      </DSButton>
    );
  }
);

Button.displayName = 'Button';

export default Button;
