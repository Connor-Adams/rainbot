import type {
  JoinRequest,
  JoinResponse,
  LeaveRequest,
  LeaveResponse,
  VolumeRequest,
  VolumeResponse,
  StatusResponse,
  SpeakRequest,
  SpeakResponse,
} from '@rainbot/worker-protocol';
import { z } from 'zod';

import { internalProcedure, t } from '../trpc';

const getStateInputSchema = z.object({ guildId: z.string().optional() }).optional();
const joinInputSchema = z.object({
  requestId: z.string(),
  guildId: z.string(),
  channelId: z.string(),
});
const leaveInputSchema = z.object({ requestId: z.string(), guildId: z.string() });
const volumeInputSchema = z.object({
  requestId: z.string(),
  guildId: z.string(),
  volume: z.number().min(0).max(1),
});
const speakInputSchema = z.object({
  requestId: z.string(),
  guildId: z.string(),
  text: z.string(),
  voice: z.string().optional(),
  speed: z.number().optional(),
  userId: z.string().optional(),
});
const grokChatInputSchema = z.object({
  guildId: z.string(),
  userId: z.string(),
  text: z.string(),
});

export type GetStateInput = z.infer<typeof getStateInputSchema>;
export type PranjeetGetStateFn = (input?: GetStateInput) => StatusResponse;

export interface GrokChatResult {
  reply: string;
}

export interface PranjeetHandlers {
  getState: PranjeetGetStateFn;
  join?: (input: JoinRequest) => Promise<JoinResponse>;
  leave?: (input: LeaveRequest) => Promise<LeaveResponse>;
  volume?: (input: VolumeRequest) => Promise<VolumeResponse>;
  speak?: (input: SpeakRequest) => Promise<SpeakResponse>;
  grokChat?: (input: { guildId: string; userId: string; text: string }) => Promise<GrokChatResult>;
}

const notImplemented = (): Promise<{ status: 'error'; message: string }> =>
  Promise.resolve({ status: 'error', message: 'RPC command not implemented' });

export function createPranjeetRouter(handlers: PranjeetHandlers) {
  return t.router({
    health: internalProcedure.query(() => ({ ok: true, service: 'pranjeet' })),
    getState: internalProcedure
      .input(getStateInputSchema)
      .query(({ input }): StatusResponse => handlers.getState(input ?? undefined)),

    join: internalProcedure
      .input(joinInputSchema)
      .mutation(({ input }) => handlers.join?.(input) ?? notImplemented()),
    leave: internalProcedure
      .input(leaveInputSchema)
      .mutation(({ input }) => handlers.leave?.(input) ?? notImplemented()),
    volume: internalProcedure
      .input(volumeInputSchema)
      .mutation(({ input }) => handlers.volume?.(input) ?? notImplemented()),
    speak: internalProcedure
      .input(speakInputSchema)
      .mutation(({ input }) => handlers.speak?.(input) ?? notImplemented()),
    grokChat: internalProcedure
      .input(grokChatInputSchema)
      .mutation(
        ({ input }) =>
          handlers.grokChat?.(input) ?? Promise.resolve({ reply: 'Grok chat is not available.' })
      ),
  });
}

export type PranjeetRouter = ReturnType<typeof createPranjeetRouter>;
