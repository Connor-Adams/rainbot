import { describe, expect, it } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { render, screen } from '@testing-library/react';
import StatsError from '../StatsError';

/**
 * Regression cover for the `instanceof Error` ordering bug.
 *
 * `StatsError` used to test `error instanceof Error` before looking at
 * `error.response.status`. Because `AxiosError extends Error`, that arm always
 * won and the 401/403 copy below it was dead code — a denied request rendered
 * "Error: Request failed with status code 403" instead of the sentence written
 * for it. Nothing caught that, because the tests below did not exist.
 *
 * The 403/401 cases therefore use a REAL `AxiosError` (so `instanceof Error` is
 * true) rather than a bare object literal that would pass either way.
 */
function realAxiosError(status: number): AxiosError {
  const headers = new AxiosHeaders();
  const config = { headers };
  const error = new AxiosError(
    `Request failed with status code ${status}`,
    AxiosError.ERR_BAD_REQUEST,
    config,
    {},
    {
      status,
      statusText: status === 403 ? 'Forbidden' : 'Unauthorized',
      headers: {},
      config,
      data: {},
    }
  );
  return error;
}

describe('StatsError', () => {
  it('renders the access-denied copy for a real AxiosError with a 403 response', () => {
    const error = realAxiosError(403);
    // Guard the premise of the regression: if this ever stops being true the
    // test below stops proving anything.
    expect(error instanceof Error).toBe(true);

    render(<StatsError error={error} />);

    expect(
      screen.getByText('Access denied — your account lacks the required role to view statistics.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/Request failed with status code 403/)).not.toBeInTheDocument();
  });

  it('renders the access-denied copy even when a `message` prop is supplied', () => {
    // The `message` prop prefixes the generic branches but must NOT be able to
    // reach the 403 sentence.
    render(<StatsError error={realAxiosError(403)} message="Could not load sounds" />);

    expect(
      screen.getByText('Access denied — your account lacks the required role to view statistics.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/Could not load sounds/)).not.toBeInTheDocument();
  });

  it('renders the authentication copy for a real AxiosError with a 401 response', () => {
    render(<StatsError error={realAxiosError(401)} />);

    expect(
      screen.getByText('Authentication required — please log in to view statistics.')
    ).toBeInTheDocument();
  });

  it('is announced assertively', () => {
    render(<StatsError error={realAxiosError(403)} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Access denied — your account lacks the required role to view statistics.'
    );
  });

  it('prefixes a plain Error with the default prefix', () => {
    render(<StatsError error={new Error('socket hang up')} />);

    expect(screen.getByText('Error: socket hang up')).toBeInTheDocument();
  });

  it('prefixes a plain Error with the `message` prop when one is given', () => {
    render(<StatsError error={new Error('socket hang up')} message="Could not load sounds" />);

    expect(screen.getByText('Could not load sounds: socket hang up')).toBeInTheDocument();
  });

  it('falls back to the generic sentence for a non-Error value with no message prop', () => {
    render(<StatsError error={'just a string'} />);

    expect(screen.getByText('An error occurred while loading statistics.')).toBeInTheDocument();
  });

  it('uses the `message` prop verbatim for a non-Error value', () => {
    render(<StatsError error={null} message="Could not load sounds" />);

    expect(screen.getByText('Could not load sounds')).toBeInTheDocument();
  });

  it('threads `subject` through the status-mapped sentences', () => {
    // The Soundboard and Recordings tabs reuse this component precisely so the
    // 401/403 mapping above is not reimplemented per tab; the only thing they
    // change is the noun.
    render(<StatsError error={realAxiosError(403)} subject="the soundboard" />);

    expect(
      screen.getByText(
        'Access denied — your account lacks the required role to view the soundboard.'
      )
    ).toBeInTheDocument();
  });

  it('threads `subject` through the generic sentence too', () => {
    render(<StatsError error={null} subject="recordings" />);

    expect(screen.getByText('An error occurred while loading recordings.')).toBeInTheDocument();
  });

  it('maps a status carried on the error itself, for raw-`fetch` callers', () => {
    // RecordingsTab uses `fetch`, so there is no Axios response to narrow on and
    // it annotates the Error it throws with the HTTP status instead.
    const error = Object.assign(new Error('Failed to load recordings (HTTP 401)'), { status: 401 });

    render(<StatsError error={error} subject="recordings" />);

    expect(
      screen.getByText('Authentication required — please log in to view recordings.')
    ).toBeInTheDocument();
  });

  it('renders an `actions` node inside the alert', () => {
    render(
      <StatsError
        error={new Error('socket hang up')}
        actions={<button type="button">Retry</button>}
      />
    );

    expect(screen.getByRole('alert')).toContainElement(
      screen.getByRole('button', { name: 'Retry' })
    );
  });

  it('maps an unhandled status through the Axios response branch', () => {
    // A 500 has no dedicated copy; it reaches the `response && message` arm.
    render(<StatsError error={realAxiosError(500)} message="Could not load sounds" />);

    expect(
      screen.getByText('Could not load sounds: Request failed with status code 500')
    ).toBeInTheDocument();
  });
});
