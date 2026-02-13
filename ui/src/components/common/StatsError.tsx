import type { AxiosError } from 'axios';

interface StatsErrorProps {
  error: unknown;
  message?: string;
}

export default function StatsError({ error, message }: StatsErrorProps) {
  let displayMessage = 'An error occurred while loading statistics.';

  if (error instanceof Error) {
    displayMessage = message ? `${message}: ${error.message}` : `Error: ${error.message}`;
  } else if ((error as AxiosError)?.response) {
    const axiosErr = error as AxiosError;
    const status = axiosErr.response?.status;
    if (status === 401) {
      displayMessage = 'Authentication required — please log in to view statistics.';
    } else if (status === 403) {
      displayMessage = 'Access denied — your account lacks the required role to view statistics.';
    } else if (axiosErr.message) {
      displayMessage = message ? `${message}: ${axiosErr.message}` : `Error: ${axiosErr.message}`;
    }
  } else {
    displayMessage = message || displayMessage;
  }

  return <div className="stats-error text-center py-12 text-danger-light">{displayMessage}</div>;
}
