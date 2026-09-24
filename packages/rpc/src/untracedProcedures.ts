/**
 * Procedures that fire on a tight poll (health checks, and any future
 * equivalent status probe) rather than in response to real user/bot activity.
 * raincloud polls `health` every 15s per worker — every root trace in Tempo
 * would otherwise be a health check, burying real RPC traces. Duration is
 * still recorded (recordRpcDuration in client.ts) since the histogram already
 * carries `rpcProcedure` as an attribute and can be filtered by it.
 *
 * Shared between client.ts (span suppression on the caller side) and trpc.ts
 * (span suppression on the handler side) so the two never drift apart.
 */
export const UNTRACED_PROCEDURES = new Set(['health']);
