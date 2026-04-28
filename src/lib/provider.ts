import "server-only";

import type { MessageView, ModelInfo, PersonaRecord } from "@/lib/types";
import { env, hasCopilotCredentials } from "@/lib/env";
import {
  getFallbackModels,
  inferTierFromModelId,
  sortModelsForSuggestions,
} from "@/lib/models";

type GitHubModelsCatalogEntry = {
  id?: string;
  name?: string;
  publisher?: string;
  summary?: string;
  description?: string;
};

type ProviderReply = {
  content: string;
  modelUsed: string;
  latencyMs: number;
  premiumCost: number;
  providerMode: "copilot" | "demo";
};

type ReplyInput = {
  persona: PersonaRecord;
  roomName: string;
  participants: Array<{ name: string; autoRespond: boolean; modelId: string }>;
  recentMessages: MessageView[];
  userMessage: string;
};

type DemoPersonaStyle =
  | "strategist"
  | "analyst"
  | "critic"
  | "researcher"
  | "general";

type DemoScenario = "india-saas-gap" | "product-usage" | "generic";
type ProviderTokenParameter = "max_completion_tokens" | "max_tokens";

const GITHUB_MODELS_API_VERSION = "2026-03-10";
const MODEL_CATALOG_TTL_MS = 5 * 60 * 1000;

// Preserve seeded personas while routing live requests to GitHub Models.
const legacyModelCandidates: Record<string, string[]> = {
  "gpt-5-mini": ["openai/gpt-5-mini"],
  "gpt-4.1": ["openai/gpt-4.1"],
  "claude-sonnet-4": [
    "anthropic/claude-sonnet-4",
    "openai/gpt-4.1",
    "openai/gpt-5-mini",
  ],
  "claude-opus-4": ["anthropic/claude-opus-4", "openai/gpt-5", "openai/o3"],
  "gemini-2.5-pro": ["google/gemini-2.5-pro", "openai/o3", "openai/gpt-5"],
};

let modelCatalogCache:
  | {
      models: ModelInfo[];
      expiresAt: number;
    }
  | null = null;

function isSupportedChatModel(entry: GitHubModelsCatalogEntry) {
  return Boolean(entry.id) && !entry.id?.toLowerCase().includes("embedding");
}

function buildTierFallbackCandidates(modelId: string) {
  const tier = inferTierFromModelId(modelId);

  return tier === "1x"
    ? ["openai/gpt-5", "openai/o3", "openai/gpt-4.1"]
    : tier === "0.5x"
      ? ["openai/gpt-4.1", "openai/gpt-5-mini", "openai/o4-mini"]
      : ["openai/gpt-5-mini", "openai/gpt-4.1-mini", "openai/gpt-4.1"];
}

function buildModelCandidates(modelId: string) {
  const preferredCandidates = modelId.includes("/")
    ? [modelId]
    : legacyModelCandidates[modelId] ?? [modelId];

  return [...new Set([...preferredCandidates, ...buildTierFallbackCandidates(modelId)])];
}

function resolveRequestedModelId(modelId: string, availableModels: ModelInfo[]) {
  const availableIds = new Set(availableModels.map((model) => model.id));

  for (const candidate of buildModelCandidates(modelId)) {
    if (availableIds.has(candidate)) {
      return candidate;
    }
  }

  return availableModels[0]?.id ?? buildModelCandidates(modelId)[0] ?? modelId;
}

function toModelInfo(item: Record<string, unknown>): ModelInfo | null {
  const id = typeof item.id === "string" ? item.id : null;

  if (!id) {
    return null;
  }

  const name = typeof item.name === "string" ? item.name : id;
  const provider =
    typeof item.publisher === "string"
      ? item.publisher
      : typeof item.provider === "string"
        ? item.provider
        : "GitHub Models";
  const description =
    typeof item.summary === "string"
      ? item.summary
      : typeof item.description === "string"
        ? item.description
        : "Live model discovered from the GitHub Models catalogue.";
  const tier = inferTierFromModelId(id);

  return {
    id,
    name,
    provider,
    tier,
    description,
    recommendedForMultiBot: tier === "0x",
  };
}

