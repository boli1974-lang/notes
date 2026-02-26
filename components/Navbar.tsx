import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="mx-auto flex max-w-4xl items-center justify-between">
        <Link
          href="/"
          className="text-lg font-semibold text-slate-800 hover:text-slate-600"
        >
          Notes MVP
        </Link>
        <div className="flex gap-4">
          <Link
            href="/notes"
            className="text-slate-600 hover:text-slate-900 hover:underline"
          >
            Notes
          </Link>
          <Link
            href="/review"
            className="text-slate-600 hover:text-slate-900 hover:underline"
          >
            Review
          </Link>
        </div>
      </div>
    </nav>
  );
}
