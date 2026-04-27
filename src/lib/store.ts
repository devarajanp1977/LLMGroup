import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import bcrypt from "bcryptjs";

import { database } from "@/lib/db/client";
import { env, hasDatabase } from "@/lib/env";
import { createSeedBundle } from "@/lib/seed";
import type {
  ChatRequest,
  DashboardData,
  MessageRecord,
  MessageView,
  ModelInfo,
  PersonaMutation,
  PersonaRecord,
  RoomMutation,
  RoomPersonaRecord,
  RoomRecord,
  RoomView,
  SearchFilters,
  SearchResult,
  UserRecord,
} from "@/lib/types";

type FileState = {
  user: UserRecord;
  personas: PersonaRecord[];
  rooms: RoomRecord[];
  roomPersonas: RoomPersonaRecord[];
  messages: MessageRecord[];
};

type RoomMutationResult = {
  rooms: RoomRecord[];
  selectedRoomId?: string;
};

const storageDir = join(process.cwd(), ".data");
const storageFile = join(storageDir, "atrium.json");

let memoryState: FileState | null = null;
let databaseInitPromise: Promise<void> | null = null;

function toIsoString(value: string | Date | null | undefined) {
  if (!value) {
    return "";
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toOptionalIsoString(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return Number(value);
  }

  return 0;
}

async function createInitialState(): Promise<FileState> {
  const passwordHash = await bcrypt.hash(env.ATRIUM_PASSWORD, 10);
  const user: UserRecord = {
    id: randomUUID(),
    name: env.ATRIUM_USERNAME,
    passwordHash,
    createdAt: new Date().toISOString(),
  };

  const seed = createSeedBundle(user);

  return {
    user,
    personas: seed.personas,
    rooms: seed.rooms,
    roomPersonas: seed.roomPersonas,
    messages: seed.messages,
  };
}

async function loadFileState(): Promise<FileState> {
  if (memoryState) {
    return memoryState;
  }

  await mkdir(storageDir, { recursive: true });

  try {
    const existing = await readFile(storageFile, "utf8");
    memoryState = JSON.parse(existing) as FileState;
  } catch {
    memoryState = await createInitialState();
    await persistFileState(memoryState);
  }

  return memoryState;
}

async function persistFileState(state: FileState) {
  memoryState = state;
  await mkdir(storageDir, { recursive: true });
  await writeFile(storageFile, JSON.stringify(state, null, 2), "utf8");
}

function mapUserRow(row: Record<string, unknown>): UserRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    passwordHash: String(row.password_hash),
    createdAt: toIsoString(row.created_at as string | Date),
  };
}

function mapPersonaRow(row: Record<string, unknown>): PersonaRecord {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    name: String(row.name),
    systemPrompt: String(row.system_prompt),
    modelId: String(row.model_id),
    temperature: toNumber(row.temperature as number | string),
    topP: toNumber(row.top_p as number | string),
    color: String(row.color),
    autoRespondDefault: Boolean(row.auto_respond_default),
    createdAt: toIsoString(row.created_at as string | Date),
    updatedAt: toIsoString(row.updated_at as string | Date),
    version: Number(row.version),
  };
}

function mapRoomRow(row: Record<string, unknown>): RoomRecord {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    name: String(row.name),
    routingMode: String(row.routing_mode) as RoomRecord["routingMode"],
    archivedAt: toOptionalIsoString(row.archived_at as string | Date | null),
    createdAt: toIsoString(row.created_at as string | Date),
  };
}

function mapRoomPersonaRow(row: Record<string, unknown>): RoomPersonaRecord {
  return {
    roomId: String(row.room_id),
    personaId: String(row.persona_id),
    autoRespond: Boolean(row.auto_respond),
    position: Number(row.position),
  };
}

function mapMessageRow(row: Record<string, unknown>): MessageRecord {
  return {
    id: String(row.id),
    roomId: String(row.room_id),
    senderType: String(row.sender_type) as MessageRecord["senderType"],
    senderId: String(row.sender_id),
    content: String(row.content),
    modelUsed:
      typeof row.model_used === "string" ? row.model_used : row.model_used ? String(row.model_used) : null,
    latencyMs:
      row.latency_ms === null || row.latency_ms === undefined
        ? null
        : Number(row.latency_ms),
    premiumCost: toNumber(row.premium_cost as number | string),
    createdAt: toIsoString(row.created_at as string | Date),
  };
}

