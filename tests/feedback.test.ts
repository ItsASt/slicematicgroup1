import { describe, it, expect } from "vitest";
import {
  validateInsight,
  deterministicInsight,
  averageRating,
  parseInsightJson,
  type FeedbackRow,
} from "@/lib/feedback";

function row(partial: Partial<FeedbackRow>): FeedbackRow {
  return {
    id: crypto.randomUUID(),
    order_id: null,
    rating: null,
    comment: null,
    source: "post_order",
    created_at: new Date().toISOString(),
    ...partial,
  };
}

describe("validateInsight", () => {
  it("coerces a well-formed reply and clamps counts", () => {
    const out = validateInsight({
      summary: "Cold pizza is the top issue.",
      themes: [{ label: "Cold on arrival", count: "14", sentiment: "negative" }],
      top_issues: [{ category: "delivery_time", issue: "Cold pizzas", severity: "high", evidence_count: 14 }],
      suggestions: [{ action: "Add heat lamps", rationale: "14 mentions" }],
    });
    expect(out).not.toBeNull();
    expect(out!.themes[0].count).toBe(14);
    expect(out!.top_issues[0].category).toBe("delivery_time");
  });

  it("rejects a reply with no usable issues", () => {
    expect(validateInsight({ summary: "ok", themes: [], top_issues: [], suggestions: [] })).toBeNull();
    expect(validateInsight(null)).toBeNull();
    expect(validateInsight("nope")).toBeNull();
  });

  it("maps an unknown category to 'other'", () => {
    const out = validateInsight({
      summary: "s",
      top_issues: [{ category: "aliens", issue: "x", severity: "weird", evidence_count: -3 }],
    });
    expect(out!.top_issues[0].category).toBe("other");
    expect(out!.top_issues[0].severity).toBe("medium");
    expect(out!.top_issues[0].evidence_count).toBe(0);
  });
});

describe("deterministicInsight", () => {
  it("ranks the most-mentioned complaint first with high severity", () => {
    const rows = [
      row({ rating: 2, comment: "Pizza arrived cold." }),
      row({ rating: 2, comment: "cold again, lukewarm." }),
      row({ rating: 3, comment: "cold on arrival" }),
      row({ rating: 2, comment: "wrong pizza, missing cheese" }),
      row({ rating: 5, comment: "loved it, fresh and hot" }),
    ];
    const out = deterministicInsight(rows);
    expect(out.top_issues[0].category).toBe("delivery_time");
    expect(out.top_issues[0].severity).toBe("high");
    expect(out.top_issues[0].evidence_count).toBe(3);
    expect(out.summary).toContain("5 recent reviews");
  });
});

describe("averageRating", () => {
  it("averages only rated rows", () => {
    expect(averageRating([row({ rating: 4 }), row({ rating: 2 }), row({ comment: "x" })])).toBe(3);
    expect(averageRating([row({ comment: "no stars" })])).toBeNull();
  });
});

describe("parseInsightJson", () => {
  it("strips code fences and returns null on junk", () => {
    expect(parseInsightJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseInsightJson("not json")).toBeNull();
  });
});
