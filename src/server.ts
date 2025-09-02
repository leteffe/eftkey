import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import dotenv from 'dotenv';
import { createTerminal, getTerminal, loadPairingFromDisk, savePairingToDisk, subscribeLogs, LogEvent, recreateTerminal } from './paytec';
import { getOrCreateTerminal, pairTerminal, getPairing as getPairingById, listTerminals, subscribeAll } from './terminalManager';

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

// Initialize terminal (load persisted pairing if available)
(async () => {
  await createTerminal();
  const pairing = await loadPairingFromDisk();
  if (pairing) {
    const trm = getTerminal();
    // set existing pairing into the terminal by constructing with it
    // handled in createTerminal via persisted file
    console.log('[eftkey] loaded persisted pairing info');
  }
})();

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.get('/pairing', (_req, res) => {
  try {
    const trm = getTerminal();
    const info = trm.getPairingInfo();
    res.json(info || null);
  } catch (e) {
    res.status(500).json({ error: 'terminal_not_ready' });
  }
});

// Multi-terminal: list known ids (in-memory)
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

// Server-Sent Events: stream logs
app.get('/logs', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // Do not call res.flushHeaders() to avoid ts-node type error; SSE works without it
  const send = (e: LogEvent) => {
    res.write(`event: ${e.type}\n`);
    res.write(`data: ${JSON.stringify(e.payload ?? null)}\n\n`);
  };
  const unsub = subscribeLogs(send);
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
  req.on('close', () => { unsub(); });
});

app.post('/pair', async (req, res) => {
  const { code } = req.body || {};
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'code_required' });
  }
  try {
    const trm = getTerminal();
    // Friendly name as specified
    trm.setOnPairingSucceeded(async () => {
      console.log('[eftkey] pairing succeeded');
      try {
        const data = trm.getPairingInfo();
        await savePairingToDisk(data);
      } catch {}
    });
    trm.setOnPairingFailed(() => {
      console.log('[eftkey] pairing failed');
    });
    try {
      trm.pair(code, 'eftkey POS');
      return res.json({ ok: true });
    } catch (err: any) {
      const msg = String(err && err.stack ? err.stack : err);
      if (msg.includes('tid not found') || msg.includes('unsubscribe') || msg.includes('onmsg')) {
        console.warn('[eftkey] pair encountered SMQ error, recreating terminal and retrying once');
        await recreateTerminal();
        const trm2 = getTerminal();
        trm2.setOnPairingSucceeded(async () => {
          console.log('[eftkey] pairing succeeded (after recreate)');
          try { const data = trm2.getPairingInfo(); await savePairingToDisk(data); } catch {}
        });
        trm2.setOnPairingFailed(() => console.log('[eftkey] pairing failed (after recreate)'));
        trm2.pair(code, 'eftkey POS');
        return res.json({ ok: true, retried: true });
      }
      throw err;
    }
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: 'pair_failed' });
  }
});

// Multi-terminal: pair by id
app.post('/pair/:id', async (req, res) => {
  const { code } = req.body || {};
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: 'id_required' });
  if (!code || typeof code !== 'string') return res.status(400).json({ error: 'code_required' });
  try {
    await pairTerminal(id, code, 'eftkey POS');
    return res.json({ ok: true, id });
  } catch (e) {
    return res.status(500).json({ error: 'pair_failed' });
  }
});

// Activate terminal (some terminals require activation before trx)
app.post('/activate', (_req, res) => {
  try {
    const trm: any = getTerminal();
    trm.setOnActivationSucceeded(() => console.log('[eftkey] activation succeeded'));
    trm.setOnActivationFailed(() => console.log('[eftkey] activation failed'));
    trm.activate();
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'activate_failed' });
  }
});

// Multi-terminal: activate by id
app.post('/activate/:id', async (req, res) => {
  try {
    const trm: any = await getOrCreateTerminal(req.params.id);
    trm.setOnActivationSucceeded?.(() => console.log(`[eftkey] activation succeeded id=${req.params.id}`));
    trm.setOnActivationFailed?.(() => console.log(`[eftkey] activation failed id=${req.params.id}`));
    trm.activate?.();
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'activate_failed' });
  }
});

// Start ACCOUNT_VERIFICATION transaction
app.post('/transaction/account-verification', (req, res) => {
  try {
    const trm: any = getTerminal();
    const payload: any = { TrxFunction: trm.TransactionFunctions.ACCOUNT_VERIFICATION };
    if (req.body && req.body.RecOrderRef) {
      payload.RecOrderRef = req.body.RecOrderRef;
    }
    trm.startTransaction(payload);
    return res.json({ ok: true, started: 'ACCOUNT_VERIFICATION' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'start_failed' });
  }
});

// Multi-terminal: AV by id
app.post('/transaction/:id/account-verification', async (req, res) => {
  try {
    const trm: any = await getOrCreateTerminal(req.params.id);
    const payload: any = { TrxFunction: trm.TransactionFunctions.ACCOUNT_VERIFICATION };
    if (req.body && req.body.RecOrderRef) payload.RecOrderRef = req.body.RecOrderRef;
    trm.startTransaction(payload);
    return res.json({ ok: true, id: req.params.id, started: 'ACCOUNT_VERIFICATION' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'start_failed' });
  }
});

