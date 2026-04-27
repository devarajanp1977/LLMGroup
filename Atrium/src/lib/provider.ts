import "server-only";

import type { MessageView, ModelInfo, PersonaRecord } from "@/lib/types";
import { env, hasCopilotCredentials } from "@/lib/env";
import {
  getFallbackModels,
  inferTierFromModelId,
  sortModelsForSuggestions,
} from "@/lib/models";

type CopilotTokenResponse = {
  token?: string;
  expires_at?: number;
  expiresAt?: number;
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

let tokenCache:
  | {
      token: string;
      expiresAt: number;
    }
  | null = null;

async function getCopilotSessionToken() {
  if (!hasCopilotCredentials) {
    return null;
  }

  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }

  const response = await fetch(env.GITHUB_COPILOT_TOKEN_URL, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.GITHUB_PAT}`,
      Accept: "application/json",
      "User-Agent": "Atrium/0.1",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Copilot token request failed: ${response.status}`);
  }

  const payload = (await response.json()) as CopilotTokenResponse;

  if (!payload.token) {
    throw new Error("Copilot token payload missing token");
  }

  tokenCache = {
    token: payload.token,
    expiresAt:
      typeof payload.expires_at === "number"
        ? payload.expires_at * 1000
        : typeof payload.expiresAt === "number"
          ? payload.expiresAt
          : Date.now() + 25 * 60 * 1000,
  };

  return tokenCache.token;
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
        : "GitHub Copilot";
  const description =
    typeof item.summary === "string"
      ? item.summary
      : typeof item.description === "string"
        ? item.description
        : "Live model discovered from the Copilot catalogue.";
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

async function fetchCopilotModels(): Promise<ModelInfo[]> {
  const token = await getCopilotSessionToken();

  if (!token) {
    return getFallbackModels();
  }

  const response = await fetch(env.GITHUB_COPILOT_MODELS_URL, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "User-Agent": "Atrium/0.1",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Copilot models request failed: ${response.status}`);
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

  const models = collection.map(toModelInfo).filter(Boolean) as ModelInfo[];

  return models.length > 0 ? sortModelsForSuggestions(models) : getFallbackModels();
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

function buildDemoResponse(input: ReplyInput) {
  const mentionedOthers = input.participants
    .filter((participant) => participant.name !== input.persona.name)
    .slice(0, 2)
    .map((participant) => participant.name)
    .join(" and ");

  const routingHint =
    mentionedOthers.length > 0
      ? `Coordinate with ${mentionedOthers} if a specialist angle matters.`
      : "Drive the answer yourself and keep it concrete.";

  return [
    `${input.persona.name} view: ${input.userMessage.trim()}`,
    "",
    `1. Focus: ${input.persona.systemPrompt.split(".")[0] ?? "Provide a clear specialist answer."}.`,
    `2. Recommendation: respond in a way that advances the room instead of restating the prompt.`,
    `3. Routing note: ${routingHint}`,
    "",
    `Model ${input.persona.modelId} is ${
      computePremiumCost(input.persona.modelId) === 0 ? "a 0x default responder" : "an explicit escalation path"
    } in Atrium.`,
  ].join("\n");
}

async function fetchCopilotReply(input: ReplyInput): Promise<ProviderReply> {
  const token = await getCopilotSessionToken();

  if (!token) {
    throw new Error("Copilot credentials are unavailable");
  }

  const startedAt = Date.now();
  const transcript = buildTranscript(input.recentMessages);
  const response = await fetch(env.GITHUB_COPILOT_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Atrium/0.1",
    },
    body: JSON.stringify({
      model: input.persona.modelId,
      stream: false,
      temperature: input.persona.temperature,
      top_p: input.persona.topP,
      messages: [
        {
          role: "system",
          content: [
            input.persona.systemPrompt,
            "You are participating in Atrium, a multi-bot room chat.",
            "Keep your reply concise but useful, and do not pretend to be other bots.",
          ].join("\n\n"),
        },
        {
          role: "user",
          content: [
            `Room: ${input.roomName}`,
            `Participants: ${input.participants.map((participant) => `${participant.name} (${participant.modelId})`).join(", ")}`,
            "",
            "Recent transcript:",
            transcript || "No previous messages.",
            "",
            `Newest user message: ${input.userMessage}`,
          ].join("\n"),
        },
      ],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Copilot chat request failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const content = payload.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("Copilot chat response did not include message content");
  }

  return {
    content,
    modelUsed: input.persona.modelId,
    latencyMs: Date.now() - startedAt,
    premiumCost: computePremiumCost(input.persona.modelId),
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
    return await fetchCopilotModels();
  } catch {
    return getFallbackModels();
  }
}

export async function generatePersonaReply(input: ReplyInput): Promise<ProviderReply> {
  if (!hasCopilotCredentials) {
    return buildDemoReply(input);
  }

  try {
    return await fetchCopilotReply(input);
  } catch {
    return buildDemoReply(input);
  }
}
