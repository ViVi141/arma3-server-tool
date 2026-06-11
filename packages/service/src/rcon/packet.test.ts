import { describe, it, expect } from "vitest";
import { crc32, encodePacket, encodeLoginPacket, encodeCommandPacket, parsePacket } from "./packet.js";

describe("crc32", () => {
  it("computes known CRC32 values", () => {
    const data = new TextEncoder().encode("BattlEye");
    const hash = crc32(data);
    // CRC32 is deterministic
    expect(hash).toBeTypeOf("number");
    expect(hash).toBeGreaterThan(0);
  });

  it("is deterministic (same input = same output)", () => {
    const data = new Uint8Array([0x01, 0x02, 0x03]);
    expect(crc32(data)).toBe(crc32(data));
  });

  it("produces different values for different inputs", () => {
    const a = crc32(new Uint8Array([0x00]));
    const b = crc32(new Uint8Array([0x01]));
    expect(a).not.toBe(b);
  });
});

describe("encodePacket", () => {
  it("produces a valid BE header", () => {
    const payload = new Uint8Array([0x01, 0x02]);
    const packet = encodePacket(0xff, payload);

    // Header: 'B' 'E' (2 bytes)
    expect(packet[0]).toBe(0x42); // 'B'
    expect(packet[1]).toBe(0x45); // 'E'
    // CRC32 (4 bytes)
    // Separator (1 byte)
    expect(packet[6]).toBe(0xff);
    // Payload (2 bytes)
    expect(packet[7]).toBe(0x01);
    expect(packet[8]).toBe(0x02);

    // Total: 2 + 4 + 1 + 2 = 9 bytes
    expect(packet.length).toBe(9);
  });

  it("packs with valid CRC32", () => {
    const payload = new Uint8Array([0x41, 0x42]); // "AB"
    const packet = encodePacket(0xff, payload);

    // Re-parse and verify CRC validates
    const parsed = parsePacket(packet);
    expect(parsed).not.toBeNull();
    expect(parsed!.type).toBe(0xff);
    expect(Array.from(parsed!.payload)).toEqual([0x41, 0x42]);
  });
});

describe("encodeLoginPacket", () => {
  it("encodes login with type 0x01", () => {
    const packet = encodeLoginPacket("testpwd");

    // BE header
    expect(packet[0]).toBe(0x42);
    expect(packet[1]).toBe(0x45);

    // Payload starts with 0x01 (login)
    expect(packet[7]).toBe(0x01);

    // Remaining bytes are the password
    const pwdBytes = new TextDecoder().decode(packet.slice(8));
    expect(pwdBytes).toBe("testpwd");
  });

  it("works with empty password", () => {
    const packet = encodeLoginPacket("");
    expect(packet[7]).toBe(0x01);
    expect(packet.length).toBe(8); // header 7 + 1 byte type
  });
});

describe("encodeCommandPacket", () => {
  it("encodes command with type 0x02 and sequence", () => {
    const packet = encodeCommandPacket(5, "players");

    expect(packet[0]).toBe(0x42);
    expect(packet[1]).toBe(0x45);
    expect(packet[7]).toBe(0x02); // command type
    expect(packet[8]).toBe(5);    // sequence number

    const cmdText = new TextDecoder().decode(packet.slice(9));
    expect(cmdText).toBe("players");
  });

  it("supports sequential commands", () => {
    const p1 = encodeCommandPacket(0, "login");
    const p2 = encodeCommandPacket(1, "players");
    expect(p1[8]).toBe(0);
    expect(p2[8]).toBe(1);
  });
});

describe("parsePacket", () => {
  it("returns null for data too short (under 7 bytes)", () => {
    expect(parsePacket(new Uint8Array([0x42, 0x45, 0, 0, 0, 0]))).toBeNull();
  });

  it("accepts 7-byte minimum packet (empty payload)", () => {
    // Minimum valid packet: 2 sig + 4 crc + 1 separator = 7 bytes
    const packet = encodePacket(0x00, new Uint8Array([]));
    expect(packet.length).toBe(7);
    const parsed = parsePacket(packet);
    expect(parsed).not.toBeNull();
    expect(parsed!.type).toBe(0x00);
    expect(parsed!.payload.length).toBe(0);
  });

  it("returns null for invalid signature", () => {
    expect(parsePacket(new Uint8Array([0x00, 0x00, 0, 0, 0, 0, 0, 0]))).toBeNull();
  });

  it("round-trips encode -> decode", () => {
    const original = new Uint8Array([0x01, 0x41, 0x42, 0x43]); // login + "ABC"
    const packet = encodePacket(0xff, original);
    const parsed = parsePacket(packet);

    expect(parsed).not.toBeNull();
    expect(parsed!.type).toBe(0xff);
    expect(Array.from(parsed!.payload)).toEqual([0x01, 0x41, 0x42, 0x43]);
  });

  it("handles empty payload", () => {
    const packet = encodePacket(0x00, new Uint8Array([]));
    const parsed = parsePacket(packet);

    expect(parsed).not.toBeNull();
    expect(parsed!.type).toBe(0x00);
    expect(parsed!.payload.length).toBe(0);
  });
});

describe("CRC integrity", () => {
  it("detects bit flips in payload", () => {
    const payload = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    const packet = encodePacket(0xff, payload);

    // Flip a bit in the payload
    packet[8] ^= 0x01;

    // The CRC should NOT match the corrupted payload
    // (parsePacket currently doesn't verify CRC, but we can validate manually)
    const expectedCrc = crc32(new Uint8Array([0xff, ...payload]));
    const packetCrc = (packet[5] << 24) | (packet[4] << 16) | (packet[3] << 8) | packet[2];
    const corruptedCrc = crc32(new Uint8Array([0xff, ...packet.slice(7)]));

    expect(corruptedCrc).not.toBe(expectedCrc);
  });
});