// Start PURCHASE transaction
app.post('/transaction/purchase', (req, res) => {
  try {
    const trm: any = getTerminal();
    const { AmtAuth, TrxCurrC = 756, RecOrderRef } = req.body || {};
    if (typeof AmtAuth !== 'number' || AmtAuth <= 0) {
      return res.status(400).json({ error: 'AmtAuth_required_minor_units' });
    }
    const payload: any = {
      TrxFunction: trm.TransactionFunctions.PURCHASE,
      TrxCurrC,
      AmtAuth,
    };
    if (RecOrderRef) payload.RecOrderRef = RecOrderRef;
    trm.startTransaction(payload);
    return res.json({ ok: true, started: 'PURCHASE' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'start_failed' });
  }
});

// Multi-terminal: PURCHASE by id
app.post('/transaction/:id/purchase', async (req, res) => {
  try {
    const trm: any = await getOrCreateTerminal(req.params.id);
    const { AmtAuth, TrxCurrC = 756, RecOrderRef } = req.body || {};
    if (typeof AmtAuth !== 'number' || AmtAuth <= 0) {
      return res.status(400).json({ error: 'AmtAuth_required_minor_units' });
    }
    const payload: any = { TrxFunction: trm.TransactionFunctions.PURCHASE, TrxCurrC, AmtAuth };
    if (RecOrderRef) payload.RecOrderRef = RecOrderRef;
    trm.startTransaction(payload);
    return res.json({ ok: true, id: req.params.id, started: 'PURCHASE' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'start_failed' });
  }
});

// Loop mode control
let loopEnabled = false;
let loopDelayMs = 2000;
let loopPending = false;
let lastStatus = 0;
let cooldownUntil = 0;

app.get('/loop', (_req, res) => {
  res.json({ enabled: loopEnabled, delayMs: loopDelayMs });
});

app.post('/loop', (req, res) => {
  const { enabled, delayMs } = req.body || {};
  if (enabled !== undefined) loopEnabled = !!enabled;
  if (delayMs !== undefined) loopDelayMs = Math.max(0, parseInt(delayMs, 10) || 0);
  return res.json({ ok: true, enabled: loopEnabled, delayMs: loopDelayMs });
});

// Auto-retrigger ACCOUNT_VERIFICATION after receipt
subscribeLogs((evt) => {
  const now = Date.now();
  if (evt.type === 'status' && evt.payload && typeof evt.payload.TrmStatus === 'number') {
    lastStatus = evt.payload.TrmStatus;
    const SHIFT_OPEN = 0x00000001;
    const BUSY = 0x00000004;
    const ready = (lastStatus & SHIFT_OPEN) && !(lastStatus & BUSY);
    if (loopEnabled && loopPending && ready && now >= cooldownUntil) {
      cooldownUntil = now + Math.max(500, loopDelayMs);
      loopPending = false;
      setTimeout(() => {
        try {
          const trm: any = getTerminal();
          trm.startTransaction({ TrxFunction: trm.TransactionFunctions.ACCOUNT_VERIFICATION, RecOrderRef: { OrderID: 'Loop-AV' } });
          console.log('[eftkey] auto loop: ACCOUNT_VERIFICATION started');
        } catch (e) {
          console.error('[eftkey] auto loop failed', e);
        }
      }, loopDelayMs);
    }
  }

  if (!loopEnabled) return;
  // Mark pending when finishing an AV (receipt or approved), actual send waits for ready status
  if (evt.type === 'receipt' && evt.payload && typeof evt.payload.text === 'string') {
    const text = evt.payload.text || '';
    if (text.includes('Account Verification') || text.includes('ACCOUNT VERIFICATION')) {
      loopPending = true;
    }
  }
  if (evt.type === 'transactionApproved' && evt.payload && typeof evt.payload.TrxFunction === 'number') {
    try {
      const trm: any = getTerminal();
      if (evt.payload.TrxFunction === trm.TransactionFunctions.ACCOUNT_VERIFICATION) {
        loopPending = true;
      }
    } catch {}
  }
  // Keep loop on declined/aborted/timeouts for ACCOUNT_VERIFICATION
  if (evt.type === 'transactionDeclined' && evt.payload && typeof evt.payload.TrxFunction === 'number') {
    try {
      const trm: any = getTerminal();
      if (evt.payload.TrxFunction === trm.TransactionFunctions.ACCOUNT_VERIFICATION) {
        loopPending = true;
      }
    } catch {}
  }
  if (evt.type === 'transactionAborted' && evt.payload && typeof evt.payload.TrxFunction === 'number') {
    try {
      const trm: any = getTerminal();
      if (evt.payload.TrxFunction === trm.TransactionFunctions.ACCOUNT_VERIFICATION) {
        loopPending = true;
      }
    } catch {}
  }
  if (evt.type === 'transactionTimedOut' && evt.payload && typeof evt.payload.TrxFunction === 'number') {
    try {
      const trm: any = getTerminal();
      if (evt.payload.TrxFunction === trm.TransactionFunctions.ACCOUNT_VERIFICATION) {
        loopPending = true;
      }
    } catch {}
  }
});

