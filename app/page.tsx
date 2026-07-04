import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-5xl font-bold tracking-tight">
        Slice<span className="text-[var(--accent)]">Matic</span>
      </h1>
      <p className="text-zinc-400">Scan the QR code at your table to order.</p>
      <div className="flex gap-4 text-sm">
        <Link href="/order" className="rounded-full border border-white/15 px-5 py-2 hover:border-[var(--accent)]">Order</Link>
        <Link href="/kitchen" className="rounded-full border border-white/15 px-5 py-2 hover:border-[var(--accent)]">Kitchen</Link>
        <Link href="/admin" className="rounded-full border border-white/15 px-5 py-2 hover:border-[var(--accent)]">Admin</Link>
      </div>
    </main>
  );
}
