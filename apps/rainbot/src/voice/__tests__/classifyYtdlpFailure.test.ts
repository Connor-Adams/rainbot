import { classifyYtdlpFailure } from '../audioResource';

// F12: `rainbot.outcome` must carry a real classification (exit code, or a
// recognised stderr category) instead of a bare `error.name`, which on a
// youtube-dl-exec rejection is almost always the unhelpful literal "Error".
describe('classifyYtdlpFailure', () => {
  it('recognises a bot-check message from stderr over a bare error name', () => {
    const err = Object.assign(new Error('unexpected'), {
      stderr: "ERROR: [youtube] aaaaaaaaaaa: Sign in to confirm you're not a bot",
    });
    expect(classifyYtdlpFailure(err)).toBe('bot_check');
  });

  it('recognises a video-unavailable message', () => {
    const err = Object.assign(new Error('boom'), {
      stderr: 'ERROR: [youtube] aaaaaaaaaaa: Video unavailable',
    });
    expect(classifyYtdlpFailure(err)).toBe('video_unavailable');
  });

  it('recognises a network error from the message when stderr is absent', () => {
    const err = new Error('request failed: ETIMEDOUT');
    expect(classifyYtdlpFailure(err)).toBe('network_error');
  });

  it('falls back to the exit code when no recognised stderr pattern matches', () => {
    const err = Object.assign(new Error('yt-dlp exited with code 1'), { exitCode: 1 });
    expect(classifyYtdlpFailure(err)).toBe('exit_1');
  });

  // F-final: a signal-killed child (tinyspawn/Node set exitCode: null,
  // signalCode: '<SIG>') means something closed the pipe deliberately — most
  // commonly @discordjs/voice destroying the play stream on /skip or /stop —
  // not a yt-dlp failure. Before this, a null exitCode fell through every
  // branch to the bare 'ChildProcessError' name, exactly the uninformative
  // literal classification exists to eliminate, and every skip/stop was
  // counted as a resolve failure.
  it('classifies a signal-killed child as stream_closed, not the bare ChildProcessError name', () => {
    const err = Object.assign(new Error('killed'), {
      name: 'ChildProcessError',
      exitCode: null,
      signalCode: 'SIGTERM',
    });
    expect(classifyYtdlpFailure(err)).toBe('stream_closed');
  });

  it('recognises stream_closed regardless of which signal killed the child', () => {
    const err = Object.assign(new Error('killed'), {
      name: 'ChildProcessError',
      exitCode: null,
      signalCode: 'SIGPIPE',
    });
    expect(classifyYtdlpFailure(err)).toBe('stream_closed');
  });

  it('prefers a recognised stderr pattern over a signal kill', () => {
    const err = Object.assign(new Error('killed'), {
      exitCode: null,
      signalCode: 'SIGTERM',
      stderr: "Sign in to confirm you're not a bot",
    });
    expect(classifyYtdlpFailure(err)).toBe('bot_check');
  });

  it('prefers stream_closed over an exit code when both are present', () => {
    // Not a real-world combination (a signalled child has a null exitCode in
    // practice), but pins the intended priority order directly rather than
    // relying on that invariant holding.
    const err = Object.assign(new Error('killed'), {
      exitCode: 1,
      signalCode: 'SIGTERM',
    });
    expect(classifyYtdlpFailure(err)).toBe('stream_closed');
  });

  it('does not treat a falsy signalCode as a signal kill', () => {
    const err = Object.assign(new Error('yt-dlp exited with code 2'), {
      exitCode: 2,
      signalCode: null,
    });
    expect(classifyYtdlpFailure(err)).toBe('exit_2');
  });

  it('prefers a recognised stderr pattern over an available exit code', () => {
    const err = Object.assign(new Error('exited'), {
      exitCode: 1,
      stderr: "Sign in to confirm you're not a bot",
    });
    expect(classifyYtdlpFailure(err)).toBe('bot_check');
  });

  it('reports a spawn error when the binary itself could not be spawned', () => {
    const err = Object.assign(new Error('spawn yt-dlp ENOENT'), { code: 'ENOENT' });
    expect(classifyYtdlpFailure(err)).toBe('spawn_error');
  });

  it('falls back to error.name for a genuinely unclassified error with a specific name', () => {
    class CustomError extends Error {}
    const err = new CustomError('mystery failure');
    err.name = 'CustomError';
    expect(classifyYtdlpFailure(err)).toBe('CustomError');
  });

  it('falls back to the boring literal "Error" only when nothing else is available', () => {
    expect(classifyYtdlpFailure(new Error('mystery'))).toBe('Error');
  });

  it('falls back to "unknown" for a non-Error thrown value', () => {
    expect(classifyYtdlpFailure('just a string')).toBe('unknown');
  });
});