function decorateRoom(
  room: RoomRecord,
  personas: PersonaRecord[],
  roomPersonas: RoomPersonaRecord[],
  messages: MessageRecord[],
  user: UserRecord,
): RoomView {
  const personaMap = new Map(personas.map((persona) => [persona.id, persona]));
  const visibleRoomPersonas = roomPersonas
    .filter((entry) => entry.roomId === room.id)
    .sort((a, b) => a.position - b.position)
    .map((entry) => ({
      persona: personaMap.get(entry.personaId)!,
      autoRespond: entry.autoRespond,
      position: entry.position,
    }))
    .filter((entry) => Boolean(entry.persona));

  const visibleMessages: MessageView[] = messages
    .filter((message) => message.roomId === room.id)
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
    .map((message) => {
      if (message.senderType === "user") {
        return {
          ...message,
          senderName: user.name,
          senderColor: "#111827",
        };
      }

      const persona = personaMap.get(message.senderId);

      return {
        ...message,
        senderName: persona?.name ?? "Unknown bot",
        senderColor: persona?.color ?? "#4b5563",
      };
    });

  return {
    ...room,
    personas: visibleRoomPersonas,
    messages: visibleMessages,
  };
}

function computeMonthlyPremiumRequests(
  messages: MessageRecord[],
  models: ModelInfo[],
): number {
  const premiumModelIds = new Set(
    models.filter((model) => model.tier !== "0x").map((model) => model.id),
  );
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );

  return messages.filter((message) => {
    return (
      message.senderType === "bot" &&
      Boolean(message.modelUsed) &&
      premiumModelIds.has(message.modelUsed!) &&
      new Date(message.createdAt) >= monthStart
    );
  }).length;
}

