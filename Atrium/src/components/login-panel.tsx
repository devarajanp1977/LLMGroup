"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

type LoginPanelProps = {
  defaultUsername: string;
};

async function readJson(response: Response) {
  try {
    return (await response.json()) as { error?: string };
  } catch {
    return {};
  }
}

export function LoginPanel({ defaultUsername }: LoginPanelProps) {
  const [username, setUsername] = useState(defaultUsername);
  const [password, setPassword] = useState("atrium");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
        }),
      });

      if (!response.ok) {
        const payload = await readJson(response);
        throw new Error(payload.error ?? "Login failed");
      }

      window.location.reload();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#1e293b_0%,#0f172a_40%,#020617_100%)] px-6 py-10 text-slate-50">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
          <div className="mb-8 inline-flex items-center gap-3 rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-2 text-sm text-violet-100">
            <span className="h-2.5 w-2.5 rounded-full bg-violet-300" />
            Atrium
          </div>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
            Multi-bot rooms for one operator, one browser, and one Copilot-backed stack.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            Atrium is a self-hosted workspace for orchestrating specialist personas in shared rooms. Create reusable bots, mix 0x defaults with premium specialists, route by{" "}
            <span className="font-semibold text-white">@mention</span>, and keep the full conversation history searchable on your own disk.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {[
              {
                title: "Persona library",
                body: "Versioned prompts, model selection with tier hints, color identity, and default auto-respond behavior.",
              },
              {
                title: "Room routing",
                body: "Use room-wide all-respond mode for cheap first-pass perspectives, or mention-only to escalate intentionally.",
              },
              {
                title: "Streaming chat",
                body: "Bots answer in a live conversation flow, with model metadata, latency, and premium-request visibility.",
              },
              {
                title: "Searchable memory",
                body: "Query across rooms, narrow by bot or date, and surface the right prior thread without leaving the app.",
              },
            ].map((item) => (
              <article
                key={item.title}
                className="rounded-2xl border border-white/10 bg-slate-950/20 p-5"
              >
                <h2 className="text-base font-semibold text-white">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-8 shadow-2xl">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold">Sign in</h2>
            <p className="mt-2 text-sm text-slate-400">
              Single-user access backed by signed cookies. Defaults are{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">
                atrium / atrium
              </code>{" "}
              until you set environment variables.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">
                Username
              </span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none ring-0 transition placeholder:text-slate-500 focus:border-violet-400"
                placeholder="atrium"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">
                Password
              </span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none ring-0 transition placeholder:text-slate-500 focus:border-violet-400"
                placeholder="••••••••"
              />
            </label>

            {error ? (
              <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className={cn(
                "inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-medium transition",
                submitting
                  ? "cursor-wait bg-slate-700 text-slate-300"
                  : "bg-violet-500 text-white hover:bg-violet-400",
              )}
            >
              {submitting ? "Signing in..." : "Open Atrium"}
            </button>
          </form>

          <div className="mt-8 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
            Copilot integration activates automatically when{" "}
            <code className="rounded bg-black/20 px-1.5 py-0.5">GITHUB_PAT</code> is
            configured. Without it, Atrium stays fully interactive in demo mode so
            the product flow is testable locally.
          </div>
        </section>
      </div>
    </div>
  );
}