// Persist ONLY outcome events (approved/declined/aborted/timed out/confirmation)
const resultsFile = path.resolve(process.cwd(), '.data', 'transactions.ndjson');
async function appendResult(entry: any) {
  try {
    await fs.mkdir(path.dirname(resultsFile), { recursive: true });
    await fs.appendFile(resultsFile, JSON.stringify(entry) + '\n', 'utf8');
  } catch (e) {
    console.error('[eftkey] failed to write result', e);
  }
}

subscribeLogs((evt) => {
  const nowIso = new Date().toISOString();
  const outcomeTypes = new Set([
    'transactionApproved',
    'transactionDeclined',
    'transactionAborted',
    'transactionTimedOut',
    'transactionConfirmationSucceeded',
    'transactionConfirmationFailed',
  ]);
  if (!outcomeTypes.has(evt.type)) return;

  const payload = evt.payload || {};
  appendResult({ ts: nowIso, type: evt.type, status: lastStatus, payload });
});

// Per-terminal PURCHASE loop
type PurchaseLoopCfg = { enabled: boolean; amount: number; curr: number; delayMs: number; pending: boolean; lastStatus: number; cooldownUntil: number };
const purchaseLoop = new Map<string, PurchaseLoopCfg>();

app.get('/loop/:id/purchase', (req, res) => {
  const id = req.params.id;
  const cfg = purchaseLoop.get(id) || { enabled: false, amount: 0, curr: 756, delayMs: 2000, pending: false, lastStatus: 0, cooldownUntil: 0 };
  res.json({ enabled: cfg.enabled, amount: cfg.amount, TrxCurrC: cfg.curr, delayMs: cfg.delayMs });
});

app.post('/loop/:id/purchase', (req, res) => {
  const id = req.params.id;
  const { enabled, amount, TrxCurrC, delayMs } = req.body || {};
  const prev = purchaseLoop.get(id) || { enabled: false, amount: 0, curr: 756, delayMs: 2000, pending: false, lastStatus: 0, cooldownUntil: 0 };
  const next: PurchaseLoopCfg = {
    enabled: enabled !== undefined ? !!enabled : prev.enabled,
    amount: typeof amount === 'number' && amount > 0 ? amount : prev.amount,
    curr: typeof TrxCurrC === 'number' ? TrxCurrC : prev.curr,
    delayMs: typeof delayMs === 'number' && delayMs >= 0 ? delayMs : prev.delayMs,
    pending: prev.pending,
    lastStatus: prev.lastStatus,
    cooldownUntil: prev.cooldownUntil,
  };
  purchaseLoop.set(id, next);
  return res.json({ ok: true, id, enabled: next.enabled, amount: next.amount, TrxCurrC: next.curr, delayMs: next.delayMs });
});

// Drive per-id purchase loop via id-tagged events
subscribeAll(async (evt) => {
  const cfg = purchaseLoop.get(evt.id);
  if (!cfg) return;
  const now = Date.now();
  if (evt.type === 'status' && evt.payload && typeof evt.payload.TrmStatus === 'number') {
    cfg.lastStatus = evt.payload.TrmStatus;
    const SHIFT_OPEN = 0x00000001;
    const BUSY = 0x00000004;
    const ready = (cfg.lastStatus & SHIFT_OPEN) && !(cfg.lastStatus & BUSY);
    if (cfg.enabled && cfg.pending && ready && now >= cfg.cooldownUntil && cfg.amount > 0) {
      cfg.cooldownUntil = now + Math.max(500, cfg.delayMs);
      cfg.pending = false;
      setTimeout(async () => {
        try {
          const trm: any = await getOrCreateTerminal(evt.id);
          trm.startTransaction({ TrxFunction: trm.TransactionFunctions.PURCHASE, TrxCurrC: cfg.curr, AmtAuth: cfg.amount, RecOrderRef: { OrderID: `Loop-P-${Date.now()}` } });
          console.log(`[eftkey] auto loop purchase: id=${evt.id} amount=${cfg.amount}`);
        } catch (e) {
          console.error('[eftkey] auto loop purchase failed', e);
        }
      }, cfg.delayMs);
    }
  }
  if (!cfg.enabled) return;
  const outcomeTypes = new Set(['transactionApproved','transactionDeclined','transactionAborted','transactionTimedOut']);
  if (outcomeTypes.has(evt.type) && evt.payload && typeof evt.payload.TrxFunction === 'number') {
    try {
      const trm: any = await getOrCreateTerminal(evt.id);
      if (evt.payload.TrxFunction === trm.TransactionFunctions.PURCHASE) {
        cfg.pending = true;
      }
    } catch {}
  }
});

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
app.listen(port, () => {
  console.log(`[eftkey] server listening on :${port}`);
});
