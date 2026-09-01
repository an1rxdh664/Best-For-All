"use client";

import React from "react";
import Image from "next/image";
import { BadgeCheck, ShieldAlert, User, Lock, Mail, Link2, Bell, Shield, Trash2, LogOut, X } from "lucide-react";

interface ProfileDashboardProps {
    onClose: () => void;
    userName: string;
    userEmail: string;
    userImage: string | null;
    isVerified: boolean;
    onVerifyEmail: () => void;
    sendingOtp: boolean;
    onSignOut: () => void;
}

export default function ProfileDashboard({
    onClose,
    userName,
    userEmail,
    userImage,
    isVerified,
    onVerifyEmail,
    sendingOtp,
    onSignOut,
}: ProfileDashboardProps) {
    const items = [
        { icon: User, label: "Change username" },
        { icon: Lock, label: "Forgot password" },
        { icon: Link2, label: "Connected accounts" },
        { icon: Bell, label: "Notification settings" },
        { icon: Shield, label: "Privacy" },
    ];

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

            <div className="relative z-[61] w-[440px] max-h-[85vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
                {/* Header with gradient */}
                <div
                    className="relative px-6 pb-6 pt-8"
                    style={{
                        background: "linear-gradient(135deg, #f472b6 0%, #a78bfa 50%, #60a5fa 100%)",
                    }}
                >
                    <button
                        onClick={onClose}
                        className="absolute right-4 top-4 rounded-full bg-white/20 p-1.5 text-white hover:bg-white/30 cursor-pointer"
                    >
                        <X size={14} />
                    </button>

                    <div className="flex items-center gap-3">
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full ring-2 ring-white/80">
                            {userImage ? (
                                <Image src={userImage} height={64} width={64} className="h-full w-full object-cover" alt="Profile picture" />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center bg-white/30 text-white">
                                    <User size={26} />
                                </div>
                            )}
                        </div>
                        <div className="min-w-0">
                            <h2 className="truncate text-base font-semibold text-white">{userName || "Your Account"}</h2>
                            <p className="truncate text-xs text-white/85">{userEmail}</p>

                            <div className="mt-1.5">
                                {isVerified ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-white/25 px-2 py-0.5 text-[11px] font-medium text-white">
                                        <BadgeCheck size={12} />
                                        Verified
                                    </span>
                                ) : (
                                    <button
                                        onClick={onVerifyEmail}
                                        disabled={sendingOtp}
                                        className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-neutral-700 hover:bg-white cursor-pointer disabled:opacity-60"
                                    >
                                        <ShieldAlert size={12} />
                                        {sendingOtp ? "Sending..." : "Verify email"}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Settings list */}
                <div className="px-4 py-4">
                    <p className="mb-2 px-2 text-[11px] font-medium tracking-wide text-neutral-400">ACCOUNT</p>
                    <div className="space-y-1">
                        {items.map(({ icon: Icon, label }) => (
                            <button
                                key={label}
                                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-neutral-700 hover:bg-neutral-50 cursor-pointer"
                            >
                                <Icon size={16} className="text-neutral-400" />
                                {label}
                            </button>
                        ))}
                    </div>

                    <p className="mb-2 mt-4 px-2 text-[11px] font-medium tracking-wide text-neutral-400">DANGER ZONE</p>
                    <div className="space-y-1">
                        <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-rose-500 hover:bg-rose-50 cursor-pointer">
                            <Trash2 size={16} />
                            Delete account
                        </button>
                        <button
                            onClick={onSignOut}
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-rose-500 hover:bg-rose-50 cursor-pointer"
                        >
                            <LogOut size={16} />
                            Sign out
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}