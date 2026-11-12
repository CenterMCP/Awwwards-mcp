import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { once } from "node:events";
import type { Server } from "node:http";
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHttpServer, startMcpServer } from "../src/transport.js";

describe("HTTP transport", () => {
  let server: Server;
  let base: string;

  beforeEach(async () => {
    server = createMcpHttpServer(() => {
      const mcp = new McpServer({ name: "transport-test", version: "1.0.0" });
      mcp.registerTool("ping", { description: "Offline transport check" }, async () => ({
        content: [{ type: "text", text: "pong" }],
      }));
      return mcp;
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  afterEach(async () => {
    const closed = once(server, "close");
    server.close();
    server.closeAllConnections();
    await closed;
  });

  async function rpc(body: unknown) {
    const response = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    const data = text.startsWith("event:") || text.startsWith("data:")
      ? text.split("\n").find((line) => line.startsWith("data:"))?.slice(5)
      : text;
    return { status: response.status, body: data ? JSON.parse(data) : undefined };
  }

  it("accepts CenterMCP's initialize probe, then lists and calls tools on separate requests", async () => {
    const initialized = await rpc({
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "centermcp-api", version: "1.0" } },
    });
    expect(initialized.status).toBe(200);
    expect(initialized.body.result.serverInfo.name).toBe("transport-test");
    const notification = await rpc({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(notification.status).toBe(202);
    const tools = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    expect(tools.status).toBe(200);
    expect(tools.body.result.tools.map((tool: { name: string }) => tool.name)).toContain("ping");
    const called = await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "ping", arguments: {} } });
    expect(called.status).toBe(200);
    expect(called.body.result.content[0].text).toBe("pong");
  });

  it("serves health checks, rejects unknown routes, and reports invalid JSON", async () => {
    expect(await (await fetch(`${base}/healthz`)).text()).toBe("ok");
    expect((await fetch(`${base}/missing`)).status).toBe(404);
    expect((await fetch(`${base}/mcp`)).status).toBe(405);
    const malformed = await fetch(`${base}/mcp`, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: "{",
    });
    expect(malformed.status).toBe(400);
  });
});

describe("transport configuration", () => {
  it("fails invalid transport modes and ports before listening", async () => {
    const mode = process.env.MCP_TRANSPORT;
    const port = process.env.PORT;
    const factory = () => new McpServer({ name: "config-test", version: "1.0.0" });
    try {
      process.env.MCP_TRANSPORT = "invalid";
      await expect(startMcpServer(factory)).rejects.toThrow("MCP_TRANSPORT");
      process.env.MCP_TRANSPORT = "http";
      process.env.PORT = "invalid";
      await expect(startMcpServer(factory)).rejects.toThrow("PORT");
    } finally {
      if (mode === undefined) delete process.env.MCP_TRANSPORT;
      else process.env.MCP_TRANSPORT = mode;
      if (port === undefined) delete process.env.PORT;
      else process.env.PORT = port;
    }
  });
});
