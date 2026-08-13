#!/usr/bin/env bun
/**
 * Semantic (meaning-based) search over a mnemon store, as a fallback to
 * mnemon's own keyword-only `search`/`recall`. mnemon stores an embedding
 * vector per insight but has no subcommand that reads it back — this script
 * is that missing consumer: embed the query the same way mnemon embeds
 * insights, then rank stored insights by cosine similarity.
 *
 * Read-only by design (opens the sqlite db with `readonly: true`) — this
 * must never be able to write to a live mnemon store.
 *
 * Usage:
 *   bun mnemon-semantic-search.ts "<query>" [--limit N] [--store NAME] [--db PATH]
 *
 * Env vars (same ones mnemon itself reads, so results stay consistent with
 * whatever mnemon used to generate the stored vectors):
 *   MNEMON_DATA_DIR      base data dir (default: /home/node/.claude/mnemon)
 *   MNEMON_STORE         store name (default: "default")
 *   MNEMON_EMBED_ENDPOINT  Ollama base URL (default: http://localhost:11434)
 *   MNEMON_EMBED_MODEL     Ollama embedding model (default: nomic-embed-text)
 */
import { Database } from 'bun:sqlite';

interface Args {
  query: string;
  limit: number;
  store: string;
  dbPath?: string;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  let limit = 10;
  let store = process.env.MNEMON_STORE || 'default';
  let dbPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--limit') {
      limit = Number(argv[++i]);
    } else if (arg === '--store') {
      store = argv[++i];
    } else if (arg === '--db') {
      dbPath = argv[++i];
    } else {
      positional.push(arg);
    }
  }

  if (positional.length === 0) {
    console.log(JSON.stringify({ error: 'missing required query argument' }));
    process.exit(1);
  }
  if (!Number.isFinite(limit) || limit <= 0) {
    console.log(JSON.stringify({ error: 'invalid --limit' }));
    process.exit(1);
  }

  return { query: positional.join(' '), limit, store, dbPath };
}

async function embedQuery(query: string): Promise<number[]> {
  const endpoint = process.env.MNEMON_EMBED_ENDPOINT || 'http://localhost:11434';
  const model = process.env.MNEMON_EMBED_MODEL || 'nomic-embed-text';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(`${endpoint}/api/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, prompt: query }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`ollama returned ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as { embedding?: number[] };
    if (!Array.isArray(data.embedding)) {
      throw new Error('response had no embedding array');
    }
    return data.embedding;
  } finally {
    clearTimeout(timeout);
  }
}

function decodeEmbedding(blob: Uint8Array): number[] {
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const dims = blob.byteLength / 4;
  const vec = new Array<number>(dims);
  for (let i = 0; i < dims; i++) {
    vec[i] = view.getFloat32(i * 4, true);
  }
  return vec;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  let queryVector: number[];
  try {
    queryVector = await embedQuery(args.query);
  } catch (err) {
    console.log(JSON.stringify({ error: `ollama unreachable: ${(err as Error).message}`, query: args.query }));
    process.exit(1);
  }

  const dataDir = process.env.MNEMON_DATA_DIR || '/home/node/.claude/mnemon';
  const dbPath = args.dbPath ?? `${dataDir}/data/${args.store}/mnemon.db`;

  // Not opened with `readonly: true`: that flag opens the file O_RDONLY, which
  // fails on a WAL-mode db (mnemon's default) whenever its `-shm` sidecar
  // doesn't already exist yet (e.g. a freshly copied db, or a container's
  // first read) — SQLITE_CANTOPEN, confirmed empirically. `PRAGMA query_only`
  // gives the same write-safety guarantee (any write statement throws)
  // without that failure mode.
  let db: Database;
  try {
    db = new Database(dbPath);
    db.exec('PRAGMA query_only = ON;');
  } catch (err) {
    console.log(JSON.stringify({ error: `cannot open store db at ${dbPath}: ${(err as Error).message}` }));
    process.exit(1);
  }

  const rows = db
    .query<{ id: string; content: string; embedding: Uint8Array }, []>(
      'SELECT id, content, embedding FROM insights WHERE deleted_at IS NULL AND embedding IS NOT NULL',
    )
    .all();

  const scored = rows
    .map((row) => ({
      id: row.id,
      content: row.content,
      score: cosineSimilarity(queryVector, decodeEmbedding(row.embedding)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, args.limit)
    .map((r) => ({ ...r, score: Math.round(r.score * 10_000) / 10_000 }));

  console.log(JSON.stringify({ query: args.query, store: args.store, results: scored }, null, 2));
}

main();
