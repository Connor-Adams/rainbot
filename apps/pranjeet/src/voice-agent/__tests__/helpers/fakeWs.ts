import { EventEmitter } from 'events';

/** The subset of the fake socket a test drives. */
export interface Sock {
  readyState: number;
  sent: Array<Record<string, unknown>>;
  emit(name: string, ...args: unknown[]): boolean;
  serverSays(event: Record<string, unknown>): void;
  sentOfType(type: string): Array<Record<string, unknown>>;
}

export class MockWebSocket extends EventEmitter {
  static OPEN = 1;
  readyState = 1;
  sent: Array<Record<string, unknown>> = [];

  constructor() {
    super();
    (global as unknown as { __sockets: unknown[] }).__sockets.push(this);
  }

  send(raw: string) {
    this.sent.push(JSON.parse(raw) as Record<string, unknown>);
  }
  ping() {}
  close() {
    this.readyState = 3;
  }
  /** Drive the client as the xAI server would. */
  serverSays(event: Record<string, unknown>) {
    this.emit('message', Buffer.from(JSON.stringify(event)));
  }
  sentOfType(type: string) {
    return this.sent.filter((e) => e['type'] === type);
  }
}

/** `ws` is imported as a default export, so the mock module must mirror that. */
export function wsModuleMock() {
  return { __esModule: true, default: MockWebSocket };
}

export const sockets = () => (global as unknown as { __sockets: Sock[] }).__sockets;
export const resetSockets = () => {
  (global as unknown as { __sockets: unknown[] }).__sockets = [];
};
/** Flush the microtask queue so the async IIFE in the 'open' handler completes. */
export const flush = () => new Promise((r) => setImmediate(r));
