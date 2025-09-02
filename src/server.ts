import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createTerminal, getTerminal, loadPairingFromDisk, savePairingToDisk, subscribeLogs, LogEvent } from './paytec';

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

// Server-Sent Events: stream logs
app.get('/logs', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (e: LogEvent) => {
    res.write(`event: ${e.type}\n`);
    res.write(`data: ${JSON.stringify(e.payload ?? null)}\n\n`);
  };
  const unsub = subscribeLogs(send);
  req.on('close', () => {
    unsub();
  });
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
    trm.pair(code, 'eftkey POS');
    return res.json({ ok: true });
  } catch (e: any) {
    console.error(e);
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

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
app.listen(port, () => {
  console.log(`[eftkey] server listening on :${port}`);
});
