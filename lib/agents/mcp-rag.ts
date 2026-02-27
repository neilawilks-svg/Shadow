import path from "node:path";

import { MCPServerStdio } from "@openai/agents";

let ragServer: MCPServerStdio | null = null;
let connected = false;
let connecting: Promise<void> | null = null;

function buildServer(): MCPServerStdio {
  return new MCPServerStdio({
    name: "local-rag-store",
    command: process.execPath,
    args: [path.join(process.cwd(), "scripts", "mcp", "local_rag_server.mjs")],
    cwd: process.cwd(),
    cacheToolsList: true,
  });
}

export function getLocalRagMcpServer(): MCPServerStdio {
  if (!ragServer) {
    ragServer = buildServer();
  }
  return ragServer;
}

export async function ensureLocalRagMcpConnected(): Promise<MCPServerStdio> {
  const server = getLocalRagMcpServer();
  if (!connected) {
    if (!connecting) {
      connecting = server
        .connect()
        .then(() => {
          connected = true;
        })
        .finally(() => {
          connecting = null;
        });
    }
    await connecting;
  }
  return server;
}

export async function closeLocalRagMcpServer(): Promise<void> {
  if (ragServer && connected) {
    await ragServer.close();
  }
  connected = false;
  connecting = null;
}
