"use client";

import { useMemo, useState } from "react";

import type {
  DashboardData,
  PersonaMutation,
  PersonaRecord,
  RoomMutation,
  RoomView,
  SearchResult,
} from "@/lib/types";
import { cn, formatRelativeDate } from "@/lib/utils";

type AtriumDashboardProps = {
  initialData: DashboardData;
};

type StreamingMessage = {
  personaId: string;
  senderName: string;
  senderColor: string;
  modelId: string;
  content: string;
  status: "streaming";
};

type PersonaDraft = {
  id?: string;
  name: string;
  systemPrompt: string;
  modelId: string;
  temperature: number;
  topP: number;
  color: string;
  autoRespondDefault: boolean;
};

type RoomDraft = {
  id?: string;
  name: string;
  routingMode: "all" | "mention";
  personaIds: string[];
  autoRespondMap: Record<string, boolean>;
};

function createPersonaDraft(
  persona?: PersonaRecord,
  fallbackModelId?: string,
): PersonaDraft {
  return {
    id: persona?.id,
    name: persona?.name ?? "",
    systemPrompt: persona?.systemPrompt ?? "",
    modelId: persona?.modelId ?? fallbackModelId ?? "",
    temperature: persona?.temperature ?? 0.7,
    topP: persona?.topP ?? 1,
    color: persona?.color ?? "#7c3aed",
    autoRespondDefault: persona?.autoRespondDefault ?? true,
  };
}

