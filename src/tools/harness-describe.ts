import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Registry } from "../registry/index.js";
import type { InputExpansionRule } from "../registry/types.js";
import { jsonResult, errorResult } from "../utils/response-formatter.js";
import { SCHEMAS, VALID_SCHEMAS } from "../data/schemas/index.js";

export function registerDescribeTool(server: McpServer, registry: Registry): void {
  const allTypes = registry.getAllResourceTypes() as [string, ...string[]];
  const allToolsets = registry.getAllToolsets().map(t => t.name) as [string, ...string[]];

  server.registerTool(
    "harness_describe",
    {
      description:
        "Describe Harness resource types and their operations (no API call). " +
        "Also fetches Harness YAML schemas for create/update body structure. " +
        `Available schemas: ${VALID_SCHEMAS.join(", ")}. ` +
        "Use resource_type to get resource details, schema_type to get a create/update body schema, or search_term to discover resource types.",
      inputSchema: {
        resource_type: z.enum(allTypes).describe("Get details for a specific resource type").optional(),
        toolset: z.enum(allToolsets).describe("Filter to a specific toolset").optional(),
        search_term: z.string().describe("Search for resource types by keyword (matches type name, display name, toolset, description)").optional(),
        schema_type: z
          .enum(VALID_SCHEMAS as [string, ...string[]])
          .describe("Fetch the Harness YAML schema for this resource type (pipeline, template, or trigger). Returns the JSON Schema definition so you know the exact body structure for harness_create/harness_update.")
          .optional(),
        schema_path: z
          .string()
          .optional()
          .describe(
            "When schema_type is set: dot-separated path to drill into a specific definition section. " +
            "E.g. 'trigger_source' for source types, 'scheduled_trigger' for cron spec, " +
            "'webhook_trigger' for webhook spec. Omit for a top-level summary.",
          ),
      },
      annotations: {
        title: "Describe Harness Resources",
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      // Schema mode — fetch Harness YAML schema for a resource type
      if (args.schema_type) {
        const schema = SCHEMAS[args.schema_type as keyof typeof SCHEMAS] as Record<string, unknown>;

        if (!args.schema_path) {
          return jsonResult(getSchemaSummary(schema, args.schema_type));
        }

        const node = navigateToSchemaPath(schema, args.schema_type, args.schema_path);
        if (!node) {
          const definitions = schema.definitions as Record<string, Record<string, unknown>> | undefined;
          const available = definitions ? Object.keys(definitions[args.schema_type] ?? {}) : [];
          return errorResult(
            `Path '${args.schema_path}' not found in ${args.schema_type} schema. ` +
            `Available sections: ${available.join(", ")}`,
          );
        }

        return jsonResult({
          schema_type: args.schema_type,
          path: args.schema_path,
          schema: inlineSchemaRefs(schema, node),
        });
      }

      if (args.resource_type) {
        try {
          const def = registry.getResource(args.resource_type);
          return jsonResult({
            resource_type: def.resourceType,
            displayName: def.displayName,
            description: def.description,
            toolset: def.toolset,
            scope: def.scope,
            identifierFields: def.identifierFields,
            listFilterFields: def.listFilterFields,
            operations: Object.entries(def.operations).map(([op, spec]) => ({
              operation: op,
              method: spec.method,
              description: spec.description,
              bodySchema: spec.bodySchema ?? undefined,
            })),
            executeActions: def.executeActions
              ? Object.entries(def.executeActions).map(([action, spec]) => ({
                  action,
                  method: spec.method,
                  description: spec.actionDescription,
                  bodySchema: spec.bodySchema ?? undefined,
                  ...(spec.inputExpansions?.length
                    ? { inputShorthands: buildShorthands(spec.inputExpansions) }
                    : {}),
                }))
              : undefined,
            diagnosticHint: def.diagnosticHint ?? undefined,
            relatedResources: def.relatedResources ?? undefined,
            executeHint: def.executeHint ?? undefined,
          });
        } catch (err) {
          // Resource type not found — return the compact summary with an error hint
          const summary = registry.describeSummary();
          return jsonResult({
            error: err instanceof Error ? err.message : String(err),
            ...summary,
          });
        }
      }

      // Search by keyword
      if (args.search_term) {
        const results = registry.searchResources(args.search_term);
        return jsonResult({
          search_term: args.search_term,
          total_results: results.length,
          resource_types: results,
          hint: results.length > 0
            ? "Call harness_describe with resource_type='<type>' for full details on a specific match."
            : "No matches found. Try a broader term, or call harness_describe with no arguments to see all resource types.",
        });
      }

      // Filter by toolset if specified — use full detail
      if (args.toolset) {
        const describe = registry.describe();
        const toolsets = describe.toolsets as Record<string, unknown>;
        const filtered = toolsets[args.toolset];
        if (!filtered) {
          return jsonResult({
            error: `Unknown toolset "${args.toolset}". Available: ${Object.keys(toolsets).join(", ")}`,
            available_toolsets: Object.keys(toolsets),
          });
        }
        return jsonResult({ toolset: args.toolset, ...filtered as object });
      }

      // No-args: return compact summary (~30 tokens per resource type)
      return jsonResult(registry.describeSummary());
    },
  );
}

/** Generate human-readable shorthand descriptions from expansion rules. */
function buildShorthands(rules: InputExpansionRule[]): Array<{ shorthand: string; expands_to: string }> {
  return rules.map((rule) => ({
    shorthand: rule.triggerKey,
    expands_to: summarizeExpansion(rule.expand),
  }));
}

/** Flatten an expand template into a readable dot-path summary. */
function summarizeExpansion(obj: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value === "$value") {
      parts.push(path);
    } else if (typeof value === "string") {
      parts.push(`${path}=${value}`);
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      parts.push(summarizeExpansion(value as Record<string, unknown>, path));
    }
  }
  return parts.join(", ");
}

