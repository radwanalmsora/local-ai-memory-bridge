import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const HOME = process.env.MEMORY_BRIDGE_HOME ?? join(homedir(), ".memory-bridge");

/** Master key: env override -> OS keychain -> 0600 file fallback. */
export async function getMasterKey(): Promise<Buffer> {
  if (process.env.MEMORY_BRIDGE_KEY) return Buffer.from(process.env.MEMORY_BRIDGE_KEY, "hex");
  try {
    const { Entry } = await import("@napi-rs/keyring");
    const entry = new Entry("local-ai-memory-bridge", "master-key");
    let hex: string | null = null;
    try { hex = entry.getPassword(); } catch {}
    if (!hex) { hex = randomBytes(32).toString("hex"); entry.setPassword(hex); }
    console.error("[memory-bridge] key source: OS keychain");
    return Buffer.from(hex, "hex");
  } catch {
    // stderr only: stdout is reserved for the MCP protocol
    console.error("[memory-bridge] OS keychain unavailable, using key file (chmod 600)");
    mkdirSync(HOME, { recursive: true, mode: 0o700 });
    const f = join(HOME, "master.key");
    if (!existsSync(f)) writeFileSync(f, randomBytes(32).toString("hex"), { mode: 0o600 });
    return Buffer.from(readFileSync(f, "utf8").trim(), "hex");
  }
}
