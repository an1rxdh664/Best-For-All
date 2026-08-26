"use client";

import { useState } from "react";
import { Plus, Heart, LogOut, PanelLeftClose, PanelLeftOpen, MessageSquare, Pencil, Trash2, Check, X } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import Image from "next/image";
import { Conversation } from "@/types/chat";

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  onRenameChat: (id : string, title: string) => void;
}

export default function Sidebar({ conversations, activeId, onSelect, onNewChat, onDeleteChat, onRenameChat }: SidebarProps) {
    const { data: session } = useSession();
    const [isOpen, setIsOpen] = useState(true);
    const [editingId, setEditingId] = useState<string | null>();
    const [draftTitle, setDraftTitle] = useState("");

    const startEditing = (id: string, currentTitle: string) => {
        setEditingId(id);
        setDraftTitle(currentTitle);
    }

    const confirmEdit = () => {
        if(editingId) onRenameChat(editingId, draftTitle);
        setEditingId(null);
        setDraftTitle("");
    }

    const cancelEdit = () => {
        setEditingId(null);
        setDraftTitle("");
    }

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
                {conversations.map((c) => {
                    const isEditing = editingId === c.id;
 
                    return (
                        <div
                            key={c.id}
                            className={`group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs transition-colors ${
                            c.id === activeId ? "bg-neutral-100 font-semibold text-neutral-900" : "text-neutral-600 hover:bg-neutral-50"}`}>
                            <MessageSquare size={14} className="shrink-0" />
 
                            {isOpen && (
                                isEditing ? (
                                    <input
                                        autoFocus
                                        value={draftTitle}
                                        onChange={(e) => setDraftTitle(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") confirmEdit();
                                            if (e.key === "Escape") cancelEdit();
                                        }}
                                        className="flex-1 min-w-0 rounded bg-white px-1 py-0.5 text-xs outline-none border border-neutral-200"
                                    />
                                ) : (
                                    <button
                                        onClick={() => onSelect(c.id)}
                                        className="flex-1 min-w-0 truncate text-left cursor-pointer">
                                        {c.title}
                                    </button>
                                )
                            )}
 
                            {isOpen && (
                                <div className="flex shrink-0 items-center gap-1">
                                    {isEditing ? (
                                        <>
                                            <button onClick={confirmEdit} className="text-neutral-400 hover:text-neutral-700 cursor-pointer">
                                                <Check size={13} />
                                            </button>
                                            <button onClick={cancelEdit} className="text-neutral-400 hover:text-neutral-700 cursor-pointer">
                                                <X size={13} />
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => startEditing(c.id, c.title)}
                                                className="opacity-0 text-neutral-400 hover:text-neutral-700 group-hover:opacity-100 cursor-pointer">
                                                <Pencil size={13} />
                                            </button>
                                            <button
                                                onClick={() => onDeleteChat(c.id)}
                                                className="opacity-0 text-neutral-400 hover:text-rose-500 group-hover:opacity-100 cursor-pointer">
                                                <Trash2 size={13} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
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