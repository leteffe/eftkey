import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import dotenv from 'dotenv';
import dns from 'dns/promises';
import https from 'https';
import { getOrCreateTerminal, pairTerminal, getPairing as getPairingById, listTerminals, subscribeAll, getTerminalState } from './terminalManager';

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static GUI
const publicDir = path.resolve(process.cwd(), 'public');
app.use(express.static(publicDir));
app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Initialize default terminal on startup
(async () => {
  try {
    await getOrCreateTerminal('default');
    console.log('[eftkey] initialized default terminal');
  } catch (e) {
    console.error('[eftkey] failed to initialize default terminal:', e);
  }
})();

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

// Multi-terminal: list known ids
app.get('/terminals', (_req, res) => {
  res.json({ ids: listTerminals() });
});

// Multi-terminal: get pairing by id
app.get('/pairing/:id', async (req, res) => {
  try {
    const info = await getPairingById(req.params.id);
    res.json(info);
  } catch (e) {
    res.status(500).json({ error: 'terminal_not_ready' });
  }
});

// Multi-terminal: pair by id
app.post('/pair/:id', async (req, res) => {
  const { id } = req.params;
  const { code } = req.body || {};
  
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'code_required' });
  }
  
  try {
    await pairTerminal(id, code, `eftkey POS ${id}`);
    res.json({ ok: true });
  } catch (e: any) {
    console.error(`[eftkey] pairing failed for terminal ${id}:`, e);
    res.status(500).json({ error: 'pair_failed' });
  }
});

// Multi-terminal: activate by id
app.post('/activate/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const trm = await getOrCreateTerminal(id);
    if (trm.activate) {
      trm.activate();
      res.json({ ok: true });
    } else {
      res.status(500).json({ error: 'activate_not_supported' });
    }
  } catch (e) {
    console.error(`[eftkey] activation failed for terminal ${id}:`, e);
    res.status(500).json({ error: 'activate_failed' });
  }
});

// Multi-terminal: start ACCOUNT_VERIFICATION transaction
app.post('/transaction/:id/account-verification', async (req, res) => {
  const { id } = req.params;
  try {
    const trm = await getOrCreateTerminal(id);
    const payload: any = { TrxFunction: trm.TransactionFunctions?.ACCOUNT_VERIFICATION };
    if (req.body && req.body.RecOrderRef) {
      payload.RecOrderRef = req.body.RecOrderRef;
    }
    trm.startTransaction(payload);
    res.json({ ok: true, started: 'ACCOUNT_VERIFICATION' });
  } catch (e) {
    console.error(`[eftkey] ACCOUNT_VERIFICATION failed for terminal ${id}:`, e);
    res.status(500).json({ error: 'start_failed' });
  }
});

// Multi-terminal: start PURCHASE transaction
app.post('/transaction/:id/purchase', async (req, res) => {
  const { id } = req.params;
  try {
    const trm = await getOrCreateTerminal(id);
    const { AmtAuth, TrxCurrC = 756, RecOrderRef } = req.body || {};
    
    if (typeof AmtAuth !== 'number' || AmtAuth <= 0) {
      return res.status(400).json({ error: 'AmtAuth_required_minor_units' });
    }
    
    const payload: any = { 
      TrxFunction: trm.TransactionFunctions?.PURCHASE, 
      TrxCurrC, 
      AmtAuth 
    };
    if (RecOrderRef) payload.RecOrderRef = RecOrderRef;
    
    trm.startTransaction(payload);
    res.json({ ok: true, started: 'PURCHASE' });
  } catch (e) {
    console.error(`[eftkey] PURCHASE failed for terminal ${id}:`, e);
    res.status(500).json({ error: 'start_failed' });
  }
});

// Server-Sent Events: stream logs for all terminals
app.get('/logs', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const send = (e: any) => {
    res.write(`event: ${e.type}\n`);
    res.write(`data: ${JSON.stringify(e.payload ?? null)}\n\n`);
  };
  
  const unsub = subscribeAll(send);
  req.on('close', () => {
    unsub();
  });
});

// Multi-terminal: per-id logs
app.get('/logs/:id', (req, res) => {
  const id = req.params.id;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const unsub = subscribeAll((evt) => {
    if (evt.id !== id) return;
    res.write(`event: ${evt.type}\n`);
    res.write(`data: ${JSON.stringify(evt.payload ?? null)}\n\n`);
  });
  
  req.on('close', () => { 
    unsub(); 
  });
});

// Diagnostics: track last known status per terminal id
const lastStatusById = new Map<string, number>();
subscribeAll((evt) => {
  if (evt.type === 'status' && evt.payload && typeof evt.payload.TrmStatus === 'number') {
    lastStatusById.set(evt.id, evt.payload.TrmStatus as number);
  }
});

