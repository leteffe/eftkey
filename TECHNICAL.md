# Technical Documentation

This document explains the architecture, key modules, endpoints, event flow, and implementation details of the eftkey multi-terminal application.

## Overview

- Stack: Node.js + TypeScript, Express, ts-node + nodemon for dev
- PayTec library: Official GitHub package `github:PayTecAG/ecritf` (POSTerminal instances)
- Transport: Cloud via SMQ WebSocket `wss://ecritf.paytec.ch/smq.lsp` (handled by the PayTec lib)
- Persistence: Per-terminal JSON files `.data/pairings/{terminalId}.json`
- Results persistence: NDJSON `.data/transactions.ndjson` with terminal ID and full outcome payloads
- GUI: static HTML/JS served from `public/` with ID-filtered SSE log streaming
- Multi-terminal: Each terminal ID maintains its own pairing, connection state, and loop configurations

## Directory structure

- `src/server.ts` — Express app, ID-based endpoints, SSE log streaming, per-terminal loop logic
- `src/terminalManager.ts` — Multi-terminal registry, per-id persistence, id-tagged logs, terminal state management
- `public/` — `index.html` GUI: terminal selection, pairing form, status, actions, loop controls, live log panel
- `.data/pairings/{terminalId}.json` — persisted pairing info per terminal
- `.data/transactions.ndjson` — transaction outcomes with terminal ID
- `package.json` — dependencies including `github:PayTecAG/ecritf`

## Terminal Manager (`src/terminalManager.ts`)

- Multi-terminal registry with per-ID POSTerminal instances
- Loads official PayTec library: `github:PayTecAG/ecritf`
- Constructs `new POSTerminal(pairing, options)` per terminal ID with:
  - AutoConnect, AutoReconnect
  - Tuned intervals/timeouts to reduce disconnects
- Exposes multi-terminal API:
  - `getOrCreateTerminal(id)` - creates/retrieves terminal instance
  - `pairTerminal(id, code, name)` - pairs specific terminal
  - `getPairing(id)` - retrieves pairing info for terminal
  - `listTerminals()` - returns all known terminal IDs
  - `getTerminalState(id)` - returns loop configuration state
- Log event bus: `subscribeAll(cb)`; emits ID-tagged events from PayTec callbacks:
  - `{ id: string, type: string, payload?: any }`
  - Events: `connected`, `disconnected`, `pairingSucceeded`, `pairingFailed`, `status`, `messageSent`, `messageReceived`, `error`, `activationSucceeded`, `activationFailed`, `transactionApproved`, `transactionDeclined`, `transactionAborted`, `transactionTimedOut`, `transactionConfirmationSucceeded`, `transactionConfirmationFailed`, `receipt`
- Per-terminal persistence: `.data/pairings/{terminalId}.json`

## Server (`src/server.ts`)

### Core Endpoints

- `GET /healthz` → health check
- `GET /terminals` → `{ ids: string[] }` - list all known terminal IDs

### Terminal-specific Endpoints (replace `:id` with terminal ID)

- `GET /pairing/:id` → returns pairing info for specific terminal
- `POST /pair/:id` → `{ code }` pairs specific terminal using `pairTerminal(id, code, name)`
- `POST /activate/:id` → activates specific terminal
- `POST /transaction/:id/account-verification` → starts ACCOUNT_VERIFICATION on specific terminal
- `POST /transaction/:id/purchase` → starts PURCHASE with `{ AmtAuth, TrxCurrC?, RecOrderRef? }` on specific terminal
- `GET /logs/:id` → Server-Sent Events stream (SSE) filtered by terminal ID

### Loop Configuration (per terminal)

- `GET /loop/:id` → `{ enabled: boolean, delayMs: number }` - ACCOUNT_VERIFICATION loop config
- `POST /loop/:id` → `{ enabled?: boolean, delayMs?: number }` - configure ACCOUNT_VERIFICATION loop
- `GET /loop/:id/purchase` → `{ enabled: boolean, amount: number, currency: number, delayMs: number }` - PURCHASE loop config
- `POST /loop/:id/purchase` → `{ enabled?: boolean, amount?: number, currency?: number, delayMs?: number }` - configure PURCHASE loop

### Diagnostics

- `GET /diagnostics` → `{ ok: boolean, serverTime: string, uptimeSec: number, cloud: object }` - global connectivity test
- `GET /diagnostics/terminal/:id` → `{ ok: boolean, id: string, paired: boolean, status: number, ready: boolean }` - terminal-specific status

