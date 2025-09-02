import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';

type PairingInfo = any;

export type TerminalApi = {
  pair: (code: string, name: string, params?: Record<string, any>) => void;
  getPairingInfo: () => PairingInfo | undefined;
  startTransaction: (payload: any) => void;
  activate?: () => void;
  TransactionFunctions?: any;
  setOnConnected?: (cb: () => void) => void;
  setOnDisconnected?: (cb: () => void) => void;
  setOnStatusChanged?: (cb: (rsp: any) => void) => void;
  setOnMessageSent?: (cb: (message: any, peerPTID?: any) => void) => void;
  setOnMessageReceived?: (cb: (message: any, ptid?: any, tid?: any, subtid?: any) => boolean) => void;
  setOnError?: (cb: (msg: string) => void) => void;
  setOnActivationSucceeded?: (cb: () => void) => void;
  setOnActivationFailed?: (cb: () => void) => void;
  setOnReceipt?: (cb: (type: number, text: string) => void) => void;
  setOnTransactionApproved?: (cb: (rsp: any) => void) => void;
  setOnTransactionDeclined?: (cb: (rsp: any) => void) => void;
  setOnTransactionAborted?: (cb: (rsp: any) => void) => void;
  setOnTransactionTimedOut?: (cb: (rsp: any) => void) => void;
  setOnTransactionConfirmationSucceeded?: (cb: (rsp?: any) => void) => void;
  setOnTransactionConfirmationFailed?: (cb: (rsp?: any) => void) => void;
};

export type LogEvent = { id: string; type: string; payload?: any };
type Subscriber = (e: LogEvent) => void;

const subscribers = new Set<Subscriber>();
export function subscribeAll(cb: Subscriber): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

function emit(id: string, type: string, payload?: any) {
  const evt: LogEvent = { id, type, payload };
  for (const cb of subscribers) {
    try { cb(evt); } catch {}
  }
}

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), '.data');
const PAIR_DIR = path.join(DATA_DIR, 'pairings');

async function loadPairing(id: string): Promise<PairingInfo | undefined> {
  try {
    const f = path.join(PAIR_DIR, `${id}.json`);
    const buf = await fs.readFile(f, 'utf8');
    return JSON.parse(buf) || undefined;
  } catch {
    return undefined;
  }
}

async function savePairing(id: string, data: PairingInfo): Promise<void> {
  await fs.mkdir(PAIR_DIR, { recursive: true });
  const f = path.join(PAIR_DIR, `${id}.json`);
  await fs.writeFile(f, JSON.stringify(data, null, 2), 'utf8');
}

type Entry = { id: string; trm: TerminalApi };
const registry = new Map<string, Entry>();

function wireLogs(id: string, trm: any) {
  trm.setOnConnected && trm.setOnConnected(() => emit(id, 'connected'));
  trm.setOnDisconnected && trm.setOnDisconnected(() => emit(id, 'disconnected'));
  trm.setOnStatusChanged && trm.setOnStatusChanged((rsp: any) => emit(id, 'status', rsp));
  trm.setOnMessageSent && trm.setOnMessageSent((message: any, peerPTID?: any) => emit(id, 'messageSent', { message, peerPTID }));
  trm.setOnMessageReceived && trm.setOnMessageReceived((message: any, ptid?: any, tid?: any, subtid?: any) => { emit(id, 'messageReceived', { message, ptid, tid, subtid }); return false; });
  trm.setOnError && trm.setOnError((msg: string) => emit(id, 'error', msg));
  trm.setOnActivationSucceeded && trm.setOnActivationSucceeded(() => emit(id, 'activationSucceeded'));
  trm.setOnActivationFailed && trm.setOnActivationFailed(() => emit(id, 'activationFailed'));
  trm.setOnTransactionApproved && trm.setOnTransactionApproved((rsp: any) => emit(id, 'transactionApproved', rsp));
  trm.setOnTransactionDeclined && trm.setOnTransactionDeclined((rsp: any) => emit(id, 'transactionDeclined', rsp));
  trm.setOnTransactionAborted && trm.setOnTransactionAborted((rsp: any) => emit(id, 'transactionAborted', rsp));
  trm.setOnTransactionTimedOut && trm.setOnTransactionTimedOut((rsp: any) => emit(id, 'transactionTimedOut', rsp));
  trm.setOnTransactionConfirmationSucceeded && trm.setOnTransactionConfirmationSucceeded((rsp?: any) => emit(id, 'transactionConfirmationSucceeded', rsp));
  trm.setOnTransactionConfirmationFailed && trm.setOnTransactionConfirmationFailed((rsp?: any) => emit(id, 'transactionConfirmationFailed', rsp));
  trm.setOnReceipt && trm.setOnReceipt((type: number, text: string) => emit(id, 'receipt', { type, text }));
}

export async function getOrCreateTerminal(id: string): Promise<TerminalApi> {
  if (registry.has(id)) return registry.get(id)!.trm;
  if (!existsSync(DATA_DIR)) await fs.mkdir(DATA_DIR, { recursive: true });

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ecritf = require('ecritf');
  const POSTerminal = ecritf.default || ecritf;

  const pairing = await loadPairing(id);
  const trm: TerminalApi = new POSTerminal(pairing, {
    AutoConnect: true,
    AutoReconnect: true,
    HeartbeatInterval: 15000,
    HeartbeatTimeout: 30000,
    ConnectionTimeout: 60000,
    DefaultTimeout: 45000,
    TransactionTimeout: 90000,
  });
  wireLogs(id, trm as any);
  registry.set(id, { id, trm });
  return trm;
}

export async function pairTerminal(id: string, code: string, friendlyName = 'eftkey POS'): Promise<void> {
  const trm = await getOrCreateTerminal(id);
  await new Promise<void>((resolve, reject) => {
    (trm as any).setOnPairingSucceeded?.(async () => {
      try { const data = trm.getPairingInfo(); await savePairing(id, data); } catch {}
      emit(id, 'pairingSucceeded');
      resolve();
    });
    (trm as any).setOnPairingFailed?.(() => { emit(id, 'pairingFailed'); reject(new Error('pair_failed')); });
    try { trm.pair(code, friendlyName); } catch (e) { reject(e); }
  });
}

export function listTerminals(): string[] {
  return Array.from(registry.keys());
}

export async function getPairing(id: string): Promise<PairingInfo | null> {
  const trm = await getOrCreateTerminal(id);
  return trm.getPairingInfo() || null;
}

export function withTerminal<T>(id: string, fn: (trm: TerminalApi) => T): Promise<T> | T {
  return getOrCreateTerminal(id).then(fn);
}

// Terminal state management for loops
export type TerminalState = {
  loopAVEnabled: boolean;
  loopAVDelayMs: number;
  loopAVPending: boolean;
  loopPurchaseEnabled: boolean;
  loopPurchaseAmount: number;
  loopPurchaseTrxCurrC: number;
  loopPurchaseDelayMs: number;
  loopPurchasePending: boolean;
  lastStatus: number;
  cooldownUntil: number;
};

const terminalStates = new Map<string, TerminalState>();

export function getTerminalState(id: string): TerminalState | undefined {
  if (!terminalStates.has(id)) {
    terminalStates.set(id, {
      loopAVEnabled: false,
      loopAVDelayMs: 2000,
      loopAVPending: false,
      loopPurchaseEnabled: false,
      loopPurchaseAmount: 150,
      loopPurchaseTrxCurrC: 756,
      loopPurchaseDelayMs: 2000,
      loopPurchasePending: false,
      lastStatus: 0,
      cooldownUntil: 0,
    });
  }
  return terminalStates.get(id);
}


