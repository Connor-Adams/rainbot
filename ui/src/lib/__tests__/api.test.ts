import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import api, { adminApi, botApi, isAbortError, queryRetry, soundsApi, statsApi } from '@/lib/api';

/**
 * The abort seam lives here: a read method's `signal` has to reach Axios's
 * request config, and must never reach the query string. Mutations have no
 * parameter to pass a signal through at all — that is what stops an unmounting
 * component from cancelling a deploy or a transcode sweep — so the runtime
 * checks below are paired with the compile-time guarantee.
 */

type Config = { params?: Record<string, unknown>; signal?: AbortSignal };

function configOf(spy: { mock: { calls: unknown[][] } }, callIndex = 0): Config {
  const call = spy.mock.calls[callIndex]!;
  // get(url, config) | post(url, body, config)
  return (call.length >= 3 ? call[2] : call[1]) as Config;
}

let get: ReturnType<typeof vi.spyOn>;
let post: ReturnType<typeof vi.spyOn>;
let del: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  get = vi.spyOn(api, 'get').mockResolvedValue({ data: {} } as never);
  post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} } as never);
  del = vi.spyOn(api, 'delete').mockResolvedValue({ data: {} } as never);
});

describe('read methods thread the AbortSignal into Axios', () => {
  it('passes the signal on a stats read that takes no filters', () => {
    const signal = new AbortController().signal;

    void statsApi.summary({ signal });

    expect(configOf(get).signal).toBe(signal);
  });

  it('passes the signal on every stats section read', () => {
    const controller = new AbortController();
    const reads = [
      () => statsApi.commands({ signal: controller.signal }),
      () => statsApi.sounds({ signal: controller.signal }),
      () => statsApi.queue({ signal: controller.signal }),
      () => statsApi.errors({ signal: controller.signal }),
      () => statsApi.retention({ signal: controller.signal }),
      () => statsApi.apiLatency({ signal: controller.signal }),
      () => statsApi.webAnalytics({ signal: controller.signal }),
      () => statsApi.userTracks({ signal: controller.signal }),
    ];

    reads.forEach((read) => void read());

    expect(get.mock.calls).toHaveLength(reads.length);
    get.mock.calls.forEach((_call: unknown, i: number) => {
      expect(configOf(get, i).signal).toBe(controller.signal);
    });
  });

  it('keeps the signal out of the query string when filters are present', () => {
    const signal = new AbortController().signal;

    void statsApi.time({ granularity: 'day', signal });

    const config = configOf(get);
    expect(config.params).toEqual({ granularity: 'day' });
    expect(config.params).not.toHaveProperty('signal');
    expect(config.signal).toBe(signal);
  });

  it('threads the signal through reads that take positional arguments', () => {
    const signal = new AbortController().signal;

    void botApi.getQueue('guild-1', { signal });
    void soundsApi.search('airhorn', { signal });

    expect(configOf(get, 0).signal).toBe(signal);
    expect(configOf(get, 1).signal).toBe(signal);
    // the search term still goes to the server
    expect(configOf(get, 1).params).toMatchObject({ q: 'airhorn' });
  });

  it('works with no options at all, leaving the request uncancelled', () => {
    void statsApi.summary();
    void botApi.getStatus();

    expect(configOf(get, 0).signal).toBeUndefined();
    expect(configOf(get, 1).signal).toBeUndefined();
  });
});

describe('mutations are not abortable', () => {
  it('sends no signal on a POST that has already reached the server', () => {
    void adminApi.deployCommands();
    void soundsApi.sweepTranscode({ limit: 5 });

    expect(configOf(post, 0)?.signal).toBeUndefined();
    expect(configOf(post, 1)?.signal).toBeUndefined();
  });

  it('sends no signal on a DELETE', () => {
    void adminApi.deletePersona('persona-1');

    expect(configOf(del, 0)?.signal).toBeUndefined();
  });

  // The real guarantee is a type-level one: `deployCommands`,
  // `sweepTranscode` and `deletePersona` accept no options object, so there is
  // no expression that hands them an AbortSignal. Were one added, this file
  // would stop compiling rather than start cancelling deploys.
});

describe('isAbortError', () => {
  it('recognises an Axios cancellation', () => {
    expect(isAbortError(new axios.CanceledError('canceled'))).toBe(true);
  });

  it('recognises a DOMException AbortError', () => {
    expect(isAbortError(new DOMException('aborted', 'AbortError'))).toBe(true);
  });

  it('recognises the ERR_CANCELED code on a plain object', () => {
    expect(isAbortError({ code: 'ERR_CANCELED' })).toBe(true);
  });

  it('does not treat a real failure as a cancellation', () => {
    expect(isAbortError(new Error('Network Error'))).toBe(false);
    expect(isAbortError({ response: { status: 500 } })).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
  });
});

describe('queryRetry', () => {
  it('never retries an aborted request', () => {
    expect(queryRetry(0, new axios.CanceledError('canceled'))).toBe(false);
  });

  it('retries a genuine failure once, then gives up', () => {
    const failure = new Error('Request failed with status code 500');
    expect(queryRetry(0, failure)).toBe(true);
    expect(queryRetry(1, failure)).toBe(false);
  });
});
