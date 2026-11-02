/** Local compaction (no LLM): cluster near-duplicates, merge, dedupe lines. */
export const cosine = (a: Float32Array, b: Float32Array) => {
  let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; // vectors are normalized
};

export function cluster(vecs: Float32Array[], threshold: number): number[][] {
  const used = new Set<number>(), groups: number[][] = [];
  for (let i = 0; i < vecs.length; i++) {
    if (used.has(i)) continue;
    const g = [i]; used.add(i);
    for (let j = i + 1; j < vecs.length; j++)
      if (!used.has(j) && cosine(vecs[i], vecs[j]) >= threshold) { g.push(j); used.add(j); }
    groups.push(g);
  }
  return groups;
}

export function mergeTexts(texts: string[], maxChars = 1500): string {
  const seen = new Set<string>(), lines: string[] = [];
  for (const t of texts) for (const l of t.split("\n")) {
    const k = l.trim().toLowerCase();
    if (k && !seen.has(k)) { seen.add(k); lines.push(l.trim()); }
  }
  const out = lines.join("\n");
  return out.length > maxChars ? out.slice(0, maxChars) + "…" : out;
}
