import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const personaMutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string().min(1).max(40),
    systemPrompt: z.string().min(1).max(4000),
    modelId: z.string().min(1),
    temperature: z.number().min(0).max(2),
    topP: z.number().min(0).max(1),
    color: z.string().regex(/^#([0-9a-fA-F]{6})$/),
    autoRespondDefault: z.boolean(),
  }),
  z.object({
    action: z.literal("update"),
    id: z.string().uuid(),
    name: z.string().min(1).max(40),
    systemPrompt: z.string().min(1).max(4000),
    modelId: z.string().min(1),
    temperature: z.number().min(0).max(2),
    topP: z.number().min(0).max(1),
    color: z.string().regex(/^#([0-9a-fA-F]{6})$/),
    autoRespondDefault: z.boolean(),
  }),
  z.object({
    action: z.literal("delete"),
    id: z.string().uuid(),
  }),
]);

export const roomMutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string().min(1).max(60),
    routingMode: z.enum(["all", "mention"]),
    personaIds: z.array(z.string().uuid()).min(1).max(5),
  }),
  z.object({
    action: z.literal("update"),
    id: z.string().uuid(),
    name: z.string().min(1).max(60),
    routingMode: z.enum(["all", "mention"]),
    personaIds: z.array(z.string().uuid()).min(1).max(5),
    autoRespondMap: z.record(z.string(), z.boolean()),
  }),
  z.object({
    action: z.literal("archive"),
    id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("delete"),
    id: z.string().uuid(),
  }),
]);

export const chatRequestSchema = z.object({
  roomId: z.string().uuid(),
  content: z.string().min(1).max(8000),
});

export const searchSchema = z.object({
  query: z.string().trim().max(200).default(""),
  roomId: z.string().uuid().optional(),
  personaId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});
