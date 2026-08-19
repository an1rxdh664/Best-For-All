"use client"

import { useState } from "react";
import { Plus, Heart, Mic, ArrowRight, LogOut, PanelLeft } from "lucide-react";
import { useSession } from "next-auth/react";

const suggestions = [
    { text: "What is the best time to visit Manali?" },
    { text: "Best Dosa point near me?" },
    { text: "What restaurant fits best in my budget?" },
];

export default function Chat() {

    const [message, setMessage] = useState("");
    
    const { data : session, status } = useSession();

    if(status === "loading") {
        <div>Loading....</div>
    }

    return (
        <>
            <div className="flex h-screen w-full bg-white p-3">
                <div className="flex h-full w-full overflow-hidden rounded-2xl bg-white">
                    {/* Sidebar */}
                    <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-100 p-4">
                    <div className="mb-6 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-400 via-fuchsia-400 to-rose-400" />
                        <span className="text-sm font-medium text-neutral-800">{session?.user?.name}</span>
                        </div>
                        <button className="text-neutral-400 hover:text-neutral-600">
                        <PanelLeft size={16} />
                        </button>
                    </div>

                    <nav className="mb-6 flex flex-col gap-1 text-sm">
                        <button className="flex items-center justify-between rounded-lg px-2 py-2 text-neutral-700 hover:bg-neutral-50">
                        <span>New Chat</span>
                        <Plus size={15} />
                        </button>
                        <button className="flex items-center justify-between rounded-lg px-2 py-2 text-neutral-700 hover:bg-neutral-50">
                        <span>Favourites</span>
                        <Heart size={15} />
                        </button>
                    </nav>

                    <p className="mb-2 px-2 text-[11px] font-medium tracking-wide text-neutral-400">
                        RECENT CHATS
                    </p>
                    {/* <div className="flex-1 space-y-0.5 overflow-y-auto">
                        
                    </div> */}

                    <button className="mt-4 flex items-center gap-2 px-2 py-2 text-sm text-rose-500 hover:text-rose-600">
                        <span>Logout</span>
                        <LogOut size={14} />
                    </button>
                    </aside>

                    {/* Main panel */}
                    <main className="relative flex flex-1 flex-col items-center justify-center px-8">
                    <div className="relative mb-10 grid w-full max-w-xl grid-cols-2 gap-3">
                        {suggestions.map((s, i) => (
                        <button key={i} className="rounded-xl bg-neutral-50 px-4 py-3 text-left text-[13px] text-neutral-600 shadow-sm hover:bg-neutral-100">
                            {s.text}
                        </button>
                        ))}
                    </div>

                    <h1 className="mb-1 text-2xl font-semibold">
                        <span className="bg-rose-100 px-2 text-rose-500">Welcome, {session?.user?.name?.slice(0, session?.user?.name?.indexOf(" "))}!</span>
                    </h1>
                    <p className="mb-8 text-lg text-neutral-300">How can I help you today?</p>

                    <div className="flex w-full max-w-xl items-center gap-3 rounded-full bg-neutral-900 px-5 py-3">
                        <input
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="What are the best places to visit in monsoon?"
                        className="flex-1 bg-transparent text-sm text-white placeholder-neutral-400 outline-none"
                        />
                        <button className="text-neutral-400 hover:text-white">
                        <Mic size={16} />
                        </button>
                        <button className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black hover:bg-neutral-200">
                        <ArrowRight size={15} />
                        </button>
                    </div>
                    <p className="mt-3 text-[11px] text-neutral-400">
                        Chat can be wrong sometimes, please verify the output
                    </p>
                    </main>
                </div>
                </div>
        </>
    )
}