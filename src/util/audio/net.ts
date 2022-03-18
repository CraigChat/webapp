import { decodeText, encodeText } from '..';
import { emit } from '../events';
import { makeLogger } from '../logger';
import {
  ConnectionType,
  DataTypeFlag,
  EnnuicastrId,
  EnnuicastrInfo,
  EnnuicastrParts,
  Feature,
  UserExtraType
} from './protocol';
import ReconnectableWebSocket from './reconnectableWS';

export let pingSock: ReconnectableWebSocket | null = null;
export let dataSock: ReconnectableWebSocket | null = null;
export let monitorSock: ReconnectableWebSocket | null = null;

// Global connection state
export let connected = false;
export let transmitting = false;
export function setTransmitting(to: boolean): void {
  transmitting = to;
  emit('selfTransmitting', to);
}
// Our own ID
export let selfId = 0;
// If we're using FLAC, we get the sample rate to send to the server
let flacInfoBuf: ArrayBuffer | null = null;
export let remoteBeginTime: null | number = null;
export let isContinuous = false;
const logger = makeLogger('net');

// If our data socket is connected, the buffered amount
export function bufferedAmount(): number {
  return dataSock?.sock ? dataSock.sock.bufferedAmount : 0;
}

export interface ConnectOptions {
  url: string;
  token: string;
  username: string;
  continuous?: boolean;
  flac?: boolean;
  onDisconnect: (arg0: CloseEvent) => void;
}

// Connect to the server (our first step)
export async function connect({ url, username, continuous, flac, token, onDisconnect }: ConnectOptions): Promise<void> {
  isContinuous = continuous;
  const nickBuf = encodeText(username);

  // The connection message is largely the same for all, so start with a generic one
  const connMsg = new DataView(new ArrayBuffer(EnnuicastrParts.login.length + nickBuf.length));
  connMsg.setUint32(0, EnnuicastrId.LOGIN, true);
  const flags = (flac ? DataTypeFlag.FLAC : DataTypeFlag.OPUS) | (continuous ? Feature.CONTINUOUS : 0);
  new Uint8Array(connMsg.buffer).set(encodeText(token), EnnuicastrParts.login.token);
  new Uint8Array(connMsg.buffer).set(nickBuf, EnnuicastrParts.login.length);

  connected = true;
  emit('connected', connected);
  logger.log('Connecting...');

  // (1) The ping socket
  pingSock = new ReconnectableWebSocket(url, onDisconnect, async (sock: WebSocket) => {
    const out = new DataView(connMsg.buffer.slice(0));
    out.setUint32(EnnuicastrParts.login.flags, ConnectionType.PING | flags, true);
    sock.send(out.buffer);
    sock.addEventListener('message', onPingSock);
  });

  await pingSock.connect();
  logger.log('Connected to ping socket');

  // (2) The data socket
  dataSock = new ReconnectableWebSocket(url, onDisconnect, async (sock: WebSocket) => {
    const out = new DataView(connMsg.buffer.slice(0));
    out.setUint32(EnnuicastrParts.login.flags, ConnectionType.DATA | flags, true);
    sock.send(out.buffer);
    if (flacInfoBuf) sock.send(flacInfoBuf);
    sock.addEventListener('message', onDataSock);
  });

  await dataSock.connect();
  logger.log('Connected to data socket');
}

// Connect to the server as a monitor
export async function connectMonitor({ url, username, token, onDisconnect }: ConnectOptions): Promise<void> {
  const nickBuf = encodeText(username);
  const connMsg = new DataView(new ArrayBuffer(EnnuicastrParts.login.length + nickBuf.length));
  connMsg.setUint32(0, EnnuicastrId.LOGIN, true);
  connMsg.setUint32(EnnuicastrParts.login.flags, ConnectionType.MONITOR | (DataTypeFlag.OPUS | 0), true);
  new Uint8Array(connMsg.buffer).set(encodeText(token), EnnuicastrParts.login.token);
  new Uint8Array(connMsg.buffer).set(nickBuf, EnnuicastrParts.login.length);

  connected = true;
  emit('connected', connected);
  logger.log('Connecting...');

  monitorSock = new ReconnectableWebSocket(url, onDisconnect, async (sock: WebSocket) => {
    sock.send(connMsg.buffer);
    sock.addEventListener('message', onMonitorSock);
  });

  await monitorSock.connect();
  logger.log('Connected to monitor socket');
}

// Ping the ping socket
export function ping(): void {
  const msg = new DataView(new ArrayBuffer(EnnuicastrParts.ping.length));
  const clientTime = performance.now();
  msg.setUint32(0, EnnuicastrId.PING, true);
  msg.setFloat64(EnnuicastrParts.ping.clientTime, clientTime, true);
  logger.debug('Sending ping with client time:', clientTime);
  pingSock?.send(msg);
}

export function flacInfo(to: ArrayBuffer): void {
  flacInfoBuf = to;
  dataSock?.send(to);
}

