import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonResult, errorResult } from "../utils/response-formatter.js";
import { SCHEMAS, VALID_SCHEMAS } from "../data/schemas/index.js";

/** Schemas whose root is not definitions[resourceType][resourceType] (e.g. top-level oneOf). */
const SCHEMA_ROOT_DEFINITION_KEY: Partial<Record<(typeof VALID_SCHEMAS)[number], string>> = {
  "agent-pipeline": "pipeline",
};

/**
 * Resolve a $ref pointer within the schema.
 * E.g. "#/definitions/trigger/trigger_source" → schema.definitions.trigger.trigger_source
 */
function resolveRef(schema: Record<string, unknown>, ref: string): unknown {
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

/**
 * Inline $ref references one level deep so the returned schema fragment
 * is self-contained and useful without chasing references.
 */
function inlineRefs(schema: Record<string, unknown>, node: unknown, depth = 0): unknown {
  if (depth > 3) return node; // prevent infinite recursion
  if (!node || typeof node !== "object") return node;

  if (Array.isArray(node)) {
    return node.map((item) => inlineRefs(schema, item, depth));
  }

  const obj = node as Record<string, unknown>;

  // If this node is a $ref, resolve it
  if (typeof obj["$ref"] === "string") {
    const resolved = resolveRef(schema, obj["$ref"]);
    if (resolved && typeof resolved === "object") {
      return inlineRefs(schema, resolved, depth + 1);
    }
    return obj;
  }

  // Recurse into child properties
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "$schema") continue; // strip noise
    result[key] = inlineRefs(schema, value, depth + 1);
  }
  return result;
}

/**
 * Navigate into definitions by dot-separated path.
 * E.g. "trigger_source" → definitions.trigger.trigger_source
 *       "scheduled_trigger" → definitions.trigger.scheduled_trigger
 */
function navigateToPath(
  schema: Record<string, unknown>,
  resourceType: string,
  path: string,
): unknown {
  const definitions = schema.definitions as Record<string, unknown> | undefined;
  if (!definitions) return undefined;

  const resourceDefs = definitions[resourceType] as Record<string, unknown> | undefined;
  if (!resourceDefs) return undefined;

  // Try direct key first
  if (resourceDefs[path]) return resourceDefs[path];

  // Try dot-separated path
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

/**
 * Summarize a JSON Schema root that is a oneOf (e.g. agent-pipeline: template vs agent vs pipeline body).
 */
function getOneOfRootSummary(schema: Record<string, unknown>, resourceType: string, sections: string[]): Record<string, unknown> {
  const oneOf = schema.oneOf;
  if (!Array.isArray(oneOf)) {
    return {
      resource_type: resourceType,
      fields: [],
      available_sections: sections,
      hint: "Use path to drill into definitions (e.g. path='Agent' for agent step schema).",
    };
  }

  const variants: Array<{
    variant_index: number;
    required: string[];
    properties: string[];
    description: string;
  }> = [];

  for (let i = 0; i < oneOf.length; i++) {
    const branch = oneOf[i];
    if (!branch || typeof branch !== "object" || Array.isArray(branch)) continue;
    const b = branch as Record<string, unknown>;
    const req = Array.isArray(b.required) ? (b.required as string[]) : [];
    const props = b.properties as Record<string, unknown> | undefined;
    const keys = props ? Object.keys(props) : [];
    const desc =
      req.length > 0
        ? `Requires: ${req.join(", ")}`
        : keys.length > 0
          ? `Optional shape keys: ${keys.slice(0, 8).join(", ")}${keys.length > 8 ? ", …" : ""}`
          : "Branch (see schema for details)";
    variants.push({
      variant_index: i + 1,
      required: req,
      properties: keys,
      description: desc,
    });
  }

  return {
    resource_type: resourceType,
    summary_kind: "oneOf_root",
    variants,
    available_sections: sections,
    hint:
      "Root document is a oneOf: pick the variant that matches your YAML (e.g. agent-first vs template). " +
      "Use path='Agent', path='stages', path='steps' to drill into definition sections.",
  };
}

/**
 * Get a compact summary of the top-level structure: property names, types,
 * required fields, and available definition sections.
 */
/** Exported for tests — same logic used by harness_schema when path is omitted. */
export function getHarnessSchemaSummary(schema: Record<string, unknown>, resourceType: string): Record<string, unknown> {
  const definitions = schema.definitions as Record<string, Record<string, unknown>> | undefined;
  const sections = definitions ? Object.keys(definitions[resourceType] ?? {}) : [];

  const rootKey = SCHEMA_ROOT_DEFINITION_KEY[resourceType as keyof typeof SCHEMA_ROOT_DEFINITION_KEY] ?? resourceType;

  // Get the root resource definition (default: definitions[rt][rt])
  let rootDef = definitions?.[resourceType]?.[rootKey] as Record<string, unknown> | undefined;
  if (!rootDef && rootKey !== resourceType) {
    rootDef = definitions?.[resourceType]?.[resourceType] as Record<string, unknown> | undefined;
  }

  if (!rootDef && resourceType === "agent-pipeline" && schema.oneOf) {
    return getOneOfRootSummary(schema, resourceType, sections);
  }

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
    resource_type: resourceType,
    fields,
    available_sections: sections,
    hint: "Use path parameter to drill into a section. E.g. path='trigger_source' for source structure, path='scheduled_trigger' for cron spec.",
  };
}

export function registerSchemaTool(server: McpServer): void {
  server.registerTool(
    "harness_schema",
    {
      description:
        "Fetch Harness YAML schema for a resource type. Returns the JSON Schema definition " +
        "so you know the exact body structure for harness_create/harness_update. " +
        "Use without path for a summary of fields and available sections. " +
        "Use with path to drill into a specific section (e.g. path='Agent' for agent structure, path='scheduled_trigger' for cron trigger spec). " +
        `Available schemas: ${VALID_SCHEMAS.join(", ")}.`,
      inputSchema: {
        resource_type: z
          .enum(VALID_SCHEMAS as [string, ...string[]])
          .describe(`Schema to fetch. Available: ${VALID_SCHEMAS.join(", ")}`),
        path: z
          .string()
          .optional()
          .describe(
            "Dot-separated path to drill into a specific definition section. " +
            "For 'agent-pipeline': path='Agent' (agent structure), path='stages' (stage definitions), path='steps' (step types). " +
            "For 'trigger': path='trigger_source', path='scheduled_trigger', path='webhook_trigger'. " +
            "For 'pipeline': path='stages', path='steps'. " +
            "Omit for a top-level summary showing all available sections.",
          ),
      },
      annotations: {
        title: "Harness YAML Schema",
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const schema = SCHEMAS[args.resource_type as keyof typeof SCHEMAS] as Record<string, unknown>;

        // No path → return summary
        if (!args.path) {
          return jsonResult(getHarnessSchemaSummary(schema, args.resource_type));
        }

        // Navigate to the requested path
        const node = navigateToPath(schema, args.resource_type, args.path);
        if (!node) {
          const definitions = schema.definitions as Record<string, Record<string, unknown>> | undefined;
          const available = definitions ? Object.keys(definitions[args.resource_type] ?? {}) : [];
          return errorResult(
            `Path '${args.path}' not found in ${args.resource_type} schema. ` +
            `Available sections: ${available.join(", ")}`,
          );
        }

        // Inline $ref references so the result is self-contained
        const resolved = inlineRefs(schema, node);

        return jsonResult({
          resource_type: args.resource_type,
          path: args.path,
          schema: resolved,
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );
}
