import express from "express";
import type { Server } from "node:http";
import { registry } from "./registry.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("metrics");

export interface MetricsServer {
  server: Server;
  close: () => Promise<void>;
}

/**
 * Create a dedicated Express HTTP server for Prometheus metrics scraping.
 * Runs on a separate port from MCP traffic. No middleware — bare routes only.
 *
 * Routes:
 *   GET  /metrics  → Prometheus text exposition format
 *   HEAD /metrics  → 200 + Content-Type (no body)
 *   GET  /healthz  → {"status":"ok"}
 *   *    *         → 404 Not Found
 */
export function createMetricsServer(port: number, host: string = "0.0.0.0"): Promise<MetricsServer> {
  const app = express();

  // GET /metrics — Prometheus scrape endpoint
  app.get("/metrics", async (_req, res) => {
    try {
      const metrics = await registry.metrics();
      res.setHeader("Content-Type", registry.contentType);
      res.end(metrics);
    } catch (err) {
      log.error("Failed to collect metrics", { error: String(err) });
      res.status(500).end("Internal Server Error");
    }
  });

  // HEAD /metrics — returns 200 + Content-Type, no body
  app.head("/metrics", (_req, res) => {
    res.setHeader("Content-Type", registry.contentType);
    res.status(200).end();
  });

  // GET /healthz — simple health check, no registry check
  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  // All other routes — 404
  app.use((_req, res) => {
    res.status(404).end("Not Found");
  });

  return new Promise<MetricsServer>((resolve, reject) => {
    const server = app.listen(port, host, () => {
      log.info(`Server listening on ${host}:${port}`);
      resolve({
        server,
        close: () => new Promise<void>((res, rej) => {
          server.close((err) => (err ? rej(err) : res()));
        }),
      });
    });

    server.on("error", (err) => {
      reject(err);
    });
  });
}