async function ensureDatabaseReady() {
  if (!database) {
    return;
  }

  if (!databaseInitPromise) {
    const sql = database.sql;

    databaseInitPromise = (async () => {
      await sql.unsafe(`
        CREATE TABLE IF NOT EXISTS users (
          id uuid PRIMARY KEY,
          name text NOT NULL UNIQUE,
          password_hash text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        );
      `);

      await sql.unsafe(`
        CREATE TABLE IF NOT EXISTS bot_personas (
          id uuid PRIMARY KEY,
          owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name text NOT NULL,
          system_prompt text NOT NULL,
          model_id text NOT NULL,
          temperature real NOT NULL DEFAULT 0.7,
          top_p real NOT NULL DEFAULT 1,
          color text NOT NULL,
          auto_respond_default boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          version integer NOT NULL DEFAULT 1
        );
      `);

      await sql.unsafe(`
        CREATE TABLE IF NOT EXISTS rooms (
          id uuid PRIMARY KEY,
          owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name text NOT NULL,
          routing_mode text NOT NULL,
          archived_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now()
        );
      `);

      await sql.unsafe(`
        CREATE TABLE IF NOT EXISTS room_personas (
          room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
          persona_id uuid NOT NULL REFERENCES bot_personas(id) ON DELETE CASCADE,
          auto_respond boolean NOT NULL DEFAULT true,
          position integer NOT NULL DEFAULT 0,
          PRIMARY KEY (room_id, persona_id)
        );
      `);

      await sql.unsafe(`
        CREATE TABLE IF NOT EXISTS messages (
          id uuid PRIMARY KEY,
          room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
          sender_type text NOT NULL,
          sender_id uuid NOT NULL,
          content text NOT NULL,
          model_used text,
          latency_ms integer,
          premium_cost numeric(6, 2) NOT NULL DEFAULT 0,
          created_at timestamptz NOT NULL DEFAULT now()
        );
      `);

      await sql.unsafe(`
        CREATE TABLE IF NOT EXISTS message_chunks (
          id uuid PRIMARY KEY,
          message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
          content text NOT NULL,
          chunk_index integer NOT NULL,
          finish_reason text,
          created_at timestamptz NOT NULL DEFAULT now()
        );
      `);

      await sql.unsafe(`
        CREATE INDEX IF NOT EXISTS bot_personas_owner_idx ON bot_personas (owner_id);
        CREATE INDEX IF NOT EXISTS rooms_owner_idx ON rooms (owner_id);
        CREATE INDEX IF NOT EXISTS room_personas_room_idx ON room_personas (room_id);
        CREATE INDEX IF NOT EXISTS messages_room_idx ON messages (room_id);
        CREATE INDEX IF NOT EXISTS messages_created_idx ON messages (created_at);
        CREATE INDEX IF NOT EXISTS message_chunks_message_idx ON message_chunks (message_id);
        CREATE INDEX IF NOT EXISTS messages_search_idx ON messages USING GIN (to_tsvector('english', content));
      `);

      const existingUsers = await sql`SELECT id FROM users LIMIT 1`;

      if (existingUsers.length === 0) {
        const initialState = await createInitialState();

        await sql.begin(async (tx) => {
          await tx`
            INSERT INTO users (id, name, password_hash, created_at)
            VALUES (
              ${initialState.user.id},
              ${initialState.user.name},
              ${initialState.user.passwordHash},
              ${initialState.user.createdAt}
            )
          `;

          for (const persona of initialState.personas) {
            await tx`
              INSERT INTO bot_personas (
                id,
                owner_id,
                name,
                system_prompt,
                model_id,
                temperature,
                top_p,
                color,
                auto_respond_default,
                created_at,
                updated_at,
                version
              ) VALUES (
                ${persona.id},
                ${persona.ownerId},
                ${persona.name},
                ${persona.systemPrompt},
                ${persona.modelId},
                ${persona.temperature},
                ${persona.topP},
                ${persona.color},
                ${persona.autoRespondDefault},
                ${persona.createdAt},
                ${persona.updatedAt},
                ${persona.version}
              )
            `;
          }

          for (const room of initialState.rooms) {
            await tx`
              INSERT INTO rooms (id, owner_id, name, routing_mode, archived_at, created_at)
              VALUES (
                ${room.id},
                ${room.ownerId},
                ${room.name},
                ${room.routingMode},
                ${room.archivedAt},
                ${room.createdAt}
              )
            `;
          }

          for (const roomPersona of initialState.roomPersonas) {
            await tx`
              INSERT INTO room_personas (room_id, persona_id, auto_respond, position)
              VALUES (
                ${roomPersona.roomId},
                ${roomPersona.personaId},
                ${roomPersona.autoRespond},
                ${roomPersona.position}
              )
            `;
          }

          for (const message of initialState.messages) {
            await tx`
              INSERT INTO messages (
                id,
                room_id,
                sender_type,
                sender_id,
                content,
                model_used,
                latency_ms,
                premium_cost,
                created_at
              ) VALUES (
                ${message.id},
                ${message.roomId},
                ${message.senderType},
                ${message.senderId},
                ${message.content},
                ${message.modelUsed},
                ${message.latencyMs},
                ${message.premiumCost},
                ${message.createdAt}
              )
            `;
          }
        });
      }
    })();
  }

  await databaseInitPromise;
}

