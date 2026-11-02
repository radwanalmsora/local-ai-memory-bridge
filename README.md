# 🧠 Local AI Memory Bridge

**Persistent, encrypted, fully offline long-term memory for AI agents** (Claude Code, Cursor, and any MCP client).
Your memories never leave your machine.

> ⚠️ **Status: alpha (v0.1).** Save, search, redaction and the MCP server are tested. `compact` is implemented but has had limited testing.

## Why

- 🔒 **Whole-database encryption** (SQLCipher) plus AES-256-GCM on every memory text
- 🔑 **Master key in your OS keychain** (falls back to a `chmod 600` key file where no keychain exists, e.g. Codespaces or Docker)
- 🧹 **Secrets redacted before anything is embedded or stored** (API keys, tokens, passwords, JWTs, private keys, credit cards, emails)
- 🌍 **Multilingual semantic search** (`multilingual-e5-small`, 100+ languages including Arabic), running locally via ONNX
- 🔌 **Native MCP server** over stdio

## Architecture

```mermaid
flowchart LR
  A[AI Agent<br/>Claude Code / Cursor] -- MCP stdio --> B[MCP Server]
  B --> C[PII Redaction<br/>regex + entropy]
  C --> D[Local Embeddings<br/>e5-small ONNX]
  D --> E[(SQLCipher DB<br/>sqlite-vec + AES-GCM text)]
  K[OS Keychain] -. master key .-> E
  E --> F[Compaction<br/>cluster + dedupe]
```

## Quick Start

```bash
git clone https://github.com/radwanalmsora/local-ai-memory-bridge
cd local-ai-memory-bridge
npm install
npx tsx src/cli.ts add "I prefer TypeScript for new projects"
npx tsx src/cli.ts search "what language do I prefer?"
npx tsx src/cli.ts setup
```

The first run downloads the embedding model (about 100-150 MB) to `~/.memory-bridge/models`.

### Connect to Claude Code

```bash
claude mcp add memory-bridge -- npx -y tsx /path/to/local-ai-memory-bridge/src/cli.ts serve
```

### Connect to Cursor (`mcp.json`)

```json
{
  "mcpServers": {
    "memory-bridge": {
      "command": "npx",
      "args": ["-y", "tsx", "/path/to/local-ai-memory-bridge/src/cli.ts", "serve"]
    }
  }
}
```

## CLI

| Command | Description |
|---|---|
| `serve` | Run the MCP server (stdio) |
| `add <text> [-p project]` | Save a memory (redacted automatically) |
| `search <query> [-n 5] [-p project]` | Semantic search |
| `forget <id>` | Delete a memory |
| `compact [-d 30] [-t 0.93]` | Merge near-duplicate memories older than N days |
| `stats` | Show counts and DB path |
| `setup` | Print MCP config snippets |

## MCP Tools

| Tool | Input | Purpose |
|---|---|---|
| `memory_save` | `text`, `project?` | Store a durable fact or decision |
| `memory_search` | `query`, `limit?`, `project?` | Semantic recall |
| `memory_forget` | `id` | Delete a memory |

## Configuration

| Env var | Default | Meaning |
|---|---|---|
| `MEMORY_BRIDGE_HOME` | `~/.memory-bridge` | Data directory |
| `MEMORY_BRIDGE_KEY` | *(unset)* | 64-char hex master key override |
| `MEMORY_BRIDGE_MODEL` | `Xenova/multilingual-e5-small` | Embedding model |
| `MEMORY_BRIDGE_MARGIN` | `0.04` | Relevance cut-off relative to the best hit |

## Security model and limits

- Redaction is best-effort (patterns plus entropy). It will miss some secrets, so don't rely on it as your only control.
- If the master key is lost, the data cannot be recovered.
- This protects data at rest on your machine, not against malware running as your user.

## Roadmap

- [ ] One-command install via npm (`npx`)
- [ ] Optional NER-based PII detection
- [ ] Optional local-LLM summarization (Ollama)
- [ ] Tests and CI

## License

MIT