async function fetchProviderModels(): Promise<ModelInfo[]> {
  if (!hasCopilotCredentials) {
    return getFallbackModels();
  }

  if (modelCatalogCache && modelCatalogCache.expiresAt > Date.now() + 30_000) {
    return modelCatalogCache.models;
  }

  const response = await fetch(env.GITHUB_COPILOT_MODELS_URL, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.GITHUB_PAT}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": GITHUB_MODELS_API_VERSION,
      "User-Agent": "Atrium/0.1",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`GitHub Models catalogue request failed: ${response.status}`);
  }

  const payload = (await response.json()) as
    | Record<string, unknown>
    | Array<Record<string, unknown>>;

  const collection = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.data)
      ? (payload.data as Array<Record<string, unknown>>)
      : Array.isArray(payload.models)
        ? (payload.models as Array<Record<string, unknown>>)
        : [];

  const models = collection
    .filter((entry) => isSupportedChatModel(entry as GitHubModelsCatalogEntry))
    .map(toModelInfo)
    .filter(Boolean) as ModelInfo[];
  const sorted =
    models.length > 0 ? sortModelsForSuggestions(models) : getFallbackModels();

  modelCatalogCache = {
    models: sorted,
    expiresAt: Date.now() + MODEL_CATALOG_TTL_MS,
  };

  return sorted;
}

function computePremiumCost(modelId: string) {
  const tier = inferTierFromModelId(modelId);

  if (tier === "0x") {
    return 0;
  }

  if (tier === "0.5x") {
    return 0.5;
  }

  return 1;
}

function buildTranscript(recentMessages: MessageView[]) {
  return recentMessages
    .map(
      (message) =>
        `${message.senderName} [${message.senderType === "user" ? "human" : "bot"}]: ${message.content}`,
    )
    .join("\n\n");
}

function buildProviderPrompt(input: ReplyInput) {
  const compactSystemPrompt = input.persona.systemPrompt.replace(/\s+/g, " ").trim();
  const compactTranscript = (buildTranscript(input.recentMessages) || "No previous messages.")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2400);

  return [
    `Act as ${input.persona.name}.`,
    compactSystemPrompt,
    "You are participating in Atrium, a multi-bot room chat. Keep your reply concise but useful, and do not pretend to be other bots.",
    `Room: ${input.roomName}.`,
    `Participants: ${input.participants.map((participant) => `${participant.name} (${participant.modelId})`).join(", ")}.`,
    `Recent transcript: ${compactTranscript}`,
    `User asked: ${input.userMessage}`,
  ].join(" ");
}

function buildProviderRequestBody(
  modelId: string,
  input: ReplyInput,
  includeSamplingControls: boolean,
  tokenParameter: ProviderTokenParameter,
) {
  return {
    model: modelId,
    stream: false,
    [tokenParameter]: 320,
    ...(includeSamplingControls
      ? {
          temperature: input.persona.temperature,
          top_p: input.persona.topP,
        }
      : {}),
    messages: [
      {
        role: "user" as const,
        content: buildProviderPrompt(input),
      },
    ],
  };
}

function isUnsupportedSamplingError(body: string) {
  return (
    /"param":\s*"(temperature|top_p)"/.test(body) ||
    /Unsupported value: '(temperature|top_p)'/.test(body)
  );
}

function isUnsupportedTokenParameterError(body: string) {
  return (
    /"param":\s*"max_tokens"/.test(body) ||
    /Unsupported parameter: 'max_tokens'/.test(body)
  );
}

async function requestProviderReply(
  modelId: string,
  input: ReplyInput,
  includeSamplingControls: boolean,
  tokenParameter: ProviderTokenParameter,
) {
  return fetch(env.GITHUB_COPILOT_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_PAT}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": GITHUB_MODELS_API_VERSION,
      "User-Agent": "Atrium/0.1",
    },
    body: JSON.stringify(
      buildProviderRequestBody(
        modelId,
        input,
        includeSamplingControls,
        tokenParameter,
      ),
    ),
    cache: "no-store",
  });
}