async function readDatabaseState(): Promise<FileState> {
  if (!database) {
    return loadFileState();
  }

  await ensureDatabaseReady();
  const sql = database.sql;
  const userRows = await sql`SELECT * FROM users ORDER BY created_at ASC LIMIT 1`;
  const user = mapUserRow(userRows[0] as Record<string, unknown>);
  const personaRows = await sql`
    SELECT * FROM bot_personas
    WHERE owner_id = ${user.id}
    ORDER BY lower(name) ASC
  `;
  const roomRows = await sql`
    SELECT * FROM rooms
    WHERE owner_id = ${user.id}
    ORDER BY created_at ASC
  `;
  const rooms = roomRows.map((row) => mapRoomRow(row as Record<string, unknown>));
  const roomIds = rooms.map((room) => room.id);
  const roomPersonaRows =
    roomIds.length > 0
      ? await sql`
          SELECT * FROM room_personas
          WHERE room_id IN ${sql(roomIds)}
          ORDER BY position ASC
        `
      : [];
  const messageRows =
    roomIds.length > 0
      ? await sql`
          SELECT * FROM messages
          WHERE room_id IN ${sql(roomIds)}
          ORDER BY created_at ASC
        `
      : [];

  return {
    user,
    personas: personaRows.map((row) => mapPersonaRow(row as Record<string, unknown>)),
    rooms,
    roomPersonas: roomPersonaRows.map((row) =>
      mapRoomPersonaRow(row as Record<string, unknown>),
    ),
    messages: messageRows.map((row) => mapMessageRow(row as Record<string, unknown>)),
  };
}

async function loadState(): Promise<FileState> {
  if (database) {
    return readDatabaseState();
  }

  return loadFileState();
}

export async function bootstrapStorage() {
  if (database) {
    await ensureDatabaseReady();
    return {
      hasDatabase: true,
      mode: "postgres",
    };
  }

  const state = await loadFileState();
  await persistFileState({
    ...state,
    user: {
      ...state.user,
      createdAt: toIsoString(state.user.createdAt),
    },
    personas: state.personas.map((persona) => ({
      ...persona,
      createdAt: toIsoString(persona.createdAt),
      updatedAt: toIsoString(persona.updatedAt),
    })),
    rooms: state.rooms.map((room) => ({
      ...room,
      archivedAt: room.archivedAt ? toIsoString(room.archivedAt) : null,
      createdAt: toIsoString(room.createdAt),
    })),
    messages: state.messages.map((message) => ({
      ...message,
      createdAt: toIsoString(message.createdAt),
    })),
  });

  return {
    hasDatabase: false,
    mode: "file",
  };
}

export async function getStoredUser() {
  const state = await loadState();
  return state.user;
}

export async function validatePassword(password: string) {
  const user = await getStoredUser();
  return bcrypt.compare(password, user.passwordHash);
}

export async function getDashboardData(models: ModelInfo[]): Promise<DashboardData> {
  const state = await loadState();
  const rooms = state.rooms
    .filter((room) => room.archivedAt === null)
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
    .map((room) =>
      decorateRoom(room, state.personas, state.roomPersonas, state.messages, state.user),
    );

  return {
    user: {
      id: state.user.id,
      name: state.user.name,
    },
    models,
    personas: [...state.personas].sort((a, b) => a.name.localeCompare(b.name)),
    rooms,
    metrics: {
      monthlyPremiumRequests: computeMonthlyPremiumRequests(state.messages, models),
      premiumCeiling: 1500,
      usingDatabase: Boolean(database),
      providerMode: env.GITHUB_PAT ? "copilot" : "demo",
    },
  };
}

