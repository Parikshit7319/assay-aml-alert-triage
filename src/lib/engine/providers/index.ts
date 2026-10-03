import type { PlanId, PolicySettings } from "@/lib/db/schema";
import type { ModelProvider } from "../types";
import { AnthropicProvider, OpenAICompatibleProvider } from "./live";
import { SimulatedProvider } from "./simulated";

/**
 * USD per million tokens. Anthropic list prices checked Oct 3, 2026 at
 * platform.claude.com/docs/en/about-claude/pricing. Override any model with
 * MODEL_INPUT_USD_PER_MTOK / MODEL_OUTPUT_USD_PER_MTOK.
 */
const PRICE_TABLE: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

/** Reference rate used to estimate cost when the real price is unknown (simulated runs). */
export const REFERENCE_MODEL = "claude-sonnet-5-5";

export function priceFor(model: string): { input: number; output: number; known: boolean } {
  const envIn = process.env.MODEL_INPUT_USD_PER_MTOK;
  const envOut = process.env.MODEL_OUTPUT_USD_PER_MTOK;
  if (envIn && envOut) return { input: Number(envIn), output: Number(envOut), known: true };
  const p = PRICE_TABLE[model];
  if (p) return { ...p, known: true };
  return { ...PRICE_TABLE[REFERENCE_MODEL], known: false };
}

/** Cost in USD millionths (micros) so integer math stays exact. */
export function costMicros(model: string, inputTokens: number, outputTokens: number) {
  const p = priceFor(model === "assay-rules-v1" ? REFERENCE_MODEL : model);
  const micros = Math.round(inputTokens * p.input + outputTokens * p.output); // tokens * $/M = micro-dollars
  return { micros, known: p.known && model !== "assay-rules-v1" };
}

export function liveProviderConfigured(id: PolicySettings["provider"]): boolean {
  switch (id) {
    case "anthropic":
      return !!process.env.ANTHROPIC_API_KEY;
    case "openai":
      return !!process.env.OPENAI_API_KEY && !!process.env.OPENAI_MODEL;
    case "azure-openai":
      return !!process.env.AZURE_OPENAI_ENDPOINT && !!process.env.AZURE_OPENAI_API_KEY && !!process.env.AZURE_OPENAI_DEPLOYMENT;
    default:
      return false;
  }
}

/**
 * Picks the model for a run. Live models need a paid plan and a configured key;
 * anything else falls back to the deterministic simulated model, and the run
 * records which one was used.
 */
export function resolveProvider(settings: PolicySettings, plan: PlanId, kind: "demo" | "customer"): ModelProvider {
  const wantsLive = settings.provider !== "simulated";
  const paid = plan === "team" || plan === "enterprise";
  if (!wantsLive || kind === "demo" || !paid || !liveProviderConfigured(settings.provider)) {
    return new SimulatedProvider();
  }
  switch (settings.provider) {
    case "anthropic":
      return new AnthropicProvider(process.env.ANTHROPIC_API_KEY!, process.env.ANTHROPIC_MODEL ?? REFERENCE_MODEL);
    case "openai":
      return new OpenAICompatibleProvider(
        "openai",
        `${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/chat/completions`,
        { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        process.env.OPENAI_MODEL!,
      );
    case "azure-openai": {
      const endpoint = process.env.AZURE_OPENAI_ENDPOINT!.replace(/\/$/, "");
      const deployment = process.env.AZURE_OPENAI_DEPLOYMENT!;
      const version = process.env.AZURE_OPENAI_API_VERSION ?? "2024-10-21";
      return new OpenAICompatibleProvider(
        "azure-openai",
        `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${version}`,
        { "api-key": process.env.AZURE_OPENAI_API_KEY! },
        deployment,
      );
    }
    default:
      return new SimulatedProvider();
  }
}
