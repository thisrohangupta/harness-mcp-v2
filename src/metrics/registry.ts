import { Registry, Gauge } from "prom-client";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Custom prom-client Registry — isolated from the global default registry.
 * All metrics for this MCP server are registered here exclusively.
 */
export const registry = new Registry();

/**
 * Read the server version from package.json.
 */
function getServerVersion(): string {
  try {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const pkgPath = resolve(thisDir, "..", "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Build info gauge — provides a static info metric for service discovery.
 * Always has value 1 (info-style metric per Prometheus convention).
 */
export const buildInfo = new Gauge({
  name: "mcp_build_info",
  help: "MCP server build information",
  labelNames: ["version", "node_version"] as const,
  registers: [registry],
});

// Set build info once at module load
buildInfo.labels({
  version: getServerVersion(),
  node_version: process.version,
}).set(1);
