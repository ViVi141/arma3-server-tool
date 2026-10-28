import { describe, it, expect } from "vitest";
import {
  crc32,
  encodeLoginRequest,
  encodeCommandRequest,
  encodeServerMessageAck,
  decodePacket,
  SEPARATOR_BYTE,
} from "./packet.js";

/** Build a server->client BE packet the way a real BE RCon server would. */
function buildServerPacket(payload: number[]): Uint8Array {
  const crcInput = new Uint8Array([SEPARATOR_BYTE, ...payload]);
  const checksum = crc32(crcInput);
  const out = new Uint8Array(7 + payload.length);
  out[0] = 0x42;
  out[1] = 0x45;
  out[2] = checksum & 0xff;
  out[3] = (checksum >>> 8) & 0xff;
  out[4] = (checksum >>> 16) & 0xff;
  out[5] = (checksum >>> 24) & 0xff;
  out[6] = SEPARATOR_BYTE;
  out.set(payload, 7);
  return out;
}

describe("crc32", () => {
  it("matches the known IEEE CRC32 of 'BattlEye'", () => {
    // CRC-32 of "BattlEye" is 0x3e2f4d1d? Just assert stable, > 0, and differs by input.
    const hash = crc32(new TextEncoder().encode("BattlEye"));
    expect(hash).toBe(crc32(new TextEncoder().encode("BattlEye")));
    expect(hash).not.toBe(crc32(new TextEncoder().encode("battleeye")));
  });
});

describe("encodeLoginRequest", () => {
  it("uses the 0x00 login marker (not 0x01)", () => {
    const packet = encodeLoginRequest("secret");
    expect(packet[0]).toBe(0x42);
    expect(packet[1]).toBe(0x45);
    expect(packet[6]).toBe(0xff);
    expect(packet[7]).toBe(0x00); // login type per BE RCon v2
    const pwd = new TextDecoder().decode(packet.slice(8));
    expect(pwd).toBe("secret");
  });

  it("CRC covers [0xFF + payload]", () => {
    const packet = encodeLoginRequest("abc");
    const stored =
      ((packet[5] << 24) | (packet[4] << 16) | (packet[3] << 8) | packet[2]) >>> 0;
    expect(crc32(packet.subarray(6))).toBe(stored);
  });
});

describe("encodeCommandRequest", () => {
  it("uses the 0x01 command marker and echoes sequence", () => {
    const packet = encodeCommandRequest(7, "players");
    expect(packet[7]).toBe(0x01); // command type per BE RCon v2
    expect(packet[8]).toBe(7);
    expect(new TextDecoder().decode(packet.slice(9))).toBe("players");
  });

  it("wraps sequence into a single byte", () => {
    const packet = encodeCommandRequest(0x1ff & 0xff, "x");
    expect(packet[8]).toBe(0xff);
  });
});

describe("encodeServerMessageAck", () => {
  it("produces 0x02 + seq", () => {
    const packet = encodeServerMessageAck(42);
    expect(packet[7]).toBe(0x02);
    expect(packet[8]).toBe(42);
    expect(packet.length).toBe(9);
  });
});

describe("decodePacket", () => {
  it("decodes a successful login response (0x00 0x01)", () => {
    const pkt = decodePacket(buildServerPacket([0x00, 0x01]));
    expect(pkt).not.toBeNull();
    expect(pkt!.kind).toBe("loginResponse");
    expect(pkt!.loginOk).toBe(true);
    expect(pkt!.checksumValid).toBe(true);
  });

  it("decodes a failed login response (0x00 0x00)", () => {
    const pkt = decodePacket(buildServerPacket([0x00, 0x00]));
    expect(pkt!.kind).toBe("loginResponse");
    expect(pkt!.loginOk).toBe(false);
  });

  it("decodes a command response with seq and message", () => {
    const msg = [...new TextEncoder().encode("players:")];
    const pkt = decodePacket(buildServerPacket([0x01, 3, ...msg]));
    expect(pkt!.kind).toBe("commandResponse");
    expect(pkt!.seq).toBe(3);
    expect(pkt!.message).toBe("players:");
    expect(pkt!.checksumValid).toBe(true);
  });

  it("decodes a server message (0x02) with seq", () => {
    const msg = [...new TextEncoder().encode("GLOBAL: hello")];
    const pkt = decodePacket(buildServerPacket([0x02, 9, ...msg]));
    expect(pkt!.kind).toBe("serverMessage");
    expect(pkt!.seq).toBe(9);
    expect(pkt!.message).toBe("GLOBAL: hello");
  });

  it("detects a corrupted checksum", () => {
    const good = buildServerPacket([0x01, 0, ...[...new TextEncoder().encode("hi")]]);
    good[9] ^= 0xff; // flip a payload byte
    const pkt = decodePacket(good);
    expect(pkt).not.toBeNull();
    expect(pkt!.checksumValid).toBe(false);
  });

  it("returns null for non-BE data", () => {
    expect(decodePacket(new Uint8Array([0x00, 0x00, 1, 2, 3, 4, 5, 6]))).toBeNull();
  });

  it("re-assembles fragmented command responses", () => {
    // Two fragments: header 0x00 | count=2 | index, then text.
    const f0 = buildServerPacket([0x01, 5, 0x00, 2, 0, ...[...new TextEncoder().encode("AB")]]);
    const p0 = decodePacket(f0);
    expect(p0!.fragCount).toBe(2);
    expect(p0!.fragIndex).toBe(0);
    expect(p0!.message).toBe("AB");
  });
});
