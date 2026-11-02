#!/usr/bin/env node
import { Command } from "commander";
import { resolve } from "node:path";
import { MemoryStore } from "./store.js";
import { serve } from "./mcp.js";

const program = new Command("memory-bridge")
  .description("Local, encrypted, offline long-term memory for AI agents").version("0.1.0");

program.command("serve").description("Run the MCP server (stdio)").action(serve);

program.command("add <text>").option("-p, --project <name>", "project", "default")
  .action(async (text, o) => {
    const r = await (await MemoryStore.open()).add(text, o.project);
    console.log(`saved #${r.id}`, r.redactions.length ? `(redacted: ${r.redactions.join(", ")})` : "");
  });

program.command("search <query>").option("-n, --limit <n>", "results", "5").option("-p, --project <name>")
  .action(async (q, o) => {
    for (const h of await (await MemoryStore.open()).search(q, +o.limit, o.project))
      console.log(`#${h.id} [${h.score}] ${h.text}\n`);
  });

program.command("forget <id>").action(async (id) => console.log((await MemoryStore.open()).forget(+id) ? "deleted" : "not found"));
program.command("stats").action(async () => console.log((await MemoryStore.open()).stats()));
program.command("compact").option("-d, --days <n>", "older than N days", "30").option("-t, --threshold <x>", "similarity", "0.93")
  .action(async (o) => console.log(await (await MemoryStore.open()).compact(+o.days, +o.threshold)));

program.command("setup").description("Print MCP config for Claude Code / Cursor").action(() => {
  const script = resolve(process.argv[1]);
  const cmd = script.endsWith(".ts") ? ["npx", "-y", "tsx", script, "serve"] : ["node", script, "serve"];
  console.log("Claude Code:\n  claude mcp add memory-bridge -- " + cmd.join(" "));
  console.log("\nCursor / mcp.json:\n" + JSON.stringify({ mcpServers: { "memory-bridge": { command: cmd[0], args: cmd.slice(1) } } }, null, 2));
});

await program.parseAsync();
if (process.argv[2] !== "serve") process.exit(0);
