# Technology Stack

**Analysis Date:** 2026-03-19

## Languages

**Primary:**
- TypeScript 5.7.3 - Entire codebase (src/)
- Node.js 20+ runtime (engines requirement in package.json)

## Runtime

**Environment:**
- Node.js 20.0.0 or higher
- ES2022 JavaScript target

**Package Manager:**
- pnpm 10.18.2
- Lockfile: pnpm-lock.yaml (present)

## Frameworks & Core Libraries

**MCP Protocol:**
- @modelcontextprotocol/sdk 1.27.1+ - MCP server SDK, transports (stdio, streamable HTTP, Express)
  - Stdio transport for single-process connections
  - StreamableHTTPServerTransport for multi-session HTTP
  - Express adapter (createMcpExpressApp)
  - Types, error handling, logging interface

**Web Server (HTTP Transport):**
- Express 5.2.1 - HTTP server for remote deployment, request routing, session middleware

**Authentication & Security:**
- jsonwebtoken 9.0.3 - JWT validation (Bearer tokens), signature verification, claims validation
  - Support for HS256, RS256, ES256 algorithms
  - Token validation with issuer/audience/expiration checks
  - Uses `dotenv` to load environment configuration

**Data Format & Serialization:**
- yaml 2.8.2 - Pipeline YAML parsing and serialization
- zod 4.0.0 - Schema validation for environment config and tool inputs (required v4 for explicit import)

**Image Processing:**
- @resvg/resvg-js 2.6.2 - SVG-to-PNG rendering for visualizations/diagrams

**Environment Configuration:**
- dotenv 17.3.1 - Load .env file on startup

## Build & Development

**Compiler:**
- TypeScript 5.7.3 (tsc)
  - Target: ES2022
  - Module: Node16 (ESM output)
  - Strict mode enabled
  - Source maps and declaration files generated

**Testing:**
- vitest 3.0.6 - Unit test runner (runs in vitest mode, watch mode available)
  - Config: vitest.config.ts (if present, otherwise inferred)
  - Commands: `pnpm test` (single run), `pnpm test:watch`

**Type Checking:**
- TypeScript strict mode
- noUncheckedIndexedAccess enabled
- skipLibCheck for faster builds

## Code Quality Tools

**Linting/Formatting:**
- Not explicitly configured in dependencies (no ESLint, Prettier in package.json)
- TypeScript strict mode provides type safety

## Key Dependencies

**Critical:**
- @modelcontextprotocol/sdk 1.27.1 - MCP protocol implementation and server infrastructure
- @resvg/resvg-js 2.6.2 - Visual rendering (used in utils/svg/render-png.ts)

**Infrastructure:**
- jsonwebtoken 9.0.3 - JWT validation and claims extraction (src/auth/jwt.ts)
- yaml 2.8.2 - Pipeline YAML parsing (registry, pipeline extraction)
- zod 4.0.0 - Runtime schema validation (strict to v4, not bare "zod" import)

**Development Infrastructure:**
- @types/express 5.0.6 - Express type definitions
- @types/jsonwebtoken 9.0.10 - JWT type definitions
- @types/node 22.13.5 - Node.js standard library types

## Configuration

**Environment Configuration:**
- `.env` file (not committed; uses .env.example as template)
- Configuration validation via Zod schema in `src/config.ts`
- Supports dual authentication: API Key OR JWT Bearer tokens

**Build Configuration:**
- `tsconfig.json` - TypeScript compiler options
- ESM module type (type: "module" in package.json)
- Output directory: build/
- Source directory: src/

**Runtime Configuration:**
- HARNESS_API_KEY (PAT token, optional if JWT_SECRET provided)
- HARNESS_ACCOUNT_ID (required unless extracted from PAT)
- HARNESS_BASE_URL (default: https://app.harness.io)
- HARNESS_FME_BASE_URL (default: https://api.split.io, for feature flag management)
- JWT_SECRET, JWT_ISSUER, JWT_AUDIENCE, JWT_ALGORITHM (for Bearer auth)
- PORT (for HTTP mode, default 3000)
- HARNESS_TOOLSETS (comma-separated list of enabled toolsets)
- LOG_LEVEL (debug, info, warn, error)

## Platform Requirements

**Development:**
- Node.js 20+
- pnpm 10.18.2
- TypeScript 5.7.3
- Git (for version control)

**Production:**
- Node.js 22-alpine (Docker image)
- Container deployment supported via Dockerfile
- Health check endpoint: GET /health (HTTP mode)
- Non-root user (mcp) for security

**Self-Managed Harness Support:**
- HARNESS_BASE_URL configurable for self-managed installations
- HARNESS_ALLOW_HTTP flag for local development (HTTPS required in production)

## Docker & Containerization

**Build:**
- Multi-stage build (Dockerfile)
  - Stage 1: node:22-alpine — pnpm install + tsc build
  - Stage 2: node:22-alpine — production dependencies only

**Runtime:**
- Port: 3000 (HTTP transport)
- Health check: wget -qO- http://localhost:3000/health
- User: mcp (non-root)
- Entry: node build/index.js http

## Data Serialization

**Formats:**
- JSON - API responses, tool outputs, configuration
- YAML - Pipeline definitions (parsed/serialized via yaml 2.8.2)
- SSE (Server-Sent Events) - Streaming chat responses from intelligence service

## Package Distribution

**npm Package:**
- Binary entry: `bin: { "harness-mcp-v2": "build/index.js" }`
- Distributed via npm
- Version: 0.6.8 (from package.json)
- Keywords: mcp, harness, ci-cd, ai-agent, devops

---

*Stack analysis: 2026-03-19*
