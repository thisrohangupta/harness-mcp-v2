import { randomUUID } from "node:crypto";
import type { ToolsetDefinition } from "../types.js";

/**
 * Wraps the chatbot's response into the standard list format
 * so harness_search and harness_list can display it uniformly.
 * Preserves the full response object (answer + sources) when present.
 */
const chatbotResponseExtract = (raw: unknown): { items: unknown[]; total: number } => {
  if (typeof raw === "string") {
    return { items: [{ answer: raw }], total: 1 };
  }
  if (typeof raw === "object" && raw !== null && "answer" in raw) {
    return { items: [raw], total: 1 };
  }
  return { items: [{ answer: JSON.stringify(raw) }], total: 1 };
};

export const documentationToolset: ToolsetDefinition = {
  name: "documentation",
  displayName: "Documentation",
  description: "Query Harness documentation using the AI-powered documentation chatbot",
  resources: [
    {
      resourceType: "documentation",
      displayName: "Documentation",
      description:
        "Ask questions about Harness products and documentation. " +
        "Uses the Harness Documentation Bot to retrieve and summarize relevant information from Harness docs. " +
        "All source links from Harness documentation (https://developer.harness.io/docs) are included in the response. " +
        "Use harness_search(query='your question', resource_types=['documentation']) for single questions. " +
        "For follow-up/multi-turn conversations, use harness_list(resource_type='documentation', search_term='your question', filters={conversation_id: '...', chat_history: [...]}).",
      toolset: "documentation",
      scope: "account",
      product: "chatbot",
      identifierFields: [],
      listFilterFields: [
        { name: "question", description: "The question to ask the documentation chatbot" },
        { name: "chat_history", description: "Array of previous Q&A pairs for conversational context. Each item has 'question' and 'answer' fields." },
        { name: "conversation_id", description: "Conversation ID for multi-turn context. Passed as X-Conversation-Id header." },
      ],
      operations: {
        list: {
          method: "POST",
          path: "/v2/chat",
          bodyBuilder: (input: Record<string, unknown>) => {
            const body: Record<string, unknown> = {
              question: input.search_term ?? input.query ?? input.search ?? input.question ?? input.name ?? "",
            };
            if (Array.isArray(input.chat_history) && input.chat_history.length > 0) {
              body.chat_history = input.chat_history;
            }
            return body;
          },
          headersBuilder: (input: Record<string, unknown>) => {
            const headers: Record<string, string> = {
              "X-Request-ID": randomUUID(),
            };
            const convId = input.conversation_id;
            if (typeof convId === "string" && convId.length > 0) {
              headers["X-Conversation-Id"] = convId;
            }
            return headers;
          },
          responseExtractor: chatbotResponseExtract,
          description: "Ask a question to the Harness documentation chatbot",
        },
      },
    },
  ],
};
