import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  FEEDBACK_INSIGHT_SYSTEM_PROMPT,
  buildInsightUserPrompt,
  parseInsightJson,
  validateInsight,
  deterministicInsight,
  averageRating,
  type FeedbackRow,
} from "@/lib/feedback";

const OPENROUTER_MODEL = "openai/gpt-4o-mini";
const WINDOW_DAYS = 56;
const MAX_ROWS = 400;

// Weekly cron mines the recent feedback batch into an insight snapshot.
// Auth: Vercel cron sends `Authorization: Bearer $CRON_SECRET`. The admin
// dashboard's "Generate now" button sends the staff Supabase JWT instead —
// both are accepted. If CRON_SECRET is unset (local dev) the route is open.
async function authorize(request: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!secret) return true;
  if (token && token === secret) return true;
  if (token) {
    const db = createAdminClient();
    const { data, error } = await db.auth.getUser(token);
    if (!error && data.user) return true;
  }
  return false;
}

async function callOpenRouter(rows: FeedbackRow[]): Promise<unknown | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
        "X-Title": "SliceMatic Feedback Insight Miner",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: "system", content: FEEDBACK_INSIGHT_SYSTEM_PROMPT },
          { role: "user", content: buildInsightUserPrompt(rows) },
        ],
        temperature: 0.2,
        max_tokens: 900,
      }),
    });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;
    return parseInsightJson(content);
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

async function runMiner(): Promise<NextResponse> {
  const db = createAdminClient();
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

  const { data, error } = await db
    .from("order_feedback")
    .select("id,order_id,rating,comment,source,created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  if (error) {
    return NextResponse.json({ error: "Could not read feedback." }, { status: 503 });
  }

  const rows = (data ?? []) as FeedbackRow[];
  const withComments = rows.filter((r) => r.comment && r.comment.trim().length > 0);

  if (withComments.length < 3) {
    return NextResponse.json(
      { ok: false, message: "Not enough feedback with comments to mine yet." },
      { status: 200 }
    );
  }

  const aiRaw = await callOpenRouter(withComments);
  const aiInsight = validateInsight(aiRaw);
  const insight = aiInsight ?? deterministicInsight(rows);
  const source = aiInsight ? "openrouter" : "fallback";

  const timestamps = rows.map((r) => r.created_at).sort();
  const insertResult = await db
    .from("feedback_insights")
    .insert({
      window_start: timestamps[0] ?? since,
      window_end: timestamps[timestamps.length - 1] ?? new Date().toISOString(),
      feedback_count: rows.length,
      avg_rating: averageRating(rows),
      summary: insight.summary,
      themes: insight.themes,
      top_issues: insight.top_issues,
      suggestions: insight.suggestions,
      source,
      model: source === "openrouter" ? OPENROUTER_MODEL : null,
    })
    .select("id")
    .single();

  if (insertResult.error) {
    return NextResponse.json({ error: "Could not store insight." }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    source,
    feedbackCount: rows.length,
    commentCount: withComments.length,
    insightId: insertResult.data.id,
  });
}

export async function GET(request: NextRequest) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    return await runMiner();
  } catch {
    return NextResponse.json({ error: "Insight mining failed." }, { status: 500 });
  }
}

// The dashboard button POSTs; behaviour is identical to the cron GET.
export async function POST(request: NextRequest) {
  return GET(request);
}
