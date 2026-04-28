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

type MobilePane = "rooms" | "chat" | "editor";

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
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (tier === "0.5x") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-rose-200 bg-rose-50 text-rose-700";
}

function mobilePaneButtonClass(active: boolean) {
  return cn(
    "rounded-xl border px-3 py-2 text-sm font-medium transition",
    active
      ? "border-violet-400 bg-violet-50 text-violet-700"
      : "border-slate-300 bg-white text-slate-600 hover:border-slate-400",
  );
}

function clampNumber(value: number, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function normalizeColor(value: string, fallback = "#7c3aed") {
  const nextValue = value.trim();

  return /^#([0-9a-fA-F]{6})$/.test(nextValue) ? nextValue : fallback;
}

function buildPersonaPayload(
  personaMode: "create" | "edit",
  personaDraft: PersonaDraft,
  models: DashboardData["models"],
): PersonaMutation {
  const modelId = models.some((model) => model.id === personaDraft.modelId)
    ? personaDraft.modelId
    : (models[0]?.id ?? "");

  if (!modelId) {
    throw new Error("No models are available yet. Reload the page and try again.");
  }

  const sharedFields = {
    name: personaDraft.name.trim(),
    systemPrompt: personaDraft.systemPrompt.trim(),
    modelId,
    temperature: clampNumber(personaDraft.temperature, 0.7, 0, 2),
    topP: clampNumber(personaDraft.topP, 1, 0, 1),
    color: normalizeColor(personaDraft.color),
    autoRespondDefault: personaDraft.autoRespondDefault,
  };

  return personaMode === "create"
    ? {
        action: "create",
        ...sharedFields,
      }
    : {
        action: "update",
        id: personaDraft.id!,
        ...sharedFields,
      };
}

const lightPanelClass = "rounded-3xl border border-slate-200 bg-white shadow-sm";
const lightInputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200";
const lightGhostButtonClass =
  "rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 transition hover:border-violet-400 hover:text-violet-700";

export function AtriumDashboard({ initialData }: AtriumDashboardProps) {
  const [data, setData] = useState(initialData);
  const [selectedRoomId, setSelectedRoomId] = useState(initialData.rooms[0]?.id ?? "");
  const [mobilePane, setMobilePane] = useState<MobilePane>(
    initialData.rooms[0] ? "chat" : "editor",
  );
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
    if (!selectedRoomId) {
      return null;
    }

    return data.rooms.find((room) => room.id === selectedRoomId) ?? null;
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
      (selectedRoomId
        ? dashboard.rooms.find((room) => room.id === selectedRoomId)?.id ??
          dashboard.rooms[0]?.id ??
          ""
        : "");

    setSelectedRoomId(roomIdToUse);
    const room = dashboard.rooms.find((entry) => entry.id === roomIdToUse);
    setRoomDraft(createRoomDraft(room));
    setRoomMode(room ? "edit" : "create");
    if (!room) {
      setMobilePane("editor");
    }

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

    try {
      const payload = buildPersonaPayload(personaMode, personaDraft, data.models);
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
      setMobilePane("chat");
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
    <div className="min-h-[100dvh] bg-slate-100 text-slate-900">
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
              Atrium
            </div>
            <div className="mt-1 text-sm font-medium text-slate-900">
              {selectedRoom?.name ?? (roomMode === "create" ? "New room" : "Workspace")}
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className={lightGhostButtonClass}
          >
            Logout
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setMobilePane("rooms")}
            className={mobilePaneButtonClass(mobilePane === "rooms")}
          >
            Rooms
          </button>
          <button
            type="button"
            disabled={!selectedRoom}
            onClick={() => {
              if (selectedRoom) {
                setMobilePane("chat");
              }
            }}
            className={cn(
              mobilePaneButtonClass(mobilePane === "chat"),
              !selectedRoom && "cursor-not-allowed opacity-50",
            )}
          >
            Chat
          </button>
          <button
            type="button"
            onClick={() => setMobilePane("editor")}
            className={mobilePaneButtonClass(mobilePane === "editor")}
          >
            Editor
          </button>
        </div>
      </div>

      {flash ? (
        <div className="border-b border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 sm:px-6">
          {flash}
        </div>
      ) : null}
      {error ? (
        <div className="border-b border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 sm:px-6">
          {error}
        </div>
      ) : null}

      <div className="grid min-h-[100dvh] lg:grid-cols-[280px_minmax(0,1fr)_360px]">
        <aside
          className={cn(
            "border-b border-slate-200 bg-white/80 p-4 sm:p-5 lg:border-r lg:border-b-0",
            mobilePane === "rooms" ? "block" : "hidden lg:block",
          )}
        >
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
              className={lightGhostButtonClass}
            >
              Logout
            </button>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-900">
                  {data.user.name}
                </div>
                <div className="text-xs text-slate-500">
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
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Premium burn</span>
                <span>
                  {data.metrics.monthlyPremiumRequests}/{data.metrics.premiumCeiling}
                </span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-200">
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
              setMobilePane("editor");
            }}
            className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-violet-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-violet-400"
          >
            New room
          </button>

          <div className="mt-5 max-h-[45dvh] space-y-2 overflow-y-auto pr-1 lg:max-h-none">
            {data.rooms.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => {
                  setSelectedRoomId(room.id);
                  resetRoomDraft(room);
                  setMobilePane("chat");
                }}
                className={cn(
                  "w-full rounded-2xl border px-4 py-3 text-left transition",
                  selectedRoom?.id === room.id
                    ? "border-violet-300 bg-violet-50"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-slate-900">{room.name}</div>
                    <div className="text-xs text-slate-500">
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

        <main
          className={cn(
            "min-h-[100dvh] flex-col bg-slate-50",
            mobilePane === "chat" ? "flex" : "hidden lg:flex",
          )}
        >
          <div className="border-b border-slate-200 bg-white/70 px-4 py-4 backdrop-blur sm:px-6 sm:py-5">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  Active room
                </div>
                <h2 className="mt-1 text-2xl font-semibold text-slate-900 sm:text-3xl">
                  {selectedRoom?.name ?? "Select or create a room"}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  {selectedRoom
                    ? `Routing is ${selectedRoom.routingMode === "all" ? "all enabled" : "mention-only"} for this room. Muted bots stay present but only answer on @mention.`
                    : "Create a room, attach up to five personas, and start orchestrating the discussion."}
                </p>
              </div>

              <form
                onSubmit={handleSearch}
                className="flex w-full max-w-xl flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="text-sm font-medium text-slate-900">
                  Search conversations
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search the current room"
                    className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                  />
                  <button
                    type="submit"
                    disabled={searching}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 transition hover:border-violet-400 hover:text-violet-700 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
                  >
                    {searching ? "Searching..." : "Search"}
                  </button>
                </div>
                {searchResults.length > 0 ? (
                  <div className="space-y-2">
                    {searchResults.slice(0, 5).map((result) => (
                      <div
                        key={result.messageId}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"
                      >
                        <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                          <span>
                            {result.roomName} · {result.senderName}
                          </span>
                          <span>{formatRelativeDate(result.createdAt)}</span>
                        </div>
                        <p className="mt-2 text-slate-700">{result.snippet}</p>
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

          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
            {data.metrics.providerMode === "demo" ? (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Demo mode is active. Bot replies are local fallback responses until
                <code className="mx-1 rounded bg-amber-100 px-1.5 py-0.5 text-amber-950">
                  GITHUB_PAT
                </code>
                is configured on the server.
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
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className="mt-1 h-3 w-3 rounded-full"
                            style={{ backgroundColor: entry.persona.color }}
                          />
                          <div>
                            <div className="font-medium text-slate-900">
                              {entry.persona.name}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600">
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
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-slate-200 bg-slate-100 text-slate-600",
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

                <section className="space-y-3 sm:space-y-4">
                  {visibleMessages.map((message) => (
                    <article
                      key={message.id}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: message.senderColor }}
                          />
                          <div>
                            <div className="font-medium text-slate-900">
                              {message.senderName}
                            </div>
                            <div className="text-xs text-slate-500">
                              {formatRelativeDate(message.createdAt)}
                            </div>
                          </div>
                        </div>
                        {message.modelUsed ? (
                          <div className="self-start text-xs text-slate-500 sm:self-auto">
                            {message.modelUsed}
                            {message.latencyMs ? ` · ${message.latencyMs}ms` : ""}
                          </div>
                        ) : null}
                      </div>
                      <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                        {message.content}
                      </p>
                    </article>
                  ))}

                  {streamingMessages.map((message) => (
                    <article
                      key={`streaming-${message.personaId}`}
                      className="rounded-2xl border border-violet-200 bg-violet-50 p-4 sm:rounded-3xl sm:p-5"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: message.senderColor }}
                        />
                        <div>
                          <div className="font-medium text-slate-900">
                            {message.senderName}
                          </div>
                          <div className="text-xs text-violet-600/80">
                            {message.modelId} · streaming
                          </div>
                        </div>
                      </div>
                      <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                        {message.content || "Thinking..."}
                      </p>
                    </article>
                  ))}
                </section>
              </>
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500 sm:p-10">
                Create your first room from the rooms panel, then attach a few personas and start the conversation.
              </div>
            )}
          </div>

          <div className="sticky bottom-0 z-10 border-t border-slate-200 bg-white/90 px-4 py-4 backdrop-blur sm:px-6 sm:py-5">
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
                className="w-full rounded-3xl border border-slate-300 bg-white px-4 py-4 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200 disabled:cursor-not-allowed disabled:opacity-60"
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

        <aside
          className={cn(
            "border-t border-slate-200 bg-white/70 p-4 sm:p-5 lg:border-l lg:border-t-0",
            mobilePane === "editor" ? "block" : "hidden lg:block",
          )}
        >
          <div className="space-y-4 sm:space-y-6">
            <section className={`${lightPanelClass} p-4 sm:p-5`}>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Persona library</h3>
                  <p className="text-xs text-slate-500">
                    Reusable bots with prompts, models, colors, and default routing posture.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetPersonaDraft}
                  className={lightGhostButtonClass}
                >
                  New
                </button>
              </div>

              <div className="mb-4 space-y-2">
                {data.personas.map((persona) => (
                  <div
                    key={persona.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: persona.color }}
                        />
                        <div>
                          <div className="text-sm font-medium text-slate-900">
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
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 transition hover:border-violet-400 hover:text-violet-700"
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
                    <span className="mb-1 block text-xs text-slate-500">Name</span>
                    <input
                      value={personaDraft.name}
                      onChange={(event) =>
                        setPersonaDraft((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      className={lightInputClass}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">Color</span>
                    <input
                      type="color"
                      value={personaDraft.color}
                      onChange={(event) =>
                        setPersonaDraft((current) => ({
                          ...current,
                          color: event.target.value,
                        }))
                      }
                      className="h-11 w-full rounded-xl border border-slate-300 bg-white px-2 py-2 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">Model</span>
                  <select
                    value={personaDraft.modelId}
                    onChange={(event) =>
                      setPersonaDraft((current) => ({
                        ...current,
                        modelId: event.target.value,
                      }))
                    }
                    className={lightInputClass}
                  >
                    {data.models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name} ({model.tier})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">
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
                    className={lightInputClass}
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">
                      Temperature
                    </span>
                    <input
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      value={personaDraft.temperature}
                      onChange={(event) => {
                        const nextValue = event.target.valueAsNumber;

                        setPersonaDraft((current) => ({
                          ...current,
                          temperature: Number.isFinite(nextValue) ? nextValue : 0.7,
                        }));
                      }}
                      className={lightInputClass}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">Top-p</span>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.1"
                      value={personaDraft.topP}
                      onChange={(event) => {
                        const nextValue = event.target.valueAsNumber;

                        setPersonaDraft((current) => ({
                          ...current,
                          topP: Number.isFinite(nextValue) ? nextValue : 1,
                        }));
                      }}
                      className={lightInputClass}
                    />
                  </label>
                </div>

                <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={personaDraft.autoRespondDefault}
                    onChange={(event) =>
                      setPersonaDraft((current) => ({
                        ...current,
                        autoRespondDefault: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-300 bg-white text-violet-600"
                  />
                  Default to auto-respond when dropped into a room
                </label>

                <button
                  type="submit"
                  disabled={savingPersona}
                  className="w-full rounded-2xl bg-violet-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-violet-400 disabled:cursor-wait disabled:opacity-60"
                >
                  {savingPersona
                    ? "Saving..."
                    : personaMode === "create"
                      ? "Create persona"
                      : "Save persona"}
                </button>
              </form>
            </section>

            <section className={`${lightPanelClass} p-4 sm:p-5`}>
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-slate-900">Room editor</h3>
                <p className="text-xs text-slate-500">
                  Attach up to five personas and tune routing plus per-bot auto-respond.
                </p>
              </div>

              <form className="space-y-3" onSubmit={handleRoomSubmit}>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">Name</span>
                  <input
                    value={roomDraft.name}
                    onChange={(event) =>
                      setRoomDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    className={lightInputClass}
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">
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
                    className={lightInputClass}
                  >
                    <option value="all">All enabled</option>
                    <option value="mention">Mention only</option>
                  </select>
                </label>

                <div className="space-y-2">
                  <div className="text-xs text-slate-500">Personas in room</div>
                  {data.personas.map((persona) => {
                    const checked = roomDraft.personaIds.includes(persona.id);
                    const model = data.models.find((entry) => entry.id === persona.modelId);

                    return (
                      <label
                        key={persona.id}
                        className="block rounded-2xl border border-slate-200 bg-slate-50 p-3"
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
                              className="mt-1 h-4 w-4 rounded border-slate-300 bg-white text-violet-600"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span
                                  className="h-3 w-3 rounded-full"
                                  style={{ backgroundColor: persona.color }}
                                />
                                <span className="text-sm font-medium text-slate-900">
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
                            <label className="flex items-center gap-2 text-xs text-slate-600">
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
                                className="h-4 w-4 rounded border-slate-300 bg-white text-violet-600"
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
