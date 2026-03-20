/**
 * Client for the Harness Documentation Chatbot (AIDA).
 *
 * Sends questions to the chatbot and returns AI-generated answers
 * grounded in Harness documentation.
 */

import type { HarnessClient } from "./harness-client.js";
import type { ChatRequest } from "./dto/chatbot.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("chatbot");

export class ChatbotClient {
  static readonly API_PATH = "/chat_v2";
  static readonly TIMEOUT_MS = 120_000; // 2 minutes — LLM inference can be slow

  constructor(private readonly client: HarnessClient) {}

  /**
   * Send a question to the Harness documentation chatbot.
   * Returns the chatbot's text response.
   */
  async sendMessage(
    request: ChatRequest,
    scope: { orgId?: string; projectId?: string },
    options?: { signal?: AbortSignal },
  ): Promise<string> {
    const params: Record<string, string> = {};
    if (scope.orgId) params.orgIdentifier = scope.orgId;
    if (scope.projectId) params.projectIdentifier = scope.projectId;

    log.info("Sending chatbot question", {
      questionLength: request.question.length,
      historyLength: request.chat_history?.length ?? 0,
    });

    const response = await this.client.request<string>({
      method: "POST",
      path: ChatbotClient.API_PATH,
      params,
      body: request,
      signal: options?.signal,
      timeoutMs: ChatbotClient.TIMEOUT_MS,
    });

    return response;
  }
}
