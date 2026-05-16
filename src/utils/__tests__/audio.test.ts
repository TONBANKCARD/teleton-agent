import { describe, it, expect } from "vitest";
import { wavToOggOpus } from "../audio.js";

/** Build a minimal valid 16-bit PCM WAV buffer. */
function buildWavBuffer({
  dataSize = 4,
  chunkSize,
  pcmData,
}: {
  dataSize?: number;
  chunkSize?: number;
  pcmData?: Buffer;
} = {}): Buffer {
  const payload = pcmData ?? Buffer.alloc(dataSize);
  const actualDataSize = payload.length;
  const writtenChunkSize = chunkSize ?? actualDataSize;
  const fmtChunkSize = 16;
  const riffSize = 4 + (8 + fmtChunkSize) + (8 + actualDataSize);
  const buf = Buffer.alloc(8 + riffSize);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(riffSize, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(fmtChunkSize, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(48000, 24); // sample rate
  buf.writeUInt32LE(96000, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(writtenChunkSize, 40);
  payload.copy(buf, 44);
  return buf;
}

describe("wavToOggOpus", () => {
  it("converts a valid WAV buffer to OGG/Opus", () => {
    const wav = buildWavBuffer({ pcmData: Buffer.alloc(960 * 2) }); // 960 samples, 16-bit
    const ogg = wavToOggOpus(wav);
    expect(ogg.slice(0, 4).toString("ascii")).toBe("OggS");
  });

  it("handles streaming WAV where data chunk size is 0xFFFFFFFF (Groq TTS format)", () => {
    // Groq TTS generates WAV with streaming placeholder size 0xFFFFFFFF
    // because the total audio length is not known at the time the header is written.
    const pcmData = Buffer.alloc(960 * 2); // 960 mono 16-bit samples = one Opus frame
    const wav = buildWavBuffer({ pcmData, chunkSize: 0xffffffff });
    // Must NOT throw "WAV parse error: chunk 'data' size 4294967295 exceeds buffer"
    const ogg = wavToOggOpus(wav);
    expect(ogg.slice(0, 4).toString("ascii")).toBe("OggS");
  });

  it("rejects a buffer that is not a WAV file", () => {
    const buf = Buffer.from("not a wav file");
    expect(() => wavToOggOpus(buf)).toThrow("WAV parse error: missing RIFF/WAVE header");
  });
});
