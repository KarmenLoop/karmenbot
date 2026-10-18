// Feishu / Lark long-connection frames (pbbp2.proto), hand-written so no
// protobuf library is needed.
//   Header { 1 key: string; 2 value: string }
//   Frame  { 1 SeqID: uint64; 2 LogID: uint64; 3 service: int32; 4 method: int32;
//            5 headers: repeated Header; 6 payload_encoding: string;
//            7 payload_type: string; 8 payload: bytes; 9 LogIDNew: string }
export const FRAME_CONTROL = 0;
export const FRAME_DATA = 1;

const utf8 = new TextEncoder();
const text = new TextDecoder();

function varint(out, value) {
  let v = BigInt.asUintN(64, BigInt(value));
  do {
    let byte = Number(v & 0x7fn);
    v >>= 7n;
    if (v) byte |= 0x80;
    out.push(byte);
  } while (v);
}

function readVarint(bytes, at) {
  let result = 0n;
  let shift = 0n;
  for (;;) {
    if (at >= bytes.length) throw new Error("truncated varint");
    const byte = bytes[at];
    at += 1;
    result |= BigInt(byte & 0x7f) << shift;
    if (!(byte & 0x80)) return [result, at];
    shift += 7n;
  }
}

function field(out, number, wire) {
  varint(out, (number << 3) | wire);
}

function bytesField(out, number, data) {
  field(out, number, 2);
  varint(out, data.length);
  for (const byte of data) out.push(byte);
}

export function encodeFrame(frame) {
  const out = [];
  field(out, 1, 0);
  varint(out, frame.SeqID ?? 0n);
  field(out, 2, 0);
  varint(out, frame.LogID ?? 0n);
  field(out, 3, 0);
  varint(out, frame.service ?? 0);
  field(out, 4, 0);
  varint(out, frame.method ?? 0);
  for (const header of frame.headers || []) {
    const inner = [];
    bytesField(inner, 1, utf8.encode(String(header.key)));
    bytesField(inner, 2, utf8.encode(String(header.value)));
    bytesField(out, 5, inner);
  }
  if (frame.payloadEncoding !== undefined) bytesField(out, 6, utf8.encode(frame.payloadEncoding));
  if (frame.payloadType !== undefined) bytesField(out, 7, utf8.encode(frame.payloadType));
  if (frame.payload !== undefined) bytesField(out, 8, frame.payload instanceof Uint8Array ? frame.payload : utf8.encode(String(frame.payload)));
  if (frame.LogIDNew !== undefined) bytesField(out, 9, utf8.encode(frame.LogIDNew));
  return Uint8Array.from(out);
}

function decodeHeader(bytes) {
  const header = { key: "", value: "" };
  let at = 0;
  while (at < bytes.length) {
    let tag;
    [tag, at] = readVarint(bytes, at);
    const [length, next] = readVarint(bytes, at);
    const end = next + Number(length);
    const value = text.decode(bytes.subarray(next, end));
    if (tag >> 3n === 1n) header.key = value;
    else if (tag >> 3n === 2n) header.value = value;
    at = end;
  }
  return header;
}

export function decodeFrame(bytes) {
  const frame = { SeqID: 0n, LogID: 0n, service: 0, method: 0, headers: [] };
  let at = 0;
  while (at < bytes.length) {
    let tag;
    [tag, at] = readVarint(bytes, at);
    const number = Number(tag >> 3n);
    const wire = Number(tag & 7n);
    if (wire === 0) {
      let value;
      [value, at] = readVarint(bytes, at);
      if (number === 1) frame.SeqID = value;
      else if (number === 2) frame.LogID = value;
      else if (number === 3) frame.service = Number(BigInt.asIntN(32, value));
      else if (number === 4) frame.method = Number(BigInt.asIntN(32, value));
    } else if (wire === 2) {
      const [length, next] = readVarint(bytes, at);
      const end = next + Number(length);
      if (end > bytes.length) throw new Error("truncated field");
      const data = bytes.subarray(next, end);
      if (number === 5) frame.headers.push(decodeHeader(data));
      else if (number === 6) frame.payloadEncoding = text.decode(data);
      else if (number === 7) frame.payloadType = text.decode(data);
      else if (number === 8) frame.payload = Uint8Array.from(data);
      else if (number === 9) frame.LogIDNew = text.decode(data);
      at = end;
    } else if (wire === 1) at += 8;
    else if (wire === 5) at += 4;
    else throw new Error(`unsupported wire type ${wire}`);
  }
  return frame;
}

export function headerOf(frame, key) {
  return frame.headers.find((item) => item.key === key)?.value;
}
