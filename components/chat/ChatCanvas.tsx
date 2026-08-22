"use client";

import { useState } from "react";
import { Mic, ArrowRight } from "lucide-react";
import { useSession } from "next-auth/react";
import { Conversation } from "@/types/chat";

const suggestions = [
    { text: "What is the best time to visit Manali?" },
    { text: "Best Dosa point near me?" },
    { text: "What restaurant fits best in my budget?" },
];

interface ChatCanvasProps {
    conversation: Conversation | undefined;
    onSendMessage: (text: string) => void;
}

export default function ChatCanvas({ conversation, onSendMessage }: ChatCanvasProps) {
    const [input, setInput] = useState("");
    const { data: session } = useSession();

    const handleSend = () => {
        if (!input.trim()) return;
        onSendMessage(input);
        setInput("");
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") handleSend();
    };

    const messages = conversation?.messages || [];

    return (
        <main className="relative flex flex-1 flex-col items-center justify-between px-8 py-6 h-full overflow-hidden">
            {/* Empty State / Suggestions (Only show when there are no messages) */}
            {messages.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center w-full max-w-xl">
                    <div className="relative mb-10 grid w-full grid-cols-2 gap-3">
                        {suggestions.map((s, i) => (
                            <button key={i} onClick={() => onSendMessage(s.text)} className="rounded-xl bg-neutral-50 px-4 py-3 text-left text-[13px] text-neutral-600 shadow-sm hover:bg-neutral-100 cursor-pointer">
                                {s.text}
                            </button>
                        ))}
                    </div>

                    <h1 className="mb-1 text-2xl font-semibold">
                        <span className="bg-rose-100 px-2 text-rose-500">Welcome, {session?.user?.name?.slice(0, session?.user?.name?.indexOf(" "))}!</span>
                    </h1>
                    <p className="mb-8 text-lg text-neutral-300">How can I help you today?</p>
                </div>
            ) : (
                <div className="flex-1 w-full max-w-xl overflow-y-auto space-y-4 py-4">
                    {messages.map((m) => (
                        <div key={m.id} className={`flex w-full ${m.sender === "user" ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${m.sender === "user" ? "bg-neutral-900 text-white rounded-br-none" : "bg-neutral-100 text-neutral-800 rounded-bl-none"}`}>
                                {m.content}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="w-full max-w-xl flex flex-col items-center">
                <div className="flex w-full items-center gap-3 rounded-full bg-neutral-900 px-5 py-3">
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="What are the best places to visit in monsoon?"
                        className="flex-1 bg-transparent text-sm text-white placeholder-neutral-400 outline-none"
                    />
                    <button className="text-neutral-400 hover:text-white cursor-pointer">
                        <Mic size={16} />
                    </button>
                    <button onClick={handleSend} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black hover:bg-neutral-200 cursor-pointer">
                        <ArrowRight size={15} />
                    </button>
                </div>
                <p className="mt-3 text-[11px] text-neutral-400">Chat can be wrong sometimes, please verify the output</p>
            </div>
        </main>
    );
}