import type { InputHTMLAttributes } from 'react';
import { forwardRef } from 'react';
import { Input as DSInput } from '@connor-adams/designsystem';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

/**
 * Thin wrapper around the design system's Input that keeps rainbot's existing
 * `error` convenience prop (message below the field) so call sites don't need
 * to change.
 */
const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        <DSInput ref={ref} invalid={!!error} className={className} {...props} />
        {error && <p className="mt-1 text-sm text-danger">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
