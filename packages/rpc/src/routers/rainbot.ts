import type {
  JoinRequest,
  JoinResponse,
  LeaveRequest,
  LeaveResponse,
  VolumeRequest,
  VolumeResponse,
  StatusResponse,
  EnqueueTrackRequest,
  EnqueueTrackResponse,
  SkipResponse,
  PauseResponse,
  StopResponse,
  ClearResponse,
  QueueResponse,
  AutoplayResponse,
  ReplayResponse,
} from '@rainbot/worker-protocol';
import { z } from 'zod';

import { internalProcedure, t } from '../trpc';

// Input schemas (aligned with worker-protocol)
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
const enqueueInputSchema = z.object({
  requestId: z.string(),
  guildId: z.string(),
  url: z.string(),
  requestedBy: z.string(),
  requestedByUsername: z.string().optional(),
});
const skipInputSchema = z.object({
  requestId: z.string(),
  guildId: z.string(),
  count: z.number().int().min(1).optional(),
});
const pauseInputSchema = z.object({ requestId: z.string(), guildId: z.string() });
const stopInputSchema = z.object({ requestId: z.string(), guildId: z.string() });
const clearInputSchema = z.object({ requestId: z.string(), guildId: z.string() });
const getQueueInputSchema = z.object({ guildId: z.string() });
const autoplayInputSchema = z.object({
  requestId: z.string(),
  guildId: z.string(),
  enabled: z.boolean().nullable().optional(),
});
const replayInputSchema = z.object({ requestId: z.string(), guildId: z.string() });

export type GetStateInput = z.infer<typeof getStateInputSchema>;
export type RainbotGetStateFn = (input?: GetStateInput) => StatusResponse;

export interface RainbotHandlers {
  getState: RainbotGetStateFn;
  join: (input: JoinRequest) => Promise<JoinResponse>;
  leave: (input: LeaveRequest) => Promise<LeaveResponse>;
  volume: (input: VolumeRequest) => Promise<VolumeResponse>;
  enqueue: (input: EnqueueTrackRequest) => Promise<EnqueueTrackResponse>;
  skip: (input: z.infer<typeof skipInputSchema>) => Promise<SkipResponse>;
  pause: (input: z.infer<typeof pauseInputSchema>) => Promise<PauseResponse>;
  stop: (input: z.infer<typeof stopInputSchema>) => Promise<StopResponse>;
  clear: (input: z.infer<typeof clearInputSchema>) => Promise<ClearResponse>;
  getQueue: (input: { guildId: string }) => Promise<QueueResponse>;
  autoplay: (input: z.infer<typeof autoplayInputSchema>) => Promise<AutoplayResponse>;
  replay: (input: z.infer<typeof replayInputSchema>) => Promise<ReplayResponse>;
}

export function createRainbotRouter(handlers: RainbotHandlers) {
  return t.router({
    health: internalProcedure.query(() => ({ ok: true, service: 'rainbot' })),
    getState: internalProcedure
      .input(getStateInputSchema)
      .query(({ input }): StatusResponse => handlers.getState(input ?? undefined)),

    join: internalProcedure.input(joinInputSchema).mutation(({ input }) => handlers.join(input)),
    leave: internalProcedure.input(leaveInputSchema).mutation(({ input }) => handlers.leave(input)),
    volume: internalProcedure
      .input(volumeInputSchema)
      .mutation(({ input }) => handlers.volume(input)),

    enqueue: internalProcedure
      .input(enqueueInputSchema)
      .mutation(({ input }) => handlers.enqueue(input)),
    skip: internalProcedure.input(skipInputSchema).mutation(({ input }) => handlers.skip(input)),
    pause: internalProcedure.input(pauseInputSchema).mutation(({ input }) => handlers.pause(input)),
    stop: internalProcedure.input(stopInputSchema).mutation(({ input }) => handlers.stop(input)),
    clear: internalProcedure.input(clearInputSchema).mutation(({ input }) => handlers.clear(input)),
    getQueue: internalProcedure
      .input(getQueueInputSchema)
      .query(({ input }) => handlers.getQueue(input)),
    autoplay: internalProcedure
      .input(autoplayInputSchema)
      .mutation(({ input }) => handlers.autoplay(input)),
    replay: internalProcedure
      .input(replayInputSchema)
      .mutation(({ input }) => handlers.replay(input)),
  });
}

export type RainbotRouter = ReturnType<typeof createRainbotRouter>;
