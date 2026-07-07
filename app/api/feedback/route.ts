import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Post-order feedback. Writes go through the service-role client (like orders),
// so the client can't spoof rows or bypass validation.
export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const { orderId, rating, comment } = (body ?? {}) as {
      orderId?: unknown;
      rating?: unknown;
      comment?: unknown;
    };

    // order_id is optional but if present must be a real uuid.
    let order_id: string | null = null;
    if (orderId != null) {
      if (typeof orderId !== "string" || !UUID_RE.test(orderId)) {
        return NextResponse.json({ error: "Invalid order reference." }, { status: 400 });
      }
      order_id = orderId;
    }

    let ratingValue: number | null = null;
    if (rating != null) {
      const n = Number(rating);
      if (!Number.isInteger(n) || n < 1 || n > 5) {
        return NextResponse.json({ error: "Rating must be 1 to 5." }, { status: 400 });
      }
      ratingValue = n;
    }

    let commentValue: string | null = null;
    if (comment != null) {
      if (typeof comment !== "string") {
        return NextResponse.json({ error: "Comment must be text." }, { status: 400 });
      }
      const trimmed = comment.trim();
      if (trimmed.length > 1000) {
        return NextResponse.json({ error: "Comment is too long." }, { status: 400 });
      }
      commentValue = trimmed.length > 0 ? trimmed : null;
    }

    if (ratingValue === null && commentValue === null) {
      return NextResponse.json({ error: "Add a rating or a comment." }, { status: 400 });
    }

    const db = createAdminClient();
    const { error } = await db.from("order_feedback").insert({
      order_id,
      rating: ratingValue,
      comment: commentValue,
      source: "post_order",
    });

    if (error) {
      return NextResponse.json({ error: "Could not save feedback." }, { status: 503 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not save feedback." }, { status: 500 });
  }
}
