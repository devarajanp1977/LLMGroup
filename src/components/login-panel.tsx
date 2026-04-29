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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#ede9fe_0%,#f8fafc_38%,#eef2ff_100%)] px-6 py-10 text-slate-900">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-3xl border border-slate-200 bg-white/90 p-8 shadow-xl backdrop-blur">
          <div className="mb-8 inline-flex items-center gap-3 rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm text-violet-700">
            <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
            Atrium
          </div>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
            Multi-bot rooms for one operator, one browser, and one Copilot-backed stack.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            Atrium is a self-hosted workspace for orchestrating specialist personas in shared rooms. Create reusable bots, mix 0x defaults with premium specialists, route by{" "}
            <span className="font-semibold text-slate-900">@mention</span>, and keep the full conversation history searchable on your own disk.
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
                className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
              >
                <h2 className="text-base font-semibold text-slate-900">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold">Sign in</h2>
            <p className="mt-2 text-sm text-slate-500">
              Single-user access backed by signed cookies. Defaults are{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
                atrium / atrium
              </code>{" "}
              until you set environment variables.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                Username
              </span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-0 transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                placeholder="atrium"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                Password
              </span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-0 transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                placeholder="••••••••"
              />
            </label>

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className={cn(
                "inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-medium transition",
                submitting
                  ? "cursor-wait bg-slate-200 text-slate-500"
                  : "bg-violet-500 text-white hover:bg-violet-400",
              )}
            >
              {submitting ? "Signing in..." : "Open Atrium"}
            </button>
          </form>

          <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Copilot integration activates automatically when{" "}
            <code className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-950">GITHUB_PAT</code> is
            configured. Without it, Atrium stays fully interactive in demo mode so
            the product flow is testable locally.
          </div>
        </section>
      </div>
    </div>
  );
}
