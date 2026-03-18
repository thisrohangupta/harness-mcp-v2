import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createMetricsServer, type MetricsServer } from "../../src/metrics/server.js";

describe("Metrics Server", () => {
  let metricsServer: MetricsServer;
  const testPort = 19091;
  const testHost = "127.0.0.1";
  const baseUrl = `http://${testHost}:${testPort}`;

  beforeAll(async () => {
    metricsServer = await createMetricsServer(testPort, testHost);
  });

  afterAll(async () => {
    await metricsServer.close();
  });

  it("GET /metrics returns 200 with Content-Type containing text/plain", async () => {
    const res = await fetch(`${baseUrl}/metrics`);
    expect(res.status).toBe(200);
    const contentType = res.headers.get("Content-Type");
    expect(contentType).toBeTruthy();
    expect(contentType).toContain("text/plain");
  });

  it("GET /metrics body contains mcp_build_info", async () => {
    const res = await fetch(`${baseUrl}/metrics`);
    const body = await res.text();
    expect(body).toContain("mcp_build_info");
  });

  it("GET /metrics body contains # HELP and # TYPE (Prometheus format)", async () => {
    const res = await fetch(`${baseUrl}/metrics`);
    const body = await res.text();
    expect(body).toContain("# HELP");
    expect(body).toContain("# TYPE");
  });

  it("HEAD /metrics returns 200 with Content-Type header, empty body", async () => {
    const res = await fetch(`${baseUrl}/metrics`, { method: "HEAD" });
    expect(res.status).toBe(200);
    const contentType = res.headers.get("Content-Type");
    expect(contentType).toBeTruthy();
    expect(contentType).toContain("text/plain");
    const body = await res.text();
    expect(body).toBe("");
  });

  it("GET /healthz returns 200 with body {\"status\":\"ok\"}", async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ status: "ok" });
  });

  it("GET /healthz Content-Type contains application/json", async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    const contentType = res.headers.get("Content-Type");
    expect(contentType).toBeTruthy();
    expect(contentType).toContain("application/json");
  });

  it("GET /unknown-route returns 404", async () => {
    const res = await fetch(`${baseUrl}/unknown-route`);
    expect(res.status).toBe(404);
  });

  it("POST /metrics returns 404", async () => {
    const res = await fetch(`${baseUrl}/metrics`, { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("Server listens on specified port", async () => {
    // If we got this far, the server is listening (beforeAll succeeded)
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
  });

  it("Server close() resolves without error", async () => {
    // This will be tested in afterAll, but we can also test it explicitly
    // by creating a temporary server
    const tempServer = await createMetricsServer(19092, testHost);
    await expect(tempServer.close()).resolves.toBeUndefined();
  });
});
