import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .optional()
    .default("development"),
  DATABASE_URL: z.string().optional(),
  AUTH_SECRET: z.string().optional().default("atrium-dev-secret"),
  ATRIUM_USERNAME: z.string().optional().default("atrium"),
  ATRIUM_PASSWORD: z.string().optional().default("atrium"),
  APP_URL: z.string().optional().default("http://localhost:3000"),
  GITHUB_PAT: z.string().optional(),
  GITHUB_COPILOT_TOKEN_URL: z
    .string()
    .optional()
    .default("https://api.github.com/copilot_internal/v2/token"),
  GITHUB_COPILOT_MODELS_URL: z
    .string()
    .optional()
    .default("https://api.githubcopilot.com/models"),
  GITHUB_COPILOT_CHAT_URL: z
    .string()
    .optional()
    .default("https://api.githubcopilot.com/chat/completions"),
});

export const env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  ATRIUM_USERNAME: process.env.ATRIUM_USERNAME,
  ATRIUM_PASSWORD: process.env.ATRIUM_PASSWORD,
  APP_URL: process.env.APP_URL,
  GITHUB_PAT: process.env.GITHUB_PAT,
  GITHUB_COPILOT_TOKEN_URL: process.env.GITHUB_COPILOT_TOKEN_URL,
  GITHUB_COPILOT_MODELS_URL: process.env.GITHUB_COPILOT_MODELS_URL,
  GITHUB_COPILOT_CHAT_URL: process.env.GITHUB_COPILOT_CHAT_URL,
});

export const isProduction = env.NODE_ENV === "production";
export const hasDatabase = Boolean(env.DATABASE_URL);
export const hasCopilotCredentials = Boolean(env.GITHUB_PAT);