// Message from the ping socket
function onPingSock(ev: MessageEvent) {
  const msg = new DataView(ev.data);
  const cmd = msg.getUint32(0, true);

  logger.debug('Got ping message:', cmd, msg);
  switch (cmd) {
    case EnnuicastrId.ACK: {
      const ackd = msg.getUint32(EnnuicastrParts.ack.ackd, true);
      if (ackd === EnnuicastrId.LOGIN) {
        logger.log('Connected to server');
        ping();
      }
      break;
    }

    case EnnuicastrId.PONG: {
      emit('pong', msg);
      logger.debug('Got pong:', msg);
      break;
    }

    default:
      logger.log('Unknown ping command:', cmd, msg);
  }
}

// Message from the data socket
function onDataSock(ev: MessageEvent) {
  const msg = new DataView(ev.data);
  const cmd: EnnuicastrId = msg.getUint32(0, true);

  logger.debug('Got data message:', cmd, msg);
  switch (cmd) {
    case EnnuicastrId.ACK: {
      logger.log('Got ACK from data socket');
      break;
    }

    case EnnuicastrId.NACK: {
      // Just tell the user
      const text = decodeText(msg.buffer.slice(EnnuicastrParts.nack.msg));
      logger.warn('Got nack', text);
      alert(text);
      break;
    }

    case EnnuicastrId.INFO: {
      const p = EnnuicastrParts.info;
      const key = msg.getUint32(p.key, true);
      let val = 0;
      if (msg.byteLength >= p.length) val = msg.getUint32(p.value, true);
      switch (key) {
        case EnnuicastrInfo.ID:
          selfId = val;
          logger.log('Got our ID:', val);
          emit('recId', val);
          break;

        case EnnuicastrInfo.START_TIME:
          remoteBeginTime = msg.getFloat64(p.value, true);
          logger.log('Got remote start time:', remoteBeginTime);
          emit('startTime', remoteBeginTime);
          break;
      }
      break;
    }

    case EnnuicastrId.USER: {
      const key = msg.getUint32(EnnuicastrParts.user.index, true);
      const connected = msg.getUint32(EnnuicastrParts.user.status, true) === 1;
      const nick = decodeText(msg.buffer.slice(EnnuicastrParts.user.nick));
      logger.log('Got user update:', { key, connected, nick });
      emit('user', key, nick, connected);
      break;
    }

    case EnnuicastrId.USER_EXTRA: {
      const key = msg.getUint32(EnnuicastrParts.userExtra.index, true);
      const type: UserExtraType = msg.getUint32(EnnuicastrParts.userExtra.type, true);
      const data = decodeText(msg.buffer.slice(EnnuicastrParts.userExtra.data));
      logger.log('Got user extra:', { key, type, data });
      emit('userExtra', key, type, data);
      break;
    }

    case EnnuicastrId.SPEECH: {
      const key = msg.getUint32(EnnuicastrParts.speech.index, true);
      const speaking = msg.getUint32(EnnuicastrParts.speech.status, true) === 1;
      logger.log('Got speech update:', { key, speaking });
      emit('speech', key, speaking);
      break;
    }

    default:
      logger.log('Unknown data command:', cmd, msg);
  }
}

// Message from the monitor socket
function onMonitorSock(ev: MessageEvent) {
  const msg = new DataView(ev.data);
  const cmd: EnnuicastrId = msg.getUint32(0, true);

  logger.debug('Got data message:', cmd, msg);
  switch (cmd) {
    case EnnuicastrId.ACK: {
      logger.log('Got ACK from monitor socket');
      break;
    }

    case EnnuicastrId.USER: {
      const key = msg.getUint32(EnnuicastrParts.user.index, true);
      const connected = msg.getUint32(EnnuicastrParts.user.status, true) === 1;
      const nick = decodeText(msg.buffer.slice(EnnuicastrParts.user.nick));
      logger.log('Got user update:', { key, connected, nick });
      emit('user', key, nick, connected);
      break;
    }

    case EnnuicastrId.USER_EXTRA: {
      const key = msg.getUint32(EnnuicastrParts.userExtra.index, true);
      const type: UserExtraType = msg.getUint32(EnnuicastrParts.userExtra.type, true);
      const data = decodeText(msg.buffer.slice(EnnuicastrParts.userExtra.data));
      logger.log('Got user extra:', { key, type, data });
      emit('userExtra', key, type, data);
      break;
    }

    case EnnuicastrId.SPEECH: {
      const key = msg.getUint32(EnnuicastrParts.speech.index, true);
      const speaking = msg.getUint32(EnnuicastrParts.speech.status, true) === 1;
      logger.log('Got speech update:', { key, speaking });
      emit('speech', key, speaking);
      break;
    }

    default:
      logger.log('Unknown monitor command:', cmd, msg);
  }
}

export function errorHandler(error: any): void {
  logger.error(error);
  const errBuf = encodeText(`${error}\n\n${navigator.userAgent}`);
  const out = new DataView(new ArrayBuffer(4 + errBuf.length));
  out.setUint32(0, EnnuicastrId.ERROR, true);
  new Uint8Array(out.buffer).set(errBuf, 4);
  dataSock?.send(out.buffer);
}