export async function upsertPersona(input: PersonaMutation): Promise<PersonaRecord[]> {
  if (database) {
    await ensureDatabaseReady();
    const sql = database.sql;
    const user = await getStoredUser();

    if (input.action === "create") {
      const now = new Date().toISOString();
      await sql`
        INSERT INTO bot_personas (
          id,
          owner_id,
          name,
          system_prompt,
          model_id,
          temperature,
          top_p,
          color,
          auto_respond_default,
          created_at,
          updated_at,
          version
        ) VALUES (
          ${randomUUID()},
          ${user.id},
          ${input.name},
          ${input.systemPrompt},
          ${input.modelId},
          ${input.temperature},
          ${input.topP},
          ${input.color},
          ${input.autoRespondDefault},
          ${now},
          ${now},
          ${1}
        )
      `;
    } else if (input.action === "update") {
      await sql`
        UPDATE bot_personas
        SET
          name = ${input.name},
          system_prompt = ${input.systemPrompt},
          model_id = ${input.modelId},
          temperature = ${input.temperature},
          top_p = ${input.topP},
          color = ${input.color},
          auto_respond_default = ${input.autoRespondDefault},
          updated_at = ${new Date().toISOString()},
          version = version + 1
        WHERE id = ${input.id}
      `;
    } else {
      await sql`DELETE FROM room_personas WHERE persona_id = ${input.id}`;
      await sql`
        DELETE FROM messages
        WHERE sender_type = 'bot' AND sender_id = ${input.id}
      `;
      await sql`DELETE FROM bot_personas WHERE id = ${input.id}`;
    }

    return (await loadState()).personas;
  }

  const state = await loadFileState();

  if (input.action === "create") {
    state.personas.push({
      id: randomUUID(),
      ownerId: state.user.id,
      name: input.name,
      systemPrompt: input.systemPrompt,
      modelId: input.modelId,
      temperature: input.temperature,
      topP: input.topP,
      color: input.color,
      autoRespondDefault: input.autoRespondDefault,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    });
  } else if (input.action === "update") {
    state.personas = state.personas.map((persona) =>
      persona.id === input.id
        ? {
            ...persona,
            name: input.name,
            systemPrompt: input.systemPrompt,
            modelId: input.modelId,
            temperature: input.temperature,
            topP: input.topP,
            color: input.color,
            autoRespondDefault: input.autoRespondDefault,
            updatedAt: new Date().toISOString(),
            version: persona.version + 1,
          }
        : persona,
    );
  } else {
    state.personas = state.personas.filter((persona) => persona.id !== input.id);
    state.roomPersonas = state.roomPersonas.filter(
      (entry) => entry.personaId !== input.id,
    );
    state.messages = state.messages.filter((message) => message.senderId !== input.id);
  }

  await persistFileState(state);
  return state.personas;
}

export async function mutateRoom(input: RoomMutation): Promise<RoomMutationResult> {
  if (database) {
    await ensureDatabaseReady();
    const sql = database.sql;
    const user = await getStoredUser();

    if (input.action === "create") {
      const roomId = randomUUID();
      await sql`
        INSERT INTO rooms (id, owner_id, name, routing_mode, archived_at, created_at)
        VALUES (
          ${roomId},
          ${user.id},
          ${input.name},
          ${input.routingMode},
          ${null},
          ${new Date().toISOString()}
        )
      `;

      const state = await loadState();

      for (const [index, personaId] of input.personaIds.entries()) {
        const persona = state.personas.find((entry) => entry.id === personaId);
        await sql`
          INSERT INTO room_personas (room_id, persona_id, auto_respond, position)
          VALUES (
            ${roomId},
            ${personaId},
            ${persona?.autoRespondDefault ?? true},
            ${index}
          )
        `;
      }

      return {
        rooms: (await loadState()).rooms,
        selectedRoomId: roomId,
      };
    }

    if (input.action === "update") {
      await sql`
        UPDATE rooms
        SET
          name = ${input.name},
          routing_mode = ${input.routingMode}
        WHERE id = ${input.id}
      `;
      await sql`DELETE FROM room_personas WHERE room_id = ${input.id}`;

      for (const [index, personaId] of input.personaIds.entries()) {
        await sql`
          INSERT INTO room_personas (room_id, persona_id, auto_respond, position)
          VALUES (
            ${input.id},
            ${personaId},
            ${input.autoRespondMap[personaId] ?? true},
            ${index}
          )
        `;
      }

      return {
        rooms: (await loadState()).rooms,
        selectedRoomId: input.id,
      };
    }

    if (input.action === "archive") {
      await sql`
        UPDATE rooms
        SET archived_at = ${new Date().toISOString()}
        WHERE id = ${input.id}
      `;
    } else {
      await sql`DELETE FROM rooms WHERE id = ${input.id}`;
    }

    return {
      rooms: (await loadState()).rooms,
    };
  }

  const state = await loadFileState();
  let selectedRoomId: string | undefined;

  if (input.action === "create") {
    const roomId = randomUUID();
    state.rooms.push({
      id: roomId,
      ownerId: state.user.id,
      name: input.name,
      routingMode: input.routingMode,
      archivedAt: null,
      createdAt: new Date().toISOString(),
    });

    state.roomPersonas.push(
      ...input.personaIds.map((personaId, index) => ({
        roomId,
        personaId,
        autoRespond:
          state.personas.find((persona) => persona.id === personaId)
            ?.autoRespondDefault ?? true,
        position: index,
      })),
    );
    selectedRoomId = roomId;
  } else if (input.action === "update") {
    state.rooms = state.rooms.map((room) =>
      room.id === input.id
        ? {
            ...room,
            name: input.name,
            routingMode: input.routingMode,
          }
        : room,
    );

    state.roomPersonas = state.roomPersonas.filter((entry) => entry.roomId !== input.id);
    state.roomPersonas.push(
      ...input.personaIds.map((personaId, index) => ({
        roomId: input.id,
        personaId,
        autoRespond: input.autoRespondMap[personaId] ?? true,
        position: index,
      })),
    );
    selectedRoomId = input.id;
  } else if (input.action === "archive") {
    state.rooms = state.rooms.map((room) =>
      room.id === input.id
        ? {
            ...room,
            archivedAt: new Date().toISOString(),
          }
        : room,
    );
  } else {
    state.rooms = state.rooms.filter((room) => room.id !== input.id);
    state.roomPersonas = state.roomPersonas.filter((entry) => entry.roomId !== input.id);
    state.messages = state.messages.filter((message) => message.roomId !== input.id);
  }

  await persistFileState(state);
  return {
    rooms: state.rooms,
    selectedRoomId,
  };
}