function inferDemoPersonaStyle(persona: PersonaRecord): DemoPersonaStyle {
  const fingerprint = `${persona.name} ${persona.systemPrompt}`.toLowerCase();

  if (fingerprint.includes("strateg")) {
    return "strategist";
  }

  if (fingerprint.includes("analyst") || fingerprint.includes("metrics")) {
    return "analyst";
  }

  if (fingerprint.includes("critic") || fingerprint.includes("failure mode")) {
    return "critic";
  }

  if (fingerprint.includes("research") || fingerprint.includes("sources")) {
    return "researcher";
  }

  return "general";
}

function inferDemoScenario(userMessage: string): DemoScenario {
  const lower = userMessage.toLowerCase();

  if (
    lower.includes("india") &&
    lower.includes("saas") &&
    /(underserved|under-served|underpenetrated|white[ -]?space|least served|gap)/.test(
      lower,
    )
  ) {
    return "india-saas-gap";
  }

  if (
    /(how do we use|how should we use|best way to use|best use|workflow|playbook|using this product)/.test(
      lower,
    )
  ) {
    return "product-usage";
  }

  return "generic";
}

function buildIndiaSaasGapDemoResponse(style: DemoPersonaStyle) {
  if (style === "strategist") {
    return [
      "My first bet would be SME manufacturing and adjacent field-operations workflows.",
      "",
      "Why this looks underserved in India:",
      "- a huge share of firms still coordinate on WhatsApp, spreadsheets, and manual follow-up",
      "- pain is tied directly to cash flow: dispatch, inventory visibility, collections, vendor coordination",
      "- traditional ERP feels too heavy, while horizontal SaaS often misses local workflow complexity",
      "",
      "The wedge I would start with is not 'ERP replacement'. I would start with one ROI-clear workflow such as order-to-dispatch, distributor visibility, or collections control.",
      "",
      "If this were a real market study, I would next compare it against construction contractors and clinic/diagnostic operations.",
    ].join("\n");
  }

  if (style === "analyst") {
    return [
      "If I had to pick one sector, I would start with SME manufacturing and related supply-chain operations.",
      "",
      "Evidence pattern behind that answer:",
      "- large market, but still low software penetration below the enterprise tier",
      "- many firms have repetitive operational pain that is expensive but not yet well digitized",
      "- adoption can be justified with hard metrics like fill rate, dispatch latency, working capital, and collection cycles",
      "",
      "Runner-up sectors worth testing are construction, agri-distribution, and smaller healthcare operations.",
      "",
      "The validation metrics I would use are: percentage of workflow still manual, software spend per location, and time-to-ROI for the operator.",
    ].join("\n");
  }

  if (style === "critic") {
    return [
      "I agree manufacturing looks underserved, but underserved is not the same as attractive.",
      "",
      "The hidden risks are:",
      "- fragmented buyer behavior and slow onboarding",
      "- messy process variation across firms, which can destroy product standardization",
      "- a tendency to drift into services-heavy implementation instead of real SaaS",
      "",
      "So the sharper framing is: which sector is underserved and still reachable with a narrow, repeatable wedge?",
      "That is the bar I would use before committing to manufacturing over construction or healthcare ops.",
    ].join("\n");
  }

  if (style === "researcher") {
    return [
      "I would shortlist four sectors for a real answer: SME manufacturing, construction contractors, clinic/diagnostic chains, and agri-distribution.",
      "",
      "For each, I would gather:",
      "- manual workflow density",
      "- software penetration in the mid-market",
      "- willingness to pay tied to operational ROI",
      "- fragmentation and channel access",
      "",
      "My current hypothesis is still that SME manufacturing is the strongest underserved bucket, but I would want industry-cluster interviews before treating that as final.",
    ].join("\n");
  }

  return [
    "My first-pass answer is SME manufacturing and adjacent operations.",
    "",
    "The reason is simple: large market, visible operational pain, and relatively weak fit from both heavy ERPs and generic horizontal SaaS.",
  ].join("\n");
}

