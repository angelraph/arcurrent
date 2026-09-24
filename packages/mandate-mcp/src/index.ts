#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createMandateServer } from "./server.js";

// stdout is the MCP wire; anything human-readable goes to stderr.
async function main() {
  const { config, notices } = loadConfig(process.env);
  for (const notice of notices) console.error(`[mandate-mcp] ${notice}`);

  const server = createMandateServer(config);
  await server.connect(new StdioServerTransport());
  console.error("[mandate-mcp] ready on stdio");
}

main().catch((err) => {
  console.error(`[mandate-mcp] failed to start: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