// ---------------------------------------------------------------------------
// Schema helpers (used by the schema_type parameter)
// ---------------------------------------------------------------------------

/** Resolve a $ref pointer within the schema. E.g. "#/definitions/trigger/trigger_source" */
function resolveSchemaRef(schema: Record<string, unknown>, ref: string): unknown {
  if (!ref.startsWith("#/")) return undefined;
  const parts = ref.slice(2).split("/");
  let current: unknown = schema;
  for (const part of parts) {
    if (current && typeof current === "object" && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

/** Inline $ref references one level deep so the result is self-contained. */
function inlineSchemaRefs(schema: Record<string, unknown>, node: unknown, depth = 0): unknown {
  if (depth > 3) return node;
  if (!node || typeof node !== "object") return node;

  if (Array.isArray(node)) {
    return node.map((item) => inlineSchemaRefs(schema, item, depth));
  }

  const obj = node as Record<string, unknown>;
  if (typeof obj["$ref"] === "string") {
    const resolved = resolveSchemaRef(schema, obj["$ref"]);
    if (resolved && typeof resolved === "object") {
      return inlineSchemaRefs(schema, resolved, depth + 1);
    }
    return obj;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "$schema") continue;
    result[key] = inlineSchemaRefs(schema, value, depth + 1);
  }
  return result;
}

/** Navigate into definitions by dot-separated path. */
function navigateToSchemaPath(
  schema: Record<string, unknown>,
  resourceType: string,
  path: string,
): unknown {
  const definitions = schema.definitions as Record<string, unknown> | undefined;
  if (!definitions) return undefined;

  const resourceDefs = definitions[resourceType] as Record<string, unknown> | undefined;
  if (!resourceDefs) return undefined;

  if (resourceDefs[path]) return resourceDefs[path];

  const parts = path.split(".");
  let current: unknown = resourceDefs;
  for (const part of parts) {
    if (current && typeof current === "object" && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

/** Get a compact summary of the top-level structure of a schema. */
function getSchemaSummary(schema: Record<string, unknown>, resourceType: string): Record<string, unknown> {
  const definitions = schema.definitions as Record<string, Record<string, unknown>> | undefined;
  const sections = definitions ? Object.keys(definitions[resourceType] ?? {}) : [];

  const rootDef = definitions?.[resourceType]?.[resourceType] as Record<string, unknown> | undefined;
  const properties = rootDef?.properties as Record<string, unknown> | undefined;
  const required = rootDef?.required as string[] | undefined;

  const fields: Array<{ name: string; type: string; required: boolean; ref?: string }> = [];
  if (properties) {
    for (const [name, spec] of Object.entries(properties)) {
      const s = spec as Record<string, unknown>;
      fields.push({
        name,
        type: (s.type as string) ?? (s["$ref"] ? "object ($ref)" : "unknown"),
        required: required?.includes(name) ?? false,
        ...(s["$ref"] ? { ref: (s["$ref"] as string).split("/").pop() } : {}),
      });
    }
  }

  return {
    schema_type: resourceType,
    fields,
    available_sections: sections,
    hint: "Use schema_path parameter to drill into a section. E.g. schema_path='trigger_source' for source structure.",
  };
}