function buildProductUsageDemoResponse(style: DemoPersonaStyle) {
  if (style === "strategist") {
    return [
      "Use Atrium as a decision funnel, not as a generic chat room.",
      "",
      "Best operating pattern:",
      "- keep two default responders on for fast first-pass thinking",
      "- keep heavier specialists mention-only so they are pulled in intentionally",
      "- make each room topic-specific so the transcript becomes reusable context instead of noise",
      "",
      "A strong workflow is: ask for first-pass synthesis, @mention a critic for failure modes, then ask one bot to converge on a recommendation.",
    ].join("\n");
  }

  if (style === "analyst") {
    return [
      "The best way to use Atrium is to treat each room as a reusable problem context.",
      "",
      "That means:",
      "- one room per problem area or project",
      "- stable personas with distinct jobs",
      "- prompts that ask for specific output formats rather than open-ended opinion",
      "",
      "You get the most value when the transcript compounds over time instead of starting from zero on every question.",
    ].join("\n");
  }

  if (style === "critic") {
    return [
      "The easiest way to waste Atrium is to let every bot answer every vague question.",
      "",
      "You will get better output if you:",
      "- keep roles distinct",
      "- use mention-only escalation for expensive or specialist bots",
      "- ask for critique after a draft exists, not before",
      "",
      "Otherwise the room becomes parallel noise rather than structured disagreement.",
    ].join("\n");
  }

  if (style === "researcher") {
    return [
      "I would use Atrium for breadth-first exploration first, then targeted follow-up.",
      "",
      "Good pattern:",
      "- ask the room for hypotheses or option space",
      "- spin out one thread per promising avenue",
      "- bring in research-heavy personas only when the question needs expansion",
      "",
      "That preserves signal and keeps the room history easier to search later.",
    ].join("\n");
  }

  return [
    "Use Atrium for structured collaboration between specialist personas, not just parallel chatting.",
    "",
    "Rooms should hold durable context, and each bot should have a clear job in the decision flow.",
  ].join("\n");
}

function buildGenericDemoResponse(style: DemoPersonaStyle) {
  if (style === "strategist") {
    return [
      "My first pass would be to optimize for speed-to-insight and visible ROI.",
      "",
      "I would structure the answer around:",
      "- what decision actually needs to be made",
      "- which option has the clearest upside if we are directionally right",
      "- what single assumption needs to be validated next",
      "",
      "If useful, ask me for a recommendation memo and I will turn it into options, trade-offs, and a call.",
    ].join("\n");
  }

  if (style === "analyst") {
    return [
      "I would break this into the claim, the evidence, and the decision threshold.",
      "",
      "Concretely, I would look for:",
      "- the strongest observable drivers",
      "- the best counter-explanations",
      "- the one metric that would make the conclusion more than just intuition",
      "",
      "If you want, I can turn the question into a scored comparison rather than a loose discussion.",
    ].join("\n");
  }

  if (style === "critic") {
    return [
      "Before locking onto an answer, I would test what could make the obvious conclusion wrong.",
      "",
      "The usual failure modes are:",
      "- confusing a loud problem with a valuable one",
      "- underestimating adoption friction",
      "- assuming the best segment is the same as the easiest segment to win",
      "",
      "If you want rigor, I can turn this into a risk review next.",
    ].join("\n");
  }

  if (style === "researcher") {
    return [
      "I would widen the option set before converging too early.",
      "",
      "The next useful step is usually to compare a small set of candidate explanations or paths, then identify what evidence would separate them.",
      "",
      "If you want, I can produce a focused research plan with the questions and source types to check next.",
    ].join("\n");
  }

  return [
    "My first pass is to answer with a clear position, then make the uncertainty explicit.",
    "",
    "That usually means stating the leading view, why it seems right, and what I would validate next before treating it as final.",
  ].join("\n");
}

