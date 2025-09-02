import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';

// Load local ecritf library (CommonJS), importable via require from compiled JS
// We will import dynamically in JS runtime; in TS we declare minimal types.

type PairingInfo = any;

type Terminal = {
  pair: (code: string, name: string, params?: Record<string, any>) => void;
  getPairingInfo: () => PairingInfo | undefined;
  setOnPairingSucceeded: (cb: () => void) => void;
  setOnPairingFailed: (cb: () => void) => void;
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
  activate?: () => void;
};

let terminalSingleton: Terminal | null = null;

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), '.data');
const PAIRING_FILE = path.join(DATA_DIR, 'pairing.json');

export type LogEvent = { type: string; payload?: any };
type LogSubscriber = (e: LogEvent) => void;
const logSubscribers = new Set<LogSubscriber>();

function emit(type: string, payload?: any) {
  const evt: LogEvent = { type, payload };
  for (const cb of logSubscribers) {
    try { cb(evt); } catch {}
  }
}

export function subscribeLogs(cb: LogSubscriber): () => void {
  logSubscribers.add(cb);
  return () => logSubscribers.delete(cb);
}

export async function createTerminal(): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }

  // Import the local library via require of built JS. It uses ES export default.
  // We'll load from the local repo path.
  const ecritfRoot = path.resolve(process.cwd(), 'ecritf-main');
  const libPath = path.join(ecritfRoot, 'ecritf.js');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ecritf = require(libPath);
  const POSTerminal = ecritf.default;

  let pairing: PairingInfo | undefined = undefined;
  try {
    pairing = await loadPairingFromDisk();
  } catch {}

  terminalSingleton = new POSTerminal(pairing, {
    AutoConnect: true,
    AutoReconnect: true,
    HeartbeatInterval: 15000,
    HeartbeatTimeout: 30000,
    ConnectionTimeout: 60000,
    DefaultTimeout: 45000,
    TransactionTimeout: 90000,
  });

  // Wire log callbacks
  const trm: any = terminalSingleton as any;
  trm.setOnConnected && trm.setOnConnected(() => emit('connected'));
  trm.setOnDisconnected && trm.setOnDisconnected(() => emit('disconnected'));
  trm.setOnPairingSucceeded(() => emit('pairingSucceeded'));
  trm.setOnPairingFailed(() => emit('pairingFailed'));
  trm.setOnStatusChanged && trm.setOnStatusChanged((rsp: any) => emit('status', rsp));
  trm.setOnMessageSent && trm.setOnMessageSent((message: any, peerPTID?: any) => emit('messageSent', { message, peerPTID }));
  trm.setOnMessageReceived && trm.setOnMessageReceived((message: any, ptid?: any, tid?: any, subtid?: any) => { emit('messageReceived', { message, ptid, tid, subtid }); return false; });
  trm.setOnError && trm.setOnError((msg: string) => emit('error', msg));
  trm.setOnActivationSucceeded && trm.setOnActivationSucceeded(() => emit('activationSucceeded'));
  trm.setOnActivationFailed && trm.setOnActivationFailed(() => emit('activationFailed'));
  trm.setOnTransactionApproved && trm.setOnTransactionApproved((rsp: any) => emit('transactionApproved', rsp));
  trm.setOnTransactionDeclined && trm.setOnTransactionDeclined((rsp: any) => emit('transactionDeclined', rsp));
  trm.setOnTransactionAborted && trm.setOnTransactionAborted((rsp: any) => emit('transactionAborted', rsp));
  trm.setOnTransactionTimedOut && trm.setOnTransactionTimedOut((rsp: any) => emit('transactionTimedOut', rsp));
  trm.setOnTransactionConfirmationSucceeded && trm.setOnTransactionConfirmationSucceeded((rsp?: any) => emit('transactionConfirmationSucceeded', rsp));
  trm.setOnTransactionConfirmationFailed && trm.setOnTransactionConfirmationFailed((rsp?: any) => emit('transactionConfirmationFailed', rsp));
  trm.setOnReceipt && trm.setOnReceipt((type: number, text: string) => emit('receipt', { type, text }));
}

export function getTerminal(): Terminal {
  if (!terminalSingleton) {
    throw new Error('terminal_not_initialized');
  }
  return terminalSingleton;
}

export async function loadPairingFromDisk(): Promise<PairingInfo | undefined> {
  try {
    const buf = await fs.readFile(PAIRING_FILE, 'utf8');
    const json = JSON.parse(buf);
    return json || undefined;
  } catch (e) {
    return undefined;
  }
}

export async function savePairingToDisk(data: PairingInfo): Promise<void> {
  await fs.writeFile(PAIRING_FILE, JSON.stringify(data, null, 2), 'utf8');
}
