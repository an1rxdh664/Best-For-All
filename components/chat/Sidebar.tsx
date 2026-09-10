"use client";

import { useState, useEffect } from "react";
import { Plus, Heart, LogOut, PanelLeftClose, PanelLeftOpen, MessageSquare, Pencil, Trash2, Check, X } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import Image from "next/image";
import { Conversation } from "@/types/chat";
import ProfileDashboard from "@/components/ProfileDashboard";

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

    const [showProfileDashboard, setShowProfileDashboard] = useState(false);
    const [showVerifyModal, setShowVerifyModal] = useState(false);
    const [otpValue, setOtpValue] = useState("");
    const [sendingOtp, setSendingOtp] = useState(false);
    const [verifyingOtp, setVerifyingOtp] = useState(false);
    const [verifyStatus, setVerifyStatus] = useState<boolean | null>(session?.user?.emailVerified ? true : null);

    useEffect(() => {
        if(!session?.user?.email) return;
        let mounted = true;

        (async () => {
            try {
                const res = await fetch("/api/auth/email-verified", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: session.user.email }),
                })

                const data = await res.json();

                if(!mounted) return;
                if(res.ok) setVerifyStatus(Boolean(data.verified));
            } catch (err) {
                console.error("Failed to fetch email-verified", err);
            }
        })();
        return () => { mounted = false; };
    }, [session?.user?.email])

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

    async function sendOtp() {
        if(!session?.user?.email) return;
        setSendingOtp(true);
        try {
            const res = await fetch("/api/auth/send-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: session.user.email })
            });
            const data = await res.json();
            if(!res.ok) throw new Error(data.error || "Failed to send OTP");
            setShowVerifyModal(true);
        } catch (err: any) {
            console.error(err);
            alert(err.message || "Failed to send OTP");
        } finally {
            setSendingOtp(false);
        }
    }

    async function verifyOtp() {
        if(!session?.user?.email) return;
        setVerifyingOtp(true);
        try {
            const res = await fetch("/api/auth/verify-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: session.user.email, otp: otpValue })
            });
            const data = await res.json();
            if(!res.ok) throw new Error(data.error || "Verification failed");
            setVerifyStatus(true);
            setShowVerifyModal(false);
            window.location.reload();
        } catch (err: any) {
            console.error(err);
            alert(err.message || "Verification failed");
        } finally {
            setVerifyingOtp(false);
        }
    }

    return (
        <aside className={`relative flex h-full shrink-0 flex-col border-r border-neutral-100 transition-all duration-200 ${isOpen ? "w-64 p-4" : "w-14 p-2"}`}>
            <div className={`mb-6 flex ${isOpen ? "items-center justify-between" : "flex-col items-center gap-2"}`}>
                <div className="flex items-center gap-2 overflow-hidden">
                    <button
                        onClick={() => setShowProfileDashboard(true)}
                        className="h-8 w-8 shrink-0 rounded-full overflow-hidden bg-gradient-to-br from-blue-400 via-fuchsia-400 to-rose-400 focus:outline-none"
                        aria-label="Open profile dashboard"
                    >
                        {session?.user?.image ? (
                        <Image
                            src={session.user.image}
                            height={32}
                            width={32}
                            className="object-cover"
                            alt="Profile picture"
                        />
                        ) : null}
                    </button>

                    {isOpen && <span className="truncate text-sm font-medium text-neutral-800">{session?.user?.name}</span>}
                </div>

                <button className="text-neutral-400 hover:text-neutral-600 cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
                {isOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
                </button>
            </div>

            {showProfileDashboard && (
                <ProfileDashboard
                    onClose={() => setShowProfileDashboard(false)}
                    userName={session?.user?.name ?? ""}
                    userEmail={session?.user?.email ?? ""}
                    userImage={session?.user?.image ?? null}
                    isVerified={Boolean(verifyStatus)}
                    onVerifyEmail={sendOtp}
                    sendingOtp={sendingOtp}
                    onSignOut={async () => await signOut({ redirectTo: "/" })}
                />
            )}

            {showVerifyModal && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setShowVerifyModal(false)} />
                    <div className="relative z-[71] w-80 rounded-2xl bg-white p-5 shadow-xl">
                        <h3 className="text-sm font-semibold text-neutral-800">Verify your email</h3>
                        <p className="mt-1 text-xs text-neutral-500">Enter the code we sent to {session?.user?.email}</p>
                        <input
                            autoFocus
                            value={otpValue}
                            onChange={(e) => setOtpValue(e.target.value)}
                            placeholder="Enter OTP"
                            className="mt-3 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-fuchsia-400"
                        />
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                onClick={() => setShowVerifyModal(false)}
                                className="rounded-lg px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={verifyOtp}
                                disabled={verifyingOtp}
                                className="rounded-lg bg-gradient-to-r from-fuchsia-500 to-blue-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                            >
                                {verifyingOtp ? "Verifying..." : "Verify"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <nav className="mb-6 flex flex-col gap-1 text-sm">
                <button onClick={onNewChat} className={`flex items-center ${isOpen ? "justify-between" : "justify-center"} rounded-lg px-2 py-2 text-neutral-700 hover:bg-neutral-50 cursor-pointer`}>
                {isOpen && <span>New Chat</span>}
                <Plus size={15} />
                </button>

                <button className={`flex items-center ${isOpen ? "justify-between" : "justify-center"} rounded-lg px-2 py-2 text-neutral-700 hover:bg-neutral-50 cursor-pointer`}>
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
        </aside>
    );
}