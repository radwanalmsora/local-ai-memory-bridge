import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const c = new Client({ name: "smoke-test", version: "0.0.0" });
await c.connect(new StdioClientTransport({ command: "npx", args: ["tsx", "src/cli.ts", "serve"] }));
console.log("tools:", (await c.listTools()).tools.map((t) => t.name));
console.log(await c.callTool({ name: "memory_save", arguments: { text: "I deploy with Docker on port 8080", project: "demo" } }));
console.log(JSON.stringify(await c.callTool({ name: "memory_search", arguments: { query: "ما هي لغتي المفضلة؟" } }), null, 1));
await c.close();
