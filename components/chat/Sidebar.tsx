"use client";

import { useState } from "react";
import { Plus, Heart, LogOut, PanelLeftClose, PanelLeftOpen, MessageSquare } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import Image from "next/image";
import { Conversation } from "@/types/chat";

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
}

export default function Sidebar({ conversations, activeId, onSelect, onNewChat }: SidebarProps) {
    const { data: session } = useSession();
    const [isOpen, setIsOpen] = useState(true);

    return (
        <aside className={`flex h-full shrink-0 flex-col border-r border-neutral-100 p-4 transition-all duration-200 ${isOpen ? "w-64" : "w-14"}`}>
            <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-2 overflow-hidden">
                    <div className="h-8 w-8 shrink-0 rounded-full overflow-hidden bg-gradient-to-br from-blue-400 via-fuchsia-400 to-rose-400">
                        {session?.user?.image && (
                        <Image
                            src={session.user.image}
                            height={32}
                            width={32}
                            className="object-cover"
                            alt="Profile picture"
                        />
                        )}
                    </div>
                    {isOpen && <span className="truncate text-sm font-medium text-neutral-800">{session?.user?.name}</span>}
                </div>

                <button className="text-neutral-400 hover:text-neutral-600 cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
                {isOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
                </button>
            </div>

            <nav className="mb-6 flex flex-col gap-1 text-sm">
                <button onClick={onNewChat} className="flex items-center justify-between rounded-lg px-2 py-2 text-neutral-700 hover:bg-neutral-50 cursor-pointer">
                {isOpen && <span>New Chat</span>}
                <Plus size={15} />
                </button>

                <button className="flex items-center justify-between rounded-lg px-2 py-2 text-neutral-700 hover:bg-neutral-50">
                {isOpen && <span>Favourites</span>}
                <Heart size={15} />
                </button>
            </nav>

            {isOpen && (
                <p className="mb-2 px-2 text-[11px] font-medium tracking-wide text-neutral-400">RECENT CHATS</p>
            )}

            <div className="flex-1 overflow-y-auto space-y-1">
                {conversations.map((c) => (
                <button
                    key={c.id}
                    onClick={() => onSelect(c.id)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs truncate transition-colors ${
                    c.id === activeId ? "bg-neutral-100 font-semibold text-neutral-900" : "text-neutral-600 hover:bg-neutral-50"}`}>
                    <MessageSquare size={14} className="shrink-0" />
                    {isOpen && <span className="truncate">{c.title}</span>}
                </button>
                ))}
            </div>

            <button
                className="mt-auto flex w-full items-center gap-2 px-2 py-2 text-sm text-rose-500 hover:text-rose-600 cursor-pointer"
                onClick={async () => await signOut({ redirectTo: "/" })}>
                {isOpen && <span>Logout</span>}
                <LogOut size={14} />
            </button>
        </aside>
    );
}