import type {
  LlmCompleteOptions,
  LlmMessage,
  LlmProvider,
} from "./types.ts";
import { LlmError } from "./types.ts";

export interface AnthropicProviderOptions {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  // for tests
  fetcher?: typeof fetch;
}

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
  stop_reason?: string;
}

interface AnthropicErrorBody {
  type?: string;
  error?: { type?: string; message?: string };
}

export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";
  readonly defaultModel: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(options: AnthropicProviderOptions) {
    if (!options.apiKey) {
      throw new LlmError("missing api key", "anthropic");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://api.anthropic.com";
    this.defaultModel = options.defaultModel ?? "claude-haiku-4-5-20251001";
    this.fetcher = options.fetcher ?? fetch;
  }

  async complete(
    messages: LlmMessage[],
    options: LlmCompleteOptions = {},
  ): Promise<string> {
    // anthropic separates system from messages
    const systemParts: string[] = [];
    const userMessages: Array<{ role: "user" | "assistant"; content: string }> = [];

    for (const m of messages) {
      if (m.role === "system") {
        systemParts.push(m.content);
      } else {
        userMessages.push({ role: m.role, content: m.content });
      }
    }

    const body = {
      model: options.model ?? this.defaultModel,
      max_tokens: options.maxTokens ?? 2048,
      ...(systemParts.length > 0 && { system: systemParts.join("\n\n") }),
      ...(options.temperature !== undefined && {
        temperature: options.temperature,
      }),
      messages: userMessages,
    };

    let res: Response;
    try {
      res = await this.fetcher(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new LlmError("network error", this.name, err);
    }

    if (!res.ok) {
      let detail = `http ${res.status}`;
      try {
        const errBody = (await res.json()) as AnthropicErrorBody;
        if (errBody.error?.message) {
          detail = `http ${res.status}: ${errBody.error.message}`;
        }
      } catch {
        // ignore body parse errors
      }
      throw new LlmError(detail, this.name);
    }

    let data: AnthropicResponse;
    try {
      data = (await res.json()) as AnthropicResponse;
    } catch (err) {
      throw new LlmError("response parse failed", this.name, err);
    }

    const text = (data.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text!)
      .join("");

    if (!text) {
      throw new LlmError("empty response", this.name);
    }

    return text;
  }
}
