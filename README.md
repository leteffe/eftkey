# eftkey

Multi-terminal Node.js + TypeScript app to pair with PayTec POS terminals via the cloud, send pairing codes, run transactions, and manage multiple terminals with individual loop configurations.

Uses the official PayTec ECR interface: [PayTecAG/ecritf](https://github.com/PayTecAG/ecritf).

## Quick start

1) Install dependencies

```bash
npm install
```

2) Start the app

```bash
npm run dev
```

3) Open the GUI

- Browser: http://localhost:3000

4) Multi-terminal setup

- **Terminal-ID wählen**: Enter a terminal ID (e.g., `default`, `99`, `1`) and click "Laden"
- **Pairing**: Enter the pairing code shown on the terminal (e.g., 6017087) and submit
- **Automatic loading**: Pairing info is persisted to `.data/pairings/{terminalId}.json` and loaded on startup
- **Multiple terminals**: Each terminal ID has its own pairing, loop settings, and transaction history

5) Healthcheck

```bash
curl http://localhost:3000/healthz
```

## GUI features

- **Terminal selection**: Choose terminal ID and load its configuration
- **Pairing form**: Send pairing code to specific terminal
- **Status card**: Current pairing info, terminal status, connection diagnostics
- **Actions** (per terminal):
  - Terminal aktivieren → `/activate/:id`
  - ACCOUNT_VERIFICATION → `/transaction/:id/account-verification`
  - PURCHASE → `/transaction/:id/purchase` (enter amount in minor units, e.g., 1575 = CHF 15.75)
- **Loop modes** (per terminal):
  - ACCOUNT_VERIFICATION loop: auto-repeat after successful receipt/approval/decline/abort/timeout
  - PURCHASE loop: configure amount/currency/delay for automatic PURCHASE retriggering
- **Live logs**: Streamed via Server-Sent Events from `/logs/:id` (filtered by terminal)
- **Connection diagnostics**: Test cloud connectivity and terminal readiness
- **Results log**: Transaction outcomes persisted to `.data/transactions.ndjson` with terminal ID

## API endpoints

### Core endpoints
- `GET /healthz` → `{ ok: true }`
- `GET /terminals` → `{ ids: string[] }` - list all known terminal IDs

### Terminal-specific endpoints (replace `:id` with terminal ID)
- `GET /pairing/:id` → pairing JSON for specific terminal
- `POST /pair/:id` → `{ code: string }` pair specific terminal
- `POST /activate/:id` → activate specific terminal
- `POST /transaction/:id/account-verification` → start ACCOUNT_VERIFICATION
- `POST /transaction/:id/purchase` → `{ AmtAuth: number, TrxCurrC?: number, RecOrderRef?: object }`
- `GET /logs/:id` → Server-Sent Events for specific terminal

### Loop configuration (per terminal)
- `GET /loop/:id` → `{ enabled: boolean, delayMs: number }` - ACCOUNT_VERIFICATION loop
- `POST /loop/:id` → `{ enabled?: boolean, delayMs?: number }` - configure ACCOUNT_VERIFICATION loop
- `GET /loop/:id/purchase` → `{ enabled: boolean, amount: number, currency: number, delayMs: number }` - PURCHASE loop
- `POST /loop/:id/purchase` → `{ enabled?: boolean, amount?: number, currency?: number, delayMs?: number }` - configure PURCHASE loop

### Diagnostics
- `GET /diagnostics` → `{ ok: boolean, serverTime: string, uptimeSec: number, cloud: object }` - global connectivity test
- `GET /diagnostics/terminal/:id` → `{ ok: boolean, id: string, paired: boolean, status: number, ready: boolean }` - terminal-specific status

## Result logging (persisted)

- File: `.data/transactions.ndjson`
- One JSON object per line with fields:
  - `ts`: ISO timestamp
  - `terminalId`: terminal ID that generated the event
  - `type`: `transactionApproved | transactionDeclined | transactionAborted | transactionTimedOut | transactionConfirmationSucceeded | transactionConfirmationFailed`
  - `status`: last known `TrmStatus` for the terminal
  - `payload`: full PayTec event payload (includes amounts, AID, IIN, refs if provided)

## Data persistence

- **Pairing data**: `.data/pairings/{terminalId}.json` - one file per terminal ID
- **Transaction outcomes**: `.data/transactions.ndjson` - all outcomes with terminal ID
- **Terminal state**: In-memory per-terminal loop configurations and status tracking

## Deployment & Configuration

- Dev:

```bash
npm run dev
```

- Build & start:

```bash
npm run build
npm start
```

Environment variables:
- `PORT` (default: `3000`)
- `DATA_DIR` (default: `.data`) directory for persisted pairing and logs