### SSE

- Writes `event: <type>` and JSON `data:` lines for each log event
- Consumed by the GUI via `EventSource('/logs/:id')` (filtered by terminal ID)
- All events are ID-tagged from `terminalManager.subscribeAll`

### Per-terminal Loop modes

- **ACCOUNT_VERIFICATION loop**: repeatedly run ACCOUNT_VERIFICATION as soon as the terminal is ready after the previous one
- **PURCHASE loop**: repeatedly run PURCHASE with configured amount/currency after completion
- Per-terminal state management:
  - `loopAVEnabled`, `loopAVDelayMs`, `loopAVPending` (ACCOUNT_VERIFICATION)
  - `loopPurchaseEnabled`, `loopPurchaseAmount`, `loopPurchaseTrxCurrC`, `loopPurchaseDelayMs`, `loopPurchasePending` (PURCHASE)
  - `lastStatus`, `cooldownUntil` (shared)
- Loop triggers on completion outcomes: approved/declined/aborted/timed out or receipt
- Waits for terminal ready state (SHIFT_OPEN set and BUSY not set) plus cooldown before next transaction

### Pairing resilience

- Each terminal maintains its own pairing state and connection
- Pairing info is automatically loaded from `.data/pairings/{terminalId}.json` on startup
- Failed pairings can be retried by sending a new pairing code

### Outcome persistence

- Subscribes to the ID-tagged log bus and persists only outcome events to `.data/transactions.ndjson`:
  - types: approved, declined, aborted, timed out, confirmation succeeded/failed
  - record: `{ ts: string, terminalId: string, type: string, status: number, payload: object }`

### Status readiness

- Uses terminal status flags from PayTec:
  - SHIFT_OPEN = `0x00000001`
  - BUSY = `0x00000004`
- Ready = `(TrmStatus & SHIFT_OPEN) && !(TrmStatus & BUSY)`
- Each terminal tracks its own status independently

## GUI (`public/index.html`)

- **Terminal selection**: Enter terminal ID and click "Laden" to load configuration
- **Pairing form**: Posts to `/pair/:id` for specific terminal
- **Status card**: Shows pairing info, live connection state, and connection diagnostics
- **Actions** (per terminal):
  - Activate button → `/activate/:id`
  - ACCOUNT_VERIFICATION button → `/transaction/:id/account-verification`
  - PURCHASE form → `/transaction/:id/purchase`
- **Loop controls** (per terminal):
  - ACCOUNT_VERIFICATION loop: checkbox, delay (ms), save to `/loop/:id`
  - PURCHASE loop: checkbox, amount, currency, delay (ms), save to `/loop/:id/purchase`
- **Connection diagnostics**: "Verbindung testen" button tests cloud connectivity
- **Live log pane**: Subscribes to SSE `/logs/:id` and appends ID-filtered events with timestamps

## Persistence

- **Pairing data**: `.data/pairings/{terminalId}.json` - one file per terminal ID
- **Transaction outcomes**: `.data/transactions.ndjson` - all outcomes with terminal ID
- **Terminal state**: In-memory per-terminal loop configurations and status tracking
- Loaded on startup; app attempts to auto-connect each known terminal

## Build and run

- Dev: `npm run dev` (nodemon + ts-node)
- Build: `npm run build`
- Start: `npm start`

## Known behaviors and caveats

- Each terminal ID maintains its own pairing state and connection; pairing info in `.data/pairings/{terminalId}.json` shows as "Gepairt" in the GUI
- Live connection state is shown separately and can be tested via diagnostics
- The cloud transport and device status transitions are handled by the PayTec library; intermittent disconnects can happen depending on network/device
- Loop modes avoid sending while terminal is busy; if you still see "Terminal is busy", increase `delayMs` or wait for ready status
- Channel IDs can change when terminals restart or are re-paired; this is normal behavior
- Multi-terminal support allows independent operation of different terminals with separate loop configurations

## Extensibility

- Add more endpoints as needed (e.g., receipts retrieval, other transaction types)
- Enhance GUI (framework, UX) or expose WebSocket for richer client updates
- Extend terminal state persistence to include loop settings in config files
- Add terminal grouping or batch operations for multiple terminals
- Implement terminal health monitoring and automatic reconnection strategies
