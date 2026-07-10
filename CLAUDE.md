# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Multiplayer Rummikub (拉密) built with Socket.IO real-time sync. 106 tiles (1-13 × 4 colors × 2 sets + 2 jokers), 2-4 players. npm workspaces monorepo: `server`, `client`, `shared`.

## Commands

```bash
npm install             # installs all workspaces
npm run dev             # runs server (:3001) and client (:5173) concurrently
npm test                # runs server test suite (node --test), covers shared/validator.js + server/src/game
npm run build           # vite build for client -> client/dist
npm start               # production: server only, serves client/dist statically on :3001

node --test server/test/game.test.js       # run a single test file (from repo root)
node server/scripts/e2e.mjs                # socket.io end-to-end simulation; start the server first
node server/scripts/bot-e2e.mjs            # bot-player end-to-end (add/remove bot, auto-play); start the server first
```

Both e2e scripts accept `URL=http://localhost:<port>`; the server accepts `PORT=`, and the Vite proxy accepts `API_PORT=` — useful when :3001 is taken by another project.

There is no lint script configured. Tests use Node's built-in `node:test` runner, not Jest/Vitest.

## Architecture

**Monorepo layout:**
- `shared/validator.js` — pure functions for tile-set validation and scoring, imported by both server and client (no build step; client imports it directly via relative path through Vite).
- `shared/solver.js` — pure-function move solver (`solve({rack, table, hasMelded}, {level})`), same dual-import pattern as validator. Used by the server-side bot (`BotDriver`) and by the client's "AI 代出牌" button. Its output is guaranteed to pass `applyLayout` + `endTurn` (final self-check downgrades or returns `null` rather than emit an invalid layout); `null` means "draw instead". `level: 'easy'` only plays melds formed purely from the rack; `'hard'` runs two solvers and keeps whichever plays more tiles (tie goes to the heuristic, which disturbs the table least): (1) the heuristic passes — extend table sets plus limited rearranging (split-insert, borrow-one, joker-swap: a rack tile substitutes a table joker; the freed joker must be re-placed on the table the same turn — conservation forbids taking it to the rack — and the swap runs before greedy extension because the substitute tile is usually also an extension candidate) — and (2) `searchTableMelds`, an exact branch-and-bound that repartitions the whole table (table tiles are mandatory to cover, rack tiles optional; joker conservation falls out automatically), with runs enumerated only at length 3–5 (longer runs always decompose, keeping the candidate space small) then merged back by a post-pass; sets identical to an original table set keep its id, so unchanged sets don't churn visually. The exact search is time-budgeted (`options.timeBudgetMs`, default 200ms, anytime: on timeout it returns its best complete solution or defers to the heuristic, whose internal budget stays 50ms) so it can't block the event loop. New set ids are randomized (`ai-xxxx-n`) so they never collide with `ai-*` ids left on the table by a previous AI turn — duplicate set ids break the client's find-set-by-id drag logic ("無效的磚"); `applyLayout` also dedupes set ids server-side as a second line of defense. `layoutSteps(sets, placedTileIds)` turns a final layout into a tile-by-tile step sequence (each step is a valid `game:layout`) so AI plays are animated one tile at a time instead of appearing all at once — both `BotDriver` and the client AI button send moves through it.
- `server/src/` — Socket.IO backend, authoritative game state.
  - `game/tiles.js` — tile generation/shuffling.
  - `game/Game.js` — the `Game` class: one instance per active match. Owns turn order, timers, provisional/snapshot table state, and win/scoring logic.
  - `game/BotDriver.js` — drives bot players via the optional `onTurn(playerId)` callback that `Game.nextTurn` fires. `Game` itself knows nothing about bots; the driver calls the same public `applyLayout`/`endTurn`/`drawAndPass` API a socket player uses, with layered fallbacks so a bot can never stall a turn.
  - `rooms/RoomManager.js` — lobby/room/chat lifecycle, independent of `Game`.
  - `socket/handlers.js` — all Socket.IO event bindings; wires `RoomManager` and `Game` together and is the only place that talks to `io`.
  - `index.js` — Express + Socket.IO bootstrap; in production also serves `client/dist` statically.
