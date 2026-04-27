import type { ModelInfo, ModelTier } from "@/lib/types";

const baseModels: ModelInfo[] = [
  {
    id: "gpt-5-mini",
    name: "GPT-5 mini",
    provider: "OpenAI via Copilot",
    tier: "0x",
    description: "Default fast responder for always-on room participation.",
    recommendedForMultiBot: true,
  },
  {
    id: "gpt-4.1",
    name: "GPT-4.1",
    provider: "OpenAI via Copilot",
    tier: "0x",
    description: "Balanced reasoning model suited to multi-bot default rooms.",
    recommendedForMultiBot: true,
  },
  {
    id: "claude-sonnet-4",
    name: "Claude Sonnet 4",
    provider: "Anthropic via Copilot",
    tier: "0.5x",
    description: "Sharper writing and critique when a room needs a specialist.",
    recommendedForMultiBot: false,
  },
  {
    id: "claude-opus-4",
    name: "Claude Opus 4",
    provider: "Anthropic via Copilot",
    tier: "1x",
    description: "Premium deep-thinking specialist for explicit escalation.",
    recommendedForMultiBot: false,
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "Google via Copilot",
    tier: "1x",
    description: "Premium large-context model for synthesis and exploration.",
    recommendedForMultiBot: false,
  },
];

const tierRank: Record<ModelTier, number> = {
  "0x": 0,
  "0.5x": 1,
  "1x": 2,
};

export function getFallbackModels(): ModelInfo[] {
  return baseModels;
}

export function inferTierFromModelId(modelId: string): ModelTier {
  const lower = modelId.toLowerCase();

  if (
    lower.includes("mini") ||
    lower.includes("4.1") ||
    lower.includes("flash")
  ) {
    return "0x";
  }

  if (lower.includes("sonnet") || lower.includes("haiku")) {
    return "0.5x";
  }

  return "1x";
}

export function getModelTierLabel(tier: ModelTier): string {
  return tier;
}

export function sortModelsForSuggestions(models: ModelInfo[]): ModelInfo[] {
  return [...models].sort((a, b) => {
    const tierDelta = tierRank[a.tier] - tierRank[b.tier];

    if (tierDelta !== 0) {
      return tierDelta;
    }

    if (a.recommendedForMultiBot !== b.recommendedForMultiBot) {
      return a.recommendedForMultiBot ? -1 : 1;
    }

    return a.name.localeCompare(b.name);
  });
}
