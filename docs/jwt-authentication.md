# JWT Authentication

The Harness MCP server supports **Bearer token authentication** using JWT (JSON Web Tokens) for HTTP mode. This enables user identity tracking, multi-user deployments, and secure authentication for shared server instances.

## Features

- ✅ **Dual-mode authentication**: API key OR JWT (or both simultaneously)
- ✅ **User identity tracking**: Know which user executed which tool
- ✅ **Token validation**: Signature verification, expiration checking, issuer validation
- ✅ **Security**: HTTPS enforcement, HS256/RS256/ES256 signing algorithms
- ✅ **Backward compatible**: Existing API key auth continues to work unchanged

## Configuration

### Environment Variables

```bash
# JWT Authentication (optional — enables Bearer token auth in HTTP mode)
JWT_SECRET=your-hmac-secret-minimum-32-chars    # Required for JWT validation
JWT_ISSUER=https://app.harness.io               # Optional: validate token issuer
JWT_AUDIENCE=harness-mcp                        # Optional: validate token audience
JWT_ALGORITHM=HS256                             # Optional: HS256, RS256, or ES256

# API Key Authentication (existing — still works)
HARNESS_API_KEY=pat.xxxxx.xxxxx.xxxxx
HARNESS_ACCOUNT_ID=your-account-id
```

### Authentication Modes

| Mode | Required Env Vars | Use Case |
|------|-------------------|----------|
| **API Key Only** | `HARNESS_API_KEY` | Stdio mode, single-user deployments |
| **JWT Only** | `JWT_SECRET` | Multi-user HTTP deployments |
| **Dual Mode** | `JWT_SECRET` + `HARNESS_API_KEY` | Support both auth methods |

## JWT Token Structure

### Claims (from mcpServerInternal)

```json
{
  "type": "USER",
  "name": "John Doe",
  "email": "john@harness.io",
  "username": "johndoe",
  "accountId": "abc123",
  "iss": "https://app.harness.io",
  "iat": 1234567890,
  "exp": 1234571490
}
```

### Required Claims

- `type`: Must be `"USER"` or `"SERVICE_ACCOUNT"`
- `name`: User's full name (non-empty)
- `accountId`: Harness account identifier (non-empty)
- `email` or `username`: At least one must be present

### Optional Claims

- `iss`: Token issuer (validated if `JWT_ISSUER` configured)
- `aud`: Token audience (validated if `JWT_AUDIENCE` configured)

## Usage

### Generating Test Tokens

Create a simple Node.js script:

```javascript
// generate-jwt.mjs
import jwt from "jsonwebtoken";

const secret = process.env.JWT_SECRET || "test-secret-minimum-32-characters-long";
const token = jwt.sign(
  {
    type: "USER",
    name: "Test User",
    email: "test@harness.io",
    username: "testuser",
    accountId: process.env.HARNESS_ACCOUNT_ID || "test-account-123",
    iss: process.env.JWT_ISSUER || "https://app.harness.io",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
  },
  secret,
  { algorithm: "HS256" }
);

console.log("JWT Token:", token);
console.log("\nUsage:");
console.log(`curl -H "Authorization: Bearer ${token}" http://localhost:3000/mcp`);
```

Run with:
```bash
JWT_SECRET="your-secret" HARNESS_ACCOUNT_ID="acc123" node generate-jwt.mjs
```

### Making Authenticated Requests

#### Initialize Session with JWT

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": { "name": "test-client", "version": "1.0.0" }
    },
    "id": 1
  }'
```

#### Using MCP Session with JWT

Once initialized, use the returned `mcp-session-id` header:

```bash
curl -X POST http://localhost:3000/mcp \
  -H "mcp-session-id: <session-id>" \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "params": {},
    "id": 2
  }'
```

#### API Key Fallback (Dual Mode)

If both `JWT_SECRET` and `HARNESS_API_KEY` are configured, API key auth still works:

```bash
curl -X POST http://localhost:3000/mcp \
  -H "x-api-key: pat.acc123.token.secret" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}'
```

## Security

### HTTPS Enforcement

JWT mode **requires HTTPS** in production:

```bash
# ✅ Production (HTTPS required)
JWT_SECRET=your-secret
HARNESS_BASE_URL=https://mcp.your-domain.com

# ❌ Will fail — JWT requires HTTPS
JWT_SECRET=your-secret
HARNESS_BASE_URL=http://mcp.your-domain.com

# ✅ Local development (HTTP allowed)
JWT_SECRET=your-secret
HARNESS_BASE_URL=http://localhost:3000
HARNESS_ALLOW_HTTP=true
```

### Secret Management

