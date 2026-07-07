// Customer Review & Feedback Insight Miner.
// Turns a batch of free-form feedback/review text into recurring themes,
// categorized complaints, and 2-3 actionable issues + suggested fixes.
//
// The LLM does the real reasoning (clustering unstructured complaints). The
// deterministic functions here are (a) a keyword fallback when the LLM is
// unavailable, and (b) validators so a malformed model reply can never reach
// the dashboard.

export const FEEDBACK_CATEGORIES = [
  "delivery_time",
  "taste",
  "order_accuracy",
  "staff_behavior",
  "value",
  "other",
] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export type Sentiment = "positive" | "neutral" | "negative";
export type Severity = "high" | "medium" | "low";

export interface FeedbackRow {
  id: string;
  order_id: string | null;
  rating: number | null;
  comment: string | null;
  source: "post_order" | "google";
  created_at: string;
}

export interface ThemeItem {
  label: string;
  count: number;
  sentiment: Sentiment;
}
export interface IssueItem {
  category: FeedbackCategory;
  issue: string;
  severity: Severity;
  evidence_count: number;
}
export interface SuggestionItem {
  action: string;
  rationale: string;
}

export interface FeedbackInsight {
  summary: string;
  themes: ThemeItem[];
  top_issues: IssueItem[];
  suggestions: SuggestionItem[];
}

export interface FeedbackInsightRow extends FeedbackInsight {
  id: string;
  window_start: string | null;
  window_end: string | null;
  feedback_count: number;
  avg_rating: number | null;
  source: "openrouter" | "fallback";
  model: string | null;
  generated_at: string;
}

export const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  delivery_time: "Speed / temperature",
  taste: "Taste & quality",
  order_accuracy: "Order accuracy",
  staff_behavior: "Staff & service",
  value: "Value for money",
  other: "Other",
};

export const FEEDBACK_INSIGHT_SYSTEM_PROMPT = `You are an operations analyst for a pizzeria.
You read raw customer feedback and reviews and find the patterns the owner should act on.

Rules:
- Cluster the feedback into recurring THEMES (short labels), each with an approximate count and sentiment.
- Surface the 2-3 most ACTIONABLE recurring issues — real, fixable operational problems, not a star average.
- Categorize each issue as one of: delivery_time, taste, order_accuracy, staff_behavior, value, other.
- For each issue give a concrete SUGGESTION the owner can act on, with a one-line rationale grounded in the feedback volume.
- Praise is useful context but the issues/suggestions must focus on what is going wrong.
- Be specific and honest. Do not invent complaints that are not supported by the text.

Respond with JSON only, no prose, in exactly this shape:
{
  "summary": "2-3 sentence plain-language overview",
  "themes": [{ "label": "string", "count": number, "sentiment": "positive|neutral|negative" }],
  "top_issues": [{ "category": "delivery_time|taste|order_accuracy|staff_behavior|value|other", "issue": "string", "severity": "high|medium|low", "evidence_count": number }],
  "suggestions": [{ "action": "string", "rationale": "string" }]
}`;

export function buildInsightUserPrompt(rows: FeedbackRow[]): string {
  const lines = rows
    .filter((r) => r.comment && r.comment.trim().length > 0)
    .map((r) => {
      const stars = r.rating ? `${r.rating}★` : "no rating";
      return `- (${stars}, ${r.source}) ${r.comment!.trim()}`;
    });
  return `Here are ${lines.length} recent pieces of customer feedback:

${lines.join("\n")}

Analyze them and return the JSON described.`;
}

// ---- parsing + validation -------------------------------------------------

export function parseInsightJson(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function asString(v: unknown, max = 300): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length === 0 || t.length > max ? (t.length > max ? t.slice(0, max) : null) : t;
}
function asCount(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}
function asSentiment(v: unknown): Sentiment {
  return v === "positive" || v === "negative" ? v : "neutral";
}
function asSeverity(v: unknown): Severity {
  return v === "high" || v === "low" ? v : "medium";
}
function asCategory(v: unknown): FeedbackCategory {
  return (FEEDBACK_CATEGORIES as readonly string[]).includes(v as string)
    ? (v as FeedbackCategory)
    : "other";
}

/** Coerce a raw LLM reply into a safe FeedbackInsight, or null if unusable. */
export function validateInsight(raw: unknown): FeedbackInsight | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const summary = asString(obj.summary, 600);
  const themesRaw = Array.isArray(obj.themes) ? obj.themes : [];
  const issuesRaw = Array.isArray(obj.top_issues) ? obj.top_issues : [];
  const suggestionsRaw = Array.isArray(obj.suggestions) ? obj.suggestions : [];

  const themes: ThemeItem[] = themesRaw
    .map((t) => {
      const o = (t ?? {}) as Record<string, unknown>;
      const label = asString(o.label, 60);
      return label ? { label, count: asCount(o.count), sentiment: asSentiment(o.sentiment) } : null;
    })
    .filter((t): t is ThemeItem => t !== null)
    .slice(0, 8);

  const top_issues: IssueItem[] = issuesRaw
    .map((t) => {
      const o = (t ?? {}) as Record<string, unknown>;
      const issue = asString(o.issue, 200);
      return issue
        ? {
            category: asCategory(o.category),
            issue,
            severity: asSeverity(o.severity),
            evidence_count: asCount(o.evidence_count),
          }
        : null;
    })
    .filter((t): t is IssueItem => t !== null)
    .slice(0, 3);

  const suggestions: SuggestionItem[] = suggestionsRaw
    .map((t) => {
      const o = (t ?? {}) as Record<string, unknown>;
      const action = asString(o.action, 200);
      const rationale = asString(o.rationale, 240);
      return action && rationale ? { action, rationale } : null;
    })
    .filter((t): t is SuggestionItem => t !== null)
    .slice(0, 4);

  if (!summary || top_issues.length === 0) return null;
  return { summary, themes, top_issues, suggestions };
}

