import { Gauge } from "prom-client";
import { registry } from "./registry.js";

/**
 * Gauge tracking the number of currently active MCP sessions.
 * Incremented on session connect, decremented on session disconnect.
 */
const activeSessions = new Gauge({
  name: "mcp_active_sessions",
  help: "Number of currently active MCP sessions",
  registers: [registry],
});

/**
 * Record a new MCP session connection — increments the active sessions gauge.
 * Call this when a client establishes a session (e.g. SSE connection opened).
 */
export function sessionConnected(): void {
  activeSessions.inc();
}

/**
 * Record an MCP session disconnection — decrements the active sessions gauge.
 * Call this when a client session ends (e.g. SSE connection closed).
 */
export function sessionDisconnected(): void {
  activeSessions.dec();
}
