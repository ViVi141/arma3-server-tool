// BattlEye RCon Protocol Specification v2 (battleye.com, 2011).
//
// Every packet (both directions) carries a 7-byte header:
//   'B'(0x42) 'E'(0x45) | 4-byte CRC32 (LE) of the subsequent bytes | 0xFF
// "Subsequent bytes" = the 0xFF separator byte + the payload, so the checksum
// is computed over [0xFF, ...payload].
//
// Packet types (first payload byte):
//   0x00 login / login-response
//   0x01 command / command-response
//   0x02 server-message / server-message-ack
// Transport is UDP (the game server's network interface / game port).

export const HEADER_MAGIC_0 = 0x42; // 'B'
export const HEADER_MAGIC_1 = 0x45; // 'E'
export const SEPARATOR_BYTE = 0xff;

export const PKT_LOGIN = 0x00;
export const PKT_COMMAND = 0x01;
export const PKT_SERVER_MESSAGE = 0x02;

/** Keep backwards-compatible named exports used elsewhere. */
export const COMMAND_LOGIN = PKT_LOGIN;
export const COMMAND_COMMAND = PKT_COMMAND;
export const RESPONSE_SERVER_MESSAGE = PKT_SERVER_MESSAGE;

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Wrap a payload into a full BE RCon packet (header + CRC over [0xFF+payload]). */
function buildPacket(payload: Uint8Array): Uint8Array {
  const crcInput = new Uint8Array(1 + payload.length);
  crcInput[0] = SEPARATOR_BYTE;
  crcInput.set(payload, 1);
  const checksum = crc32(crcInput);

  const out = new Uint8Array(7 + payload.length);
  out[0] = HEADER_MAGIC_0;
  out[1] = HEADER_MAGIC_1;
  out[2] = checksum & 0xff;
  out[3] = (checksum >>> 8) & 0xff;
  out[4] = (checksum >>> 16) & 0xff;
  out[5] = (checksum >>> 24) & 0xff;
  out[6] = SEPARATOR_BYTE;
  out.set(payload, 7);
  return out;
}

/** Login request: payload = 0x00 | password(ASCII, no NUL). */
export function encodeLoginRequest(password: string): Uint8Array {
  const pwd = new TextEncoder().encode(password);
  const payload = new Uint8Array(1 + pwd.length);
  payload[0] = PKT_LOGIN;
  payload.set(pwd, 1);
  return buildPacket(payload);
}

/** Command request: payload = 0x01 | seq(1) | command(ASCII, no NUL). */
export function encodeCommandRequest(seq: number, command: string): Uint8Array {
  const cmd = new TextEncoder().encode(command);
  const payload = new Uint8Array(2 + cmd.length);
  payload[0] = PKT_COMMAND;
  payload[1] = seq & 0xff;
  payload.set(cmd, 2);
  return buildPacket(payload);
}

/** Server-message ack: payload = 0x02 | seq(1). */
export function encodeServerMessageAck(seq: number): Uint8Array {
  const payload = new Uint8Array([PKT_SERVER_MESSAGE, seq & 0xff]);
  return buildPacket(payload);
}

/**
 * @deprecated kept for any external callers; login no longer uses a 0x01 marker.
 */
export function encodeLoginPacket(password: string): Uint8Array {
  return encodeLoginRequest(password);
}

/**
 * @deprecated prefer encodeCommandRequest (correct 0x01 type byte).
 */
export function encodeCommandPacket(sequence: number, command: string): Uint8Array {
  return encodeCommandRequest(sequence, command);
}

export type DecodedKind =
  | "loginResponse"
  | "commandResponse"
  | "serverMessage"
  | "unknown";

export interface DecodedPacket {
  kind: DecodedKind;
  seq: number;
  message: string;
  /** Only for loginResponse: true when the server accepted the password. */
  loginOk?: boolean;
  /** Present when the server split a large response across packets. */
  fragCount?: number;
  fragIndex?: number;
  checksumValid: boolean;
}

function decodeText(bytes: Uint8Array): string {
  // BE payloads are ASCII/Latin-1 but may embed UTF-8 names; strip NUL padding
  // and decode leniently.
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0x00) {
    end -= 1;
  }
  const slice = bytes.subarray(0, end);
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(slice);
  } catch {
    return Buffer.from(slice).toString("latin1");
  }
}

/** Parse a full BE RCon datagram. Returns null if it is not a BE packet. */
export function decodePacket(data: Uint8Array): DecodedPacket | null {
  // header(7) + at least 1 payload byte
  if (data.length < 8) {
    return null;
  }
  if (data[0] !== HEADER_MAGIC_0 || data[1] !== HEADER_MAGIC_1) {
    return null;
  }
  if (data[6] !== SEPARATOR_BYTE) {
    return null;
  }

  const stored =
    ((data[5] << 24) | (data[4] << 16) | (data[3] << 8) | data[2]) >>> 0;
  // CRC covers [0xFF separator + payload] = bytes from index 6 to the end.
  const checksumValid = crc32(data.subarray(6)) === stored;

  const msgType = data[7];
  if (msgType === PKT_LOGIN) {
    const loginOk = data.length >= 9 ? data[8] === 0x01 : false;
    return { kind: "loginResponse", seq: 0, message: "", loginOk, checksumValid };
  }

  if (msgType === PKT_COMMAND) {
    const seq = data.length >= 9 ? data[8] : 0;
    let idx = 9;
    let fragCount: number | undefined;
    let fragIndex: number | undefined;
    // Optional fragmentation header: 0x00 | packetCount | zeroBasedIndex
    if (data.length >= idx + 3 && data[idx] === 0x00) {
      fragCount = data[idx + 1];
      fragIndex = data[idx + 2];
      idx += 3;
    }
    return {
      kind: "commandResponse",
      seq,
      message: decodeText(data.subarray(idx)),
      fragCount,
      fragIndex,
      checksumValid,
    };
  }

  if (msgType === PKT_SERVER_MESSAGE) {
    const seq = data.length >= 9 ? data[8] : 0;
    return {
      kind: "serverMessage",
      seq,
      message: decodeText(data.subarray(9)),
      checksumValid,
    };
  }

  return {
    kind: "unknown",
    seq: 0,
    message: decodeText(data.subarray(8)),
    checksumValid,
  };
}

/**
 * @deprecated use decodePacket; retained so old round-trip tests still import.
 */
export function parsePacket(
  data: Uint8Array
): { type: number; payload: Uint8Array } | null {
  if (data.length < 7) {
    return null;
  }
  if (data[0] !== HEADER_MAGIC_0 || data[1] !== HEADER_MAGIC_1) {
    return null;
  }
  const separator = data[6];
  const payload = data.slice(7);
  return { type: separator, payload };
}
