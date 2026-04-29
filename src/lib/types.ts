export type RoutingMode = "all" | "mention";
export type SenderType = "user" | "bot";
export type ModelTier = "0x" | "0.5x" | "1x";

export type UserRecord = {
  id: string;
  name: string;
  passwordHash: string;
  createdAt: string;
};

export type ModelInfo = {
  id: string;
  name: string;
  provider: string;
  tier: ModelTier;
  description: string;
  recommendedForMultiBot: boolean;
};

export type PersonaRecord = {
  id: string;
  ownerId: string;
  name: string;
  systemPrompt: string;
  modelId: string;
  temperature: number;
  topP: number;
  color: string;
  autoRespondDefault: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type RoomRecord = {
  id: string;
  ownerId: string;
  name: string;
  routingMode: RoutingMode;
  archivedAt: string | null;
  createdAt: string;
};

export type RoomPersonaRecord = {
  roomId: string;
  personaId: string;
  autoRespond: boolean;
  position: number;
};

export type MessageRecord = {
  id: string;
  roomId: string;
  senderType: SenderType;
  senderId: string;
  content: string;
  modelUsed: string | null;
  latencyMs: number | null;
  premiumCost: number;
  createdAt: string;
};

export type MessageChunkRecord = {
  id: string;
  messageId: string;
  content: string;
  chunkIndex: number;
  finishReason: string | null;
  createdAt: string;
};

export type RoomPersonaView = {
  persona: PersonaRecord;
  autoRespond: boolean;
  position: number;
};

export type MessageView = MessageRecord & {
  senderName: string;
  senderColor: string;
};

export type RoomView = RoomRecord & {
  personas: RoomPersonaView[];
  messages: MessageView[];
};

export type SearchResult = {
  messageId: string;
  roomId: string;
  roomName: string;
  senderName: string;
  senderType: SenderType;
  createdAt: string;
  snippet: string;
};

export type DashboardData = {
  user: {
    id: string;
    name: string;
  };
  models: ModelInfo[];
  personas: PersonaRecord[];
  rooms: RoomView[];
  metrics: {
    monthlyPremiumRequests: number;
    premiumCeiling: number;
    usingDatabase: boolean;
    providerMode: "copilot" | "demo";
  };
};

export type LoginPayload = {
  username: string;
  password: string;
};

export type PersonaMutation =
  | {
      action: "create";
      name: string;
      systemPrompt: string;
      modelId: string;
      temperature: number;
      topP: number;
      color: string;
      autoRespondDefault: boolean;
    }
  | {
      action: "update";
      id: string;
      name: string;
      systemPrompt: string;
      modelId: string;
      temperature: number;
      topP: number;
      color: string;
      autoRespondDefault: boolean;
    }
  | {
      action: "delete";
      id: string;
    };

export type RoomMutation =
  | {
      action: "create";
      name: string;
      routingMode: RoutingMode;
      personaIds: string[];
    }
  | {
      action: "update";
      id: string;
      name: string;
      routingMode: RoutingMode;
      personaIds: string[];
      autoRespondMap: Record<string, boolean>;
    }
  | {
      action: "archive";
      id: string;
    }
  | {
      action: "delete";
      id: string;
    };

export type SearchFilters = {
  query: string;
  roomId?: string;
  personaId?: string;
  from?: string;
  to?: string;
};

export type ChatRequest = {
  roomId: string;
  content: string;
};
