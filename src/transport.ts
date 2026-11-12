import { createServer, type Server } from "node:http";
import { createMcpHandler, type McpServerFactory } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

const onerror = (error: Error) => console.error(`awwwards-mcp: server error: ${error.message}`);

export function createMcpHttpServer(factory: McpServerFactory): Server {
  const handler = createMcpHandler(factory, { onerror });
  const handleRequest = toNodeHandler(handler, { onerror });
  const server = createServer((request, response) => {
    const path = request.url?.split("?")[0];
    if (path === "/healthz") {
      response.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
      return;
    }
    if (path !== "/mcp") {
      response.writeHead(404).end("Not found");
      return;
    }
    void handleRequest(request, response).catch((error: Error) => {
      onerror(error);
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });
  server.once("close", () => { void handler.close().catch(onerror); });
  return server;
}

export async function startMcpServer(factory: McpServerFactory): Promise<Server | undefined> {
  const mode = (process.env.MCP_TRANSPORT?.trim() || "stdio").toLowerCase();
  if (mode === "stdio") {
    await serveStdio(factory, { onerror });
    return;
  }
  if (mode !== "http" && mode !== "streamable-http") {
    throw new Error("MCP_TRANSPORT must be stdio, http, or streamable-http");
  }
  const port = Number(process.env.PORT?.trim() || "8000");
  const host = process.env.HOST?.trim() || "0.0.0.0";
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  const server = createMcpHttpServer(factory);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  console.error(`awwwards-mcp: HTTP server listening at http://${host}:${port}/mcp`);
  return server;
}
