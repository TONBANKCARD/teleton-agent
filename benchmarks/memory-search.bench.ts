/**
 * Vector memory search benchmark.
 *
 * Mirrors the production semantic-search path: an in-memory SQLite database with
 * the `sqlite-vec` extension and the same `vec0(... distance_metric=cosine)`
 * virtual table and `WHERE embedding MATCH ? AND k = ?` KNN query used by
 * {@link ../src/memory/search/hybrid.ts}. We vary the corpus size N to show how
 * search latency scales with the number of stored memories.
 *
 * Self-contained — uses the real `better-sqlite3` + `sqlite-vec` dependencies but
 * synthetic, deterministic embeddings, so it runs in CI without API keys.
 */
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { serializeEmbedding } from "../src/memory/embeddings/utils.js";
import type { BenchGroup, BenchModule } from "./lib/harness.js";
import { makeBench } from "./lib/harness.js";
import { generateEmbeddings, makeMemoryText } from "./lib/fixtures.js";

const DIMENSIONS = 384; // matches the local all-MiniLM-L6-v2 embedder
const CORPUS_SIZES = [100, 1_000, 10_000];
const TOP_K = 10;

function buildIndex(count: number): { db: Database.Database; query: Buffer } {
  const db = new Database(":memory:");
  sqliteVec.load(db);

  db.exec(`
    CREATE TABLE knowledge (id TEXT PRIMARY KEY, text TEXT);
    CREATE VIRTUAL TABLE knowledge_vec USING vec0(
      id TEXT PRIMARY KEY,
      embedding FLOAT[${DIMENSIONS}] distance_metric=cosine
    );
  `);

  const vectors = generateEmbeddings(count, DIMENSIONS, 1234);
  const insertKnowledge = db.prepare(`INSERT INTO knowledge (id, text) VALUES (?, ?)`);
  const insertVec = db.prepare(`INSERT INTO knowledge_vec (id, embedding) VALUES (?, ?)`);
  const tx = db.transaction(() => {
    for (let i = 0; i < count; i++) {
      const id = `mem-${i}`;
      insertKnowledge.run(id, makeMemoryText(i));
      insertVec.run(id, serializeEmbedding(Array.from(vectors[i])));
    }
  });
  tx();

  // A fixed query vector (separate seed) reused across iterations.
  const query = serializeEmbedding(Array.from(generateEmbeddings(1, DIMENSIONS, 7)[0]));
  return { db, query };
}

const moduleFactory: BenchModule = async (): Promise<BenchGroup[]> => {
  const groups: BenchGroup[] = [];

  for (const n of CORPUS_SIZES) {
    const { db, query } = buildIndex(n);
    const stmt = db.prepare(`
      SELECT kv.id, k.text, kv.distance
      FROM (
        SELECT id, distance FROM knowledge_vec
        WHERE embedding MATCH ? AND k = ?
      ) kv
      JOIN knowledge k ON k.id = kv.id
    `);

    // Smaller time budget for the 10k corpus so the whole suite stays quick.
    const bench = makeBench(n >= 10_000 ? { time: 800, iterations: 5 } : {});
    bench.add(`knn top-${TOP_K}`, () => {
      stmt.all(query, TOP_K);
    });

    groups.push({ suite: "memory-search", group: `N=${n.toLocaleString("en-US")}`, bench });
  }

  return groups;
};

export default moduleFactory;