- `client/src/` — React 18 + Vite + Zustand + `@dnd-kit` for drag-and-drop.
  - `store.js` — single Zustand store; `bindSocket()` wires all socket event listeners into store state (call once at app startup).
  - `pages/` — `Lobby.jsx`, `Room.jsx` (waiting room), `GameBoard.jsx` (main game).
  - `components/` — `Rack.jsx` (player's hand), `TableArea.jsx` (board), `Tile.jsx`, `TurnControls.jsx`, `Chat.jsx`, `PlayerBar.jsx`, `ResultModal.jsx`, `RulesHelp.jsx`.

**Core sync model (important to understand before touching game logic):**

Every drag-and-drop action sends the player's *entire* table layout to the server (`game:layout`). The server (`Game.applyLayout`) validates tile ownership/conservation against a `snapshotTable` (state at turn start) and stores the result as `provisionalTable`/`provisionalRack`, then broadcasts `game:state` to all clients — so everyone sees the current player's board manipulation live, before it's finalized.

Only when the player clicks "出牌" (`game:endTurn`) does the server validate:
1. Every set in `provisionalTable` is a valid group/run (`shared/validator.js`).
2. If the player hasn't melded yet this game, enforce first-meld rules: no existing table tiles may be touched/reorganized, and newly placed sets must sum to ≥30 points (`INITIAL_MELD_MIN`).

On validation failure, the turn does **not** end — the server returns which set IDs are invalid (`invalidSetIds`) and a reason string, the client flashes those sets and shows a toast, and the player can keep adjusting, reset (`game:reset`), or draw-and-pass (`game:draw`). Only the 60-second turn timer expiring (`onTimeout`) forces an automatic revert + penalty draw. This means: any change to turn-ending logic must go through `endTurn`'s two-phase validate-then-commit structure, not a single-shot commit.

Disconnection handling: a disconnected current player is auto-skipped after 3s (`DISCONNECT_SKIP_MS`) via `drawTile` + `nextTurn`; a room with all players disconnected is destroyed after 5 minutes (`RoomManager.EMPTY_DESTROY_MS`). Reconnection restores the room, hand, and chat history via `state:full`.

**Bot players:** the host adds/removes bots in the waiting room (`room:addBot` / `room:removeBot {playerId}`). There is only one bot difficulty — every bot is created with `botLevel: 'hard'` (`RoomManager.addBot` no longer takes a level param; the old easy/hard picker was removed from the UI). A bot is a socketless entry in `room.players` (`isBot: true`, `botLevel`, `socketId: null`, always `connected`/`ready` — `toPlayer` no-ops safely for it). `room:start` builds a `BotDriver` per room when bots are present; `onGameOver` disposes it and keeps bots ready for a rematch. Room-lifecycle rules that must stay bot-aware: host succession skips bots (a bot can never be host; an all-bot room is destroyed), and `scheduleDestroyIfAbandoned` ignores bots when checking for connected players (they are always "connected"). The client "AI 代出牌" button (`TurnControls.jsx`) runs the same solver locally: `game:reset` → `solve()` → stepped `game:layout` (via `layoutSteps`, paced to half the turn time) → `game:endTurn`, falling back to `game:draw` — the server still fully validates, so a buggy client solve can't cheat. The button is a hidden feature: tapping the room name 5 times within 2s (`useSecretTaps.js`, wired to `.room-tag` in `PlayerBar.jsx` and the `<h1>` in `Room.jsx`) toggles `aiUnlocked` (persisted in localStorage as `rummy-ai-unlocked`). Next to it is an "自動" checkbox (`aiAuto`, not persisted) that auto-plays every turn via a `useEffect` on `myTurn`; hiding the feature also switches auto mode off.

**Client store contract:** `store.js`'s `bindSocket()` is the single source of truth for how server events map to UI state — e.g. `game:state` triggers the "your turn" banner+beep only when `current` changes to the local player; `game:drew` drives both a temporary rack highlight and a center-screen overlay animation. When adding a new server-to-client event, add the listener there rather than in individual components.
