/**
 * Deterministic fixtures for benchmarks.
 *
 * A seeded PRNG keeps generated embeddings/payloads identical across runs so the
 * committed baseline stays meaningful (data shape never changes between runs).
 */

/** Mulberry32 — tiny, fast, deterministic PRNG. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generate `count` L2-normalised embeddings of `dim` dimensions (mirrors cosine-index storage). */
export function generateEmbeddings(count: number, dim: number, seed = 42): Float32Array[] {
  const rng = makeRng(seed);
  const out: Float32Array[] = [];
  for (let i = 0; i < count; i++) {
    const v = new Float32Array(dim);
    let norm = 0;
    for (let d = 0; d < dim; d++) {
      const x = rng() * 2 - 1;
      v[d] = x;
      norm += x * x;
    }
    norm = Math.sqrt(norm) || 1;
    for (let d = 0; d < dim; d++) v[d] /= norm;
    out.push(v);
  }
  return out;
}

/** A short pseudo-realistic memory text for the given index. */
export function makeMemoryText(i: number): string {
  const subjects = ["user", "agent", "wallet", "chat", "task", "deal", "token", "swap"];
  const verbs = ["requested", "completed", "scheduled", "verified", "received", "sent"];
  const objects = ["a payment", "a swap quote", "a reminder", "a message", "a transfer", "a report"];
  return `${subjects[i % subjects.length]} ${verbs[i % verbs.length]} ${objects[i % objects.length]} #${i}`;
}
