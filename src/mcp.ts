import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MemoryStore } from "./store.js";

/** MCP server over stdio. NEVER write to stdout here (it carries the protocol). */
export async function serve() {
  const store = await MemoryStore.open();
  const server = new McpServer({ name: "local-ai-memory-bridge", version: "0.1.0" });
  const reply = (s: string) => ({ content: [{ type: "text" as const, text: s }] });

  server.tool("memory_save",
    "Save a durable fact, decision or preference to long-term local memory. Secrets are auto-redacted.",
    { text: z.string().min(1), project: z.string().optional() },
    async ({ text, project }) => {
      const r = await store.add(text, project);
      return reply(`Saved #${r.id}` + (r.redactions.length ? ` (redacted: ${r.redactions.join(", ")})` : ""));
    });

  server.tool("memory_search",
    "Semantic search over long-term memory (multilingual, incl. Arabic). Call at the start of a task.",
    { query: z.string().min(1), limit: z.number().int().min(1).max(20).optional(), project: z.string().optional() },
    async ({ query, limit, project }) => {
      const hits = await store.search(query, limit ?? 5, project);
      return reply(hits.length ? hits.map((h) => `#${h.id} [${h.score}] ${h.text}`).join("\n---\n") : "No memories found.");
    });

  server.tool("memory_forget", "Delete a memory by id.",
    { id: z.number().int() },
    async ({ id }) => reply(store.forget(id) ? `Deleted #${id}` : `#${id} not found`));

  await server.connect(new StdioServerTransport());
}
