"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Status = "idle" | "sending" | "done" | "error";

// Post-order feedback. Free-form comment is the important part — it feeds the
// weekly Feedback Insight Miner, which clusters complaints into actionable themes.
export default function FeedbackForm({ orderId }: { orderId: string | null }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function submit() {
    if (status === "sending" || status === "done") return;
    if (rating === 0 && comment.trim().length === 0) {
      setStatus("error");
      return;
    }
    setStatus("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          rating: rating || null,
          comment: comment.trim() || null,
        }),
      });
      if (!res.ok) throw new Error();
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45 }}
      className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur"
    >
      <AnimatePresence mode="wait">
        {status === "done" ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="py-2 text-center"
          >
            <p className="text-2xl">🙏</p>
            <p className="mt-2 font-semibold text-emerald-400">Thanks for the feedback!</p>
            <p className="mt-1 text-sm text-zinc-400">Rajan reads every note to make the next slice better.</p>
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <h3 className="text-center text-sm font-semibold uppercase tracking-wide text-zinc-300">
              How was your order?
            </h3>

            <div className="mt-3 flex justify-center gap-1.5">
              {[1, 2, 3, 4, 5].map((star) => {
                const active = star <= (hover || rating);
                return (
                  <button
                    key={star}
                    type="button"
                    onClick={() => {
                      setRating(star);
                      if (status === "error") setStatus("idle");
                    }}
                    onMouseEnter={() => setHover(star)}
                    onMouseLeave={() => setHover(0)}
                    aria-label={`${star} star${star > 1 ? "s" : ""}`}
                    className={`text-3xl leading-none transition ${active ? "text-[var(--accent)]" : "text-white/20"}`}
                  >
                    ★
                  </button>
                );
              })}
            </div>

            <textarea
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                if (status === "error") setStatus("idle");
              }}
              maxLength={1000}
              rows={3}
              placeholder="Anything we could do better? (cold, too oily, wrong order, slow, loved it…)"
              className="mt-4 w-full resize-none rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm outline-none transition placeholder:text-zinc-600 focus:border-[var(--accent)]"
            />

            {status === "error" && (
              <p className="mt-2 text-center text-xs text-red-400">
                Add a rating or a note first — then tap send.
              </p>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={status === "sending"}
              className="mt-3 w-full rounded-xl border border-white/15 py-3 text-sm font-semibold text-zinc-200 transition hover:border-[var(--accent)] hover:text-white disabled:opacity-60"
            >
              {status === "sending" ? "Sending…" : "Send feedback"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
