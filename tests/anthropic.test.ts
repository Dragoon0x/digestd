import { test, expect, describe } from "bun:test";
import { AnthropicProvider } from "../src/llm/anthropic.ts";
import { LlmError } from "../src/llm/types.ts";

const OK_RESPONSE = {
  content: [{ type: "text", text: "hello from claude" }],
  stop_reason: "end_turn",
};

describe("AnthropicProvider construction", () => {
  test("throws without api key", () => {
    expect(() => new AnthropicProvider({ apiKey: "" })).toThrow(LlmError);
  });

  test("accepts api key", () => {
    const p = new AnthropicProvider({ apiKey: "sk-test" });
    expect(p.name).toBe("anthropic");
    expect(p.defaultModel).toBeTruthy();
  });

  test("respects custom default model", () => {
    const p = new AnthropicProvider({
      apiKey: "sk-test",
      defaultModel: "claude-opus-4-7",
    });
    expect(p.defaultModel).toBe("claude-opus-4-7");
  });
});

describe("AnthropicProvider complete", () => {
  test("returns text from response", async () => {
    const mockFetcher: typeof fetch = async () =>
      new Response(JSON.stringify(OK_RESPONSE), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    const p = new AnthropicProvider({ apiKey: "sk-test", fetcher: mockFetcher });
    const out = await p.complete([{ role: "user", content: "hi" }]);
    expect(out).toBe("hello from claude");
  });

  test("sends api key and version headers", async () => {
    let capturedHeaders: Record<string, string> = {};
    const mockFetcher: typeof fetch = async (_, init) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response(JSON.stringify(OK_RESPONSE), { status: 200 });
    };

    const p = new AnthropicProvider({ apiKey: "sk-123", fetcher: mockFetcher });
    await p.complete([{ role: "user", content: "hi" }]);
    expect(capturedHeaders["x-api-key"]).toBe("sk-123");
    expect(capturedHeaders["anthropic-version"]).toBeTruthy();
  });

  test("separates system messages from user messages", async () => {
    let capturedBody: any;
    const mockFetcher: typeof fetch = async (_, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify(OK_RESPONSE), { status: 200 });
    };

    const p = new AnthropicProvider({ apiKey: "sk-test", fetcher: mockFetcher });
    await p.complete([
      { role: "system", content: "you are a curator" },
      { role: "user", content: "score these items" },
    ]);
    expect(capturedBody.system).toBe("you are a curator");
    expect(capturedBody.messages).toHaveLength(1);
    expect(capturedBody.messages[0].role).toBe("user");
  });

  test("concatenates multiple system messages", async () => {
    let capturedBody: any;
    const mockFetcher: typeof fetch = async (_, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify(OK_RESPONSE), { status: 200 });
    };

    const p = new AnthropicProvider({ apiKey: "sk-test", fetcher: mockFetcher });
    await p.complete([
      { role: "system", content: "rule 1" },
      { role: "system", content: "rule 2" },
      { role: "user", content: "go" },
    ]);
    expect(capturedBody.system).toContain("rule 1");
    expect(capturedBody.system).toContain("rule 2");
  });

  test("passes model and maxTokens overrides", async () => {
    let capturedBody: any;
    const mockFetcher: typeof fetch = async (_, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify(OK_RESPONSE), { status: 200 });
    };

    const p = new AnthropicProvider({ apiKey: "sk-test", fetcher: mockFetcher });
    await p.complete([{ role: "user", content: "hi" }], {
      model: "claude-sonnet-4-6",
      maxTokens: 1024,
      temperature: 0.7,
    });
    expect(capturedBody.model).toBe("claude-sonnet-4-6");
    expect(capturedBody.max_tokens).toBe(1024);
    expect(capturedBody.temperature).toBe(0.7);
  });

  test("throws LlmError on non-2xx", async () => {
    const mockFetcher: typeof fetch = async () =>
      new Response(
        JSON.stringify({ error: { message: "invalid_api_key" } }),
        { status: 401, headers: { "content-type": "application/json" } },
      );

    const p = new AnthropicProvider({ apiKey: "sk-test", fetcher: mockFetcher });
    await expect(
      p.complete([{ role: "user", content: "hi" }]),
    ).rejects.toThrow(LlmError);
  });

  test("includes error message from api in thrown error", async () => {
    const mockFetcher: typeof fetch = async () =>
      new Response(
        JSON.stringify({ error: { message: "rate limit" } }),
        { status: 429, headers: { "content-type": "application/json" } },
      );

    const p = new AnthropicProvider({ apiKey: "sk-test", fetcher: mockFetcher });
    try {
      await p.complete([{ role: "user", content: "hi" }]);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as Error).message).toContain("rate limit");
    }
  });

  test("throws on empty content array", async () => {
    const mockFetcher: typeof fetch = async () =>
      new Response(JSON.stringify({ content: [] }), { status: 200 });

    const p = new AnthropicProvider({ apiKey: "sk-test", fetcher: mockFetcher });
    await expect(
      p.complete([{ role: "user", content: "hi" }]),
    ).rejects.toThrow();
  });
});
