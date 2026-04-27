import type {
  MessageRecord,
  PersonaRecord,
  RoomPersonaRecord,
  RoomRecord,
  UserRecord,
} from "@/lib/types";

const now = new Date("2026-04-27T12:00:00.000Z").toISOString();

export type SeedBundle = {
  user: UserRecord;
  personas: PersonaRecord[];
  rooms: RoomRecord[];
  roomPersonas: RoomPersonaRecord[];
  messages: MessageRecord[];
};

function makePersona(
  userId: string,
  id: string,
  name: string,
  modelId: string,
  color: string,
  systemPrompt: string,
  autoRespondDefault = true,
): PersonaRecord {
  return {
    id,
    ownerId: userId,
    name,
    systemPrompt,
    modelId,
    temperature: 0.7,
    topP: 1,
    color,
    autoRespondDefault,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

export function createSeedBundle(user: UserRecord): SeedBundle {
  const personas = [
    makePersona(
      user.id,
      "00000000-0000-4000-8000-000000000101",
      "Strategist",
      "gpt-5-mini",
      "#7c3aed",
      "You are Strategist. Focus on direction, trade-offs, sequencing, and clear recommendations.",
    ),
    makePersona(
      user.id,
      "00000000-0000-4000-8000-000000000102",
      "Analyst",
      "gpt-4.1",
      "#2563eb",
      "You are Analyst. Break problems into concrete observations, metrics, and structured reasoning.",
    ),
    makePersona(
      user.id,
      "00000000-0000-4000-8000-000000000103",
      "Critic",
      "claude-sonnet-4",
      "#dc2626",
      "You are Critic. Stress-test assumptions, surface failure modes, and point out edge cases.",
      false,
    ),
    makePersona(
      user.id,
      "00000000-0000-4000-8000-000000000104",
      "Researcher",
      "gemini-2.5-pro",
      "#059669",
      "You are Researcher. Generate avenues to explore, cite likely sources, and expand the option set.",
      false,
    ),
  ];

  const roomId = "00000000-0000-4000-8000-000000000201";
  const rooms: RoomRecord[] = [
    {
      id: roomId,
      ownerId: user.id,
      name: "Product Studio",
      routingMode: "all",
      archivedAt: null,
      createdAt: now,
    },
  ];

  const roomPersonas: RoomPersonaRecord[] = personas.map((persona, index) => ({
    roomId,
    personaId: persona.id,
    autoRespond: index < 2,
    position: index,
  }));

  const messages: MessageRecord[] = [
    {
      id: "00000000-0000-4000-8000-000000000301",
      roomId,
      senderType: "user",
      senderId: user.id,
      content:
        "We need a personal multi-bot workspace that feels like Slack DMs for specialist agents. What matters first?",
      modelUsed: null,
      latencyMs: null,
      premiumCost: 0,
      createdAt: now,
    },
    {
      id: "00000000-0000-4000-8000-000000000302",
      roomId,
      senderType: "bot",
      senderId: personas[0].id,
      content:
        "Start with the conversation loop: rooms, persona assignment, @mentions, and fast streaming. If that flow is clumsy, everything else is garnish.",
      modelUsed: personas[0].modelId,
      latencyMs: 1280,
      premiumCost: 0,
      createdAt: new Date("2026-04-27T12:00:03.000Z").toISOString(),
    },
    {
      id: "00000000-0000-4000-8000-000000000303",
      roomId,
      senderType: "bot",
      senderId: personas[1].id,
      content:
        "Persistence is the second pillar. Searchable history, room metadata, and reusable personas should all be durable from day one.",
      modelUsed: personas[1].modelId,
      latencyMs: 1490,
      premiumCost: 0,
      createdAt: new Date("2026-04-27T12:00:05.000Z").toISOString(),
    },
  ];

  return {
    user,
    personas,
    rooms,
    roomPersonas,
    messages,
  };
}
