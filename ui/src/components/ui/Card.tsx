import type { HTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';
import {
  Card as DSCard,
  CardHeader as DSCardHeader,
  CardTitle as DSCardTitle,
  CardContent as DSCardContent,
} from '@connor-adams/designsystem';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  hover?: boolean;
}

/**
 * Thin wrapper around the design system's Card that keeps rainbot's existing
 * `hover` convenience prop so call sites don't need to change.
 */
const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, hover = false, className = '', ...props }, ref) => {
    return (
      <DSCard
        ref={ref}
        className={`${
          hover
            ? 'transition-all duration-300 ease-out hover:border-primary hover:shadow-md hover:-translate-y-0.5'
            : ''
        } ${className}`.trim()}
        {...props}
      >
        {children}
      </DSCard>
    );
  }
);

Card.displayName = 'Card';

export function CardHeader({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <DSCardHeader className={className} {...props}>
      {children}
    </DSCardHeader>
  );
}

export function CardTitle({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <DSCardTitle className={className} {...props}>
      {children}
    </DSCardTitle>
  );
}

export function CardContent({
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <DSCardContent className={className} {...props}>
      {children}
    </DSCardContent>
  );
}

export default Card;
