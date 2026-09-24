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
 *
 * With no `error` this renders the bare `<input>` — no wrapper element — so it
 * stays a drop-in replacement for a plain `<input>`, including as a direct
 * child of a flex row where an extra `w-full` div would break the layout.
 */
const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, className = '', ...props }, ref) => {
    const input = <DSInput ref={ref} invalid={!!error} className={className} {...props} />;

    if (!error) return input;

    return (
      <div className="w-full">
        {input}
        <p className="mt-1 text-sm text-danger">{error}</p>
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
