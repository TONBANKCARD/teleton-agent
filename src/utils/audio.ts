/**
 * WAV (PCM s16le) → OGG/Opus conversion using a WASM Opus encoder.
 *
 * Telegram only renders voice notes when the audio is in OGG/Opus, so Groq's WAV
 * output must be transcoded before sending. Earlier versions shelled out to a
 * system `ffmpeg` binary, which forced operators to install ffmpeg manually on
 * every host. This module performs the same conversion in pure JavaScript via
 * `opusscript` (libopus 1.4 compiled to WebAssembly), so the agent works out of
 * the box on any Node.js host with no third-party codecs to install.
 */

import OpusScript from "opusscript";

interface WavFormat {
  format: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
}

interface ParsedWav {
  fmt: WavFormat;
  data: Buffer;
}

const WAV_FORMAT_PCM = 1;
const WAV_BITS_PER_SAMPLE = 16;

const OPUS_SAMPLE_RATE = 48000;
const OPUS_FRAME_DURATION_MS = 20;
const OPUS_FRAME_SAMPLES = (OPUS_SAMPLE_RATE * OPUS_FRAME_DURATION_MS) / 1000; // 960
const DEFAULT_OPUS_BITRATE = 48_000;

const OGG_HEADER_BOS = 0x02;
const OGG_HEADER_EOS = 0x04;

function parseWav(buf: Buffer): ParsedWav {
  if (
    buf.length < 12 ||
    buf.toString("ascii", 0, 4) !== "RIFF" ||
    buf.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error("WAV parse error: missing RIFF/WAVE header");
  }

  let offset = 12;
  let fmt: WavFormat | null = null;
  let data: Buffer | null = null;

  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const start = offset + 8;
    // 0xFFFFFFFF is a streaming/unknown-size placeholder used by some TTS providers
    // (e.g. Groq) that write the WAV header before the total audio length is known.
    // Treat it as "rest of buffer" rather than rejecting the file.
    const rawSize = buf.readUInt32LE(offset + 4);
    const size = rawSize === 0xffffffff ? buf.length - start : rawSize;
    if (start + size > buf.length) {
      throw new Error(`WAV parse error: chunk '${id}' size ${size} exceeds buffer`);
    }
    if (id === "fmt ") {
      fmt = {
        format: buf.readUInt16LE(start),
        channels: buf.readUInt16LE(start + 2),
        sampleRate: buf.readUInt32LE(start + 4),
        bitsPerSample: buf.readUInt16LE(start + 14),
      };
    } else if (id === "data") {
      data = buf.subarray(start, start + size);
      break;
    }
    offset = start + size + (size % 2); // RIFF chunks pad to even byte boundary
  }

  if (!fmt) throw new Error("WAV parse error: missing 'fmt ' chunk");
  if (!data) throw new Error("WAV parse error: missing 'data' chunk");
  if (fmt.format !== WAV_FORMAT_PCM) {
    throw new Error(
      `WAV parse error: unsupported format code ${fmt.format} (only PCM is supported)`
    );
  }
  if (fmt.bitsPerSample !== WAV_BITS_PER_SAMPLE) {
    throw new Error(
      `WAV parse error: unsupported bit depth ${fmt.bitsPerSample} (only 16-bit PCM is supported)`
    );
  }
  if (fmt.channels !== 1 && fmt.channels !== 2) {
    throw new Error(`WAV parse error: unsupported channel count ${fmt.channels}`);
  }
  return { fmt, data };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) {
      r = (r & 0x80000000) !== 0 ? ((r << 1) ^ 0x04c11db7) >>> 0 : (r << 1) >>> 0;
    }
    table[i] = r >>> 0;
  }
  return table;
})();

function oggCrc(buf: Buffer): number {
  let crc = 0;
  for (let i = 0; i < buf.length; i++) {
    crc = (CRC_TABLE[((crc >>> 24) ^ buf[i]) & 0xff] ^ (crc << 8)) >>> 0;
  }
  return crc >>> 0;
}

interface OggPageOptions {
  headerType: number;
  granulePosition: bigint;
  serial: number;
  sequence: number;
  segments: Buffer[];
}

function buildOggPage(opts: OggPageOptions): Buffer {
  const lacing: number[] = [];
  for (const seg of opts.segments) {
    let n = seg.length;
    if (n === 0) {
      lacing.push(0);
      continue;
    }
    while (n >= 255) {
      lacing.push(255);
      n -= 255;
    }
    lacing.push(n);
  }
  if (lacing.length > 255) {
    throw new Error("OGG encode error: too many lacing values for one page");
  }

  const segmentTable = Buffer.from(lacing);
  const payload = Buffer.concat(opts.segments);
  const header = Buffer.alloc(27 + segmentTable.length);
  header.write("OggS", 0, "ascii");
  header.writeUInt8(0, 4); // stream structure version
  header.writeUInt8(opts.headerType, 5);
  const gp = opts.granulePosition;
  header.writeUInt32LE(Number(gp & 0xffffffffn), 6);
  header.writeUInt32LE(Number((gp >> 32n) & 0xffffffffn), 10);
  header.writeUInt32LE(opts.serial >>> 0, 14);
  header.writeUInt32LE(opts.sequence >>> 0, 18);
  header.writeUInt32LE(0, 22); // CRC placeholder
  header.writeUInt8(lacing.length, 26);
  segmentTable.copy(header, 27);

  const page = Buffer.concat([header, payload]);
  page.writeUInt32LE(oggCrc(page), 22);
  return page;
}

