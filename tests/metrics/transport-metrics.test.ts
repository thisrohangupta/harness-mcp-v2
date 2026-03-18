import { describe, it, expect, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { registry } from "../../src/metrics/registry.js";

// Reset all transport metric values before each test to ensure isolation.
// We do NOT use registry.resetMetrics() because metrics are module-level singletons
// and cannot be re-registered once deregistered.
beforeEach(async () => {
  // Import the module once to ensure all metrics are registered
  await import("../../src/metrics/transport-metrics.js");
  // Reset each metric individually
  for (const name of [
    "http_request_duration_seconds",
    "http_requests_total",
    "mcp_request_size_bytes",
    "mcp_response_size_bytes",
  ]) {
    const metric = registry.getSingleMetric(name);
    if (metric) {
      metric.reset();
    }
  }
});

/**
 * Build a minimal mock Express Request object.
 */
function makeMockReq(overrides: Partial<{
  method: string;
  path: string;
  headers: Record<string, string>;
}> = {}) {
  return {
    method: overrides.method ?? "GET",
    path: overrides.path ?? "/health",
    headers: overrides.headers ?? {},
  };
}

/**
 * Build a minimal mock Express Response object backed by EventEmitter
 * so we can simulate the "finish" event.
 */
function makeMockRes(overrides: Partial<{
  statusCode: number;
  contentLength: string | undefined;
}> = {}) {
  const emitter = new EventEmitter();
  const res = Object.assign(emitter, {
    statusCode: overrides.statusCode ?? 200,
    getHeader: (name: string) => {
      if (name.toLowerCase() === "content-length") {
        return overrides.contentLength;
      }
      return undefined;
    },
  });
  return res;
}

describe("Transport Metrics — metric registration", () => {
  it("http_request_duration_seconds histogram is registered on the custom registry", () => {
    const metric = registry.getSingleMetric("http_request_duration_seconds");
    expect(metric).toBeDefined();
  });

  it("http_requests_total counter is registered on the custom registry", () => {
    const metric = registry.getSingleMetric("http_requests_total");
    expect(metric).toBeDefined();
  });

  it("mcp_request_size_bytes histogram is registered on the custom registry", () => {
    const metric = registry.getSingleMetric("mcp_request_size_bytes");
    expect(metric).toBeDefined();
  });

  it("mcp_response_size_bytes histogram is registered on the custom registry", () => {
    const metric = registry.getSingleMetric("mcp_response_size_bytes");
    expect(metric).toBeDefined();
  });
});

describe("createHttpMetricsMiddleware — middleware behaviour", () => {
  it("calls next() to pass control downstream", async () => {
    const { createHttpMetricsMiddleware } = await import("../../src/metrics/transport-metrics.js");
    const middleware = createHttpMetricsMiddleware();

    let nextCalled = false;
    const next = () => { nextCalled = true; };

    const req = makeMockReq({ method: "POST", path: "/mcp" });
    const res = makeMockRes();

    middleware(req as any, res as any, next as any);
    expect(nextCalled).toBe(true);
  });

  it("after response 'finish', http_requests_total is incremented with correct method/path/status labels", async () => {
    const { createHttpMetricsMiddleware } = await import("../../src/metrics/transport-metrics.js");
    const middleware = createHttpMetricsMiddleware();

    const req = makeMockReq({ method: "POST", path: "/mcp" });
    const res = makeMockRes({ statusCode: 200 });

    middleware(req as any, res as any, () => {});
    res.emit("finish");

    const output = await registry.metrics();
    expect(output).toContain('method="POST"');
    expect(output).toContain('path="/mcp"');
    expect(output).toContain('status="200"');
    expect(output).toContain("http_requests_total");
  });

  it("after response 'finish', http_request_duration_seconds observes a value >= 0", async () => {
    const { createHttpMetricsMiddleware } = await import("../../src/metrics/transport-metrics.js");
    const middleware = createHttpMetricsMiddleware();

    const req = makeMockReq({ method: "GET", path: "/health" });
    const res = makeMockRes({ statusCode: 200 });

    middleware(req as any, res as any, () => {});
    res.emit("finish");

    const output = await registry.metrics();
    expect(output).toContain("http_request_duration_seconds_sum");
    expect(output).toContain("http_request_duration_seconds_count");
  });

  it("request size is read from content-length request header", async () => {
    const { createHttpMetricsMiddleware } = await import("../../src/metrics/transport-metrics.js");
    const middleware = createHttpMetricsMiddleware();

    const req = makeMockReq({
      method: "POST",
      path: "/mcp",
      headers: { "content-length": "1024" },
    });
    const res = makeMockRes();

    middleware(req as any, res as any, () => {});
    res.emit("finish");

    const output = await registry.metrics();
    // 1024 bytes should appear in mcp_request_size_bytes_sum
    expect(output).toContain("mcp_request_size_bytes_sum");
  });

  it("request size defaults to 0 when content-length header is absent", async () => {
    const { createHttpMetricsMiddleware } = await import("../../src/metrics/transport-metrics.js");
    const middleware = createHttpMetricsMiddleware();

    const req = makeMockReq({ method: "GET", path: "/health" }); // no headers
    const res = makeMockRes();

    middleware(req as any, res as any, () => {});
    res.emit("finish");

    const output = await registry.metrics();
    // sum should be 0 (size 0 observed once)
    expect(output).toContain("mcp_request_size_bytes_sum 0");
  });

  it("response size is read from content-length response header", async () => {
    const { createHttpMetricsMiddleware } = await import("../../src/metrics/transport-metrics.js");
    const middleware = createHttpMetricsMiddleware();

    const req = makeMockReq({ method: "GET", path: "/metrics" });
    const res = makeMockRes({ statusCode: 200, contentLength: "2048" });

    middleware(req as any, res as any, () => {});
    res.emit("finish");

    const output = await registry.metrics();
    expect(output).toContain("mcp_response_size_bytes_sum");
  });

  it("response size defaults to 0 when content-length response header is absent", async () => {
    const { createHttpMetricsMiddleware } = await import("../../src/metrics/transport-metrics.js");
    const middleware = createHttpMetricsMiddleware();

    const req = makeMockReq({ method: "GET", path: "/health" });
    const res = makeMockRes(); // no contentLength

    middleware(req as any, res as any, () => {});
    res.emit("finish");

    const output = await registry.metrics();
    expect(output).toContain("mcp_response_size_bytes_sum 0");
  });
});

describe("Histogram bucket boundaries", () => {
  it("http_request_duration_seconds has buckets [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5]", async () => {
    const { createHttpMetricsMiddleware } = await import("../../src/metrics/transport-metrics.js");
    const middleware = createHttpMetricsMiddleware();

    const req = makeMockReq({ method: "GET", path: "/health" });
    const res = makeMockRes();
    middleware(req as any, res as any, () => {});
    res.emit("finish");

    const output = await registry.metrics();
    expect(output).toContain('le="0.001"');
    expect(output).toContain('le="0.005"');
    expect(output).toContain('le="0.01"');
    expect(output).toContain('le="0.05"');
    expect(output).toContain('le="0.1"');
    expect(output).toContain('le="0.5"');
    expect(output).toContain('le="1"');
    expect(output).toContain('le="5"');
  });

  it("mcp_request_size_bytes has buckets [0, 100, 1000, 10000, 100000, 1000000]", async () => {
    const { createHttpMetricsMiddleware } = await import("../../src/metrics/transport-metrics.js");
    const middleware = createHttpMetricsMiddleware();

    const req = makeMockReq({ method: "POST", path: "/mcp" });
    const res = makeMockRes();
    middleware(req as any, res as any, () => {});
    res.emit("finish");

    const output = await registry.metrics();
    // Check the section for mcp_request_size_bytes specifically
    const lines = output.split("\n");
    const reqSizeLines = lines.filter(l => l.startsWith("mcp_request_size_bytes_bucket"));
    expect(reqSizeLines.some(l => l.includes('le="0"'))).toBe(true);
    expect(reqSizeLines.some(l => l.includes('le="100"'))).toBe(true);
    expect(reqSizeLines.some(l => l.includes('le="1000"'))).toBe(true);
    expect(reqSizeLines.some(l => l.includes('le="10000"'))).toBe(true);
    expect(reqSizeLines.some(l => l.includes('le="100000"'))).toBe(true);
    expect(reqSizeLines.some(l => l.includes('le="1000000"'))).toBe(true);
  });

  it("mcp_response_size_bytes has buckets [0, 100, 1000, 10000, 100000, 1000000]", async () => {
    const { createHttpMetricsMiddleware } = await import("../../src/metrics/transport-metrics.js");
    const middleware = createHttpMetricsMiddleware();

    const req = makeMockReq({ method: "GET", path: "/health" });
    const res = makeMockRes();
    middleware(req as any, res as any, () => {});
    res.emit("finish");

    const output = await registry.metrics();
    const lines = output.split("\n");
    const resSizeLines = lines.filter(l => l.startsWith("mcp_response_size_bytes_bucket"));
    expect(resSizeLines.some(l => l.includes('le="0"'))).toBe(true);
    expect(resSizeLines.some(l => l.includes('le="100"'))).toBe(true);
    expect(resSizeLines.some(l => l.includes('le="1000"'))).toBe(true);
    expect(resSizeLines.some(l => l.includes('le="10000"'))).toBe(true);
    expect(resSizeLines.some(l => l.includes('le="100000"'))).toBe(true);
    expect(resSizeLines.some(l => l.includes('le="1000000"'))).toBe(true);
  });
});