function createRoomDraft(room?: RoomView): RoomDraft {
  return {
    id: room?.id,
    name: room?.name ?? "",
    routingMode: room?.routingMode ?? "all",
    personaIds: room?.personas.map((entry) => entry.persona.id) ?? [],
    autoRespondMap:
      room?.personas.reduce<Record<string, boolean>>((acc, entry) => {
        acc[entry.persona.id] = entry.autoRespond;
        return acc;
      }, {}) ?? {},
  };
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function modelTierClass(tier: string) {
  if (tier === "0x") {
    return "bg-emerald-500/10 text-emerald-300 border-emerald-400/30";
  }

  if (tier === "0.5x") {
    return "bg-amber-500/10 text-amber-300 border-amber-400/30";
  }

  return "bg-rose-500/10 text-rose-300 border-rose-400/30";
}

export function AtriumDashboard({ initialData }: AtriumDashboardProps) {
  const [data, setData] = useState(initialData);
  const [selectedRoomId, setSelectedRoomId] = useState(initialData.rooms[0]?.id ?? "");
  const [composer, setComposer] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingPersona, setSavingPersona] = useState(false);
  const [savingRoom, setSavingRoom] = useState(false);
  const [sending, setSending] = useState(false);
  const [personaDraft, setPersonaDraft] = useState<PersonaDraft>(
    createPersonaDraft(undefined, initialData.models[0]?.id),
  );
  const [roomDraft, setRoomDraft] = useState<RoomDraft>(
    createRoomDraft(initialData.rooms[0]),
  );
  const [personaMode, setPersonaMode] = useState<"create" | "edit">("create");
  const [roomMode, setRoomMode] = useState<"create" | "edit">(
    initialData.rooms[0] ? "edit" : "create",
  );
  const [streamingMessages, setStreamingMessages] = useState<StreamingMessage[]>(
    [],
  );

  const selectedRoom = useMemo(() => {
    return data.rooms.find((room) => room.id === selectedRoomId) ?? data.rooms[0] ?? null;
  }, [data.rooms, selectedRoomId]);

  const visibleMessages = useMemo(() => {
    if (!selectedRoom) {
      return [];
    }

    return [...selectedRoom.messages];
  }, [selectedRoom]);

  function updateRoom(room: RoomView) {
    setData((current) => ({
      ...current,
      rooms: current.rooms.map((entry) => (entry.id === room.id ? room : entry)),
    }));
  }

  async function reloadDashboard(nextSelectedRoomId?: string) {
    const response = await fetch("/api/dashboard", { cache: "no-store" });

    if (!response.ok) {
      throw new Error("Failed to reload dashboard");
    }

    const dashboard = await readJson<DashboardData>(response);
    setData(dashboard);

    const roomIdToUse =
      nextSelectedRoomId ??
      dashboard.rooms.find((room) => room.id === selectedRoomId)?.id ??
      dashboard.rooms[0]?.id ??
      "";

    setSelectedRoomId(roomIdToUse);
    const room = dashboard.rooms.find((entry) => entry.id === roomIdToUse);
    setRoomDraft(createRoomDraft(room));
    setRoomMode(room ? "edit" : "create");

    if (personaMode === "create") {
      setPersonaDraft(createPersonaDraft(undefined, dashboard.models[0]?.id));
    } else {
      const currentPersona = dashboard.personas.find(
        (persona) => persona.id === personaDraft.id,
      );
      setPersonaDraft(createPersonaDraft(currentPersona, dashboard.models[0]?.id));
    }
  }

  function resetPersonaDraft() {
    setPersonaMode("create");
    setPersonaDraft(createPersonaDraft(undefined, data.models[0]?.id));
  }

  function resetRoomDraft(room?: RoomView | null) {
    setRoomMode(room ? "edit" : "create");
    setRoomDraft(createRoomDraft(room ?? undefined));
  }

  async function handlePersonaSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPersona(true);
    setError(null);
    setFlash(null);

    const payload: PersonaMutation =
      personaMode === "create"
        ? {
            action: "create",
            name: personaDraft.name.trim(),
            systemPrompt: personaDraft.systemPrompt.trim(),
            modelId: personaDraft.modelId,
            temperature: personaDraft.temperature,
            topP: personaDraft.topP,
            color: personaDraft.color,
            autoRespondDefault: personaDraft.autoRespondDefault,
          }
        : {
            action: "update",
            id: personaDraft.id!,
            name: personaDraft.name.trim(),
            systemPrompt: personaDraft.systemPrompt.trim(),
            modelId: personaDraft.modelId,
            temperature: personaDraft.temperature,
            topP: personaDraft.topP,
            color: personaDraft.color,
            autoRespondDefault: personaDraft.autoRespondDefault,
          };

    try {
      const response = await fetch("/api/personas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const payload = await readJson<{ error?: string }>(response);
        throw new Error(payload.error ?? "Failed to save persona");
      }

      await reloadDashboard();
      resetPersonaDraft();
      setFlash(personaMode === "create" ? "Persona created." : "Persona updated.");
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSavingPersona(false);
    }
  }

  async function handlePersonaDelete(personaId: string) {
    setSavingPersona(true);
    setError(null);
    setFlash(null);

    try {
      const response = await fetch("/api/personas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "delete",
          id: personaId,
        } satisfies PersonaMutation),
      });

      if (!response.ok) {
        const payload = await readJson<{ error?: string }>(response);
        throw new Error(payload.error ?? "Failed to delete persona");
      }

      await reloadDashboard();
      resetPersonaDraft();
      setFlash("Persona deleted.");
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setSavingPersona(false);
    }
  }

  async function handleRoomSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingRoom(true);
    setError(null);
    setFlash(null);

    const payload: RoomMutation =
      roomMode === "create"
        ? {
            action: "create",
            name: roomDraft.name.trim(),
            routingMode: roomDraft.routingMode,
            personaIds: roomDraft.personaIds,
          }
        : {
            action: "update",
            id: roomDraft.id!,
            name: roomDraft.name.trim(),
            routingMode: roomDraft.routingMode,
            personaIds: roomDraft.personaIds,
            autoRespondMap: roomDraft.autoRespondMap,
          };

    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await readJson<{ error?: string }>(response);
        throw new Error(body.error ?? "Failed to save room");
      }

      const body = await readJson<{ selectedRoomId?: string }>(response);
      await reloadDashboard(body.selectedRoomId ?? roomDraft.id);
      setFlash(roomMode === "create" ? "Room created." : "Room updated.");
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSavingRoom(false);
    }
  }

  async function mutateRoomAction(action: "archive" | "delete") {
    if (!selectedRoom) {
      return;
    }

    setSavingRoom(true);
    setError(null);
    setFlash(null);

    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          id: selectedRoom.id,
        } satisfies RoomMutation),
      });

      if (!response.ok) {
        const body = await readJson<{ error?: string }>(response);
        throw new Error(body.error ?? `Failed to ${action} room`);
      }

      await reloadDashboard();
      setFlash(action === "archive" ? "Room archived." : "Room deleted.");
    } catch (mutationError) {
      setError(getErrorMessage(mutationError));
    } finally {
      setSavingRoom(false);
    }
  }

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearching(true);
    setError(null);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: searchQuery,
          roomId: selectedRoom?.id,
        }),
      });

      if (!response.ok) {
        const body = await readJson<{ error?: string }>(response);
        throw new Error(body.error ?? "Search failed");
      }

      const payload = await readJson<{ results: SearchResult[] }>(response);
      setSearchResults(payload.results);
    } catch (searchError) {
      setError(getErrorMessage(searchError));
    } finally {
      setSearching(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", {
      method: "POST",
    });
    window.location.reload();
  }

  async function handleSendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedRoom || !composer.trim()) {
      return;
    }

    setSending(true);
    setError(null);
    setFlash(null);
    setStreamingMessages([]);

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roomId: selectedRoom.id,
          content: composer,
        }),
      });

      if (!response.ok || !response.body) {
        const body = await readJson<{ error?: string }>(response);
        throw new Error(body.error ?? "Failed to send message");
      }

      const pendingRoom: RoomView = {
        ...selectedRoom,
        messages: [
          ...selectedRoom.messages,
          {
            id: `pending-${Date.now()}`,
            roomId: selectedRoom.id,
            senderType: "user",
            senderId: data.user.id,
            senderName: data.user.name,
            senderColor: "#111827",
            content: composer,
            modelUsed: null,
            latencyMs: null,
            premiumCost: 0,
            createdAt: new Date().toISOString(),
          },
        ],
      };
      updateRoom(pendingRoom);
      setComposer("");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const rawEvent of events) {
          const line = rawEvent.trim();
          if (!line.startsWith("data:")) {
            continue;
          }

          const parsed = JSON.parse(line.slice(5).trim()) as
            | {
                type: "user-message";
                payload: { roomId: string; senderName: string; content: string };
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
                payload: { roomId: string; personaId: string; content: string };
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
            | { type: "done"; payload: { roomId: string } }
            | { type: "error"; payload: { message: string } };

          if (parsed.type === "bot-start") {
            setStreamingMessages((current) => [
              ...current,
              {
                personaId: parsed.payload.personaId,
                senderName: parsed.payload.senderName,
                senderColor: parsed.payload.senderColor,
                modelId: parsed.payload.modelId,
                content: "",
                status: "streaming",
              },
            ]);
          }

          if (parsed.type === "bot-chunk") {
            setStreamingMessages((current) =>
              current.map((entry) =>
                entry.personaId === parsed.payload.personaId
                  ? {
                      ...entry,
                      content: entry.content
                        ? `${entry.content} ${parsed.payload.content}`.trim()
                        : parsed.payload.content,
                    }
                  : entry,
              ),
            );
          }

          if (parsed.type === "bot-complete") {
            setStreamingMessages((current) =>
              current.filter((entry) => entry.personaId !== parsed.payload.personaId),
            );
            await reloadDashboard(selectedRoom.id);
          }

          if (parsed.type === "error") {
            throw new Error(parsed.payload.message);
          }
        }
      }
    } catch (sendError) {
      setError(getErrorMessage(sendError));
    } finally {
      setSending(false);
      setStreamingMessages([]);
      await reloadDashboard(selectedRoom?.id);
    }
  }

  const monthlyPremiumRatio =
    data.metrics.premiumCeiling > 0
      ? data.metrics.monthlyPremiumRequests / data.metrics.premiumCeiling
      : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)_360px]">
        <aside className="border-r border-white/10 bg-slate-950/80 p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Atrium
              </div>
              <h1 className="mt-1 text-2xl font-semibold">Rooms</h1>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 transition hover:border-violet-400 hover:text-white"
            >
              Logout
            </button>
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-white">
                  {data.user.name}
                </div>
                <div className="text-xs text-slate-400">
                  {data.metrics.providerMode === "copilot"
                    ? "Live Copilot provider"
                    : "Demo provider fallback"}
                </div>
              </div>
              <span
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px]",
                  data.metrics.usingDatabase
                    ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                    : "border-amber-400/30 bg-amber-500/10 text-amber-300",
                )}
              >
                {data.metrics.usingDatabase ? "DB ready" : "File-backed"}
              </span>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Premium burn</span>
                <span>
                  {data.metrics.monthlyPremiumRequests}/{data.metrics.premiumCeiling}
                </span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-white/5">
                <div
                  className="h-2 rounded-full bg-violet-400"
                  style={{
                    width: `${Math.min(100, Math.max(4, monthlyPremiumRatio * 100))}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setSelectedRoomId("");
              resetRoomDraft(null);
            }}
            className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-violet-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-violet-400"
          >
            New room
          </button>

          <div className="mt-5 space-y-2">
            {data.rooms.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => {
                  setSelectedRoomId(room.id);
                  resetRoomDraft(room);
                }}
                className={cn(
                  "w-full rounded-2xl border px-4 py-3 text-left transition",
                  selectedRoom?.id === room.id
                    ? "border-violet-400/40 bg-violet-500/10"
                    : "border-white/5 bg-white/[0.03] hover:border-white/10 hover:bg-white/[0.05]",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-white">{room.name}</div>
                    <div className="text-xs text-slate-400">
                      {room.personas.length} bot{room.personas.length === 1 ? "" : "s"} ·{" "}
                      {room.routingMode === "all" ? "all respond" : "mention only"}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    {room.messages.length}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <main className="flex min-h-screen flex-col bg-slate-950">
          <div className="border-b border-white/10 bg-slate-950/70 px-6 py-5 backdrop-blur">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  Active room
                </div>
                <h2 className="mt-1 text-3xl font-semibold text-white">
                  {selectedRoom?.name ?? "Select or create a room"}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                  {selectedRoom
                    ? `Routing is ${selectedRoom.routingMode === "all" ? "all enabled" : "mention-only"} for this room. Muted bots stay present but only answer on @mention.`
                    : "Create a room, attach up to five personas, and start orchestrating the discussion."}
                </p>
              </div>

              <form
                onSubmit={handleSearch}
                className="flex w-full max-w-xl flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="text-sm font-medium text-white">
                  Search conversations
                </div>
                <div className="flex gap-3">
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search the current room"
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-violet-400"
                  />
                  <button
                    type="submit"
                    disabled={searching}
                    className="rounded-xl border border-white/10 px-4 py-3 text-sm text-slate-200 transition hover:border-violet-400 hover:text-white disabled:cursor-wait disabled:opacity-60"
                  >
                    {searching ? "Searching..." : "Search"}
                  </button>
                </div>
                {searchResults.length > 0 ? (
                  <div className="space-y-2">
                    {searchResults.slice(0, 5).map((result) => (
                      <div
                        key={result.messageId}
                        className="rounded-xl border border-white/5 bg-slate-950/80 p-3 text-sm"
                      >
                        <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
                          <span>
                            {result.roomName} · {result.senderName}
                          </span>
                          <span>{formatRelativeDate(result.createdAt)}</span>
                        </div>
                        <p className="mt-2 text-slate-200">{result.snippet}</p>
                      </div>
                    ))}
                  </div>
                ) : searchQuery && !searching ? (
                  <div className="text-sm text-slate-500">
                    No matches yet for this query.
                  </div>
                ) : null}
              </form>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6">
            {flash ? (
              <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {flash}
              </div>
            ) : null}
            {error ? (
              <div className="mb-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            ) : null}

            {selectedRoom ? (
              <>
                <section className="mb-5 flex flex-wrap gap-3">
                  {selectedRoom.personas.map((entry) => {
                    const model = data.models.find(
                      (candidate) => candidate.id === entry.persona.modelId,
                    );

                    return (
                      <div
                        key={entry.persona.id}
                        className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className="mt-1 h-3 w-3 rounded-full"
                            style={{ backgroundColor: entry.persona.color }}
                          />
                          <div>
                            <div className="font-medium text-white">
                              {entry.persona.name}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                              <span className="rounded-full border border-white/10 px-2 py-1 text-slate-300">
                                {entry.persona.modelId}
                              </span>
                              {model ? (
                                <span
                                  className={cn(
                                    "rounded-full border px-2 py-1",
                                    modelTierClass(model.tier),
                                  )}
                                >
                                  {model.tier}
                                </span>
                              ) : null}
                              <span
                                className={cn(
                                  "rounded-full border px-2 py-1",
                                  entry.autoRespond
                                    ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-300"
                                    : "border-slate-700 bg-slate-800 text-slate-300",
                                )}
                              >
                                {entry.autoRespond ? "auto" : "muted"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </section>

                <section className="space-y-4">
                  {visibleMessages.map((message) => (
                    <article
                      key={message.id}
                      className="rounded-3xl border border-white/5 bg-white/[0.03] p-5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: message.senderColor }}
                          />
                          <div>
                            <div className="font-medium text-white">
                              {message.senderName}
                            </div>
                            <div className="text-xs text-slate-500">
                              {formatRelativeDate(message.createdAt)}
                            </div>
                          </div>
                        </div>
                        {message.modelUsed ? (
                          <div className="text-xs text-slate-400">
                            {message.modelUsed}
                            {message.latencyMs ? ` · ${message.latencyMs}ms` : ""}
                          </div>
                        ) : null}
                      </div>
                      <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-200">
                        {message.content}
                      </p>
                    </article>
                  ))}

                  {streamingMessages.map((message) => (
                    <article
                      key={`streaming-${message.personaId}`}
                      className="rounded-3xl border border-violet-400/20 bg-violet-500/5 p-5"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: message.senderColor }}
                        />
                        <div>
                          <div className="font-medium text-white">
                            {message.senderName}
                          </div>
                          <div className="text-xs text-violet-200/70">
                            {message.modelId} · streaming
                          </div>
                        </div>
                      </div>
                      <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-200">
                        {message.content || "Thinking..."}
                      </p>
                    </article>
                  ))}
                </section>
              </>
            ) : (
              <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center text-slate-400">
                Create your first room from the sidebar, then attach a few personas and start the conversation.
              </div>
            )}
          </div>

          <div className="border-t border-white/10 bg-slate-950/80 px-6 py-5">
            <form className="space-y-3" onSubmit={handleSendMessage}>
              <textarea
                value={composer}
                onChange={(event) => setComposer(event.target.value)}
                disabled={!selectedRoom || sending}
                rows={4}
                placeholder={
                  selectedRoom
                    ? "Message the room. Use @strategist to route a turn to a specific bot."
                    : "Select a room to start chatting."
                }
                className="w-full rounded-3xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm outline-none transition focus:border-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-500">
                  Enter sends to the room. Mention routing works by persona name.
                </div>
                <button
                  type="submit"
                  disabled={!selectedRoom || sending || !composer.trim()}
                  className="rounded-2xl bg-violet-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-violet-400 disabled:cursor-wait disabled:opacity-60"
                >
                  {sending ? "Streaming..." : "Send"}
                </button>
              </div>
            </form>
          </div>
        </main>

        <aside className="border-l border-white/10 bg-slate-950/60 p-5">
          <div className="space-y-6">
            <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">Persona library</h3>
                  <p className="text-xs text-slate-500">
                    Reusable bots with prompts, models, colors, and default routing posture.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetPersonaDraft}
                  className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 transition hover:border-violet-400 hover:text-white"
                >
                  New
                </button>
              </div>

              <div className="mb-4 space-y-2">
                {data.personas.map((persona) => (
                  <div
                    key={persona.id}
                    className="rounded-2xl border border-white/5 bg-slate-950/80 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: persona.color }}
                        />
                        <div>
                          <div className="text-sm font-medium text-white">
                            {persona.name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {persona.modelId} · v{persona.version}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setPersonaMode("edit");
                            setPersonaDraft(createPersonaDraft(persona, data.models[0]?.id));
                          }}
                          className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 transition hover:border-violet-400 hover:text-white"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePersonaDelete(persona.id)}
                          className="rounded-lg border border-rose-400/20 px-2.5 py-1.5 text-xs text-rose-200 transition hover:bg-rose-500/10"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <form className="space-y-3" onSubmit={handlePersonaSubmit}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-400">Name</span>
                    <input
                      value={personaDraft.name}
                      onChange={(event) =>
                        setPersonaDraft((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-400"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-400">Color</span>
                    <input
                      value={personaDraft.color}
                      onChange={(event) =>
                        setPersonaDraft((current) => ({
                          ...current,
                          color: event.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-400"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">Model</span>
                  <select
                    value={personaDraft.modelId}
                    onChange={(event) =>
                      setPersonaDraft((current) => ({
                        ...current,
                        modelId: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-400"
                  >
                    {data.models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name} ({model.tier})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">
                    System prompt
                  </span>
                  <textarea
                    rows={5}
                    value={personaDraft.systemPrompt}
                    onChange={(event) =>
                      setPersonaDraft((current) => ({
                        ...current,
                        systemPrompt: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-400"
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-400">
                      Temperature
                    </span>
                    <input
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      value={personaDraft.temperature}
                      onChange={(event) =>
                        setPersonaDraft((current) => ({
                          ...current,
                          temperature: Number(event.target.value),
                        }))
                      }
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-400"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-400">Top-p</span>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.1"
                      value={personaDraft.topP}
                      onChange={(event) =>
                        setPersonaDraft((current) => ({
                          ...current,
                          topP: Number(event.target.value),
                        }))
                      }
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-400"
                    />
                  </label>
                </div>

                <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={personaDraft.autoRespondDefault}
                    onChange={(event) =>
                      setPersonaDraft((current) => ({
                        ...current,
                        autoRespondDefault: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-white/10 bg-slate-900"
                  />
                  Default to auto-respond when dropped into a room
                </label>

                <button
                  type="submit"
                  disabled={savingPersona}
                  className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-slate-200 disabled:cursor-wait disabled:opacity-60"
                >
                  {savingPersona
                    ? "Saving..."
                    : personaMode === "create"
                      ? "Create persona"
                      : "Save persona"}
                </button>
              </form>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-white">Room editor</h3>
                <p className="text-xs text-slate-500">
                  Attach up to five personas and tune routing plus per-bot auto-respond.
                </p>
              </div>

              <form className="space-y-3" onSubmit={handleRoomSubmit}>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">Name</span>
                  <input
                    value={roomDraft.name}
                    onChange={(event) =>
                      setRoomDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-400"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">
                    Routing mode
                  </span>
                  <select
                    value={roomDraft.routingMode}
                    onChange={(event) =>
                      setRoomDraft((current) => ({
                        ...current,
                        routingMode: event.target.value as "all" | "mention",
                      }))
                    }
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-400"
                  >
                    <option value="all">All enabled</option>
                    <option value="mention">Mention only</option>
                  </select>
                </label>

                <div className="space-y-2">
                  <div className="text-xs text-slate-400">Personas in room</div>
                  {data.personas.map((persona) => {
                    const checked = roomDraft.personaIds.includes(persona.id);
                    const model = data.models.find((entry) => entry.id === persona.modelId);

                    return (
                      <label
                        key={persona.id}
                        className="block rounded-2xl border border-white/10 bg-slate-950 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => {
                                setRoomDraft((current) => {
                                  const nextPersonaIds = event.target.checked
                                    ? [...current.personaIds, persona.id].slice(0, 5)
                                    : current.personaIds.filter((id) => id !== persona.id);

                                  return {
                                    ...current,
                                    personaIds: nextPersonaIds,
                                    autoRespondMap: {
                                      ...current.autoRespondMap,
                                      [persona.id]:
                                        current.autoRespondMap[persona.id] ??
                                        persona.autoRespondDefault,
                                    },
                                  };
                                });
                              }}
                              className="mt-1 h-4 w-4 rounded border-white/10 bg-slate-900"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span
                                  className="h-3 w-3 rounded-full"
                                  style={{ backgroundColor: persona.color }}
                                />
                                <span className="text-sm font-medium text-white">
                                  {persona.name}
                                </span>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                <span>{persona.modelId}</span>
                                {model ? (
                                  <span
                                    className={cn(
                                      "rounded-full border px-2 py-1",
                                      modelTierClass(model.tier),
                                    )}
                                  >
                                    {model.tier}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          {checked ? (
                            <label className="flex items-center gap-2 text-xs text-slate-300">
                              <input
                                type="checkbox"
                                checked={roomDraft.autoRespondMap[persona.id] ?? true}
                                onChange={(event) =>
                                  setRoomDraft((current) => ({
                                    ...current,
                                    autoRespondMap: {
                                      ...current.autoRespondMap,
                                      [persona.id]: event.target.checked,
                                    },
                                  }))
                                }
                                className="h-4 w-4 rounded border-white/10 bg-slate-900"
                              />
                              auto
                            </label>
                          ) : null}
                        </div>
                      </label>
                    );
                  })}
                </div>

                <button
                  type="submit"
                  disabled={savingRoom}
                  className="w-full rounded-2xl bg-violet-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-violet-400 disabled:cursor-wait disabled:opacity-60"
                >
                  {savingRoom
                    ? "Saving..."
                    : roomMode === "create"
                      ? "Create room"
                      : "Save room"}
                </button>
              </form>

              {selectedRoom ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => mutateRoomAction("archive")}
                    className="rounded-2xl border border-amber-400/20 px-4 py-3 text-sm text-amber-200 transition hover:bg-amber-500/10"
                  >
                    Archive room
                  </button>
                  <button
                    type="button"
                    onClick={() => mutateRoomAction("delete")}
                    className="rounded-2xl border border-rose-400/20 px-4 py-3 text-sm text-rose-200 transition hover:bg-rose-500/10"
                  >
                    Delete room
                  </button>
                </div>
              ) : null}
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
}
