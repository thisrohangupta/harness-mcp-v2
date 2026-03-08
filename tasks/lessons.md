# Lessons Learned

## MCP SDK v1.27+ Type Compatibility
- **Issue**: `server.tool()` callback return type requires `[key: string]: unknown` index signature on the result object.
- **Fix**: Add `[key: string]: unknown` to the ToolResult interface.
- **Rule**: Always check MCP SDK type expectations for return types before defining custom interfaces.

## MCP SDK Prompt API
- **Issue**: `server.prompt()` does NOT accept an array of `{ name, description, required }` for args. It uses a Zod schema object.
- **Fix**: Use `{ paramName: z.string().describe("...").optional() }` format for prompt argument schemas.
- **Rule**: Check the actual SDK `.d.ts` types, not just documentation examples that may be outdated.

## Cursor Plugin / SKILL.md Pattern
- **Pattern**: Notion MCP bundles skills alongside their MCP server as a Cursor plugin. Skills are SKILL.md files with YAML frontmatter (name, description) + markdown instructions.
- **Key insight**: Skills complement MCP tools — tools provide low-level API access, skills provide high-level guided workflows that teach the agent to compose multiple tool calls.
- **Structure**: `.cursor-plugin/plugin.json` (manifest), `.mcp.json` (MCP server config), `skills/<name>/SKILL.md` (one per workflow).
- **Token efficiency**: Skills use a 3-phase loading model (Discovery → Activation → Execution) to avoid bloating the context with unused instructions.
- **Rule**: Every MCP prompt template should have a corresponding SKILL.md. Prompts are MCP-protocol-level (any client), skills are agent-level (Cursor/Claude Code). Keep both in sync.
