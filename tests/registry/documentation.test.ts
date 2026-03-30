/**
 * Tests for the documentation toolset's custom extractor, bodyBuilder, and headersBuilder.
 * Per CONTRIBUTING.md, custom responseExtractor and bodyBuilder logic warrants verification.
 */
import { describe, it, expect } from "vitest";
import { chatbotResponseExtract } from "../../src/registry/extractors.js";
import { documentationToolset } from "../../src/registry/toolsets/documentation.js";
import type { EndpointSpec } from "../../src/registry/types.js";

const listSpec = documentationToolset.resources[0].operations.list as EndpointSpec;

describe("chatbotResponseExtract", () => {
  it("wraps a string response", () => {
    const result = chatbotResponseExtract("Hello world");
    expect(result).toEqual({ items: [{ answer: "Hello world" }], total: 1 });
  });

  it("preserves an object with answer field", () => {
    const raw = { answer: "Use pipelines", sources: ["https://docs.harness.io/pipelines"] };
    const result = chatbotResponseExtract(raw);
    expect(result).toEqual({ items: [raw], total: 1 });
  });

  it("JSON-stringifies unknown object shapes", () => {
    const raw = { unexpected: "data" };
    const result = chatbotResponseExtract(raw);
    expect(result.items).toHaveLength(1);
    expect((result.items[0] as { answer: string }).answer).toBe(JSON.stringify(raw));
    expect(result.total).toBe(1);
  });

  it("handles null by stringifying", () => {
    const result = chatbotResponseExtract(null);
    expect(result).toEqual({ items: [{ answer: "null" }], total: 1 });
  });
});

describe("documentation bodyBuilder", () => {
  const bodyBuilder = listSpec.bodyBuilder!;

  it("maps search_term to question", () => {
    const body = bodyBuilder({ search_term: "how to create a pipeline" }) as Record<string, unknown>;
    expect(body.question).toBe("how to create a pipeline");
  });

  it("falls back through query → search → question → name", () => {
    expect((bodyBuilder({ query: "q1" }) as Record<string, unknown>).question).toBe("q1");
    expect((bodyBuilder({ search: "s1" }) as Record<string, unknown>).question).toBe("s1");
    expect((bodyBuilder({ question: "q2" }) as Record<string, unknown>).question).toBe("q2");
    expect((bodyBuilder({ name: "n1" }) as Record<string, unknown>).question).toBe("n1");
  });

  it("throws on empty question", () => {
    expect(() => bodyBuilder({})).toThrow("non-empty question is required");
    expect(() => bodyBuilder({ search_term: "  " })).toThrow("non-empty question is required");
  });

  it("includes chat_history when present and non-empty", () => {
    const history = [{ question: "q1", answer: "a1" }];
    const body = bodyBuilder({ search_term: "follow-up", chat_history: history }) as Record<string, unknown>;
    expect(body.chat_history).toEqual(history);
  });

  it("omits chat_history when empty or absent", () => {
    const body1 = bodyBuilder({ search_term: "test" }) as Record<string, unknown>;
    expect(body1.chat_history).toBeUndefined();
    const body2 = bodyBuilder({ search_term: "test", chat_history: [] }) as Record<string, unknown>;
    expect(body2.chat_history).toBeUndefined();
  });
});

describe("documentation headersBuilder", () => {
  const headersBuilder = listSpec.headersBuilder!;

  it("always includes X-Request-ID", () => {
    const headers = headersBuilder({});
    expect(headers["X-Request-ID"]).toBeDefined();
    expect(headers["X-Request-ID"].length).toBeGreaterThan(0);
  });

  it("generates unique X-Request-ID on each call", () => {
    const h1 = headersBuilder({});
    const h2 = headersBuilder({});
    expect(h1["X-Request-ID"]).not.toBe(h2["X-Request-ID"]);
  });

  it("includes X-Conversation-Id when provided", () => {
    const headers = headersBuilder({ conversation_id: "conv-123" });
    expect(headers["X-Conversation-Id"]).toBe("conv-123");
  });

  it("omits X-Conversation-Id when empty or absent", () => {
    expect(headersBuilder({})["X-Conversation-Id"]).toBeUndefined();
    expect(headersBuilder({ conversation_id: "" })["X-Conversation-Id"]).toBeUndefined();
  });
});

describe("documentation toolset structure", () => {
  const resource = documentationToolset.resources[0];

  it("has correct toolset metadata", () => {
    expect(documentationToolset.name).toBe("documentation");
    expect(documentationToolset.displayName).toBe("Documentation");
  });

  it("uses chatbot product and account scope", () => {
    expect(resource.product).toBe("chatbot");
    expect(resource.scope).toBe("account");
  });

  it("uses header-based scoping to avoid leaking accountIdentifier", () => {
    expect(resource.headerBasedScoping).toBe(true);
    expect(listSpec.headerBasedScoping).toBe(true);
  });

  it("has a bodySchema on the list operation", () => {
    expect(listSpec.bodySchema).toBeDefined();
    expect(listSpec.bodySchema!.fields.length).toBeGreaterThan(0);
    const questionField = listSpec.bodySchema!.fields.find(f => f.name === "question");
    expect(questionField).toBeDefined();
    expect(questionField!.required).toBe(true);
  });

  it("has a diagnosticHint", () => {
    expect(resource.diagnosticHint).toBeDefined();
    expect(resource.diagnosticHint).toContain("HARNESS_CHATBOT_BASE_URL");
  });

  it("has no identifier fields (list-only resource)", () => {
    expect(resource.identifierFields).toEqual([]);
  });
});