## Scripts

- `npm run dev` → start in watch mode with ts-node + nodemon
- `npm run build` → compile TypeScript to `dist/`
- `npm start` → run compiled app from `dist/`

## Notes

- Uses the official PayTec library from GitHub: `github:PayTecAG/ecritf`
- Cloud transport endpoint is managed internally by the PayTec library (`wss://ecritf.paytec.ch/smq.lsp`)
- Each terminal ID maintains its own pairing channel and connection state
- Pairing and transaction logs are visible both in the terminal output and in the GUI log panel
- Loop modes automatically retrigger transactions after completion (approved/declined/aborted/timeout)
- Connection diagnostics help troubleshoot cloud connectivity issues
- All endpoints are now ID-based for multi-terminal support

## Architecture diagram

```mermaid
flowchart LR
  subgraph Client
    GUI["Browser GUI\n(public/index.html)"]
  end

  subgraph Server[Node.js/Express]
    API["Express API\n/src/server.ts"]
    TM["Terminal Manager\n/src/terminalManager.ts"]
    LOGS["SSE /logs/:id\nsubscribeAll"]
    LOOP["Per-terminal Loops\nAV + Purchase auto-retrigger"]
    PERSIST["Persistence\n.data/pairings/{id}.json\n.data/transactions.ndjson"]
    DIAG["Diagnostics\nCloud connectivity tests"]
  end

  subgraph PayTec
    ECRITF["github:PayTecAG/ecritf\nPOSTerminal instances"]
    CLOUD["SMQ Cloud\nwss://ecritf.paytec.ch/smq.lsp"]
    TERM1["POS Terminal 1"]
    TERM2["POS Terminal 2"]
    TERMN["POS Terminal N"]
  end

  GUI -- "POST /pair/:id, /activate/:id, /transaction/:id/*, /loop/:id" --> API
  GUI -- "EventSource /logs/:id" --> LOGS
  GUI -- "GET /diagnostics" --> DIAG
  API --> TM
  TM --> ECRITF
  ECRITF <--> CLOUD <--> TERM1
  ECRITF <--> CLOUD <--> TERM2
  ECRITF <--> CLOUD <--> TERMN
  TM --> PERSIST
  API --> PERSIST
  LOOP --> API
  LOGS --> GUI
```

## Communication flow (multi-terminal view)

```mermaid
sequenceDiagram
  participant User as User
  participant GUI as Browser GUI
  participant API as eftkey API
  participant TM as Terminal Manager
  participant Lib as PayTec Library
  participant Cloud as PayTec Cloud (SMQ)
  participant Term1 as Terminal 1
  participant Term2 as Terminal 2

  User->>GUI: Select terminal ID "99"
  GUI->>API: GET /pairing/99
  API->>TM: getPairingById("99")
  TM-->>API: Pairing info
  API-->>GUI: Display pairing status

  User->>GUI: Enter pairing code for terminal "99"
  GUI->>API: POST /pair/99 {code}
  API->>TM: pairTerminal("99", code)
  TM->>Lib: Create/get terminal instance
  Lib->>Cloud: Secure WebSocket (SMQ)
  Cloud->>Term1: Forward pairing command
  Term1-->>Cloud: Pairing success
  Cloud-->>Lib: Pairing response
  Lib-->>TM: Pairing callback
  TM-->>API: Pairing complete
  API-->>GUI: SSE /logs/99 (live updates)
  API-->>API: Persist pairing (.data/pairings/99.json)

  User->>GUI: Start transaction on terminal "99"
  GUI->>API: POST /transaction/99/account-verification
  API->>TM: getOrCreateTerminal("99")
  TM->>Lib: trm.startTransaction
  Lib->>Cloud: Transaction command
  Cloud->>Term1: Forward transaction
  Term1-->>Cloud: Transaction outcome
  Cloud-->>Lib: Transaction response
  Lib-->>TM: Transaction callback
  TM-->>API: Transaction complete
  API-->>GUI: SSE /logs/99 (transaction result)
  API-->>API: Persist outcome (.data/transactions.ndjson)
```

## Git usage

Initialize and push to your repository:

```bash
git init
git add .
git commit -m "feat: multi-terminal eftkey with pairing, GUI, loops, and diagnostics"
git branch -M main
git remote add origin <YOUR_GIT_REMOTE_URL>
git push -u origin main
```

Use feature branches for changes:

```bash
git checkout -b feat/transaction-endpoints
# ...changes...
git commit -m "feat: add purchase endpoint"
git push -u origin feat/transaction-endpoints
```

See `TECHNICAL.md` for a deeper technical overview.
