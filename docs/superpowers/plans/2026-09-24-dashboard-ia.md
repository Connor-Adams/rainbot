# Dashboard Information Architecture Rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Make the rainbot dashboard navigable, contextual and safe to hand to friends, without redesigning any screen. The Player stays the landing screen.

**Architecture:** Replace the duplicated `activeTab` state + `window` CustomEvent with real react-router routes. Make the sidebar route-aware instead of showing all four panels everywhere. Promote server selection into the header, since it gates every guild-scoped control. Split the 1020-line `AdminTab` into six single-concern sections behind a sub-nav. Put confirmations on the five irreversible admin controls.

**Tech Stack:** React 18, react-router-dom v6, Zustand, TanStack Query, `@connor-adams/designsystem` v1.0.0, Tailwind.

## Global Constraints

- The Player is the landing screen. `/` must land on the Player.
- No screen is redesigned. Existing tab internals keep their current look, data flow, handlers and react-query usage except where a task explicitly says otherwise.
- All new UI uses `@connor-adams/designsystem` components. Available: `Accordion Alert Badge Button Card Checkbox Combobox Dialog DropdownMenu EmptyState Icon GLYPHS Input Label NativeSelect Separator Skeleton Slider Spinner Switch Table Tabs Text Textarea Toast ToggleGroup Tooltip`. Import from `@connor-adams/designsystem`.
- Do not add an authorization or role-gating layer. The backend has exactly one session gate (`requireAuth`); adding a client-side admin tier would be security theatre. Out of scope.
- No new npm dependencies.
- `yarn workspace @rainbot/ui build` and `yarn workspace @rainbot/ui lint` must pass at the end of every task.
- File deletion is blocked in this environment. If a file becomes dead, leave it and name it in the report.

---

### Task 1: Route the tabs

**Problem:** `activeTab` is declared twice — `ui/src/components/Header.tsx:16` and `ui/src/pages/DashboardPage.tsx:10` — and kept in sync only by `window.dispatchEvent(new CustomEvent('tab-change'))` at `Header.tsx:30`. Two sources of truth, no deep links, no back button.

**Files:**

- Modify: `ui/src/App.tsx`
- Modify: `ui/src/components/Layout.tsx`
- Modify: `ui/src/components/Header.tsx`
- Modify: `ui/src/components/header/NavTabs.tsx`
- Modify: `ui/src/pages/DashboardPage.tsx` (becomes dead — see below)

**Interfaces produced (later tasks depend on these):**

- Route paths, exactly: `/player`, `/soundboard`, `/recordings`, `/stats`, `/status`, `/admin`
- `Layout` renders `<Outlet />` and no longer accepts a `children` prop.
- `NavTabs` takes no props.

**Steps:**

- [ ] **Step 1: Convert `App.tsx` to a nested layout route.** `Layout` becomes a layout route wrapping the six tab routes. Preserve the existing auth redirect behaviour: unauthenticated users go to `/login`. Structure:

```tsx
<Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route element={isAuthenticated ? <Layout /> : <Navigate to="/login" replace />}>
    <Route index element={<Navigate to="/player" replace />} />
    <Route path="player" element={<PlayerTab />} />
    <Route path="soundboard" element={<SoundboardTab />} />
    <Route path="recordings" element={<RecordingsTab />} />
    <Route path="stats" element={<StatisticsTab />} />
    <Route path="status" element={<StatusTab />} />
    <Route path="admin" element={<AdminTab />} />
    <Route path="*" element={<Navigate to="/player" replace />} />
  </Route>
</Routes>
```

Keep the existing `checkAuth` effect and `isLoading` early-return in `App.tsx` unchanged.

- [ ] **Step 2: `Layout` renders `<Outlet />`.** Drop `LayoutProps`/`children`; `import { Outlet } from 'react-router-dom'` and replace `{children}` at `Layout.tsx:20` with `<Outlet />`. Everything else in Layout stays.

- [ ] **Step 3: `Header` loses its tab state.** Delete the `useState` at `Header.tsx:16-18`, the `handleTabChange` function at `:26-31`, and the `useState` import if now unused. Render `<NavTabs />` with no props. The `bot-status` query stays.

- [ ] **Step 4: `NavTabs` derives from the URL.** No props. Use `useLocation()` and `useNavigate()`. Derive the active value from the first path segment, defaulting to `'player'`. `onValueChange` calls `navigate('/' + value)`. Keep `TAB_ITEMS` and the DS `Tabs` usage exactly as they are.

