import type { AxiosError } from 'axios';
import { Alert } from '@connor-adams/designsystem';

/**
 * Error state for a stats panel, backed by the design system's `Alert`.
 *
 * The Axios status-code mapping is the reason this wrapper exists: 401 and 403
 * are the two failures the dashboard actually hits (the stats API is behind
 * Discord OAuth plus a role check), and the raw Axios message for either
 * ("Request failed with status code 403") tells a reader nothing.
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
 */
interface StatsErrorProps {
  error: unknown;
  message?: string;
}

function withPrefix(message: string | undefined, detail: string): string {
  return message ? `${message}: ${detail}` : `Error: ${detail}`;
}

export default function StatsError({ error, message }: StatsErrorProps) {
  let displayMessage = 'An error occurred while loading statistics.';

  const axiosErr = error as AxiosError | undefined;
  const status = axiosErr?.response?.status;

  if (status === 401) {
    displayMessage = 'Authentication required — please log in to view statistics.';
  } else if (status === 403) {
    displayMessage = 'Access denied — your account lacks the required role to view statistics.';
  } else if (error instanceof Error) {
    displayMessage = withPrefix(message, error.message);
  } else if (axiosErr?.response && axiosErr.message) {
    displayMessage = withPrefix(message, axiosErr.message);
  } else {
    displayMessage = message || displayMessage;
  }

  return (
    <div className="py-4">
      <Alert variant="error">{displayMessage}</Alert>
    </div>
  );
}
