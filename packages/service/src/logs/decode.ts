/**
 * Log decoding helpers.
 *
 * Arma III RPT / console logs on Chinese Windows are frequently written in
 * GBK / ANSI, while newer builds emit UTF-8 (sometimes with a BOM). Reading
 * everything as UTF-8 corrupts GBK Chinese text into mojibake. Strategy:
 *   1. Honour an explicit BOM (UTF-8 / UTF-16LE / UTF-16BE).
 *   2. Otherwise try strict UTF-8; if that throws, fall back to GBK when the
 *      runtime has GBK support (Node ships full-icu by default), else lossy
 *      UTF-8.
 */

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const UTF16LE_BOM = Buffer.from([0xff, 0xfe]);
const UTF16BE_BOM = Buffer.from([0xfe, 0xff]);

let gbkDecoder: TextDecoder | null | undefined;
function getGbkDecoder(): TextDecoder | null {
  if (gbkDecoder !== undefined) {
    return gbkDecoder;
  }
  try {
    gbkDecoder = new TextDecoder("gbk");
  } catch {
    gbkDecoder = null;
  }
  return gbkDecoder;
}

const utf8Strict = new TextDecoder("utf-8", { fatal: true });
const utf8Lossy = new TextDecoder("utf-8");

function startsWith(buf: Buffer, prefix: Buffer): boolean {
  if (buf.length < prefix.length) {
    return false;
  }
  for (let i = 0; i < prefix.length; i += 1) {
    if (buf[i] !== prefix[i]) {
      return false;
    }
  }
  return true;
}

/** Decode a raw log byte chunk into a best-effort JS string. */
export function decodeLogBytes(buf: Buffer): string {
  if (buf.length === 0) {
    return "";
  }
  if (startsWith(buf, UTF8_BOM)) {
    return utf8Lossy.decode(buf.subarray(UTF8_BOM.length));
  }
  if (startsWith(buf, UTF16LE_BOM)) {
    return new TextDecoder("utf-16le").decode(buf.subarray(UTF16LE_BOM.length));
  }
  if (startsWith(buf, UTF16BE_BOM)) {
    return new TextDecoder("utf-16be").decode(buf.subarray(UTF16BE_BOM.length));
  }
  try {
    return utf8Strict.decode(buf);
  } catch {
    const gbk = getGbkDecoder();
    if (gbk) {
      try {
        return gbk.decode(buf);
      } catch {
        // fall through to lossy utf-8
      }
    }
    return utf8Lossy.decode(buf);
  }
}