- [ ] **Step 5: Strip `DashboardPage`.** It is now unreachable. Replace its whole body with a re-export or leave a one-line component that renders `<Navigate to="/player" replace />`; do not leave the CustomEvent listener in the tree. Note it in the report as a deletion candidate.

- [ ] **Step 6: Verify.** `yarn workspace @rainbot/ui build && yarn workspace @rainbot/ui lint`. Then grep: `grep -rn "tab-change" ui/src` must return nothing.

- [ ] **Step 7: Commit.** `feat(ui): route dashboard tabs instead of a window CustomEvent`

---

### Task 2: Route-aware sidebar, server selector in the header

**Problem:** `ui/src/components/Sidebar.tsx` renders `ServerSelector`, `ConnectionsList`, `ServersList`, `QueueList` on every tab. The queue is noise on Statistics; the connections list is noise on Admin. And server selection — which gates every guild-scoped control in the app — is presented as one card among four.

**Files:**

- Modify: `ui/src/components/Sidebar.tsx`
- Modify: `ui/src/components/Header.tsx`
- Modify: `ui/src/components/Layout.tsx`
- Create: `ui/src/components/header/GuildPicker.tsx`
- Modify: `ui/src/components/ServerSelector.tsx` (may become dead — see below)

**Interfaces consumed:** Task 1's route paths; `Layout` rendering `<Outlet />`.

**Steps:**

- [ ] **Step 1: Build `GuildPicker`.** A compact header control replacing the sidebar's `ServerSelector` card. Same data source as `ServerSelector.tsx:11-17` (the `['bot-status']` query, `status?.guilds`) and the same `useGuildStore()` read/write. Use the DS `Combobox` — unlike `DropdownMenu` it carries a selected value. Placeholder `"Select a server..."`. When `guilds` is empty show it disabled with `"Loading servers..."`. No `DisplayCard` wrapper; this is a header control, so the label alone.

- [ ] **Step 2: Mount `GuildPicker` in the header.** Put it in the right-hand cluster at `Header.tsx:45-53`, before `UserInfo`. On narrow viewports it may wrap; that is acceptable, the cluster already wraps.

- [ ] **Step 3: Make the sidebar route-aware.** `Sidebar` reads `useLocation()` and renders per first path segment:

| Route                             | Sidebar contents                 |
| --------------------------------- | -------------------------------- |
| `/player`                         | `ConnectionsList`, `QueueList`   |
| `/soundboard`                     | `ConnectionsList`                |
| `/status`                         | `ConnectionsList`, `ServersList` |
| `/recordings`, `/stats`, `/admin` | nothing                          |

`ServerSelector` is no longer rendered in the sidebar on any route — it lives in the header now.

- [ ] **Step 4: Collapse the sidebar when empty.** `Sidebar` returns `null` when its route has no panels. In `Layout.tsx`, that must let the content take the full width — since `Sidebar` returns `null` and `.content` is already `flex-1`, confirm by building and checking the flex container has no leftover gap or fixed-width placeholder. Do not add a width class to `.content`.

- [ ] **Step 5: Verify.** Build and lint. Note `ServerSelector.tsx` (and `Displaycard`/`CustomDropdown` if they lose their last consumer — check with grep) as deletion candidates in the report.

- [ ] **Step 6: Commit.** `feat(ui): move server selection into the header and scope the sidebar to the route`

---

### Task 3: Explain the no-server-selected state

**Problem:** With no guild selected, `PlayerTab` and `SoundboardTab` render a full screen of silently disabled controls — the pattern at `PlayerTab.tsx:200` (`disabled={... || !selectedGuildId}`) repeated throughout. Nothing tells you why.

**Files:**

- Modify: `ui/src/components/tabs/PlayerTab.tsx`
- Modify: `ui/src/components/tabs/SoundboardTab.tsx`

**Interfaces consumed:** Task 2's header `GuildPicker`.

**Steps:**

- [ ] **Step 1: Early-return an `EmptyState` in `PlayerTab`.** When `!selectedGuildId`, return the DS `EmptyState` instead of the tab body. Title `"No server selected"`, description `"Pick a server from the menu in the header to control playback."` Place the early return after all hooks — React hook rules — so no hook call becomes conditional. Verify that by reading the component's hook list first.

- [ ] **Step 2: Same in `SoundboardTab`.** Description: `"Pick a server from the menu in the header to play sounds."` The sound _library_ is global, so if the tab has any management affordance that works without a guild, keep the tab body and disable only the play controls; read the component and decide, then state which you did in the report.