- **Minimum length**: 32 characters for HS256
- **Storage**: Environment variables or secret manager (AWS Secrets Manager, HashiCorp Vault)
- **Rotation**: Not yet supported (future enhancement)
- **Never commit**: Keep secrets out of git

### Token Validation

- ✅ Signature verification (HS256, RS256, ES256)
- ✅ Expiration checking (`exp` claim)
- ✅ Issuer validation (`iss` claim, if configured)
- ✅ Audience validation (`aud` claim, if configured)
- ✅ Required claims enforcement

## Session Tracking

Sessions created with JWT authentication include user identity:

```typescript
{
  server: McpServer,
  transport: StreamableHTTPServerTransport,
  lastActivity: number,
  authContext: {
    principal: {
      uid: "test@harness.io",
      email: "test@harness.io",
      displayName: "Test User",
      accountId: "acc123",
      type: "USER"
    },
    accountId: "acc123",
    authMode: "jwt"
  }
}
```

Logs show authentication mode and user identity:

```json
{
  "ts": "2026-03-18T10:00:00.000Z",
  "level": "info",
  "module": "server",
  "msg": "Session created",
  "sessionId": "uuid-1234",
  "authMode": "jwt",
  "principal": "test@harness.io",
  "accountId": "acc123",
  "total": 1
}
```

## Error Responses

### 401 Unauthorized

**Invalid signature:**
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Authentication failed: JWT validation failed: invalid signature"
  },
  "id": null
}
```

**Expired token:**
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Authentication failed: JWT token has expired"
  },
  "id": null
}
```

**Missing claims:**
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Authentication failed: Missing required claim: accountId"
  },
  "id": null
}
```

**No auth provided:**
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Authentication required: provide Bearer token or x-api-key header"
  },
  "id": null
}
```

## Integration with genai-service

The JWT authentication mirrors mcpServerInternal's implementation, enabling seamless integration with Harness's genai-service:

1. **genai-service** generates JWT with user session data
2. **Sends** `Authorization: Bearer <jwt>` to MCP server
3. **MCP server** validates JWT and extracts user identity
4. **Tools execute** with user's Harness account credentials
5. **Audit logs** track which user executed which operation

## Testing

### Unit Tests

```bash
pnpm test tests/auth/
```

Tests cover:
- Valid JWT validation
- Expired token rejection
- Invalid signature rejection
- Missing claims rejection
- Issuer/audience validation
- Middleware integration

### Manual Testing

1. Start server with JWT enabled:
   ```bash
   JWT_SECRET="test-secret-minimum-32-characters-long" \
   HARNESS_API_KEY="pat.acc123.token.secret" \
   HARNESS_ACCOUNT_ID="acc123" \
   node build/index.js http
   ```

2. Generate test token (see script above)

3. Test authentication:
   ```bash
   # Test JWT auth
   curl -X POST http://localhost:3000/mcp \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}'

   # Test API key fallback
   curl -X POST http://localhost:3000/mcp \
     -H "x-api-key: pat.acc123.token.secret" \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}'
   ```

4. Check logs for auth mode:
   ```json
   {"ts":"...","level":"info","module":"server","msg":"Session created","sessionId":"...","authMode":"jwt","principal":"test@harness.io"}
   ```

## Troubleshooting

### "JWT token has expired"

**Cause**: Token `exp` claim is in the past.

**Fix**: Generate a new token with valid expiration.

### "JWT validation failed: invalid signature"

**Cause**: `JWT_SECRET` on server doesn't match secret used to sign token.

**Fix**: Ensure both use the same secret.

### "Missing required claim: accountId"

**Cause**: Token was signed without `accountId` claim.

**Fix**: Include all required claims when generating token.

### "JWT authentication requires HTTPS"

**Cause**: `JWT_SECRET` is set but server URL uses HTTP.

**Fix**: Either use HTTPS or set `HARNESS_ALLOW_HTTP=true` for local dev.

### "JWT authentication not configured on server"

**Cause**: Client sent Bearer token but server doesn't have `JWT_SECRET` set.

**Fix**: Set `JWT_SECRET` environment variable and restart server.

## Future Enhancements

- [ ] Refresh token support (long-lived sessions)
- [ ] RS256 public/private key pairs (asymmetric signing)
- [ ] Token rotation (multiple active secrets)
- [ ] Per-user rate limiting
- [ ] RBAC integration (role-based access control)
- [ ] Token revocation (blacklist)

## References

- **mcpServerInternal**: `pkg/auth/jwt.go`, `pkg/auth/session.go`
- **JWT Spec**: [RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519)
- **jsonwebtoken Library**: [npmjs.com/package/jsonwebtoken](https://www.npmjs.com/package/jsonwebtoken)
- **MCP Specification**: [modelcontextprotocol.io](https://modelcontextprotocol.io)