// ---- deterministic keyword fallback --------------------------------------

const CATEGORY_KEYWORDS: Record<Exclude<FeedbackCategory, "other">, string[]> = {
  delivery_time: ["cold", "lukewarm", "slow", "wait", "waited", "late", "forever", "took long", "reheat"],
  taste: ["oily", "greasy", "soggy", "salty", "bland", "rubbery", "burnt", "undercooked", "tasteless", "stale"],
  order_accuracy: ["wrong", "missing", "instead", "forgot", "not what", "incorrect", "mixed up", "didn't get"],
  staff_behavior: ["rude", "staff", "waiter", "service", "unresponsive", "ignored", "attitude", "no response"],
  value: ["pricey", "expensive", "overpriced", "costly", "too much for", "not worth"],
};

const ISSUE_TEXT: Record<Exclude<FeedbackCategory, "other">, string> = {
  delivery_time: "Pizzas reaching tables cold or service running slow",
  taste: "Food described as too oily, greasy, or soggy",
  order_accuracy: "Wrong pizza or missing toppings/beverages served",
  staff_behavior: "Slow or unresponsive staff / service",
  value: "Portions seen as pricey for the value",
};

const SUGGESTION_TEXT: Record<Exclude<FeedbackCategory, "other">, string> = {
  delivery_time: "Add a heat-lamp holding step and cut kitchen-to-table time at peak hours",
  taste: "Review oil and cheese quantity on the top pizzas and blot before serving",
  order_accuracy: "Add an order-readback / ticket-match check before pizzas leave the pass",
  staff_behavior: "Tighten waiter-call response and table assignment during busy windows",
  value: "Revisit topping pricing or bundle a value combo to shift the perception",
};

function categorize(comment: string): Exclude<FeedbackCategory, "other"> | null {
  const text = comment.toLowerCase();
  for (const cat of Object.keys(CATEGORY_KEYWORDS) as Array<Exclude<FeedbackCategory, "other">>) {
    if (CATEGORY_KEYWORDS[cat].some((kw) => text.includes(kw))) return cat;
  }
  return null;
}

/** Keyword-based fallback used when the LLM is unavailable or returns junk. */
export function deterministicInsight(rows: FeedbackRow[]): FeedbackInsight {
  const counts = new Map<Exclude<FeedbackCategory, "other">, number>();
  let positive = 0;
  let negative = 0;

  for (const row of rows) {
    const rating = row.rating ?? 0;
    if (rating >= 4) positive += 1;
    if (rating > 0 && rating <= 2) negative += 1;
    if (!row.comment) continue;
    const cat = categorize(row.comment);
    if (cat) counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  const themes: ThemeItem[] = [
    ...ranked.slice(0, 4).map(([cat, count]) => ({
      label: CATEGORY_LABELS[cat],
      count,
      sentiment: "negative" as Sentiment,
    })),
  ];
  if (positive > 0) themes.push({ label: "Positive / praise", count: positive, sentiment: "positive" });

  const top_issues: IssueItem[] = ranked.slice(0, 3).map(([cat, count], i) => ({
    category: cat,
    issue: ISSUE_TEXT[cat],
    severity: i === 0 ? "high" : count >= 5 ? "medium" : "low",
    evidence_count: count,
  }));

  const suggestions: SuggestionItem[] = ranked.slice(0, 3).map(([cat, count]) => ({
    action: SUGGESTION_TEXT[cat],
    rationale: `${count} recent comments point to this — acting here removes a repeat complaint.`,
  }));

  const total = rows.length;
  const summary =
    top_issues.length > 0
      ? `Across ${total} recent reviews, the most common fixable complaint is "${top_issues[0].issue.toLowerCase()}" (${top_issues[0].evidence_count} mentions). ${positive} reviews were clearly positive and ${negative} clearly negative.`
      : `Across ${total} recent reviews, no single complaint stands out yet — ${positive} were positive and ${negative} negative.`;

  return { summary, themes, top_issues, suggestions };
}

export function averageRating(rows: FeedbackRow[]): number | null {
  const rated = rows.filter((r) => typeof r.rating === "number");
  if (rated.length === 0) return null;
  return Math.round((rated.reduce((s, r) => s + (r.rating ?? 0), 0) / rated.length) * 100) / 100;
}