- [ ] **Step 3: Verify.** Build and lint.

- [ ] **Step 4: Commit.** `feat(ui): explain the no-server-selected state instead of disabling silently`

---

### Task 4: Split AdminTab into single-concern sections

**Problem:** `ui/src/components/tabs/AdminTab.tsx` is 1020 lines, 18 `useState` declarations, and nine unrelated concerns — global and guild-scoped fused into one screen.

**Files:**

- Create: `ui/src/components/tabs/admin/BotOperations.tsx` — AdminTab.tsx:365-387 (redeploy slash commands)
- Create: `ui/src/components/tabs/admin/YoutubeIngestSettings.tsx` — AdminTab.tsx:389-514 (proxy + cookies)
- Create: `ui/src/components/tabs/admin/CommandRunner.tsx` — AdminTab.tsx:516-640 (run commands; guild-scoped)
- Create: `ui/src/components/tabs/admin/GrokVoiceSettings.tsx` — AdminTab.tsx:642-778 (conversation mode, voice, persona selection; guild-scoped)
- Create: `ui/src/components/tabs/admin/PersonaManager.tsx` — AdminTab.tsx:780-953 (persona CRUD)
- Create: `ui/src/components/tabs/admin/SoundLibraryMaintenance.tsx` — AdminTab.tsx:955-1016 (transcode sweep, search analysis, strip video)
- Modify: `ui/src/components/tabs/AdminTab.tsx` — becomes the shell

**Steps:**

- [ ] **Step 1: Move each section verbatim.** Each new file is a default-exported component owning only the state its section reads. Distribute the 18 `useState` declarations to the section that uses them — `proxyInput` to `YoutubeIngestSettings`; `runGuildId`/`runCommand`/`playSource`/`speakText`/`grokText`/`grokSpeakReply`/`soundboardSound`/`runResult`/`runError` to `CommandRunner`; `personaFormOpen`/`editingPersonaId`/`personaName`/`personaSystemPrompt` to `PersonaManager`; `lastResult`/`stripVideoResult`/`analyzeResult` to `SoundLibraryMaintenance`; `deployMessage` to `BotOperations`. Move any shared helper or type used by exactly one section into that section's file; anything used by two or more goes in `ui/src/components/tabs/admin/shared.ts`.

  Do not change markup, class names, API calls, query keys or handler logic. This is a move, not a rewrite. The one exception is Task 5's confirmations, which land next.

- [ ] **Step 2: `AdminTab` becomes a shell.** A DS `Tabs` sub-nav over the six sections, driven by local `useState` (not routing — these are sub-sections, and the URL already carries `/admin`). Section order and labels, exactly:

```
Playback   → CommandRunner
Grok       → GrokVoiceSettings
Personas   → PersonaManager
YouTube    → YoutubeIngestSettings
Sounds     → SoundLibraryMaintenance
Bot        → BotOperations
```

Default section: `Playback`.

- [ ] **Step 3: Verify.** Build and lint. `wc -l ui/src/components/tabs/AdminTab.tsx` should be under 60. Confirm no section lost a control: the report must list, per section, the controls it now renders, checked against the inventory above.

- [ ] **Step 4: Commit.** `refactor(ui): split AdminTab into six single-concern sections`

---

### Task 5: Confirm the irreversible admin actions

**Problem:** Five controls take irreversible action with a single click, and every authenticated user reaches them — there is no admin tier in the backend.

**Files:**

- Create: `ui/src/components/ConfirmDialog.tsx`
- Modify: `ui/src/components/tabs/admin/YoutubeIngestSettings.tsx`
- Modify: `ui/src/components/tabs/admin/PersonaManager.tsx`
- Modify: `ui/src/components/tabs/admin/SoundLibraryMaintenance.tsx`

**Interfaces consumed:** Task 4's section components.

**Steps:**

- [ ] **Step 1: Build `ConfirmDialog`.** A thin wrapper over the DS `Dialog`. Props: `open`, `title`, `description`, `confirmLabel` (default `'Confirm'`), `onConfirm`, `onCancel`, and `pending` (disables both buttons and shows a DS `Spinner` in the confirm button). The confirm button uses the DS `Button` danger/destructive variant — read `ButtonVariant` in `@connor-adams/designsystem` and use the destructive one if it exists, otherwise the most prominent variant. Cancel is the default action: Escape and scrim click both cancel.

