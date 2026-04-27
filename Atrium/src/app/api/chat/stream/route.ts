import { requireSession } from "@/lib/guards";
import { jsonError } from "@/lib/http";
import { generatePersonaReply } from "@/lib/provider";
import { chatRequestSchema } from "@/lib/schemas";
import { appendMessages, getChatContext } from "@/lib/store";
import { extractMentions } from "@/lib/utils";

type StreamEvent =
  | {
      type: "user-message";
      payload: {
        roomId: string;
        senderName: string;
        content: string;
      };
    }
  | {
      type: "bot-start";
      payload: {
        roomId: string;
        personaId: string;
        senderName: string;
        senderColor: string;
        modelId: string;
      };
    }
  | {
      type: "bot-chunk";
      payload: {
        roomId: string;
        personaId: string;
        content: string;
      };
    }
  | {
      type: "bot-complete";
      payload: {
        roomId: string;
        personaId: string;
        messageId: string;
        content: string;
        modelUsed: string;
        latencyMs: number;
        premiumCost: number;
      };
    }
  | {
      type: "done";
      payload: {
        roomId: string;
      };
    }
  | {
      type: "error";
      payload: {
        message: string;
      };
    };

function encodeSse(event: StreamEvent) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function splitIntoChunks(content: string) {
  const sentences = content.split(/(?<=[.!?])\s+/).filter(Boolean);

  if (sentences.length <= 1) {
    return [content];
  }

  return sentences;
}

async function pause(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  const { session, error } = await requireSession();

  if (error || !session) {
    return error ?? jsonError("Unauthorized", 401);
  }

  const payload = chatRequestSchema.safeParse(await request.json());

  if (!payload.success) {
    return jsonError("Invalid chat payload", 400);
  }

  const context = await getChatContext(payload.data);

  if (!context) {
    return jsonError("Room not found", 404);
  }

  const mentions = new Set(extractMentions(payload.data.content));
  const targets =
    mentions.size > 0
      ? context.room.personas.filter((entry) =>
          mentions.has(entry.persona.name.toLowerCase()),
        )
      : context.room.routingMode === "all"
        ? context.room.personas.filter((entry) => entry.autoRespond)
        : [];

  const userMessage = await appendMessages([
    {
      roomId: payload.data.roomId,
      senderType: "user",
      senderId: context.user.id,
      content: payload.data.content,
      modelUsed: null,
      latencyMs: null,
      premiumCost: 0,
    },
  ]);

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encodeSse({
          type: "user-message",
          payload: {
            roomId: payload.data.roomId,
            senderName: context.user.name,
            content: payload.data.content,
          },
        }),
      );

      try {
        await Promise.all(
          targets.map(async (target, index) => {
            controller.enqueue(
              encodeSse({
                type: "bot-start",
                payload: {
                  roomId: payload.data.roomId,
                  personaId: target.persona.id,
                  senderName: target.persona.name,
                  senderColor: target.persona.color,
                  modelId: target.persona.modelId,
                },
              }),
            );

            const reply = await generatePersonaReply({
              persona: target.persona,
              roomName: context.room.name,
              participants: context.room.personas.map((entry) => ({
                name: entry.persona.name,
                autoRespond: entry.autoRespond,
                modelId: entry.persona.modelId,
              })),
              recentMessages: [
                ...context.recentMessages,
                {
                  ...userMessage[0],
                  senderName: context.user.name,
                  senderColor: "#111827",
                },
              ],
              userMessage: payload.data.content,
            });

            for (const chunk of splitIntoChunks(reply.content)) {
              controller.enqueue(
                encodeSse({
                  type: "bot-chunk",
                  payload: {
                    roomId: payload.data.roomId,
                    personaId: target.persona.id,
                    content: chunk,
                  },
                }),
              );
              await pause(90 + index * 30);
            }

            const [created] = await appendMessages([
              {
                roomId: payload.data.roomId,
                senderType: "bot",
                senderId: target.persona.id,
                content: reply.content,
                modelUsed: reply.modelUsed,
                latencyMs: reply.latencyMs,
                premiumCost: reply.premiumCost,
              },
            ]);

            controller.enqueue(
              encodeSse({
                type: "bot-complete",
                payload: {
                  roomId: payload.data.roomId,
                  personaId: target.persona.id,
                  messageId: created.id,
                  content: created.content,
                  modelUsed: created.modelUsed ?? target.persona.modelId,
                  latencyMs: created.latencyMs ?? reply.latencyMs,
                  premiumCost: created.premiumCost,
                },
              }),
            );
          }),
        );

        controller.enqueue(
          encodeSse({
            type: "done",
            payload: {
              roomId: payload.data.roomId,
            },
          }),
        );
      } catch (streamError) {
        controller.enqueue(
          encodeSse({
            type: "error",
            payload: {
              message:
                streamError instanceof Error
                  ? streamError.message
                  : "Streaming failed",
            },
          }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
