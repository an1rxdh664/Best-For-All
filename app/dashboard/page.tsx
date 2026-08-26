// app/dashboard/page.tsx
import Link from "next/link";
import { auth, signOut } from "@/auth";

export default async function Dashboard() {
    const session = await auth();

    return (
        <div className="flex h-screen w-full items-center justify-center bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50 p-3">
            <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
                <p className="text-sm text-gray-400">Signed in as</p>
                <p className="mb-6 text-sm font-medium text-gray-700">
                    {session?.user?.email}
                </p>

                <h1 className="mb-8 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 bg-clip-text text-2xl font-semibold text-transparent">
                    Welcome, {session?.user?.name?.split(" ")[0] ?? "there"}
                </h1>

                <div className="flex flex-col gap-3">
                    <Link
                        href="/chat"
                        className="rounded-xl bg-gray-900 py-2.5 text-center text-sm font-medium text-white transition hover:bg-gray-700"
                    >
                        Go to chat
                    </Link>

                    <form
                        action={async () => {
                            "use server";
                            await signOut({ redirectTo: "/" });
                        }}
                    >
                        <button
                            type="submit"
                            className="w-full rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-500 transition hover:bg-gray-50"
                        >
                            Sign out
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}