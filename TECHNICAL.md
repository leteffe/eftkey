# Technical Documentation

This document explains the architecture, key modules, endpoints, event flow, and implementation details of the eftkey MVP.

## Overview

- Stack: Node.js + TypeScript, Express, ts-node + nodemon for dev
- PayTec library: local `ecritf-main/ecritf.js` (ES module default export `POSTerminal`)
- Transport: Cloud via SMQ WebSocket `wss://ecritf.paytec.ch/smq.lsp` (handled by the PayTec lib)
- Persistence: JSON file `.data/pairing.json`
- Results persistence: NDJSON `.data/transactions.ndjson` with full outcome payloads
- GUI: static HTML/JS served from `public/` with SSE log streaming

## Directory structure

- `src/server.ts` — Express app, endpoints, SSE log streaming, loop logic
- `src/paytec.ts` — Loads the PayTec lib, constructs terminal instance, wires callbacks, exposes log subscription
- `public/` — `index.html` GUI: pairing form, status, actions, loop controls, live log panel
- `.data/pairing.json` — persisted pairing info
- `ecritf-main/ecritf.js` — PayTec library

## PayTec integration (`src/paytec.ts`)

- Loads local `ecritf-main/ecritf.js` using CommonJS require from Node (compiled TS)
- Constructs `new POSTerminal(pairing, options)` with:
  - AutoConnect, AutoReconnect
  - Tuned intervals/timeouts to reduce disconnects
- Exposes a minimal API:
  - `createTerminal()`, `getTerminal()`
  - `loadPairingFromDisk()`, `savePairingToDisk()`
  - Log event bus: `subscribeLogs(cb)`; emits structured events from PayTec callbacks:
    - `connected`, `disconnected`, `pairingSucceeded`, `pairingFailed`, `status`, `messageSent`, `messageReceived`, `error`, `activationSucceeded`, `activationFailed`, `transactionApproved`, `transactionDeclined`, `transactionAborted`, `transactionTimedOut`, `transactionConfirmationSucceeded`, `transactionConfirmationFailed`, `receipt`

## Server (`src/server.ts`)

### Endpoints

- `GET /healthz` → health check
- `GET /pairing` → returns current pairing info (or null)
- `POST /pair` → `{ code }` triggers `trm.pair(code, 'eftkey POS')` and persists on success
- `POST /activate` → `trm.activate()`
- `POST /transaction/account-verification` → starts ACCOUNT_VERIFICATION
- `POST /transaction/purchase` → starts PURCHASE with `{ AmtAuth, TrxCurrC?, RecOrderRef? }`
- `GET /loop` → `{ enabled, delayMs }`
- `POST /loop` → control loop mode `{ enabled?: boolean, delayMs?: number }`
- `GET /logs` → Server-Sent Events stream (SSE) of `subscribeLogs` events

### SSE

- Writes `event: <type>` and JSON `data:` lines for each log event
- Consumed by the GUI via `EventSource('/logs')`

### Loop mode

- Goal: repeatedly run ACCOUNT_VERIFICATION as soon as the terminal is ready after the previous one
- State:
  - `loopEnabled` (boolean), `loopDelayMs` (ms)
  - `loopPending` (boolean): set after AV completion outcomes (approved/declined/aborted/timed out) or receipt
  - Tracks latest `status.TrmStatus`; considers ready when SHIFT_OPEN set and BUSY not set
- On ready and pending, sends next AV after `loopDelayMs` and a short cooldown

### Pairing resilience

- `/pair` retries once after recreating the terminal when SMQ/TID errors are detected (e.g., `tid not found`, `unsubscribe`, `onmsg`).

### Outcome persistence

- Subscribes to the log bus and persists only outcome events to `.data/transactions.ndjson`:
  - types: approved, declined, aborted, timed out, confirmation succeeded/failed
  - record: `{ ts, type, status, payload }`

### Status readiness

- Uses terminal status flags from PayTec:
  - SHIFT_OPEN = `0x00000001`
  - BUSY = `0x00000004`
- Ready = `(TrmStatus & SHIFT_OPEN) && !(TrmStatus & BUSY)`

## GUI (`public/index.html`)

- Pairing form posts to `/pair`
- Status card shows pairing info and live connection state (“verbunden/ getrennt”) from SSE `connected`/`disconnected`
- Actions:
  - Activate button → `/activate`
  - ACCOUNT_VERIFICATION button → `/transaction/account-verification`
  - PURCHASE form → `/transaction/purchase`
- Loop controls:
  - Checkbox to enable/disable
  - Delay (ms)
  - Save posts to `/loop`
- Live log pane subscribes to SSE and appends events with timestamps

## Persistence

- Pairing info stored at `.data/pairing.json`
- Loaded on startup; app attempts to auto-connect

## Build and run

- Dev: `npm run dev` (nodemon + ts-node)
- Build: `npm run build`
- Start: `npm start`

## Known behaviors and caveats

- Pairing info remaining in `.data/pairing.json` shows as “Gepairt” in the GUI; live connection state is shown separately.
- The cloud transport and device status transitions are handled by the PayTec library; intermittent disconnects can happen depending on network/device.
- Loop mode avoids sending while terminal is busy; if you still see “Terminal is busy”, increase `delayMs` or wait for ready status.

## Extensibility

- Add more endpoints as needed (e.g., receipts retrieval, other transaction types)
- Enhance GUI (framework, UX) or expose WebSocket for richer client updates
- Persist more runtime state if required (e.g., loop settings) in a config file
