import type { ReactNode } from 'react';
import type { AxiosError } from 'axios';
import { Alert } from '@connor-adams/designsystem';

/**
 * Error state for a data view, backed by the design system's `Alert`.
 *
 * The Axios status-code mapping is the reason this wrapper exists: 401 and 403
 * are the two failures the dashboard actually hits (every `/api` route is
 * behind Discord OAuth plus a role check in `requireAuth`), and the raw Axios
 * message for either ("Request failed with status code 403") tells a reader
 * nothing.
 *
 * **The branch order is load-bearing.** It used to test `error instanceof
 * Error` first — but `AxiosError` extends `Error`, so that arm always won and
 * the 401/403 mapping below it was unreachable. A denied request rendered
 * "Error: Request failed with status code 403" instead of the message written
 * for it. Narrow on the response shape FIRST, then fall back to plain `Error`.
 *
 * The wrapper's `stats-error` class is gone — it is defined nowhere in the app
 * or in either design-system package, so it never carried style. `Alert`'s
 * `error` variant is assertive (`role="alert"`), which this state wants.
 *
 * **Not only for stats, despite the name.** `subject` parameterises the three
 * sentences that used to hard-code "statistics", so the Soundboard and
 * Recordings tabs get the same 401/403 prose and the same assertive `Alert`
 * without a second copy of the ordering rule above — reimplementing that
 * mapping per tab is how the bug it documents comes back. The name is kept
 * because 21 stats sections import it; renaming is a separate, mechanical
 * change.
 */
interface StatsErrorProps {
  error: unknown;
  message?: string;
  /**
   * What failed to load, as it should read mid-sentence ("statistics", "the
   * soundboard", "recordings"). Only the status-mapped sentences use it.
   */
  subject?: string;
  /**
   * Trailing action — a Retry button. Rendered under the message rather than in
   * `Alert`'s `action` slot, which lives in the alert's header next to `title`:
   * with no title (this component has never had one, and adding one would
   * restyle all 21 stats sections) the slot leaves the button stranded on a row
   * of its own ABOVE the sentence it acts on.
   */
  actions?: ReactNode;
}

function withPrefix(message: string | undefined, detail: string): string {
  return message ? `${message}: ${detail}` : `Error: ${detail}`;
}

export default function StatsError({
  error,
  message,
  subject = 'statistics',
  actions,
}: StatsErrorProps) {
  let displayMessage = `An error occurred while loading ${subject}.`;

  // `status` on the error itself, not just under `response`, is how a caller
  // that uses raw `fetch` (RecordingsTab) gets the same 401/403 copy: it has no
  // Axios response object to narrow on, so it annotates the Error it throws.
  const axiosErr = error as (AxiosError & { status?: number }) | undefined;
  const status = axiosErr?.response?.status ?? axiosErr?.status;

  if (status === 401) {
    displayMessage = `Authentication required — please log in to view ${subject}.`;
  } else if (status === 403) {
    displayMessage = `Access denied — your account lacks the required role to view ${subject}.`;
  } else if (error instanceof Error) {
    displayMessage = withPrefix(message, error.message);
  } else if (axiosErr?.response && axiosErr.message) {
    displayMessage = withPrefix(message, axiosErr.message);
  } else {
    displayMessage = message || displayMessage;
  }

  return (
    <div className="py-4">
      <Alert variant="error">
        {displayMessage}
        {actions && <span className="mt-3 flex flex-wrap gap-2">{actions}</span>}
      </Alert>
    </div>
  );
}
