// app/page.tsx
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-white p-3">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-2xl border border-neutral-100 p-8 text-center">
        <div className="h-12 w-12 shrink-0 rounded-full bg-gradient-to-br from-blue-400 via-fuchsia-400 to-rose-400" />

        <div>
          <h1 className="text-xl font-semibold text-neutral-900">
            Best Of All
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            Ask for food nearby in plain language and get real
            recommendations, powered by a local AI assistant.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2">
          <Link
            href="/chat"
            className="flex w-full items-center justify-between rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700"
          >
            <span>Go to chat</span>
            <ArrowRight size={15} />
          </Link>

          <Link
            href="/dashboard"
            className="flex w-full items-center justify-between rounded-lg border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
          >
            <span>Dashboard</span>
            <ArrowRight size={15} />
          </Link>

          <Link
            href="/register"
            className="flex w-full items-center justify-between rounded-lg border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
          >
            <span>Create an account</span>
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </div>
  );
}