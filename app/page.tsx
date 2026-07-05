import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="relative">
        <div className="absolute inset-0 -z-10 rounded-full bg-[var(--accent)]/25 blur-3xl" />
        <p className="animate-bounce text-7xl drop-shadow-[0_0_30px_rgba(255,92,26,0.6)]">🍕</p>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.4em] text-[var(--accent)]">
          The pizza forge
        </p>
        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
          Slice<span className="text-[var(--accent)]">Matic</span>
        </h1>
        <p className="mt-3 max-w-sm text-zinc-400">
          Scan the QR at your table and watch your pizza assemble itself — live.
        </p>
      </div>
      <div className="flex gap-4 text-sm">
        <Link
          href="/order"
          className="glow-button rounded-full bg-[var(--accent)] px-6 py-2.5 font-semibold text-black"
        >
          Start an order
        </Link>
        <Link href="/kitchen" className="rounded-full border border-white/15 px-5 py-2.5 transition hover:border-[var(--accent)]">
          Kitchen
        </Link>
        <Link href="/admin" className="rounded-full border border-white/15 px-5 py-2.5 transition hover:border-[var(--accent)]">
          Admin
        </Link>
      </div>
    </main>
  );
}
