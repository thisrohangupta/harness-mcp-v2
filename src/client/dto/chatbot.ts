/**
 * DTOs for the Harness Documentation Chatbot.
 *
 * Mirrors the Go SDK's chatbot DTO.
 */

export interface ChatHistoryItem {
  question: string;
  answer: string;
}

/** Request body for POST /gateway/aida/api/chat_v2 */
export interface ChatRequest {
  question: string;
  chat_history?: ChatHistoryItem[];
}
