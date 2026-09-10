// app/dashboard/page.tsx
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { auth } from "@/auth";

export default async function Dashboard() {
    const session = await auth();
    const firstName = session?.user?.name?.split(" ")[0] ?? "there";

    return (
        <div className="flex h-screen w-full items-center justify-center bg-white p-3">
            <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-2xl border border-neutral-100 p-8 text-center">
                <div className="h-12 w-12 shrink-0 rounded-full bg-gradient-to-br from-blue-400 via-fuchsia-400 to-rose-400" />

                <div>
                    <p className="text-sm text-neutral-400">Signed in as</p>
                    <p className="text-sm font-medium text-neutral-700">
                        {session?.user?.email}
                    </p>
                </div>

                <h1 className="text-xl font-semibold text-neutral-900">
                    Welcome, {firstName}
                </h1>

                <Link
                    href="/chat"
                    className="flex w-full items-center justify-between rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700"
                >
                    <span>Go to chat</span>
                    <ArrowRight size={15} />
                </Link>
            </div>
        </div>
    );
}