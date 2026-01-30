import type {
  JoinRequest,
  JoinResponse,
  LeaveRequest,
  LeaveResponse,
  VolumeRequest,
  VolumeResponse,
  StatusResponse,
  PlaySoundRequest,
  PlaySoundResponse,
  CleanupUserRequest,
  CleanupUserResponse,
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
const playSoundInputSchema = z.object({
  requestId: z.string(),
  guildId: z.string(),
  userId: z.string(),
  sfxId: z.string(),
  volume: z.number().optional(),
});
const cleanupUserInputSchema = z.object({ guildId: z.string(), userId: z.string() });

export type GetStateInput = z.infer<typeof getStateInputSchema>;
export type HungerbotGetStateFn = (input?: GetStateInput) => StatusResponse;

export interface HungerbotHandlers {
  getState: HungerbotGetStateFn;
  join?: (input: JoinRequest) => Promise<JoinResponse>;
  leave?: (input: LeaveRequest) => Promise<LeaveResponse>;
  volume?: (input: VolumeRequest) => Promise<VolumeResponse>;
  playSound?: (input: PlaySoundRequest) => Promise<PlaySoundResponse>;
  cleanupUser?: (input: CleanupUserRequest) => Promise<CleanupUserResponse>;
}

const notImplemented = (): Promise<{ status: 'error'; message: string }> =>
  Promise.resolve({ status: 'error', message: 'RPC command not implemented' });

export function createHungerbotRouter(handlers: HungerbotHandlers) {
  return t.router({
    health: internalProcedure.query(() => ({ ok: true, service: 'hungerbot' })),
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
    playSound: internalProcedure
      .input(playSoundInputSchema)
      .mutation(({ input }) => handlers.playSound?.(input) ?? notImplemented()),
    cleanupUser: internalProcedure
      .input(cleanupUserInputSchema)
      .mutation(({ input }) => handlers.cleanupUser?.(input) ?? notImplemented()),
  });
}

export type HungerbotRouter = ReturnType<typeof createHungerbotRouter>;