- [ ] **Step 2: Wire the five controls.** Each of these opens `ConfirmDialog` instead of firing directly:

| Control                 | Title                          | Description                                                                                |
| ----------------------- | ------------------------------ | ------------------------------------------------------------------------------------------ |
| Remove proxy            | `Remove the YouTube proxy?`    | `Playback will fall back to direct connections, which may be rate-limited.`                |
| Remove cookies          | `Remove the YouTube cookies?`  | `Age-restricted and members-only videos will stop playing until new cookies are uploaded.` |
| Delete (persona)        | `Delete this persona?`         | `This cannot be undone.` — include the persona's name in the description.                  |
| Run Transcode Sweep     | `Run the transcode sweep?`     | `This rewrites sound files and deletes the originals. This cannot be undone.`              |
| Strip video from sounds | `Strip video from all sounds?` | `This rewrites every sound in the library. Originals are archived, not kept in place.`     |

`pending` is bound to the corresponding mutation's `isPending`. `Search Analysis` is read-only — leave it alone.

- [ ] **Step 3: Verify.** Build and lint. Report which mutation's pending flag each dialog is bound to.

- [ ] **Step 4: Commit.** `feat(ui): confirm the irreversible admin actions`

---

### Task 6: One server selection, app-wide

**Problem:** Task 2 put a `GuildPicker` in the header. Task 4 revealed that Admin carries its own, separate server dropdown (`useAdminRunGuildId()` in `ui/src/components/tabs/admin/shared.ts`, surfaced as a `CustomDropdown` in `CommandRunner.tsx`), which governs `CommandRunner` and all of `GrokVoiceSettings`. So on `/admin` you pick a server twice, and the two picks can disagree. That is the same ill-conceived-navigation complaint this whole plan exists to fix.

Task 4 also left three copy strings that referred to sibling sections by page position ("above" / "below"), which stopped being true once the sections became sub-tabs.

**Files:**

- Modify: `ui/src/components/tabs/admin/shared.ts`
- Modify: `ui/src/components/tabs/admin/CommandRunner.tsx`
- Modify: `ui/src/components/tabs/admin/GrokVoiceSettings.tsx`

**Steps:**

- [ ] **Step 1: Delete the second source of truth.** Replace every use of `useAdminRunGuildId()` with `useGuildStore()`'s `selectedGuildId`. The header `GuildPicker` becomes the only server control in the application. Remove `useAdminRunGuildId` and its module-level store from `shared.ts`; if `shared.ts` is then empty, leave the file and say so.

- [ ] **Step 2: Remove Admin's own server dropdown.** The `CustomDropdown` in `CommandRunner.tsx` and its label go away — deliberately, not by accident. Nothing replaces it in the section body.

- [ ] **Step 3: Handle no-server-selected in the two guild-scoped sections.** `CommandRunner` and `GrokVoiceSettings` both become useless without a guild. Each returns the DS `EmptyState` when `!selectedGuildId`, after all hooks, exactly as Task 3 did in `PlayerTab`. Title `"No server selected"`, description `"Pick a server from the menu in the header."`

- [ ] **Step 4: Fix the three stale copy strings.** Find every string in `ui/src/components/tabs/admin/` that locates another section by page position — the known three are "Run commands above", "Manage personas below", and the Grok persona dropdown's reference to "above". Rewrite each to name the sub-tab it means (the sub-tab labels are `Playback`, `Grok`, `Personas`, `YouTube`, `Sounds`, `Bot`). Grep for `above` and `below` across that directory to catch any the plan missed.

- [ ] **Step 5: Verify.** Build and lint. Grep for `useAdminRunGuildId` — must return nothing. Check whether `CustomDropdown` and `Displaycard` still have consumers and report the answer.

- [ ] **Step 6: Commit.** `feat(ui): make the header server picker govern admin too`

---

## Out of scope, deliberately

- **Authorization.** `requireAuth` (`apps/raincloud/server/middleware/auth.ts:16-79`) is the only session gate; with `REQUIRED_ROLE_ID` unset it grants every authenticated Discord user access to every destructive endpoint. `ServerSelector` also lists every guild the bot is in, not the user's guilds (`apps/raincloud/server/routes/api.ts:236-253`). Both are real, both need backend work, neither belongs in a layout change.
- **`NavTabs` wrapping to two rows on narrow viewports** — a known regression from the DS `Tabs` `flex-wrap`, carried over from the design-system adoption.
