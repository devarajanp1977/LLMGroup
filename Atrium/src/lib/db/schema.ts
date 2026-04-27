import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const botPersonas = pgTable(
  "bot_personas",
  {
    id: uuid("id").primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    systemPrompt: text("system_prompt").notNull(),
    modelId: text("model_id").notNull(),
    temperature: real("temperature").notNull().default(0.7),
    topP: real("top_p").notNull().default(1),
    color: text("color").notNull(),
    autoRespondDefault: boolean("auto_respond_default").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    version: integer("version").notNull().default(1),
  },
  (table) => ({
    ownerIdx: index("bot_personas_owner_idx").on(table.ownerId),
  }),
);

export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    routingMode: text("routing_mode").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    ownerIdx: index("rooms_owner_idx").on(table.ownerId),
  }),
);

export const roomPersonas = pgTable(
  "room_personas",
  {
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    personaId: uuid("persona_id")
      .notNull()
      .references(() => botPersonas.id, { onDelete: "cascade" }),
    autoRespond: boolean("auto_respond").notNull().default(true),
    position: integer("position").notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.roomId, table.personaId] }),
    roomIdx: index("room_personas_room_idx").on(table.roomId),
  }),
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    senderType: text("sender_type").notNull(),
    senderId: uuid("sender_id").notNull(),
    content: text("content").notNull(),
    modelUsed: text("model_used"),
    latencyMs: integer("latency_ms"),
    premiumCost: numeric("premium_cost", { precision: 6, scale: 2 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    roomIdx: index("messages_room_idx").on(table.roomId),
    createdIdx: index("messages_created_idx").on(table.createdAt),
  }),
);

export const messageChunks = pgTable(
  "message_chunks",
  {
    id: uuid("id").primaryKey(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    finishReason: text("finish_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    messageIdx: index("message_chunks_message_idx").on(table.messageId),
  }),
);
