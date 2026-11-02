import Database from "better-sqlite3-multiple-ciphers";
import * as sqliteVec from "sqlite-vec";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { getMasterKey, HOME } from "./keystore.js";
import { open, seal, subkey } from "./crypto.js";
import { redact } from "./redact.js";
import { DIM, embedPassage, embedQuery } from "./embeddings.js";
import { cluster, mergeTexts } from "./compress.js";
const blob = (v: Float32Array) => Buffer.from(v.buffer, v.byteOffset, v.byteLength);
const toF32 = (b: Buffer) => new Float32Array(Uint8Array.from(b).buffer);

export interface Hit { id: number; project: string; text: string; score: number; createdAt: number }

export class MemoryStore {
  private constructor(private db: any, private fieldKey: Buffer) {}

  static async open(): Promise<MemoryStore> {
    mkdirSync(HOME, { recursive: true, mode: 0o700 });
    const master = await getMasterKey();
    const db: any = new Database(join(HOME, "memory.db"));
    db.pragma("cipher='sqlcipher'");                                   // whole-DB encryption
    try {
    db.pragma(`key="x'${subkey(master, "db").toString("hex")}'"`);
    db.prepare("SELECT count(*) FROM sqlite_master").get();
    } catch (e: any) { if (e.code === "SQLITE_NOTADB") throw new Error("Cannot decrypt memory.db: the master key does not match. Restore your key (MEMORY_BRIDGE_KEY) or delete ~/.memory-bridge/memory.db to start fresh."); throw e; }
    sqliteVec.load(db);
    db.exec(`
      CREATE TABLE IF NOT EXISTS memories(
        id INTEGER PRIMARY KEY, project TEXT NOT NULL DEFAULT 'default',
        content BLOB NOT NULL, created_at INTEGER NOT NULL,
        accessed_at INTEGER NOT NULL, hits INTEGER NOT NULL DEFAULT 0,
        compacted INTEGER NOT NULL DEFAULT 0);
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_memories USING vec0(embedding float[${DIM}]);`);
    return new MemoryStore(db, subkey(master, "field"));
  }

  private put(project: string, text: string, vec: Float32Array, compacted = 0, createdAt = Date.now()): number {
    const now = Date.now();
    const r = this.db.prepare(
      "INSERT INTO memories(project,content,created_at,accessed_at,compacted) VALUES (?,?,?,?,?)"
    ).run(project, seal(this.fieldKey, text), createdAt, now, compacted);
    this.db.prepare("INSERT INTO vec_memories(rowid, embedding) VALUES (?, ?)")
      .run(BigInt(r.lastInsertRowid), blob(vec));
    return Number(r.lastInsertRowid);
  }

  async add(raw: string, project = "default") {
    const { text, findings } = redact(raw);          // redact BEFORE embedding/storing
    const vec = await embedPassage(text);
    const id = this.db.transaction(() => this.put(project, text, vec))();
    return { id: id as number, redactions: findings };
  }

  async search(query: string, limit = 5, project?: string): Promise<Hit[]> {
    const q = await embedQuery(query);
    const rows = this.db.prepare(
      "SELECT rowid, distance FROM vec_memories WHERE embedding MATCH ? AND k = ?"
    ).all(blob(q), limit * 4) as { rowid: number | bigint; distance: number }[];
    const get = this.db.prepare("SELECT id,project,content,created_at FROM memories WHERE id=?");
    const touch = this.db.prepare("UPDATE memories SET hits=hits+1, accessed_at=? WHERE id=?");
    const out: Hit[] = [];
    for (const r of rows) {
      const m = get.get(Number(r.rowid));
      if (!m || (project && m.project !== project)) continue;
      touch.run(Date.now(), m.id);
      out.push({ id: m.id, project: m.project, text: open(this.fieldKey, m.content),
        score: +(1 - (r.distance ** 2) / 2).toFixed(3), createdAt: m.created_at });
      if (out.length >= limit) break;
    }
    return filterRelevant(out);
  }

  forget(id: number): boolean {
    return this.db.transaction(() => {
      this.db.prepare("DELETE FROM vec_memories WHERE rowid=?").run(BigInt(id));
      return this.db.prepare("DELETE FROM memories WHERE id=?").run(id).changes > 0;
    })();
  }

  stats() {
    const r = this.db.prepare("SELECT COUNT(*) n, COALESCE(SUM(compacted),0) c FROM memories").get();
    return { memories: r.n, compacted: r.c, path: join(HOME, "memory.db") };
  }

  /** Merge near-duplicate old memories (per project). E5 cosines run high, so threshold ~0.93. */
  async compact(olderThanDays = 30, threshold = 0.93) {
    const cutoff = Date.now() - olderThanDays * 864e5;
    const rows = this.db.prepare(
      "SELECT id,project,content,created_at FROM memories WHERE created_at < ? AND compacted = 0"
    ).all(cutoff) as any[];
    const byProject = new Map<string, any[]>();
    for (const r of rows) { if (!byProject.has(r.project)) byProject.set(r.project, []); byProject.get(r.project)!.push(r); }
    const getVec = this.db.prepare("SELECT embedding FROM vec_memories WHERE rowid=?");
    let merged = 0, removed = 0;
    for (const [project, items] of byProject) {
      const vecs = items.map((r) => toF32(getVec.get(BigInt(r.id)).embedding));
      for (const g of cluster(vecs, threshold)) {
        if (g.length < 2) continue;
        const text = mergeTexts(g.map((i) => open(this.fieldKey, items[i].content)));
        const vec = await embedPassage(text);
        this.db.transaction(() => {
          this.put(project, text, vec, 1, Math.min(...g.map((i) => items[i].created_at)));
          for (const i of g) {
            this.db.prepare("DELETE FROM vec_memories WHERE rowid=?").run(BigInt(items[i].id));
            this.db.prepare("DELETE FROM memories WHERE id=?").run(items[i].id);
          }
        })();
        merged++; removed += g.length;
      }
    }
    return { merged, removed };
  }
}

/** E5 scores are compressed (~0.7-0.9), so cut relative to the best hit, not by a fixed score. */
function filterRelevant(h: Hit[], margin = Number(process.env.MEMORY_BRIDGE_MARGIN ?? 0.04), floor = 0.7): Hit[] {
  if (!h.length) return h;
  const top = h[0].score;
  return h.filter((x) => x.score >= floor && x.score >= top - margin);
}
