"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRequireAuth } from "@/components/staff/useRequireAuth";
import StaffHeader from "@/components/staff/StaffHeader";
import {
  CATEGORY_LABELS,
  type FeedbackInsightRow,
  type FeedbackRow,
  type Severity,
} from "@/lib/feedback";

const SEVERITY_STYLE: Record<Severity, string> = {
  high: "border-red-500/40 bg-red-500/10 text-red-300",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  low: "border-white/15 bg-white/5 text-zinc-300",
};

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-xs uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

export default function InsightsPage() {
  const auth = useRequireAuth();
  const [insight, setInsight] = useState<FeedbackInsightRow | null>(null);
  const [recent, setRecent] = useState<FeedbackRow[]>([]);
  const [totalFeedback, setTotalFeedback] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState<string | null>(null);

  const refresh = useCallback(() => {
    Promise.all([
      supabase.from("feedback_insights").select("*").order("generated_at", { ascending: false }).limit(1),
      supabase.from("order_feedback").select("id,order_id,rating,comment,source,created_at").order("created_at", { ascending: false }).limit(10),
      supabase.from("order_feedback").select("id", { count: "exact", head: true }),
    ]).then(([insightRes, recentRes, countRes]) => {
      setInsight((insightRes.data?.[0] as FeedbackInsightRow) ?? null);
      setRecent((recentRes.data as FeedbackRow[]) ?? []);
      setTotalFeedback(countRes.count ?? 0);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (auth !== "authed") return;
    refresh();
    const channel = supabase
      .channel("insights")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "feedback_insights" }, refresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "order_feedback" }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [auth, refresh]);

  async function generateNow() {
    if (generating) return;
    setGenerating(true);
    setGenMsg(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch("/api/ai/feedback-insights/refresh", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!res.ok) {
        setGenMsg(json.error ?? "Could not generate insights.");
      } else if (json.ok === false) {
        setGenMsg(json.message ?? "Not enough feedback yet.");
      } else {
        setGenMsg(`Fresh insight mined from ${json.commentCount} comments (${json.source === "openrouter" ? "AI" : "fallback"}).`);
        refresh();
      }
    } catch {
      setGenMsg("Could not reach the insight miner.");
    } finally {
      setGenerating(false);
    }
  }

  if (auth !== "authed") {
    return <p className="p-10 text-center text-zinc-400">Checking access…</p>;
  }

  return (
    <main className="min-h-dvh">
      <StaffHeader title="Admin — Feedback Insights" />
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-xs text-zinc-500">
              {insight
                ? `Last mined ${new Date(insight.generated_at).toLocaleString()} · ${insight.source === "openrouter" ? `AI (${insight.model})` : "keyword fallback"}`
                : "No insight generated yet."}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {genMsg && <span className="text-xs text-zinc-400">{genMsg}</span>}
            <button
              onClick={generateNow}
              disabled={generating}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:border-[var(--accent)] hover:text-white disabled:opacity-60"
            >
              {generating ? "Mining…" : "Generate insights now"}
            </button>
          </div>
        </div>

        <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-zinc-500">
          An LLM reads recent post-order feedback and Google reviews weekly, clusters the free-form complaints
          into themes, and surfaces the few issues actually driving dissatisfaction — beyond a star average.
        </p>

        {loaded && !insight && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-zinc-400">
            No insights yet. Collect a few pieces of feedback, then tap <span className="text-zinc-200">Generate insights now</span>.
          </div>
        )}

        {insight && (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Feedback in window" value={String(insight.feedback_count)} sub={`${totalFeedback} collected all-time`} />
              <StatCard label="Avg rating" value={insight.avg_rating != null ? `${insight.avg_rating.toFixed(2)} ★` : "—"} />
              <StatCard label="Actionable issues" value={String(insight.top_issues.length)} sub="ranked by evidence" />
              <StatCard label="Themes found" value={String(insight.themes.length)} />
            </div>

            <Panel title="What the feedback is telling you" hint="Plain-language summary">
              <p className="text-sm leading-relaxed text-zinc-200">{insight.summary}</p>
            </Panel>

            <Panel title="Top actionable issues" hint="The recurring, fixable problems — not a rating average">
              <div className="space-y-3">
                {insight.top_issues.map((issue, i) => (
                  <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SEVERITY_STYLE[issue.severity]}`}>
                        {issue.severity}
                      </span>
                      <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                        {CATEGORY_LABELS[issue.category]}
                      </span>
                      <span className="text-[10px] text-zinc-500">{issue.evidence_count} mentions</span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-zinc-100">{issue.issue}</p>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Suggested improvements" hint="LLM-proposed fixes, grounded in complaint volume">
              <ol className="space-y-3">
                {insight.suggestions.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-black">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-zinc-100">{s.action}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">{s.rationale}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Panel>

            <Panel title="Recurring themes" hint="How feedback clusters, by mention count">
              <div className="space-y-2">
                {[...insight.themes].sort((a, b) => b.count - a.count).map((t, i) => {
                  const max = Math.max(1, ...insight.themes.map((x) => x.count));
                  const pct = Math.max(6, (t.count / max) * 100);
                  const color = t.sentiment === "positive" ? "from-emerald-500/50 to-emerald-400" : t.sentiment === "negative" ? "from-red-500/50 to-red-400" : "from-zinc-500/50 to-zinc-400";
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-40 shrink-0 truncate text-xs text-zinc-300">{t.label}</span>
                      <div className="h-5 flex-1 overflow-hidden rounded-md bg-white/5">
                        <div className={`flex h-full items-center justify-end rounded-md bg-gradient-to-r ${color} pr-2 text-[10px] font-semibold text-black`} style={{ width: `${pct}%` }}>
                          {t.count}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>

            {recent.length > 0 && (
              <Panel title="Latest feedback" hint="Most recent verbatim reviews">
                <div className="space-y-2">
                  {recent.map((r) => (
                    <div key={r.id} className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                      <span className="shrink-0 text-xs font-semibold text-[var(--accent)]">{r.rating ? `${r.rating}★` : "—"}</span>
                      <p className="flex-1 text-sm text-zinc-300">{r.comment ?? <span className="text-zinc-600">no comment</span>}</p>
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-zinc-600">{r.source === "google" ? "Google" : "in-app"}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </>
        )}
      </div>
    </main>
  );
}
