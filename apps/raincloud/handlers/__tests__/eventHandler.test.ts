/**
 * Tests for the Discord event loader.
 *
 * The loader previously scanned a dist path that tsc never emits to, so
 * TypeScript events (compiled with `export default`) were never registered.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const eventHandler = require('../eventHandler');

function writeEventFile(dir: string, name: string, body: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), body);
}

describe('eventHandler', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eventHandler-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('points at the directory tsc actually emits compiled events to', () => {
    expect(eventHandler.DIST_EVENTS_PATH).toContain(
      path.join('dist', 'apps', 'raincloud', 'src', 'events')
    );
  });

  it('registers an event exported as `export default`', () => {
    writeEventFile(
      tmp,
      'compiled.js',
      'exports.default = { name: "voiceStateUpdate", execute: () => {} };'
    );
    const client = { on: jest.fn(), once: jest.fn() };

    eventHandler(client, { eventDirs: [tmp] });

    expect(client.on).toHaveBeenCalledTimes(1);
    expect(client.on.mock.calls[0]?.[0]).toBe('voiceStateUpdate');
  });

  it('registers a plain CommonJS event and honours `once`', () => {
    writeEventFile(
      tmp,
      'ready.js',
      'module.exports = { name: "ready", once: true, execute() {} };'
    );
    const client = { on: jest.fn(), once: jest.fn() };

    eventHandler(client, { eventDirs: [tmp] });

    expect(client.once).toHaveBeenCalledTimes(1);
    expect(client.once.mock.calls[0]?.[0]).toBe('ready');
    expect(client.on).not.toHaveBeenCalled();
  });

  it('prefers the first directory when the same filename exists in both', () => {
    const dist = path.join(tmp, 'dist');
    const src = path.join(tmp, 'src');
    writeEventFile(dist, 'dupe.js', 'exports.default = { name: "fromDist", execute() {} };');
    writeEventFile(src, 'dupe.js', 'module.exports = { name: "fromSrc", execute() {} };');
    const client = { on: jest.fn(), once: jest.fn() };

    eventHandler(client, { eventDirs: [dist, src] });

    expect(client.on).toHaveBeenCalledTimes(1);
    expect(client.on.mock.calls[0]?.[0]).toBe('fromDist');
  });

  it('skips modules that are not valid event definitions', () => {
    writeEventFile(tmp, 'notAnEvent.js', 'module.exports = { helper: () => {} };');
    const client = { on: jest.fn(), once: jest.fn() };

    eventHandler(client, { eventDirs: [tmp] });

    expect(client.on).not.toHaveBeenCalled();
    expect(client.once).not.toHaveBeenCalled();
  });

  it('ignores directories that do not exist', () => {
    const client = { on: jest.fn(), once: jest.fn() };

    expect(() => eventHandler(client, { eventDirs: [path.join(tmp, 'missing')] })).not.toThrow();
  });
});
