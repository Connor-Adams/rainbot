# Canonical Types (Media Model)

Purpose: centralize shared playback/media state types so all apps and workers use the same model.

## Changes made (2026-01-29)

- Added canonical media model in `packages/protocol/src/types/media.ts`.
- Exported canonical media types from `packages/protocol/src/types/index.ts`.
- Added `@types/media` re-export in `types/media.ts`.
- Repointed Raincloud `@types` paths to the root `types/` collection.
- Unified `SourceType` to canonical `@types/media` in db + utils.
- Added canonical `BotType` in `packages/protocol/src/types/core.ts` and repointed worker + raincloud usage.
- Wired canonical `SourceType` into protocol `voice` + `services` types.
- Added canonical `Logger` interface in `core` and repointed shared + utils loggers.
- Mapped protocol voice types to the canonical media model (`MediaItem`, `QueueState`, `MediaState`).
- Updated Raincloud `MultiBotService` queue/status types to use canonical media types.
- Repointed type-only imports from `@rainbot/protocol` to `@types`.
- Worker status is now via tRPC `getState` (rainbot/pranjeet/hungerbot); only `/health/*` remains HTTP. Workers return canonical `MediaState` from `getState`.
- Updated rainbot `/queue` endpoint to return canonical `QueueState`.
- Updated `WorkerCoordinator` and `MultiBotService` to consume the canonical media model from workers.

## Canonical model (initial)

- `SourceType`, `MediaKind`, `MediaItem`
- `PlaybackStatus`, `PlaybackState`
- `QueueState`
- `MediaWorkerState`
- `MediaState`

## Changes made (2026-01-30)

- Promoted canonical types into `packages/types` as the single `@rainbot/types` workspace package.
- Re-exported canonical modules from `packages/types/src/*` to keep `@rainbot/types/<module>` as the only import surface.
- Removed the root `types/` folder and path mappings so all consumers resolve `@rainbot/types` via workspace dependency.
- Updated imports across apps + packages to use `@rainbot/types/*` submodules.
- Added explicit `@rainbot/types` dependencies to apps and packages that consume canonical types.
- Added Raincloud server `.d.ts` augmentations under `apps/raincloud/server/types`.
- Cleaned up generated `.js/.d.ts/.map` artifacts from source trees and ran Prettier.

## Next steps

- Decide if existing `Track`, `VoiceStatus`, `QueueInfo`, `PlayResult`, and `PlaybackState` should be replaced or mapped to the canonical types.
- Consolidate `PlayResult` and status/queue models in `apps/raincloud/lib/multiBotService.ts` to use the canonical model.
- Confirm all remaining type-only imports from `@rainbot/protocol` can move to `@rainbot/types` submodules.
- Remove or repoint `apps/raincloud/types/**` (now superseded by `@rainbot/types`).
- Make `MediaItem.kind` required once all call sites annotate it.
- Replace remaining value imports from `@rainbot/protocol` where possible (types already moved).
