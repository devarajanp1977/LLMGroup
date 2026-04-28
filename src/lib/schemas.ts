import { z } from "zod";

function boundedNumber(min: number, max: number) {
  return z.preprocess((value) => {
    if (typeof value === "string") {
      const trimmed = value.trim();

      if (!trimmed) {
        return value;
      }

      return Number(trimmed);
    }

    return value;
  }, z.number().finite().min(min).max(max));
}

const requiredTrimmedString = (min: number, max: number) =>
  z.string().trim().min(min).max(max);

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const personaMutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: requiredTrimmedString(1, 40),
    systemPrompt: requiredTrimmedString(1, 4000),
    modelId: z.string().trim().min(1),
    temperature: boundedNumber(0, 2),
    topP: boundedNumber(0, 1),
    color: z.string().regex(/^#([0-9a-fA-F]{6})$/),
    autoRespondDefault: z.boolean(),
  }),
  z.object({
    action: z.literal("update"),
    id: z.string().uuid(),
    name: requiredTrimmedString(1, 40),
    systemPrompt: requiredTrimmedString(1, 4000),
    modelId: z.string().trim().min(1),
    temperature: boundedNumber(0, 2),
    topP: boundedNumber(0, 1),
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