// Helper: test cloud connectivity to ecritf.paytec.ch
async function testCloudConnectivity(): Promise<any> {
  const host = 'ecritf.paytec.ch';
  const out: any = { host };
  try {
    const start = Date.now();
    const addrs = await dns.resolve(host);
    out.dns = { ok: true, addresses: addrs, ms: Date.now() - start };
  } catch (e: any) {
    out.dns = { ok: false, error: String(e && e.message ? e.message : e) };
  }
  out.https = await new Promise((resolve) => {
    const started = Date.now();
    const req = https.request({ method: 'HEAD', host, path: '/', timeout: 4000 }, (res) => {
      resolve({ ok: true, statusCode: res.statusCode, ms: Date.now() - started });
      res.resume();
    });
    req.on('timeout', () => { try { req.destroy(); } catch {} resolve({ ok: false, error: 'timeout' }); });
    req.on('error', (err) => resolve({ ok: false, error: String(err) }));
    req.end();
  });
  return out;
}

// GET /diagnostics → basic server and cloud checks
app.get('/diagnostics', async (_req, res) => {
  try {
    const cloud = await testCloudConnectivity();
    res.json({ ok: true, serverTime: new Date().toISOString(), uptimeSec: process.uptime(), cloud });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e && e.message ? e.message : e) });
  }
});

// GET /diagnostics/terminal/:id → pairing present and last status flags
app.get('/diagnostics/terminal/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const pairing = await getPairingById(id);
    const status = lastStatusById.get(id) ?? null;
    const SHIFT_OPEN = 0x00000001;
    const BUSY = 0x00000004;
    const ready = typeof status === 'number' ? ((status & SHIFT_OPEN) && !(status & BUSY)) : null;
    res.json({ ok: true, id, paired: !!pairing, status, ready });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e && e.message ? e.message : e) });
  }
});

// Loop mode control (per terminal)
app.get('/loop/:id', (req, res) => {
  const { id } = req.params;
  const state = getTerminalState(id);
  if (!state) return res.status(404).json({ error: 'terminal_not_found' });
  res.json({ enabled: state.loopAVEnabled, delayMs: state.loopAVDelayMs });
});

app.post('/loop/:id', (req, res) => {
  const { id } = req.params;
  const state = getTerminalState(id);
  if (!state) return res.status(404).json({ error: 'terminal_not_found' });
  const { enabled, delayMs } = req.body || {};
  if (enabled !== undefined) state.loopAVEnabled = !!enabled;
  if (delayMs !== undefined) state.loopAVDelayMs = Math.max(0, parseInt(delayMs, 10) || 0);
  return res.json({ ok: true, enabled: state.loopAVEnabled, delayMs: state.loopAVDelayMs });
});

app.get('/loop/:id/purchase', (req, res) => {
  const { id } = req.params;
  const state = getTerminalState(id);
  if (!state) return res.status(404).json({ error: 'terminal_not_found' });
  res.json({ 
    enabled: state.loopPurchaseEnabled, 
    amount: state.loopPurchaseAmount, 
    currency: state.loopPurchaseTrxCurrC, 
    delayMs: state.loopPurchaseDelayMs 
  });
});

app.post('/loop/:id/purchase', (req, res) => {
  const { id } = req.params;
  const state = getTerminalState(id);
  if (!state) return res.status(404).json({ error: 'terminal_not_found' });
  const { enabled, amount, currency, delayMs } = req.body || {};
  if (enabled !== undefined) state.loopPurchaseEnabled = !!enabled;
  if (amount !== undefined) state.loopPurchaseAmount = Math.max(0, parseInt(amount, 10) || 0);
  if (currency !== undefined) state.loopPurchaseTrxCurrC = parseInt(currency, 10) || 756;
  if (delayMs !== undefined) state.loopPurchaseDelayMs = Math.max(0, parseInt(delayMs, 10) || 0);
  return res.json({ 
    ok: true, 
    enabled: state.loopPurchaseEnabled, 
    amount: state.loopPurchaseAmount, 
    currency: state.loopPurchaseTrxCurrC, 
    delayMs: state.loopPurchaseDelayMs 
  });
});