export async function appendMessage(message: Omit<MessageRecord, "id" | "createdAt">) {
  const [created] = await appendMessages([message]);
  return created;
}

export async function appendMessages(
  messagesToInsert: Array<Omit<MessageRecord, "id" | "createdAt">>,
) {
  if (database) {
    await ensureDatabaseReady();
    const sql = database.sql;
    const created: MessageRecord[] = [];

    await sql.begin(async (tx) => {
      for (const message of messagesToInsert) {
        const nextMessage: MessageRecord = {
          id: randomUUID(),
          createdAt: new Date().toISOString(),
          ...message,
        };

        await tx`
          INSERT INTO messages (
            id,
            room_id,
            sender_type,
            sender_id,
            content,
            model_used,
            latency_ms,
            premium_cost,
            created_at
          ) VALUES (
            ${nextMessage.id},
            ${nextMessage.roomId},
            ${nextMessage.senderType},
            ${nextMessage.senderId},
            ${nextMessage.content},
            ${nextMessage.modelUsed},
            ${nextMessage.latencyMs},
            ${nextMessage.premiumCost},
            ${nextMessage.createdAt}
          )
        `;

        const chunks = nextMessage.content
          .split(/(?<=[.!?])\s+/)
          .filter(Boolean);

        for (const [chunkIndex, chunk] of chunks.entries()) {
          await tx`
            INSERT INTO message_chunks (
              id,
              message_id,
              content,
              chunk_index,
              finish_reason,
              created_at
            ) VALUES (
              ${randomUUID()},
              ${nextMessage.id},
              ${chunk},
              ${chunkIndex},
              ${chunkIndex === chunks.length - 1 ? "stop" : null},
              ${nextMessage.createdAt}
            )
          `;
        }

        created.push(nextMessage);
      }
    });

    return created;
  }

  const state = await loadFileState();
  const created = messagesToInsert.map((message) => ({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...message,
  }));

  state.messages.push(...created);
  await persistFileState(state);

  return created;
}

export async function getRoomById(roomId: string) {
  const state = await loadState();
  const room = state.rooms.find(
    (entry) => entry.id === roomId && entry.archivedAt === null,
  );

  if (!room) {
    return null;
  }

  return decorateRoom(room, state.personas, state.roomPersonas, state.messages, state.user);
}

export async function getPersonaById(personaId: string) {
  const state = await loadState();
  return state.personas.find((persona) => persona.id === personaId) ?? null;
}