function buildOpusIdHeader(channels: number, originalSampleRate: number): Buffer {
  const buf = Buffer.alloc(19);
  buf.write("OpusHead", 0, "ascii");
  buf.writeUInt8(1, 8); // version
  buf.writeUInt8(channels, 9);
  buf.writeUInt16LE(0, 10); // pre-skip (encoder delay; 0 is acceptable for VBR speech)
  buf.writeUInt32LE(originalSampleRate, 12);
  buf.writeInt16LE(0, 16); // output gain (Q7.8 dB)
  buf.writeUInt8(0, 18); // channel mapping family 0 (mono/stereo)
  return buf;
}

function buildOpusCommentHeader(vendor: string): Buffer {
  const vendorBuf = Buffer.from(vendor, "utf8");
  const buf = Buffer.alloc(8 + 4 + vendorBuf.length + 4);
  buf.write("OpusTags", 0, "ascii");
  buf.writeUInt32LE(vendorBuf.length, 8);
  vendorBuf.copy(buf, 12);
  buf.writeUInt32LE(0, 12 + vendorBuf.length); // user comment count
  return buf;
}

function resampleLinear(
  samples: Int16Array,
  srcRate: number,
  dstRate: number,
  channels: number
): Int16Array {
  if (srcRate === dstRate) return samples;
  const srcFrames = samples.length / channels;
  const ratio = srcRate / dstRate;
  const dstFrames = Math.floor(srcFrames / ratio);
  const out = new Int16Array(dstFrames * channels);
  for (let i = 0; i < dstFrames; i++) {
    const srcPos = i * ratio;
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    const idxNext = Math.min(idx + 1, srcFrames - 1);
    for (let c = 0; c < channels; c++) {
      const a = samples[idx * channels + c];
      const b = samples[idxNext * channels + c];
      out[i * channels + c] = Math.max(-32768, Math.min(32767, Math.round(a + (b - a) * frac)));
    }
  }
  return out;
}

export interface WavToOggOpusOptions {
  /** Target Opus bitrate in bits per second. Default: 48000 (well-suited to speech). */
  bitrate?: number;
  /** Vendor string written into the Opus comment header. Default: "teleton-agent". */
  vendor?: string;
}

/**
 * Convert a WAV (PCM signed 16-bit, mono or stereo) buffer into an OGG/Opus
 * buffer suitable for Telegram voice notes. The output is always 48 kHz.
 */
export function wavToOggOpus(wav: Buffer, opts: WavToOggOpusOptions = {}): Buffer {
  const { fmt, data } = parseWav(wav);
  const bitrate = opts.bitrate ?? DEFAULT_OPUS_BITRATE;
  const vendor = opts.vendor ?? "teleton-agent";

  // Reinterpret PCM bytes as Int16 samples. We copy via Uint8Array.from to
  // guarantee the underlying ArrayBuffer is properly aligned for Int16Array.
  const aligned = Uint8Array.from(data);
  const srcSamples = new Int16Array(aligned.buffer, aligned.byteOffset, aligned.byteLength / 2);
  const channels = fmt.channels;
  const samples = resampleLinear(srcSamples, fmt.sampleRate, OPUS_SAMPLE_RATE, channels);

  const samplesPerFrame = OPUS_FRAME_SAMPLES * channels;
  const encoder = new OpusScript(OPUS_SAMPLE_RATE, channels, OpusScript.Application.VOIP);
  encoder.setBitrate(bitrate);

  try {
    const serial = (Math.random() * 0xffffffff) >>> 0;
    let sequence = 0;
    let granule = 0n;
    const pages: Buffer[] = [];

    pages.push(
      buildOggPage({
        headerType: OGG_HEADER_BOS,
        granulePosition: 0n,
        serial,
        sequence: sequence++,
        segments: [buildOpusIdHeader(channels, fmt.sampleRate)],
      })
    );
    pages.push(
      buildOggPage({
        headerType: 0,
        granulePosition: 0n,
        serial,
        sequence: sequence++,
        segments: [buildOpusCommentHeader(vendor)],
      })
    );

    const totalFrames = Math.ceil(samples.length / samplesPerFrame);
    if (totalFrames === 0) {
      // Empty input; emit a final empty page to close the stream.
      pages.push(
        buildOggPage({
          headerType: OGG_HEADER_EOS,
          granulePosition: 0n,
          serial,
          sequence: sequence++,
          segments: [Buffer.alloc(0)],
        })
      );
      return Buffer.concat(pages);
    }

    for (let f = 0; f < totalFrames; f++) {
      const start = f * samplesPerFrame;
      let frame: Int16Array;
      if (start + samplesPerFrame <= samples.length) {
        frame = samples.subarray(start, start + samplesPerFrame);
      } else {
        // Pad the last partial frame with silence so opusscript receives a full frame.
        frame = new Int16Array(samplesPerFrame);
        frame.set(samples.subarray(start));
      }
      const pcmBuf = Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength);
      const opusPacket = encoder.encode(pcmBuf, OPUS_FRAME_SAMPLES);
      granule += BigInt(OPUS_FRAME_SAMPLES);
      const isLast = f === totalFrames - 1;
      pages.push(
        buildOggPage({
          headerType: isLast ? OGG_HEADER_EOS : 0,
          granulePosition: granule,
          serial,
          sequence: sequence++,
          segments: [Buffer.from(opusPacket)],
        })
      );
    }

    return Buffer.concat(pages);
  } finally {
    encoder.delete();
  }
}
