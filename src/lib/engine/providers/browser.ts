/**
 * Browser-side model providers for "bring your own key" use on the static demo.
 * Same prompt, schema and parsing as live.ts, but the request goes straight from
 * the visitor's browser to the provider with a key they typed in. Nothing here
 * reads process.env, so it is safe to bundle into client components.
 */
import { ASSESSMENT_SCHEMA, buildUserPrompt, parseAssessment, SYSTEM_PROMPT } from "../prompt";
import type { ModelInput, ModelOutput, ModelProvider } from "../types";

export type BrowserModelConfig = {
  provider: "anthropic" | "openai";
  apiKey: string;
  model: string;
  baseUrl?: string;
};

export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";
export const ANTHROPIC_MODELS = ["claude-sonnet-5-5", "claude-haiku-4-5", "claude-opus-5-5"] as const;
export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
export const BROWSER_TIMEOUT_MS = 60_000;

/** Error with a message that is safe and useful to show to the person who typed the key. */
export class BrowserModelError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "BrowserModelError";
  }
}

/** Headers for a direct browser call to the Anthropic Messages API. */
export function anthropicBrowserHeaders(apiKey: string): Record<string, string> {
  return {
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    // Anthropic rejects browser (CORS) requests unless the caller opts in explicitly.
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

/** Chat Completions URL for an OpenAI-compatible base URL. */
export function openAIChatUrl(baseUrl?: string): string {
  const base = (baseUrl?.trim() || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, "");
  return base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
}

export function openAIHeaders(apiKey: string): Record<string, string> {
  return { authorization: `Bearer ${apiKey}` };
}

function providerMessage(body: string): string {
  try {
    const j = JSON.parse(body);
    const m = j?.error?.message ?? j?.message ?? (typeof j?.error === "string" ? j.error : null);
    if (typeof m === "string" && m.trim()) return m.trim().slice(0, 240);
  } catch {
    // not JSON
  }
  return body.replace(/\s+/g, " ").trim().slice(0, 160);
}

/** Maps an HTTP failure to a plain-language message. Never echoes the key. */
export function describeHttpError(status: number, body: string): string {
  const detail = providerMessage(body);
  switch (status) {
    case 401:
      return "The API key was rejected.";
    case 403:
      return `The provider refused this request. Check that the key has access to this model.${detail ? ` Provider said: ${detail}` : ""}`;
    case 404:
      return `The provider did not find that model or URL. Check the model id${detail ? `. Provider said: ${detail}` : "."}`;
    case 408:
      return "The provider timed out. Try again in a moment.";
    case 413:
      return "The request was too large for this model.";
    case 429:
      return "Rate limited by the provider. Try again in a moment.";
    case 400:
    case 422:
      return `The provider rejected the request.${detail ? ` Provider said: ${detail}` : ""}`;
    default:
      if (status >= 500) return `The provider had an error (status ${status}). Try again shortly.`;
      return `The provider returned status ${status}.${detail ? ` ${detail}` : ""}`;
  }
}

function withTimeout(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(BROWSER_TIMEOUT_MS);
  if (!signal) return timeout;
  const any = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  return typeof any === "function" ? any.call(AbortSignal, [signal, timeout]) : signal;
}

/** The parts of an Anthropic or Chat Completions response this module reads. */
export interface ProviderResponse {
  model?: string;
  content?: { type: string; text?: string; input?: unknown }[];
  usage?: { input_tokens?: number; output_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
  choices?: { message?: { content?: string | null } }[];
}

/** POST JSON from the browser with a 60 second timeout and readable errors. */
export async function browserPostJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal?: AbortSignal,
): Promise<ProviderResponse> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: withTimeout(signal),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError") throw new BrowserModelError("The provider did not answer within 60 seconds. Try again, or pick a faster model.");
    if (name === "AbortError") throw new BrowserModelError("The request was cancelled.");
    throw new BrowserModelError(
      "Could not reach the provider from this browser. Some providers and gateways block calls made directly from a web page (CORS). Check the base URL and your network, or use a provider that allows browser requests.",
    );
  }
  const text = await res.text();
  if (!res.ok) throw new BrowserModelError(describeHttpError(res.status, text), res.status);
  try {
    return JSON.parse(text);
  } catch {
    throw new BrowserModelError("The provider sent back a response that is not JSON.");
  }
}

/** Strips a ```json fence some gateways wrap around JSON content. */
export function stripJsonFence(s: string): string {
  const m = s.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return m ? m[1] : s.trim();
}

function toOutput(raw: unknown, model: string, inputTokens: number, outputTokens: number): ModelOutput {
  const a = parseAssessment(raw);
  return {
    recommendation: a.recommendation,
    confidence: a.confidence,
    riskScore: a.risk_score,
    rationale: a.rationale,
    narrative: a.narrative,
    inputTokens,
    outputTokens,
    model,
    costEstimated: false,
  };
}

/** Anthropic Messages API from the browser, forced tool call for structured output. */
export class BrowserAnthropicProvider implements ModelProvider {
  id = "anthropic" as const;
  constructor(
    private apiKey: string,
    public model: string = DEFAULT_ANTHROPIC_MODEL,
    private signal?: AbortSignal,
  ) {}

