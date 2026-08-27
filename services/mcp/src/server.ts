import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function createServer() {
  const server = new McpServer({ name: "polaris", version: "0.1.0" });

  server.registerTool(
    "echo",
    {
      title: "Echo",
      description: "Echo back a message. Placeholder proving the wiring works.",
      inputSchema: { message: z.string().describe("Text to echo back") },
    },
    async ({ message }) => ({
      content: [{ type: "text", text: `You said: ${message}` }],
    }),
  );

  return server;
}