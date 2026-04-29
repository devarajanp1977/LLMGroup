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
    personaIds: room?.personas?.map((entry) => entry.persona.id) ?? [],
    autoRespondMap:
      room?.personas?.reduce<Record<string, boolean>>((acc, entry) => {
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
    return "border-[#bedfd2] bg-[#eaf6f0] text-[#17594a]";
  }

  if (tier === "0.5x") {
    return "border-[#f1d8b7] bg-[#fff4e6] text-[#b26436]";
  }

  return "border-[#efc5c2] bg-[#fff0ef] text-[#a24f49]";
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

function getUsagePercentage(used: number, ceiling: number) {
  if (ceiling <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((used / ceiling) * 100));
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

const inputClass =
  "w-full rounded-2xl border border-[#e5d7c6] bg-[#fffdfa] px-4 py-3 text-sm text-[#261c14] outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition placeholder:text-[#ab9782] focus:border-[#17594a]/50 focus:ring-4 focus:ring-[#17594a]/10";

const ghostButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-2xl border border-[#e5d7c6] bg-white/90 px-3.5 py-2.5 text-sm font-medium text-[#5f4d3d] shadow-[0_10px_30px_-24px_rgba(55,41,24,0.45)] transition hover:border-[#d2b188] hover:bg-[#fff7ee] hover:text-[#241a12]";

const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-2xl bg-[#17594a] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_-22px_rgba(23,89,74,0.75)] transition hover:bg-[#13483c] active:scale-[0.99] disabled:cursor-wait disabled:opacity-50";

const destructiveButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-2xl border border-[#e7b8b4] bg-[#fff6f5] px-4 py-3 text-sm font-semibold text-[#a24f49] transition hover:border-[#d79a94] hover:bg-[#ffefed]";

const roomCardClass =
  "w-full rounded-[28px] border border-[#eadfce] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(249,242,233,0.92))] p-4 text-left shadow-[0_24px_60px_-42px_rgba(55,41,24,0.55)] transition hover:-translate-y-0.5 hover:border-[#dcb98d] hover:shadow-[0_28px_70px_-40px_rgba(55,41,24,0.42)]";

const roomCardActiveClass =
  "w-full rounded-[28px] border border-[#d4b082] bg-[linear-gradient(180deg,rgba(255,248,239,0.98),rgba(249,238,222,0.95))] p-4 text-left shadow-[0_30px_70px_-42px_rgba(178,100,54,0.45)] ring-1 ring-[#f0d6b8] transition";

const panelCardClass =
  "rounded-[32px] border border-[#e8dbc8] bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(250,244,236,0.95))] p-5 shadow-[0_28px_70px_-46px_rgba(55,41,24,0.5)]";

const miniMetricClass =
  "rounded-[24px] border border-[#eadfce] bg-white/88 p-4 shadow-[0_18px_45px_-34px_rgba(55,41,24,0.38)]";

const Icons = {
  Home: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  ),
  Search: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
  ),
  Send: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
    </svg>
  ),
  Logout: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
    </svg>
  ),
  Plus: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  ),
  ChevronLeft: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
    </svg>
  ),
  Archive: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
    </svg>
  ),
  Trash: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  ),
  Edit: () => (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
    </svg>
  ),
  Close: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  ),
  Check: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  ),
  Bot: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 3.75h6M12 3.75V6m-7.5 4.5A2.25 2.25 0 0 1 6.75 8.25h10.5A2.25 2.25 0 0 1 19.5 10.5v6.75a2.25 2.25 0 0 1-2.25 2.25H6.75a2.25 2.25 0 0 1-2.25-2.25V10.5ZM9 12h.008v.008H9V12Zm6 0h.008v.008H15V12Zm-6 3h6" />
    </svg>
  ),
  Pulse: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h3.3l2.1-5.25 4.2 10.5 2.1-5.25h4.8" />
    </svg>
  ),
  Database: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75c0 1.864 3.694 3.375 8.25 3.375s8.25-1.511 8.25-3.375S16.556 3.375 12 3.375 3.75 4.886 3.75 6.75Zm0 0v4.5c0 1.864 3.694 3.375 8.25 3.375s8.25-1.511 8.25-3.375v-4.5m-16.5 4.5v4.5c0 1.864 3.694 3.375 8.25 3.375s8.25-1.511 8.25-3.375v-4.5" />
    </svg>
  ),
  Spark: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Zm6.75 13.5.75 2.25 2.25.75-2.25.75-.75 2.25-.75-2.25-2.25-.75 2.25-.75.75-2.25ZM4.5 15l.9 2.6L8 18.5l-2.6.9L4.5 22l-.9-2.6L1 18.5l2.6-.9.9-2.6Z" />
    </svg>
  ),
};

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
  const [showSearch, setShowSearch] = useState(false);
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
  const [streamingMessages, setStreamingMessages] = useState<StreamingMessage[]>([]);

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
        const resPayload = await readJson<{ error?: string }>(response);
        throw new Error(resPayload.error ?? "Failed to save persona");
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
        const resPayload = await readJson<{ error?: string }>(response);
        throw new Error(resPayload.error ?? "Failed to delete persona");
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

    if (!roomDraft.name.trim()) {
      setError("Room name is required.");
      setSavingRoom(false);
      return;
    }

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

    if (!searchQuery.trim()) {
      return;
    }

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
            senderColor: "#a78bfa",
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
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) {
            continue;
          }

          try {
            const rawData = JSON.parse(line.slice(6));

            if (rawData?.event === "user-message") {
              continue;
            }

            if (rawData?.event === "bot-start") {
              setStreamingMessages((current) => [
                ...current,
                {
                  personaId: rawData.data.botId,
                  senderName: rawData.data.senderName,
                  senderColor: rawData.data.senderColor,
                  modelId: rawData.data.modelId,
                  content: "",
                  status: "streaming",
                } satisfies StreamingMessage,
              ]);
              continue;
            }

            if (rawData?.event === "bot-chunk") {
              setStreamingMessages((current) =>
                current.map((entry) =>
                  entry.personaId === rawData.data.botId
                    ? { ...entry, content: entry.content + rawData.data.chunk }
                    : entry,
                ),
              );
              continue;
            }

            if (rawData?.event === "bot-complete") {
              setStreamingMessages((current) =>
                current.filter((entry) => entry.personaId !== rawData.data.botId),
              );
              continue;
            }

            if (rawData?.event === "done") {
              break;
            }
          } catch {
            // Skip malformed lines
          }
        }
      }

      setStreamingMessages([]);
      await reloadDashboard(selectedRoom.id);
    } catch (sendError) {
      setError(getErrorMessage(sendError));
      setStreamingMessages([]);
    } finally {
      setSending(false);
    }
  }

  const nonArchivedRooms = useMemo(
    () => data.rooms.filter((room) => !room.archivedAt),
    [data.rooms],
  );
  const archivedRoomsCount = data.rooms.length - nonArchivedRooms.length;
  const totalMessages = useMemo(
    () => data.rooms.reduce((sum, room) => sum + room.messages.length, 0),
    [data.rooms],
  );
  const recommendedModelCount = useMemo(
    () => data.models.filter((model) => model.recommendedForMultiBot).length,
    [data.models],
  );
  const autoDefaultPersonaCount = useMemo(
    () => data.personas.filter((persona) => persona.autoRespondDefault).length,
    [data.personas],
  );
  const premiumUsagePercentage = useMemo(
    () =>
      getUsagePercentage(
        data.metrics.monthlyPremiumRequests,
        data.metrics.premiumCeiling,
      ),
    [data.metrics.monthlyPremiumRequests, data.metrics.premiumCeiling],
  );
  const selectedRoomLastMessage = useMemo(() => {
    if (!selectedRoom || selectedRoom.messages.length === 0) {
      return null;
    }

    return selectedRoom.messages[selectedRoom.messages.length - 1] ?? null;
  }, [selectedRoom]);
  const selectedRoomAutoResponders = useMemo(
    () => selectedRoom?.personas.filter((entry) => entry.autoRespond).length ?? 0,
    [selectedRoom],
  );
  const selectedModel = useMemo(
    () => data.models.find((model) => model.id === personaDraft.modelId) ?? null,
    [data.models, personaDraft.modelId],
  );

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-[#f6efe5] text-[#241a13]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(232,180,108,0.22),transparent_30%),radial-gradient(circle_at_top_right,rgba(23,89,74,0.12),transparent_26%),linear-gradient(180deg,#fbf7f1_0%,#f4ecdf_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(124,99,76,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(124,99,76,0.05)_1px,transparent_1px)] bg-[size:44px_44px] opacity-30" />
      </div>

      <header className="relative z-10 border-b border-[#eadcc8]/90 bg-[#fbf6ef]/85 backdrop-blur-2xl">
        <div className="px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[18px] bg-[linear-gradient(135deg,#c8734b,#17594a)] shadow-[0_18px_40px_-20px_rgba(23,89,74,0.55)]">
                <span className="text-lg font-semibold text-white">A</span>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#b26436]">
                  Atrium Console
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#20160f] sm:text-[2rem]">
                  A brighter control room for multi-bot collaboration.
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#7f6d5d]">
                  Manage rooms, shape personas, and keep live conversations centered
                  without changing how the system works underneath.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => {
                  resetRoomDraft(null);
                  setMobilePane("editor");
                }}
                className={ghostButtonClass}
              >
                <Icons.Plus />
                New room
              </button>
              <button
                type="button"
                onClick={() => setShowSearch((current) => !current)}
                className={cn(
                  ghostButtonClass,
                  showSearch &&
                    "border-[#d3b184] bg-[#fff3e1] text-[#a65c34] shadow-[0_16px_36px_-28px_rgba(178,100,54,0.6)]",
                )}
              >
                <Icons.Search />
                Search
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#e8c3be] bg-[#fff7f6] px-3.5 py-2.5 text-sm font-medium text-[#a24f49] transition hover:border-[#dba29b] hover:bg-[#fff0ee]"
                aria-label="Logout"
              >
                <Icons.Logout />
                Logout
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className={miniMetricClass}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#987e68]">
                  Rooms live
                </span>
                <span className="rounded-full bg-[#fff3e2] px-2.5 py-1 text-[11px] font-semibold text-[#b26436]">
                  {archivedRoomsCount} archived
                </span>
              </div>
              <p className="mt-4 text-3xl font-semibold text-[#1f160f]">
                {nonArchivedRooms.length}
              </p>
              <p className="mt-1 text-sm text-[#877566]">
                Active spaces ready for conversation and routing.
              </p>
            </div>

            <div className={miniMetricClass}>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#987e68]">
                <Icons.Bot />
                Personas ready
              </div>
              <p className="mt-4 text-3xl font-semibold text-[#1f160f]">
                {data.personas.length}
              </p>
              <p className="mt-1 text-sm text-[#877566]">
                {autoDefaultPersonaCount} default to auto-respond when dropped into a room.
              </p>
            </div>

            <div className={miniMetricClass}>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#987e68]">
                <Icons.Spark />
                Model coverage
              </div>
              <p className="mt-4 text-3xl font-semibold text-[#1f160f]">
                {data.models.length}
              </p>
              <p className="mt-1 text-sm text-[#877566]">
                {recommendedModelCount} tuned for multi-bot use. {totalMessages} messages stored.
              </p>
            </div>

            <div className={miniMetricClass}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#987e68]">
                  <Icons.Pulse />
                  Premium use
                </div>
                <span className="text-xs font-medium text-[#6f5c4d]">
                  {data.metrics.premiumCeiling > 0
                    ? `${data.metrics.monthlyPremiumRequests}/${data.metrics.premiumCeiling}`
                    : `${data.metrics.monthlyPremiumRequests} used`}
                </span>
              </div>
              <div className="mt-4 h-2.5 rounded-full bg-[#efe4d5]">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#c8734b,#17594a)]"
                  style={{
                    width:
                      data.metrics.premiumCeiling > 0
                        ? `${premiumUsagePercentage}%`
                        : "18%",
                  }}
                />
              </div>
              <p className="mt-3 text-sm text-[#877566]">
                {data.metrics.providerMode === "demo" ? "Demo mode" : "Copilot mode"} with{" "}
                {data.metrics.usingDatabase ? "database persistence" : "local file persistence"}.
              </p>
            </div>
          </div>

          <div className="mt-4 flex gap-2 lg:hidden">
            <button
              type="button"
              onClick={() => setMobilePane("rooms")}
              className={cn(
                "flex-1 rounded-2xl border px-3 py-2.5 text-sm font-medium transition",
                mobilePane === "rooms"
                  ? "border-[#d3b184] bg-[#fff3e1] text-[#a65c34]"
                  : "border-[#e5d7c6] bg-white/80 text-[#6b5949]",
              )}
            >
              Rooms
            </button>
            <button
              type="button"
              onClick={() => setMobilePane("chat")}
              className={cn(
                "flex-1 rounded-2xl border px-3 py-2.5 text-sm font-medium transition",
                mobilePane === "chat"
                  ? "border-[#17594a]/30 bg-[#eaf6f0] text-[#17594a]"
                  : "border-[#e5d7c6] bg-white/80 text-[#6b5949]",
              )}
            >
              Chat
            </button>
            <button
              type="button"
              onClick={() => setMobilePane("editor")}
              className={cn(
                "flex-1 rounded-2xl border px-3 py-2.5 text-sm font-medium transition",
                mobilePane === "editor"
                  ? "border-[#d3b184] bg-[#fff8ef] text-[#8f4f2f]"
                  : "border-[#e5d7c6] bg-white/80 text-[#6b5949]",
              )}
            >
              Studio
            </button>
          </div>

          {showSearch ? (
            <div className="mt-4 rounded-[30px] border border-[#e8dbc8] bg-white/82 p-4 shadow-[0_28px_70px_-48px_rgba(55,41,24,0.45)] backdrop-blur-xl animate-fade-in">
              <form onSubmit={handleSearch} className="flex flex-col gap-3 lg:flex-row">
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search messages, rooms, or prior decisions..."
                  className={cn(inputClass, "flex-1")}
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={searching || !searchQuery.trim()}
                    className={primaryButtonClass}
                  >
                    {searching ? "Searching..." : "Run search"}
                  </button>
                  {(searchQuery || searchResults.length > 0) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchResults([]);
                        setSearchQuery("");
                      }}
                      className={ghostButtonClass}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </form>

              {searchResults.length > 0 ? (
                <div className="mt-4 grid gap-3">
                  {searchResults.map((result) => (
                    <button
                      key={result.messageId}
                      type="button"
                      onClick={() => {
                        setSelectedRoomId(result.roomId);
                        setMobilePane("chat");
                        setShowSearch(false);
                        setSearchResults([]);
                        setSearchQuery("");
                      }}
                      className="rounded-[24px] border border-[#eadfce] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(249,243,235,0.92))] p-4 text-left shadow-[0_18px_40px_-34px_rgba(55,41,24,0.35)] transition hover:border-[#d9b386] hover:shadow-[0_22px_46px_-32px_rgba(55,41,24,0.38)]"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#8b7a6a]">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f7efe4] px-2.5 py-1 font-medium text-[#6d5a4a]">
                          <Icons.Home />
                          {result.roomName}
                        </span>
                        <span>{result.senderName}</span>
                        <span>{formatRelativeDate(result.createdAt)}</span>
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#271c14]">
                        {result.snippet}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-[24px] border border-dashed border-[#e4d5c4] bg-[#fcfaf7] px-4 py-5 text-sm text-[#8f7f70]">
                  Search spans the current workspace and keeps context one click away.
                </div>
              )}
            </div>
          ) : null}
        </div>
      </header>

      <div className="relative z-10 flex flex-1 overflow-hidden">
        <aside
          className={cn(
            "flex w-full flex-shrink-0 flex-col border-r border-[#eadcc8] bg-[#f8f1e7]/72 backdrop-blur-xl lg:w-[22rem]",
            mobilePane === "rooms" ? "flex" : "hidden lg:flex",
          )}
        >
          <div className="p-4 sm:p-5">
            <div className="rounded-[30px] border border-[#eadfce] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(249,242,233,0.9))] p-5 shadow-[0_24px_60px_-42px_rgba(55,41,24,0.48)]">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#17594a,#29806d)] text-sm font-semibold text-white shadow-[0_18px_40px_-22px_rgba(23,89,74,0.72)]">
                  {data.user.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-[#241a13]">
                    {data.user.name}
                  </p>
                  <p className="text-sm text-[#7e6d5c]">
                    {data.metrics.providerMode === "demo" ? "Demo workspace" : "Copilot workspace"}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <div className="rounded-[22px] border border-[#e7dac9] bg-white/82 p-3">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#987e68]">
                    <Icons.Database />
                    Storage
                  </div>
                  <p className="mt-2 text-sm font-medium text-[#241a13]">
                    {data.metrics.usingDatabase ? "Database" : "Local files"}
                  </p>
                </div>
                <div className="rounded-[22px] border border-[#e7dac9] bg-white/82 p-3">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#987e68]">
                    <Icons.Pulse />
                    Routing
                  </div>
                  <p className="mt-2 text-sm font-medium text-[#241a13]">
                    {selectedRoom?.routingMode === "mention" ? "Mention led" : "Open chorus"}
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.24em] text-[#987e68]">
                  <span>Monthly premium</span>
                  <span className="tracking-normal text-[#6e5b4c]">
                    {data.metrics.premiumCeiling > 0
                      ? `${data.metrics.monthlyPremiumRequests}/${data.metrics.premiumCeiling}`
                      : `${data.metrics.monthlyPremiumRequests}`}
                  </span>
                </div>
                <div className="mt-2 h-2.5 rounded-full bg-[#efe4d5]">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#c8734b,#17594a)]"
                    style={{
                      width:
                        data.metrics.premiumCeiling > 0
                          ? `${premiumUsagePercentage}%`
                          : "18%",
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-[#8d7866]">
                  Rooms
                </h2>
                <p className="mt-1 text-sm text-[#786757]">
                  Switch contexts quickly and keep edits close by.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  resetRoomDraft(null);
                  setMobilePane("editor");
                }}
                className={ghostButtonClass}
              >
                <Icons.Plus />
                New
              </button>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-4 pb-4 sm:px-5">
            {nonArchivedRooms.length === 0 ? (
              <div className="rounded-[30px] border border-dashed border-[#e4d5c4] bg-[#fcfaf7] px-5 py-10 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff0dd] text-[#b26436]">
                  <Icons.Home />
                </div>
                <p className="mt-4 text-sm font-semibold text-[#241a13]">No rooms yet</p>
                <p className="mt-2 text-sm leading-6 text-[#877566]">
                  Start with a room, then add the personas you want in the conversation.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {nonArchivedRooms.map((room) => {
                  const isActive = room.id === selectedRoomId;
                  const latestMessage = room.messages[room.messages.length - 1];

                  return (
                    <button
                      key={room.id}
                      type="button"
                      onClick={() => {
                        setSelectedRoomId(room.id);
                        setRoomDraft(createRoomDraft(room));
                        setRoomMode("edit");
                        setMobilePane("chat");
                      }}
                      className={isActive ? roomCardActiveClass : roomCardClass}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-base font-semibold text-[#241a13]">
                              {room.name}
                            </p>
                            {isActive ? (
                              <span className="rounded-full bg-[#17594a] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
                                live
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-[#9a8772]">
                            {room.routingMode === "all" ? "All respond" : "Mention only"} - {room.personas.length} bot{room.personas.length === 1 ? "" : "s"}
                          </p>
                        </div>
                        <span className="text-[11px] font-medium text-[#8b7a6a]">
                          {latestMessage
                            ? formatRelativeDate(latestMessage.createdAt)
                            : "Fresh"}
                        </span>
                      </div>

                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#6d5b4c]">
                        {latestMessage?.content ?? "No conversation yet. Open the room to start the thread."}
                      </p>

                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex -space-x-2">
                          {room.personas.slice(0, 4).map((entry) => (
                            <div
                              key={entry.persona.id}
                              className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#fff8ef] text-[10px] font-semibold text-white shadow-sm"
                              style={{ backgroundColor: entry.persona.color }}
                              title={entry.persona.name}
                            >
                              {entry.persona.name.charAt(0).toUpperCase()}
                            </div>
                          ))}
                          {room.personas.length > 4 ? (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#fff8ef] bg-[#ede1d0] text-[10px] font-semibold text-[#6c5b4c]">
                              +{room.personas.length - 4}
                            </div>
                          ) : null}
                        </div>

                        <span className="text-xs font-medium text-[#8d7a6a]">
                          {room.messages.length} message{room.messages.length === 1 ? "" : "s"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </nav>

          <div className="border-t border-[#eadcc8] px-4 py-4 sm:px-5">
            <div className="rounded-[24px] border border-[#e7dac9] bg-white/75 px-4 py-3 text-sm text-[#6d5b4c]">
              {archivedRoomsCount > 0
                ? `${archivedRoomsCount} archived room${archivedRoomsCount === 1 ? "" : "s"} tucked away.`
                : "Nothing archived right now."}
            </div>
          </div>
        </aside>

        <main
          className={cn(
            "flex min-w-0 flex-1 flex-col",
            mobilePane === "chat" ? "flex" : "hidden lg:flex",
          )}
        >
          {!selectedRoom ? (
            <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
              <div className="max-w-lg rounded-[36px] border border-[#eadfce] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(249,243,236,0.93))] p-8 text-center shadow-[0_32px_80px_-50px_rgba(55,41,24,0.45)]">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] bg-[linear-gradient(135deg,#fff0dd,#f8dfb6)] text-[#b26436] shadow-[0_22px_45px_-26px_rgba(178,100,54,0.45)]">
                  <Icons.Send />
                </div>
                <h2 className="mt-5 text-2xl font-semibold text-[#241a13]">
                  Choose a room to bring the conversation into focus.
                </h2>
                <p className="mt-3 text-sm leading-7 text-[#837161]">
                  Your chat surface is ready. Pick an existing room on the left or open the studio to create a new one.
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <button
                    type="button"
                    onClick={() => setMobilePane("rooms")}
                    className={ghostButtonClass}
                  >
                    Browse rooms
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      resetRoomDraft(null);
                      setMobilePane("editor");
                    }}
                    className={primaryButtonClass}
                  >
                    <Icons.Plus />
                    Create room
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="border-b border-[#eadcc8] bg-[#faf5ee]/82 px-4 py-4 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-5xl">
                  <div className="rounded-[34px] border border-[#e8dbc8] bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(249,243,235,0.94))] p-5 shadow-[0_28px_70px_-46px_rgba(55,41,24,0.42)]">
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setMobilePane("rooms")}
                            className="inline-flex items-center gap-1 rounded-full border border-[#e5d7c6] bg-white/85 px-3 py-1.5 text-xs font-medium text-[#6b5949] transition hover:border-[#d8b183] hover:text-[#241a13] lg:hidden"
                          >
                            <Icons.ChevronLeft />
                            Rooms
                          </button>
                          <span
                            className={cn(
                              "rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em]",
                              selectedRoom.routingMode === "all"
                                ? "border-[#bedfd2] bg-[#eaf6f0] text-[#17594a]"
                                : "border-[#f1d8b7] bg-[#fff4e6] text-[#b26436]",
                            )}
                          >
                            {selectedRoom.routingMode === "all" ? "Open chorus" : "Mention routing"}
                          </span>
                          <span className="rounded-full border border-[#e6dac9] bg-white/82 px-3 py-1.5 text-xs font-medium text-[#6d5a4a]">
                            {selectedRoom.personas.length} bot{selectedRoom.personas.length === 1 ? "" : "s"}
                          </span>
                          <span className="rounded-full border border-[#e6dac9] bg-white/82 px-3 py-1.5 text-xs font-medium text-[#6d5a4a]">
                            {selectedRoom.messages.length} message{selectedRoom.messages.length === 1 ? "" : "s"}
                          </span>
                        </div>

                        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#20160f]">
                          {selectedRoom.name}
                        </h2>
                        <p className="mt-2 max-w-3xl text-sm leading-7 text-[#7f6d5d]">
                          {selectedRoom.routingMode === "all"
                            ? "Every attached persona can contribute, making this room ideal for wide-angle reviews and fast comparison."
                            : "Mentions keep the thread intentional. Call in the exact persona you want when the moment needs it."}
                        </p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 xl:w-[360px]">
                        <div className="rounded-[24px] border border-[#eadfce] bg-white/85 p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#9b8772]">
                            Last activity
                          </p>
                          <p className="mt-3 text-sm font-medium text-[#241a13]">
                            {selectedRoomLastMessage
                              ? `${selectedRoomLastMessage.senderName} - ${formatRelativeDate(selectedRoomLastMessage.createdAt)}`
                              : "No messages yet"}
                          </p>
                          <p className="mt-1 text-sm text-[#837161]">
                            {selectedRoomLastMessage
                              ? "Conversation momentum is visible at a glance."
                              : "Send the first message to kick things off."}
                          </p>
                        </div>
                        <div className="rounded-[24px] border border-[#eadfce] bg-white/85 p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#9b8772]">
                            Auto responders
                          </p>
                          <p className="mt-3 text-sm font-medium text-[#241a13]">
                            {selectedRoomAutoResponders} of {selectedRoom.personas.length} attached bots
                          </p>
                          <p className="mt-1 text-sm text-[#837161]">
                            Balance always-on voices with specialists you invoke by name.
                          </p>
                        </div>
                      </div>
                    </div>

                    {selectedRoom.personas.length > 0 ? (
                      <div className="mt-5 flex flex-wrap gap-2">
                        {selectedRoom.personas.map((entry) => (
                          <span
                            key={entry.persona.id}
                            className="inline-flex items-center gap-2 rounded-full border border-[#eadfce] bg-white/88 px-3 py-1.5 text-xs font-medium text-[#3a2c22] shadow-[0_14px_35px_-28px_rgba(55,41,24,0.34)]"
                          >
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: entry.persona.color }}
                            />
                            {entry.persona.name}
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em]",
                                entry.autoRespond
                                  ? "bg-[#eaf6f0] text-[#17594a]"
                                  : "bg-[#f4ede5] text-[#8a725e]",
                              )}
                            >
                              {entry.autoRespond ? "auto" : "mention"}
                            </span>
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-5 flex flex-col gap-3 border-t border-[#efe5d8] pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-[#7f6d5d]">
                        {selectedRoomLastMessage
                          ? `Latest thread note: ${selectedRoomLastMessage.content.slice(0, 100)}${selectedRoomLastMessage.content.length > 100 ? "..." : ""}`
                          : "This room is ready for its first thread."}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setRoomDraft(createRoomDraft(selectedRoom));
                          setRoomMode("edit");
                          setMobilePane("editor");
                        }}
                        className={ghostButtonClass}
                      >
                        <Icons.Edit />
                        Edit room
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-5xl">
                  <div className="rounded-[36px] border border-[#e8dbc8] bg-[linear-gradient(180deg,rgba(255,255,255,0.62),rgba(252,248,243,0.86))] p-4 shadow-[0_34px_90px_-58px_rgba(55,41,24,0.5)] backdrop-blur-xl sm:p-6">
                    {visibleMessages.length === 0 && streamingMessages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-[linear-gradient(135deg,#fff0dc,#f7ddb2)] text-[#b26436] shadow-[0_22px_45px_-28px_rgba(178,100,54,0.45)]">
                          <Icons.Send />
                        </div>
                        <p className="mt-5 text-lg font-semibold text-[#241a13]">
                          The room is quiet.
                        </p>
                        <p className="mt-2 max-w-md text-sm leading-7 text-[#837161]">
                          Send a prompt below and this space will turn into a live multi-bot conversation.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        {visibleMessages.map((message) => {
                          const isUser = message.senderType === "user";

                          return (
                            <div
                              key={message.id}
                              className={cn(
                                "flex animate-fade-in",
                                isUser ? "justify-end" : "justify-start",
                              )}
                            >
                              <div
                                className={cn(
                                  "flex max-w-[90%] gap-3 sm:max-w-[82%]",
                                  isUser ? "flex-row-reverse" : "flex-row",
                                )}
                              >
                                <div
                                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl text-xs font-semibold text-white shadow-[0_16px_34px_-20px_rgba(55,41,24,0.45)]"
                                  style={{
                                    backgroundColor: isUser ? "#17594a" : message.senderColor,
                                  }}
                                >
                                  {message.senderName.charAt(0).toUpperCase()}
                                </div>

                                <div
                                  className={cn(
                                    "rounded-[28px] border px-4 py-4 shadow-[0_18px_45px_-34px_rgba(55,41,24,0.4)]",
                                    isUser
                                      ? "border-[#17594a] bg-[#17594a] text-white"
                                      : "border-[#eadfce] bg-white text-[#261b14]",
                                  )}
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span
                                      className={cn(
                                        "text-xs font-semibold uppercase tracking-[0.18em]",
                                        isUser ? "text-white/80" : "text-[#6d5a4a]",
                                      )}
                                    >
                                      {message.senderName}
                                    </span>
                                    <span
                                      className={cn(
                                        "text-[11px]",
                                        isUser ? "text-white/65" : "text-[#9a8773]",
                                      )}
                                    >
                                      {formatRelativeDate(message.createdAt)}
                                    </span>
                                  </div>

                                  <p className="mt-3 whitespace-pre-wrap text-sm leading-7">
                                    {message.content}
                                  </p>

                                  {(message.modelUsed ||
                                    message.latencyMs ||
                                    message.premiumCost > 0) && (
                                    <div className="mt-4 flex flex-wrap gap-2">
                                      {message.modelUsed ? (
                                        <span
                                          className={cn(
                                            "rounded-full px-2.5 py-1 text-[11px] font-medium",
                                            isUser
                                              ? "bg-white/14 text-white/85"
                                              : "bg-[#f5eee6] text-[#715e4f]",
                                          )}
                                        >
                                          {message.modelUsed}
                                        </span>
                                      ) : null}
                                      {message.latencyMs ? (
                                        <span
                                          className={cn(
                                            "rounded-full px-2.5 py-1 text-[11px] font-medium",
                                            isUser
                                              ? "bg-white/14 text-white/85"
                                              : "bg-[#f5eee6] text-[#715e4f]",
                                          )}
                                        >
                                          {message.latencyMs}ms
                                        </span>
                                      ) : null}
                                      {message.premiumCost > 0 ? (
                                        <span
                                          className={cn(
                                            "rounded-full px-2.5 py-1 text-[11px] font-medium",
                                            isUser
                                              ? "bg-[#d98d68]/40 text-white"
                                              : "bg-[#fff0df] text-[#b26436]",
                                          )}
                                        >
                                          premium request
                                        </span>
                                      ) : null}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {streamingMessages.map((streamMsg) => (
                          <div key={streamMsg.personaId} className="flex justify-start animate-fade-in">
                            <div className="flex max-w-[90%] gap-3 sm:max-w-[82%]">
                              <div
                                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl text-xs font-semibold text-white shadow-[0_16px_34px_-20px_rgba(55,41,24,0.45)]"
                                style={{ backgroundColor: streamMsg.senderColor }}
                              >
                                {streamMsg.senderName.charAt(0).toUpperCase()}
                              </div>

                              <div className="rounded-[28px] border border-dashed border-[#d9c6b3] bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(248,241,232,0.92))] px-4 py-4 text-[#261b14] shadow-[0_18px_45px_-34px_rgba(55,41,24,0.3)]">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6d5a4a]">
                                    {streamMsg.senderName}
                                  </span>
                                  <span className="inline-flex items-center gap-1 rounded-full bg-[#fff1df] px-2.5 py-1 text-[11px] font-medium text-[#b26436]">
                                    <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-[#b26436]" />
                                    streaming
                                  </span>
                                  <span className="rounded-full bg-[#f5eee6] px-2.5 py-1 text-[11px] font-medium text-[#715e4f]">
                                    {streamMsg.modelId}
                                  </span>
                                </div>

                                {streamMsg.content ? (
                                  <p className="mt-3 whitespace-pre-wrap text-sm leading-7">
                                    {streamMsg.content}
                                    <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-[#b26436] align-middle" />
                                  </p>
                                ) : (
                                  <div className="mt-4 flex items-center gap-1">
                                    <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-[#b26436]" style={{ animationDelay: "0s" }} />
                                    <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-[#b26436]" style={{ animationDelay: "0.2s" }} />
                                    <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-[#b26436]" style={{ animationDelay: "0.4s" }} />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-[#eadcc8] bg-[#fbf6ef]/92 px-4 py-4 sm:px-6 lg:px-8">
                <form onSubmit={handleSendMessage} className="mx-auto max-w-5xl">
                  <div className="rounded-[30px] border border-[#e8dbc8] bg-white/94 p-3 shadow-[0_28px_70px_-44px_rgba(55,41,24,0.45)]">
                    <div className="mb-3 flex flex-col gap-2 px-1 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-[#756353]">
                        {selectedRoom.routingMode === "all"
                          ? "All attached bots can answer."
                          : "Use @name to call in a persona."}
                      </p>
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#9a8772]">
                        Enter to send - Shift+Enter for a new line
                      </p>
                    </div>

                    <div className="flex items-end gap-3">
                      <textarea
                        value={composer}
                        onChange={(event) => setComposer(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            if (composer.trim() && !sending) {
                              handleSendMessage(event as unknown as React.FormEvent<HTMLFormElement>);
                            }
                          }
                        }}
                        rows={3}
                        placeholder="Type a message for the room. Mention a persona when you want precision."
                        className={cn(
                          inputClass,
                          "min-h-[108px] flex-1 resize-none border-transparent bg-[#fffdf9] shadow-none focus:border-[#17594a]/50",
                        )}
                      />
                      <button
                        type="submit"
                        disabled={!composer.trim() || sending}
                        className={cn(primaryButtonClass, "h-[108px] min-w-[108px] flex-col")}
                      >
                        {sending ? (
                          <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        ) : (
                          <Icons.Send />
                        )}
                        <span>{sending ? "Sending..." : "Send"}</span>
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </>
          )}
        </main>

        <aside
          className={cn(
            "flex w-full flex-shrink-0 flex-col overflow-y-auto border-l border-[#eadcc8] bg-[#f9f3ea]/80 backdrop-blur-xl lg:w-[24rem] xl:w-[28rem]",
            mobilePane === "editor" ? "flex" : "hidden lg:flex",
          )}
        >
          <div className="space-y-5 p-4 sm:p-5">
            <section className={panelCardClass}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#9a8772]">
                    Persona library
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-[#241a13]">
                    Shape the voices in your workspace.
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[#7f6d5d]">
                    {data.personas.length} configured, with color identity, prompt versioning, and model selection.
                  </p>
                </div>
                <button type="button" onClick={resetPersonaDraft} className={ghostButtonClass}>
                  <Icons.Plus />
                  New
                </button>
              </div>

              <div className="mt-5 space-y-3">
                {data.personas.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-[#e4d5c4] bg-[#fcfaf7] px-4 py-5 text-sm text-[#8f7f70]">
                    Add a persona to start building reusable specialists for your rooms.
                  </div>
                ) : (
                  data.personas.map((persona) => (
                    <div
                      key={persona.id}
                      className="rounded-[24px] border border-[#eadfce] bg-white/86 p-4 shadow-[0_18px_45px_-34px_rgba(55,41,24,0.3)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-3 w-3 flex-shrink-0 rounded-full"
                              style={{ backgroundColor: persona.color }}
                            />
                            <p className="truncate text-sm font-semibold text-[#241a13]">
                              {persona.name}
                            </p>
                            <span className="rounded-full bg-[#f7efe4] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8b725d]">
                              v{persona.version}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="text-xs text-[#837161]">{persona.modelId}</span>
                            {persona.autoRespondDefault ? (
                              <span className="rounded-full bg-[#eaf6f0] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#17594a]">
                                auto by default
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setPersonaMode("edit");
                              setPersonaDraft(createPersonaDraft(persona, data.models[0]?.id));
                            }}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-[#e5d7c6] bg-white text-[#6d5a4a] transition hover:border-[#d2b188] hover:text-[#241a12]"
                            title="Edit persona"
                          >
                            <Icons.Edit />
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePersonaDelete(persona.id)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-[#e8c3be] bg-[#fff7f6] text-[#a24f49] transition hover:border-[#dba29b] hover:bg-[#fff0ee]"
                            title="Delete persona"
                          >
                            <Icons.Trash />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <form className="mt-5 space-y-4" onSubmit={handlePersonaSubmit}>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[#8f7b68]">
                    {personaMode === "edit" ? "Edit persona" : "New persona"}
                  </label>
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <input
                      value={personaDraft.name}
                      onChange={(event) =>
                        setPersonaDraft((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="Name"
                      className={inputClass}
                    />
                    <div className="flex items-center gap-3 rounded-2xl border border-[#e5d7c6] bg-[#fffdfa] px-4 py-3">
                      <span className="text-xs font-medium uppercase tracking-[0.16em] text-[#8f7b68]">
                        Color
                      </span>
                      <input
                        type="color"
                        value={personaDraft.color}
                        onChange={(event) =>
                          setPersonaDraft((current) => ({
                            ...current,
                            color: event.target.value,
                          }))
                        }
                        className="h-8 w-10 cursor-pointer rounded-xl border-0 bg-transparent p-0"
                      />
                    </div>
                  </div>
                </div>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[#8f7b68]">
                    Model
                  </span>
                  <select
                    value={personaDraft.modelId}
                    onChange={(event) =>
                      setPersonaDraft((current) => ({
                        ...current,
                        modelId: event.target.value,
                      }))
                    }
                    className={inputClass}
                  >
                    {data.models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name} ({model.tier})
                      </option>
                    ))}
                  </select>
                  {selectedModel ? (
                    <div className="mt-3 rounded-[22px] border border-[#e8dbc8] bg-[#fffaf3] px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em]",
                            modelTierClass(selectedModel.tier),
                          )}
                        >
                          {selectedModel.tier}
                        </span>
                        {selectedModel.recommendedForMultiBot ? (
                          <span className="rounded-full bg-[#eaf6f0] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#17594a]">
                            recommended
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#7f6d5d]">
                        {selectedModel.description}
                      </p>
                    </div>
                  ) : null}
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[#8f7b68]">
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
                    placeholder="You are a helpful assistant..."
                    className={cn(inputClass, "min-h-[120px] resize-y")}
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[#8f7b68]">
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
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[#8f7b68]">
                      Top-p
                    </span>
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
                      className={inputClass}
                    />
                  </label>
                </div>

                <label className="flex items-center gap-3 rounded-[24px] border border-[#e8dbc8] bg-[#fffaf3] px-4 py-4">
                  <input
                    type="checkbox"
                    checked={personaDraft.autoRespondDefault}
                    onChange={(event) =>
                      setPersonaDraft((current) => ({
                        ...current,
                        autoRespondDefault: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-[#cbbba9] accent-[#17594a]"
                  />
                  <span className="text-sm leading-6 text-[#4a392e]">
                    Default to auto-respond when this persona is added to a room.
                  </span>
                </label>

                <button type="submit" disabled={savingPersona} className={cn(primaryButtonClass, "w-full")}>
                  {savingPersona
                    ? "Saving..."
                    : personaMode === "create"
                      ? "Create persona"
                      : "Save changes"}
                </button>

                {personaMode === "edit" ? (
                  <button
                    type="button"
                    onClick={resetPersonaDraft}
                    className={cn(ghostButtonClass, "w-full")}
                  >
                    Switch to create new
                  </button>
                ) : null}
              </form>
            </section>

            <section className={panelCardClass}>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#9a8772]">
                  Room studio
                </p>
                <h3 className="mt-2 text-xl font-semibold text-[#241a13]">
                  Assemble the room and tune how it behaves.
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#7f6d5d]">
                  Attach up to five personas, choose the routing mode, and decide who answers automatically.
                </p>
              </div>

              <form className="mt-5 space-y-4" onSubmit={handleRoomSubmit}>
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[#8f7b68]">
                    Room name
                  </span>
                  <input
                    value={roomDraft.name}
                    onChange={(event) =>
                      setRoomDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Product Studio"
                    className={inputClass}
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[#8f7b68]">
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
                    className={inputClass}
                  >
                    <option value="all">All respond - every bot answers</option>
                    <option value="mention">Mention only - use @name to invoke</option>
                  </select>
                </label>

                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8f7b68]">
                      Personas in room
                    </p>
                    <span className="rounded-full bg-[#fff3e1] px-2.5 py-1 text-[11px] font-semibold text-[#b26436]">
                      {roomDraft.personaIds.length}/5 selected
                    </span>
                  </div>

                  <div className="space-y-3">
                    {data.personas.length === 0 ? (
                      <div className="rounded-[24px] border border-dashed border-[#e4d5c4] bg-[#fcfaf7] px-4 py-5 text-sm text-[#8f7f70]">
                        Create at least one persona before building a room.
                      </div>
                    ) : (
                      data.personas.map((persona) => {
                        const checked = roomDraft.personaIds.includes(persona.id);
                        const model = data.models.find((entry) => entry.id === persona.modelId);

                        return (
                          <div
                            key={persona.id}
                            className={cn(
                              "rounded-[24px] border px-4 py-3 transition",
                              checked
                                ? "border-[#d3b184] bg-[#fff8ef] shadow-[0_18px_40px_-34px_rgba(178,100,54,0.25)]"
                                : "border-[#eadfce] bg-white/84",
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
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
                                  className="mt-1 h-4 w-4 flex-shrink-0 rounded border-[#cbbba9] accent-[#17594a]"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span
                                      className="h-3 w-3 flex-shrink-0 rounded-full"
                                      style={{ backgroundColor: persona.color }}
                                    />
                                    <span className="text-sm font-semibold text-[#241a13]">
                                      {persona.name}
                                    </span>
                                    {model ? (
                                      <span
                                        className={cn(
                                          "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em]",
                                          modelTierClass(model.tier),
                                        )}
                                      >
                                        {model.tier}
                                      </span>
                                    ) : null}
                                  </div>
                                  <p className="mt-1 text-sm text-[#7f6d5d]">
                                    {persona.modelId}
                                  </p>
                                </div>
                              </label>

                              {checked ? (
                                <div className="flex items-center gap-2 rounded-full bg-white/85 px-3 py-1.5">
                                  <input
                                    id={`auto-${persona.id}`}
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
                                    className="h-3.5 w-3.5 rounded border-[#cbbba9] accent-[#17594a]"
                                  />
                                  <label
                                    htmlFor={`auto-${persona.id}`}
                                    className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#786757]"
                                  >
                                    auto
                                  </label>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <button type="submit" disabled={savingRoom} className={cn(primaryButtonClass, "w-full")}>
                  {savingRoom
                    ? "Saving..."
                    : roomMode === "create"
                      ? "Create room"
                      : "Save room"}
                </button>

                {selectedRoom ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => mutateRoomAction("archive")}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#efd7b1] bg-[#fff7ea] px-4 py-3 text-sm font-semibold text-[#b26436] transition hover:border-[#e0be90] hover:bg-[#fff1db]"
                    >
                      <Icons.Archive />
                      Archive
                    </button>
                    <button
                      type="button"
                      onClick={() => mutateRoomAction("delete")}
                      className={destructiveButtonClass}
                    >
                      <Icons.Trash />
                      Delete
                    </button>
                  </div>
                ) : null}
              </form>
            </section>
          </div>
        </aside>
      </div>

      {(flash || error) ? (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 px-4">
          <div
            className={cn(
              "pointer-events-auto flex items-center gap-3 rounded-[24px] border px-5 py-4 shadow-[0_30px_80px_-44px_rgba(55,41,24,0.52)] backdrop-blur-xl animate-fade-in",
              flash
                ? "border-[#bedfd2] bg-[#f2fbf7] text-[#17594a]"
                : "border-[#efc5c2] bg-[#fff5f4] text-[#a24f49]",
            )}
          >
            {flash ? <Icons.Check /> : <Icons.Close />}
            <p className="text-sm font-medium">{flash ?? error}</p>
            <button
              type="button"
              onClick={() => {
                setFlash(null);
                setError(null);
              }}
              className="rounded-xl p-1 transition hover:bg-black/5"
            >
              <Icons.Close />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