function buildDemoResponse(input: ReplyInput) {
  const style = inferDemoPersonaStyle(input.persona);
  const scenario = inferDemoScenario(input.userMessage.trim());

  if (scenario === "india-saas-gap") {
    return buildIndiaSaasGapDemoResponse(style);
  }

  if (scenario === "product-usage") {
    return buildProductUsageDemoResponse(style);
  }

  return buildGenericDemoResponse(style);
}

async function fetchProviderReply(input: ReplyInput): Promise<ProviderReply> {
  const availableModels = await fetchProviderModels();
  const availableIds = new Set(availableModels.map((model) => model.id));
  const candidateModels = buildModelCandidates(input.persona.modelId).filter(
    (candidate) => availableIds.has(candidate),
  );
  let activeModelId =
    candidateModels[0] ??
    resolveRequestedModelId(input.persona.modelId, availableModels);
  const startedAt = Date.now();
  let includeSamplingControls = true;
  let tokenParameter: ProviderTokenParameter = "max_tokens";
  let transientRetries = 0;
  let response = await requestProviderReply(
    activeModelId,
    input,
    includeSamplingControls,
    tokenParameter,
  );

  while (!response.ok) {
    const body = await response.text();

    if (response.status === 400 && isUnsupportedSamplingError(body)) {
      includeSamplingControls = false;
      response = await requestProviderReply(
        activeModelId,
        input,
        includeSamplingControls,
        tokenParameter,
      );
      continue;
    }

    if (response.status === 400 && isUnsupportedTokenParameterError(body)) {
      tokenParameter = "max_completion_tokens";
      response = await requestProviderReply(
        activeModelId,
        input,
        includeSamplingControls,
        tokenParameter,
      );
      continue;
    }

    if (response.status >= 500 && transientRetries < 1) {
      transientRetries += 1;
      response = await requestProviderReply(
        activeModelId,
        input,
        includeSamplingControls,
        tokenParameter,
      );
      continue;
    }

    const currentCandidateIndex = candidateModels.indexOf(activeModelId);

    if (response.status >= 500 && currentCandidateIndex < candidateModels.length - 1) {
      activeModelId = candidateModels[currentCandidateIndex + 1]!;
      includeSamplingControls = true;
      tokenParameter = "max_tokens";
      transientRetries = 0;
      response = await requestProviderReply(
        activeModelId,
        input,
        includeSamplingControls,
        tokenParameter,
      );
      continue;
    }

    throw new Error(
      `GitHub Models chat request failed: ${response.status} ${body}`,
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ text?: string }>;
      };
    }>;
  };
  const rawContent = payload.choices?.[0]?.message?.content;
  const content =
    typeof rawContent === "string"
      ? rawContent.trim()
      : Array.isArray(rawContent)
        ? rawContent
            .map((part) => (typeof part.text === "string" ? part.text : ""))
            .join("")
            .trim()
        : "";

  if (!content) {
    throw new Error("GitHub Models response did not include message content");
  }

  return {
    content,
    modelUsed: activeModelId,
    latencyMs: Date.now() - startedAt,
    premiumCost: computePremiumCost(activeModelId),
    providerMode: "copilot",
  };
}

async function buildDemoReply(input: ReplyInput): Promise<ProviderReply> {
  const startedAt = Date.now();
  const content = buildDemoResponse(input);

  return {
    content,
    modelUsed: input.persona.modelId,
    latencyMs: Date.now() - startedAt + 250,
    premiumCost: computePremiumCost(input.persona.modelId),
    providerMode: "demo",
  };
}

export async function listAvailableModels(): Promise<ModelInfo[]> {
  if (!hasCopilotCredentials) {
    return getFallbackModels();
  }

  try {
    return await fetchProviderModels();
  } catch (error) {
    console.error("Provider model catalogue failed", error);
    return getFallbackModels();
  }
}

export async function generatePersonaReply(input: ReplyInput): Promise<ProviderReply> {
  if (!hasCopilotCredentials) {
    return buildDemoReply(input);
  }

  try {
    return await fetchProviderReply(input);
  } catch (error) {
    console.error("Provider reply failed", error);
    return buildDemoReply(input);
  }
}