export async function getChatContext(input: ChatRequest) {
  const state = await loadState();
  const room = state.rooms.find(
    (entry) => entry.id === input.roomId && entry.archivedAt === null,
  );

  if (!room) {
    return null;
  }

  const roomView = decorateRoom(
    room,
    state.personas,
    state.roomPersonas,
    state.messages,
    state.user,
  );

  return {
    user: state.user,
    room: roomView,
    personas: state.personas,
    recentMessages: roomView.messages.slice(-12),
  };
}

export async function searchMessages(filters: SearchFilters): Promise<SearchResult[]> {
  const query = filters.query.trim();

  if (!query) {
    return [];
  }

  if (database) {
    await ensureDatabaseReady();
    const sql = database.sql;
    const user = await getStoredUser();
    const rows = await sql`
      SELECT
        m.id AS message_id,
        m.room_id,
        r.name AS room_name,
        m.sender_type,
        m.created_at,
        CASE
          WHEN m.sender_type = 'user' THEN u.name
          ELSE p.name
        END AS sender_name,
        ts_headline(
          'english',
          m.content,
          websearch_to_tsquery('english', ${query}),
          'MaxFragments=2, MaxWords=20, MinWords=8'
        ) AS snippet
      FROM messages m
      INNER JOIN rooms r ON r.id = m.room_id
      LEFT JOIN users u ON u.id = m.sender_id
      LEFT JOIN bot_personas p ON p.id = m.sender_id
      WHERE
        r.owner_id = ${user.id}
        AND r.archived_at IS NULL
        AND to_tsvector('english', m.content) @@ websearch_to_tsquery('english', ${query})
        ${filters.roomId ? sql`AND m.room_id = ${filters.roomId}` : sql``}
        ${filters.personaId ? sql`AND m.sender_id = ${filters.personaId}` : sql``}
        ${filters.from ? sql`AND m.created_at >= ${filters.from}` : sql``}
        ${filters.to ? sql`AND m.created_at <= ${filters.to}` : sql``}
      ORDER BY m.created_at DESC
      LIMIT 50
    `;

    return rows.map((row) => ({
      messageId: String((row as Record<string, unknown>).message_id),
      roomId: String((row as Record<string, unknown>).room_id),
      roomName: String((row as Record<string, unknown>).room_name),
      senderName: String((row as Record<string, unknown>).sender_name ?? "Unknown"),
      senderType: String((row as Record<string, unknown>).sender_type) as SearchResult["senderType"],
      createdAt: toIsoString((row as Record<string, unknown>).created_at as string | Date),
      snippet: String((row as Record<string, unknown>).snippet ?? ""),
    }));
  }

  const state = await loadFileState();
  const roomMap = new Map(state.rooms.map((room) => [room.id, room]));
  const personaMap = new Map(state.personas.map((persona) => [persona.id, persona]));
  const lowered = query.toLowerCase();

  return state.messages
    .filter((message) => {
      if (!message.content.toLowerCase().includes(lowered)) {
        return false;
      }

      if (filters.roomId && message.roomId !== filters.roomId) {
        return false;
      }

      if (filters.personaId && message.senderId !== filters.personaId) {
        return false;
      }

      if (filters.from && new Date(message.createdAt) < new Date(filters.from)) {
        return false;
      }

      if (filters.to && new Date(message.createdAt) > new Date(filters.to)) {
        return false;
      }

      return true;
    })
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, 50)
    .map((message) => {
      const room = roomMap.get(message.roomId);
      const persona = personaMap.get(message.senderId);
      const snippetStart = Math.max(
        0,
        message.content.toLowerCase().indexOf(lowered) - 60,
      );
      const snippetEnd = Math.min(message.content.length, snippetStart + 180);

      return {
        messageId: message.id,
        roomId: message.roomId,
        roomName: room?.name ?? "Unknown room",
        senderName:
          message.senderType === "user"
            ? state.user.name
            : (persona?.name ?? "Unknown bot"),
        senderType: message.senderType,
        createdAt: message.createdAt,
        snippet: message.content.slice(snippetStart, snippetEnd),
      };
    });
}

export async function getStorageStatus() {
  return {
    hasDatabase,
    mode: database ? "postgres" : "file-backed-demo",
  };
}

export async function bootstrapDatabaseFile() {
  await bootstrapStorage();
}
