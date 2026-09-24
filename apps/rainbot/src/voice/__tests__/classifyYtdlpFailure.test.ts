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
