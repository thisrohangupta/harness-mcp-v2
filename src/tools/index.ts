import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Registry } from "../registry/index.js";
import type { HarnessClient } from "../client/harness-client.js";
import type { Config } from "../config.js";
import { withMetrics } from "../metrics/tool-metrics.js";

import { registerListTool } from "./harness-list.js";
import { registerGetTool } from "./harness-get.js";
import { registerCreateTool } from "./harness-create.js";
import { registerUpdateTool } from "./harness-update.js";
import { registerDeleteTool } from "./harness-delete.js";
import { registerExecuteTool } from "./harness-execute.js";
import { registerDiagnoseTool } from "./harness-diagnose.js";
import { registerSearchTool } from "./harness-search.js";
import { registerDescribeTool } from "./harness-describe.js";
import { registerStatusTool } from "./harness-status.js";
import { registerAskTool } from "./harness-ask.js";

/**
 * Creates a proxy around McpServer that intercepts every registerTool() call
 * and wraps the handler with withMetrics instrumentation.
 *
 * This approach instruments all 11 tools at the registration point without
 * modifying any individual tool file.
 */
function createInstrumentedServer(server: McpServer, harnessRegistry: Registry): McpServer {
  const proxy = Object.create(server) as McpServer;
  const originalRegisterTool = server.registerTool.bind(server);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (proxy as any).registerTool = function (name: string, config: unknown, handler: unknown) {
    if (typeof handler === "function") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wrapped = withMetrics(name, harnessRegistry)(handler as any);
      return originalRegisterTool(name, config as Parameters<typeof originalRegisterTool>[1], wrapped as Parameters<typeof originalRegisterTool>[2]);
    }
    return originalRegisterTool(name, config as Parameters<typeof originalRegisterTool>[1], handler as Parameters<typeof originalRegisterTool>[2]);
  };

  return proxy;
}

export function registerAllTools(server: McpServer, registry: Registry, client: HarnessClient, config: Config): void {
  const instrumented = createInstrumentedServer(server, registry);
  registerListTool(instrumented, registry, client);
  registerGetTool(instrumented, registry, client);
  registerCreateTool(instrumented, registry, client);
  registerUpdateTool(instrumented, registry, client);
  registerDeleteTool(instrumented, registry, client);
  registerExecuteTool(instrumented, registry, client);
  registerDiagnoseTool(instrumented, registry, client, config);
  registerSearchTool(instrumented, registry, client);
  registerDescribeTool(instrumented, registry);
  registerStatusTool(instrumented, registry, client, config);
  registerAskTool(instrumented, registry, client, config);
}