// Auto-retrigger logic (per terminal)
subscribeAll(async (evt) => {
  const now = Date.now();
  const state = getTerminalState(evt.id);
  if (!state) return; // Should not happen with proper setup

  if (evt.type === 'status' && evt.payload && typeof evt.payload.TrmStatus === 'number') {
    state.lastStatus = evt.payload.TrmStatus;
    const SHIFT_OPEN = 0x00000001;
    const BUSY = 0x00000004;
    const ready = (state.lastStatus & SHIFT_OPEN) && !(state.lastStatus & BUSY);

    if (state.loopAVEnabled && state.loopAVPending && ready && now >= state.cooldownUntil) {
      state.cooldownUntil = now + Math.max(500, state.loopAVDelayMs);
      state.loopAVPending = false;
      setTimeout(async () => {
        try {
          const trm = await getOrCreateTerminal(evt.id);
          trm.startTransaction({ 
            TrxFunction: trm.TransactionFunctions?.ACCOUNT_VERIFICATION, 
            RecOrderRef: { OrderID: `Loop-AV-${evt.id}-${Date.now()}` } 
          });
          console.log(`[eftkey] auto loop AV: id=${evt.id} started`);
        } catch (e) {
          console.error(`[eftkey] auto loop AV for ${evt.id} failed`, e);
        }
      }, state.loopAVDelayMs);
    }

    if (state.loopPurchaseEnabled && state.loopPurchasePending && ready && now >= state.cooldownUntil) {
      state.cooldownUntil = now + Math.max(500, state.loopPurchaseDelayMs);
      state.loopPurchasePending = false;
      setTimeout(async () => {
        try {
          const trm = await getOrCreateTerminal(evt.id);
          trm.startTransaction({
            TrxFunction: trm.TransactionFunctions?.PURCHASE,
            TrxCurrC: state.loopPurchaseTrxCurrC,
            AmtAuth: state.loopPurchaseAmount,
            RecOrderRef: { OrderID: `Loop-P-${evt.id}-${Date.now()}` }
          });
          console.log(`[eftkey] auto loop purchase: id=${evt.id} amount=${state.loopPurchaseAmount} started`);
        } catch (e) {
          console.error(`[eftkey] auto loop purchase for ${evt.id} failed`, e);
        }
      }, state.loopPurchaseDelayMs);
    }
  }

  // Mark pending when finishing an AV (receipt or approved/declined/aborted/timed out)
  if (state.loopAVEnabled || state.loopPurchaseEnabled) {
    try {
      const trm = await getOrCreateTerminal(evt.id); // Need to get terminal to access TransactionFunctions
      const isAVOutcome = evt.payload && typeof evt.payload.TrxFunction === 'number' && evt.payload.TrxFunction === trm.TransactionFunctions?.ACCOUNT_VERIFICATION;
      const isPurchaseOutcome = evt.payload && typeof evt.payload.TrxFunction === 'number' && evt.payload.TrxFunction === trm.TransactionFunctions?.PURCHASE;

      if (state.loopAVEnabled && isAVOutcome && (
        evt.type === 'receipt' && evt.payload && typeof evt.payload.text === 'string' && (evt.payload.text.includes('Account Verification') || evt.payload.text.includes('ACCOUNT VERIFICATION')) ||
        evt.type === 'transactionApproved' || evt.type === 'transactionDeclined' || evt.type === 'transactionAborted' || evt.type === 'transactionTimedOut'
      )) {
        state.loopAVPending = true;
      }

      if (state.loopPurchaseEnabled && isPurchaseOutcome && (
        evt.type === 'receipt' && evt.payload && typeof evt.payload.text === 'string' && (evt.payload.text.includes('Purchase') || evt.payload.text.includes('PURCHASE')) ||
        evt.type === 'transactionApproved' || evt.type === 'transactionDeclined' || evt.type === 'transactionAborted' || evt.type === 'transactionTimedOut'
      )) {
        state.loopPurchasePending = true;
      }
    } catch (e) {
      console.error(`[eftkey] error in loop logic for ${evt.id}:`, e);
    }
  }
});

// Log transaction outcomes to file
const resultsFile = path.resolve(process.cwd(), '.data', 'transactions.ndjson');
async function appendResult(entry: any) {
  try {
    await fs.mkdir(path.dirname(resultsFile), { recursive: true });
    await fs.appendFile(resultsFile, JSON.stringify(entry) + '\n', 'utf8');
  } catch (e) {
    console.error('[eftkey] failed to write result', e);
  }
}

subscribeAll((evt) => {
  const nowIso = new Date().toISOString();
  const outcomeTypes = new Set([
    'transactionApproved', 'transactionDeclined', 'transactionAborted', 'transactionTimedOut',
    'transactionConfirmationSucceeded', 'transactionConfirmationFailed',
  ]);
  if (!outcomeTypes.has(evt.type)) return;

  const payload = evt.payload || {};
  const status = lastStatusById.get(evt.id);
  appendResult({ ts: nowIso, terminalId: evt.id, type: evt.type, status, payload });
});

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
app.listen(port, () => {
  console.log(`[eftkey] server listening on :${port}`);
});
