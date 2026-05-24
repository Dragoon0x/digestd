import type { LlmProvider } from "./types.ts";
import { AnthropicProvider } from "./anthropic.ts";

export interface LlmConfig {
  provider?: string; // "anthropic" only for now
  model?: string;
  apiKeyEnv?: string; // env var name. default per-provider.
}

export function buildProvider(config: LlmConfig | undefined): LlmProvider | null {
  if (!config) return null;
  const providerName = config.provider ?? "anthropic";

  if (providerName === "anthropic") {
    const envVar = config.apiKeyEnv ?? "ANTHROPIC_API_KEY";
    const apiKey = process.env[envVar];
    if (!apiKey) {
      throw new Error(
        `relevance scoring needs ${envVar} env var set. unset it or remove the 'relevance' section in your config.`,
      );
    }
    return new AnthropicProvider({
      apiKey,
      defaultModel: config.model,
    });
  }

  throw new Error(
    `unknown llm provider: "${providerName}". v0.2 only supports "anthropic". more coming in v0.3.`,
  );
}
