import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Welcome to Notes MVP</h1>
      <p className="text-slate-600">
        A simple note-taking app with a daily review focus mode.
      </p>
      <div className="flex gap-4">
        <Link
          href="/notes"
          className="rounded-lg bg-slate-800 px-4 py-2 text-white hover:bg-slate-700"
        >
          Go to Notes
        </Link>
        <Link
          href="/review"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50"
        >
          Review Today
        </Link>
      </div>
    </div>
  );
}
