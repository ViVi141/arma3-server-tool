// BattlEye RCon V2 packet encoding/decoding
// Based on the C# bytextdigital implementation

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

export interface PacketHeader {
  readonly signature: string; // "BE"
  readonly checksum: number;  // CRC32
  readonly type: number;      // 0xFF separator
}

export function encodePacket(type: number, payload: Uint8Array): Uint8Array {
  const checksumContent = new Uint8Array(1 + payload.length);
  checksumContent[0] = type;
  checksumContent.set(payload, 1);

  const checksum = crc32(checksumContent);

  const buf = new Uint8Array(2 + 4 + 1 + payload.length);
  buf[0] = 0x42; // 'B'
  buf[1] = 0x45; // 'E'
  // CRC32 in little-endian
  buf[2] = (checksum >>> 0) & 0xff;
  buf[3] = (checksum >>> 8) & 0xff;
  buf[4] = (checksum >>> 16) & 0xff;
  buf[5] = (checksum >>> 24) & 0xff;
  buf[6] = type;
  buf.set(payload, 7);

  return buf;
}

export function encodeLoginPacket(password: string): Uint8Array {
  const pwdBytes = new TextEncoder().encode(password);
  const payload = new Uint8Array(1 + pwdBytes.length);
  payload[0] = 0x01; // login type
  payload.set(pwdBytes, 1);
  return encodePacket(0xff, payload);
}

export function encodeCommandPacket(sequence: number, command: string): Uint8Array {
  const cmdBytes = new TextEncoder().encode(command);
  const payload = new Uint8Array(2 + cmdBytes.length);
  payload[0] = 0x02; // command type
  payload[1] = sequence;
  payload.set(cmdBytes, 2);
  return encodePacket(0xff, payload);
}

export function parsePacket(data: Uint8Array): { type: number; payload: Uint8Array } | null {
  if (data.length < 7) return null;
  if (data[0] !== 0x42 || data[1] !== 0x45) return null; // "BE"

  const receivedChecksum =
    (data[2]) |
    (data[3] << 8) |
    (data[4] << 16) |
    (data[5] << 24) >>> 0;

  const separator = data[6];
  const payload = data.slice(7);

  // Verify CRC32
  const checksumContent = new Uint8Array(1 + payload.length);
  checksumContent[0] = separator;
  checksumContent.set(payload, 1);

  const computed = crc32(checksumContent);

  return { type: separator, payload };
}

export const COMMAND_LOGIN = 0x01;
export const COMMAND_COMMAND = 0x02;
export const RESPONSE_SERVER_MESSAGE = 0x01;