  async assess(input: ModelInput): Promise<ModelOutput> {
    const data = await browserPostJson(
      ANTHROPIC_MESSAGES_URL,
      anthropicBrowserHeaders(this.apiKey),
      {
        model: this.model,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserPrompt(input) }],
        tools: [{ name: "submit_assessment", description: "Submit the alert assessment.", input_schema: ASSESSMENT_SCHEMA }],
        tool_choice: { type: "tool", name: "submit_assessment" },
      },
      this.signal,
    );
    const block = (data.content ?? []).find((c) => c.type === "tool_use");
    if (!block) throw new BrowserModelError("The model did not return an assessment.");
    return toOutput(block.input, data.model ?? this.model, data.usage?.input_tokens ?? 0, data.usage?.output_tokens ?? 0);
  }
}

/** OpenAI-compatible Chat Completions from the browser with a strict JSON schema. */
export class BrowserOpenAIProvider implements ModelProvider {
  id = "openai" as const;
  constructor(
    private apiKey: string,
    public model: string,
    private baseUrl?: string,
    private signal?: AbortSignal,
  ) {}

  async assess(input: ModelInput): Promise<ModelOutput> {
    const url = openAIChatUrl(this.baseUrl);
    const headers = openAIHeaders(this.apiKey);
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(input) },
    ];
    let data: ProviderResponse;
    try {
      data = await browserPostJson(
        url,
        headers,
        { model: this.model, messages, response_format: { type: "json_schema", json_schema: { name: "assessment", strict: true, schema: ASSESSMENT_SCHEMA } } },
        this.signal,
      );
    } catch (err) {
      // Some compatible servers do not support json_schema. Retry once with plain JSON mode.
      if (!(err instanceof BrowserModelError) || err.status !== 400 || !/response_format|json_schema|schema/i.test(err.message)) throw err;
      data = await browserPostJson(
        url,
        headers,
        {
          model: this.model,
          messages: [
            { role: "system", content: `${SYSTEM_PROMPT}\n\nRespond with one JSON object that matches this JSON schema and nothing else:\n${JSON.stringify(ASSESSMENT_SCHEMA)}` },
            messages[1],
          ],
          response_format: { type: "json_object" },
        },
        this.signal,
      );
    }
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new BrowserModelError("The model returned an empty response.");
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonFence(String(content)));
    } catch {
      throw new BrowserModelError("The model's answer was not valid JSON.");
    }
    return toOutput(parsed, data.model ?? this.model, data.usage?.prompt_tokens ?? 0, data.usage?.completion_tokens ?? 0);
  }
}

export function createBrowserProvider(cfg: BrowserModelConfig, signal?: AbortSignal): ModelProvider {
  if (!cfg.apiKey.trim()) throw new BrowserModelError("Add an API key first.");
  if (cfg.provider === "anthropic") return new BrowserAnthropicProvider(cfg.apiKey.trim(), cfg.model.trim() || DEFAULT_ANTHROPIC_MODEL, signal);
  if (!cfg.model.trim()) throw new BrowserModelError("Add the model id from your provider.");
  return new BrowserOpenAIProvider(cfg.apiKey.trim(), cfg.model.trim(), cfg.baseUrl, signal);
}

/** One plain-text completion. Shared by the key test and the ask feature. */
export async function browserComplete(
  cfg: BrowserModelConfig,
  system: string,
  user: string,
  opts: { maxTokens?: number; signal?: AbortSignal } = {},
): Promise<{ text: string; model: string }> {
  const key = cfg.apiKey.trim();
  if (!key) throw new BrowserModelError("Add an API key first.");
  if (cfg.provider === "anthropic") {
    const model = cfg.model.trim() || DEFAULT_ANTHROPIC_MODEL;
    const data = await browserPostJson(
      ANTHROPIC_MESSAGES_URL,
      anthropicBrowserHeaders(key),
      { model, max_tokens: opts.maxTokens ?? 800, system, messages: [{ role: "user", content: user }] },
      opts.signal,
    );
    const text = (data.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n")
      .trim();
    if (!text) throw new BrowserModelError("The model returned an empty response.");
    return { text, model: data.model ?? model };
  }
  const model = cfg.model.trim();
  if (!model) throw new BrowserModelError("Add the model id from your provider.");
  // No max token field: OpenAI and compatible servers disagree on its name, and a short prompt keeps cost low.
  const data = await browserPostJson(
    openAIChatUrl(cfg.baseUrl),
    openAIHeaders(key),
    {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    },
    opts.signal,
  );
  const text = String(data.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new BrowserModelError("The model returned an empty response.");
  return { text, model: data.model ?? model };
}

/** Minimal request used by the "Test key" button. */
export async function testBrowserModel(cfg: BrowserModelConfig, signal?: AbortSignal): Promise<{ model: string; ms: number }> {
  const t0 = performance.now();
  const out = await browserComplete(cfg, "Reply with the single word OK.", "Connection test.", { maxTokens: 5, signal });
  return { model: out.model, ms: Math.round(performance.now() - t0) };
}
