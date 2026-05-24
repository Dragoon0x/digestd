// minimal contract any llm provider must implement.
// keeping this surface tiny makes it trivial to add openai, ollama,
// gemini, deepseek, anything else. one method.

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmCompleteOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmProvider {
  // human-readable name for logs and errors
  readonly name: string;
  // default model when caller doesn't specify
  readonly defaultModel: string;

  complete(messages: LlmMessage[], options?: LlmCompleteOptions): Promise<string>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly cause?: unknown,
  ) {
    super(`[${provider}] ${message}`);
    this.name = "LlmError";
  }
}
