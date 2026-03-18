import { Counter, Histogram } from "prom-client";
import { registry } from "./registry.js";
import type { RequestHandler } from "express";

/**
 * Histogram tracking HTTP request latency in seconds.
 * Labelled by HTTP method, request path, and response status code.
 * Timer starts at request arrival (before body parsing) for full round-trip coverage.
 */
const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "path", "status"] as const,
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [registry],
});

/**
 * Counter tracking total HTTP requests received.
 * Labelled by HTTP method, request path, and response status code.
 */
const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "path", "status"] as const,
  registers: [registry],
});

/**
 * Histogram tracking incoming MCP request payload sizes in bytes.
 * Read from the Content-Length request header; defaults to 0 for GET/DELETE.
 * Label-free to avoid cardinality risk from variable content sizes.
 */
const requestSizeBytes = new Histogram({
  name: "mcp_request_size_bytes",
  help: "Size of incoming MCP request payloads in bytes",
  buckets: [0, 100, 1000, 10000, 100000, 1000000],
  registers: [registry],
});

/**
 * Histogram tracking outgoing MCP response payload sizes in bytes.
 * Read from the Content-Length response header in the "finish" event.
 * Defaults to 0 for SSE streams that do not set Content-Length.
 */
const responseSizeBytes = new Histogram({
  name: "mcp_response_size_bytes",
  help: "Size of outgoing MCP response payloads in bytes",
  buckets: [0, 100, 1000, 10000, 100000, 1000000],
  registers: [registry],
});

/**
 * Factory function that creates an Express middleware for recording HTTP
 * transport metrics on every request-response cycle.
 *
 * Records:
 *   - http_request_duration_seconds (start timer before next(), stop on finish)
 *   - http_requests_total (incremented on finish with method/path/status labels)
 *   - mcp_request_size_bytes (from Content-Length request header)
 *   - mcp_response_size_bytes (from Content-Length response header on finish)
 *
 * @returns Express RequestHandler middleware.
 */
export function createHttpMetricsMiddleware(): RequestHandler {
  return (req, res, next) => {
    // Start timing immediately — before body parsing for full round-trip latency.
    const end = httpRequestDuration.startTimer();

    // Record incoming request payload size from Content-Length header.
    // Defaults to 0 when header is absent (e.g. GET requests).
    const reqSize = parseInt(req.headers["content-length"] ?? "0", 10) || 0;
    requestSizeBytes.observe(reqSize);

    // Record remaining metrics once the response has been fully sent.
    res.on("finish", () => {
      const labels = {
        method: req.method,
        path: req.path,
        status: res.statusCode.toString(),
      };

      // Stop the duration timer with labels — records observation in histogram.
      end(labels);

      // Increment the requests counter with the same labels.
      httpRequestsTotal.inc(labels);

      // Record outgoing response payload size from Content-Length response header.
      // Defaults to 0 for SSE streams that do not set Content-Length.
      const resHeaderValue = res.getHeader("content-length");
      const resSize = parseInt((resHeaderValue as string) ?? "0", 10) || 0;
      responseSizeBytes.observe(resSize);
    });

    next();
  };
}
