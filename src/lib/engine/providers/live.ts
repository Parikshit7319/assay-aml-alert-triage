import { ASSESSMENT_SCHEMA, buildUserPrompt, parseAssessment, SYSTEM_PROMPT } from "../prompt";
import type { ModelInput, ModelOutput, ModelProvider } from "../types";

const TIMEOUT_MS = Number(process.env.MODEL_TIMEOUT_MS ?? 60_000);

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Model API ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
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

/** Anthropic Messages API with a forced tool call for structured output. */
export class AnthropicProvider implements ModelProvider {
  id = "anthropic" as const;
  constructor(
    private apiKey: string,
    public model: string,
  ) {}

  async assess(input: ModelInput): Promise<ModelOutput> {
    const data = await postJson(
      "https://api.anthropic.com/v1/messages",
      { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
      {
        model: this.model,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserPrompt(input) }],
        tools: [{ name: "submit_assessment", description: "Submit the alert assessment.", input_schema: ASSESSMENT_SCHEMA }],
        tool_choice: { type: "tool", name: "submit_assessment" },
      },
    );
    const block = (data.content ?? []).find((c: { type: string }) => c.type === "tool_use");
    if (!block) throw new Error("Model did not return an assessment");
    return toOutput(block.input, data.model ?? this.model, data.usage?.input_tokens ?? 0, data.usage?.output_tokens ?? 0);
  }
}

/** OpenAI-compatible Chat Completions with strict JSON schema. Covers OpenAI and Azure OpenAI. */
export class OpenAICompatibleProvider implements ModelProvider {
  constructor(
    public id: "openai" | "azure-openai",
    private url: string,
    private headers: Record<string, string>,
    public model: string,
  ) {}

  async assess(input: ModelInput): Promise<ModelOutput> {
    const data = await postJson(this.url, this.headers, {
      model: this.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(input) },
      ],
      response_format: { type: "json_schema", json_schema: { name: "assessment", strict: true, schema: ASSESSMENT_SCHEMA } },
    });
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Model returned an empty response");
    return toOutput(JSON.parse(content), data.model ?? this.model, data.usage?.prompt_tokens ?? 0, data.usage?.completion_tokens ?? 0);
  }
}
