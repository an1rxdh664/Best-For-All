"use client";

import React from "react";
import Image from "next/image";
import { BadgeCheck, ShieldAlert, User, Lock, Link2, Bell, Shield, Trash2, LogOut, X } from "lucide-react";

interface ProfileDashboardProps {
    onClose: () => void;
    userName: string;
    userEmail: string;
    userImage: string | null;
    isVerified: boolean;
    onVerifyEmail: () => void;
    sendingOtp: boolean;
    onSignOut: () => void;
    onUsernameUpdated: (newName: string) => void;
}

type PasswordStep = "closed" | "otp" | "reset";

export default function ProfileDashboard({
    onClose,
    userName,
    userEmail,
    userImage,
    isVerified,
    onVerifyEmail,
    sendingOtp,
    onSignOut,
    onUsernameUpdated,
}: ProfileDashboardProps) {
    // --- Username editing state ---
    const [editingUsername, setEditingUsername] = React.useState(false);
    const [usernameDraft, setUsernameDraft] = React.useState(userName);
    const [usernameError, setUsernameError] = React.useState<string | null>(null);
    const [savingUsername, setSavingUsername] = React.useState(false);

    // --- Password change state ---
    const [hasPassword, setHasPassword] = React.useState<boolean | null>(null);
    const [passwordStep, setPasswordStep] = React.useState<PasswordStep>("closed");
    const [pwdOtp, setPwdOtp] = React.useState("");
    const [pwdOtpError, setPwdOtpError] = React.useState<string | null>(null);
    const [sendingPwdOtp, setSendingPwdOtp] = React.useState(false);
    const [verifyingPwdOtp, setVerifyingPwdOtp] = React.useState(false);
    const [resetToken, setResetToken] = React.useState<string | null>(null);
    const [newPassword, setNewPassword] = React.useState("");
    const [confirmPassword, setConfirmPassword] = React.useState("");
    const [pwdSaveError, setPwdSaveError] = React.useState<string | null>(null);
    const [savingPassword, setSavingPassword] = React.useState(false);
    const [pwdSuccess, setPwdSuccess] = React.useState(false);

    React.useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const res = await fetch("/api/user/account-info");
                const data = await res.json();
                if (mounted && res.ok) setHasPassword(Boolean(data.hasPassword));
            } catch {
                if (mounted) setHasPassword(false);
            }
        })();
        return () => { mounted = false; };
    }, []);

    const items = [
        { icon: Link2, label: "Connected accounts" },
        { icon: Bell, label: "Notification settings" },
        { icon: Shield, label: "Privacy" },
    ];

    async function saveUsername() {
        setUsernameError(null);
        setSavingUsername(true);
        try {
            const res = await fetch("/api/user/update-username", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: usernameDraft }),
            });
            const data = await res.json();
            if (!res.ok) {
                setUsernameError(data.error || "Failed to update username");
                return;
            }
            onUsernameUpdated(data.name);
            setEditingUsername(false);
        } catch {
            setUsernameError("Something went wrong, please try again");
        } finally {
            setSavingUsername(false);
        }
    }

    function openPasswordFlow() {
        setPwdOtp("");
        setPwdOtpError(null);
        setNewPassword("");
        setConfirmPassword("");
        setPwdSaveError(null);
        setPwdSuccess(false);
        setResetToken(null);
        setPasswordStep("otp");
        sendPasswordOtp();
    }

    async function sendPasswordOtp() {
        setSendingPwdOtp(true);
        setPwdOtpError(null);
        try {
            const res = await fetch("/api/user/send-password-otp", { method: "POST" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to send code");
        } catch (err: any) {
            setPwdOtpError(err.message || "Failed to send code");
        } finally {
            setSendingPwdOtp(false);
        }
    }

    async function verifyPasswordOtp() {
        setVerifyingPwdOtp(true);
        setPwdOtpError(null);
        try {
            const res = await fetch("/api/user/verify-password-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ otp: pwdOtp }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Verification failed");
            setResetToken(data.resetToken);
            setPasswordStep("reset");
        } catch (err: any) {
            setPwdOtpError(err.message || "Verification failed");
        } finally {
            setVerifyingPwdOtp(false);
        }
    }

    async function savePassword() {
        setPwdSaveError(null);

        if (newPassword !== confirmPassword) {
            setPwdSaveError("Passwords do not match");
            return;
        }
        if (newPassword.length < 6) {
            setPwdSaveError("Password must be at least 6 characters long");
            return;
        }

        setSavingPassword(true);
        try {
            const res = await fetch("/api/user/update-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ resetToken, newPassword, confirmPassword }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to update password");
            setPwdSuccess(true);
            setTimeout(() => setPasswordStep("closed"), 1500);
        } catch (err: any) {
            setPwdSaveError(err.message || "Failed to update password");
        } finally {
            setSavingPassword(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

            <div className="relative z-[61] w-[440px] max-h-[85vh] overflow-y-auto rounded-2xl" style={{ background: "#FBF7F0", boxShadow: "0 24px 60px rgba(26,20,16,0.3)" }}>
                <div className="relative px-6 pb-6 pt-8" style={{ background: "#2D2420" }}>
                    <button onClick={onClose} className="absolute right-4 top-4 rounded-full p-1.5 cursor-pointer transition" style={{ background: "rgba(251,247,240,0.12)", color: "#FBF7F0" }}>
                        <X size={14} />
                    </button>

                    <div className="flex items-center gap-3">
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full" style={{ boxShadow: "0 0 0 2px rgba(251,247,240,0.5)" }}>
                            {userImage ? (
                                <Image src={userImage} height={64} width={64} className="h-full w-full object-cover" alt="Profile picture" />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center" style={{ background: "#E8B34A" }}>
                                    <User size={26} color="#2D2420" />
                                </div>
                            )}
                        </div>
                        <div className="min-w-0">
                            <h2 className="truncate text-base font-medium font-[family-name:var(--font-fraunces)]" style={{ color: "#FBF7F0" }}>{userName || "Your account"}</h2>
                            <p className="truncate text-xs" style={{ color: "rgba(251,247,240,0.7)" }}>{userEmail}</p>

                            <div className="mt-1.5">
                                {isVerified ? (
                                    <span
                                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                                        style={{ background: "rgba(232,179,74,0.2)", color: "#E8B34A" }}
                                    >
                                        <BadgeCheck size={12} />
                                        Verified
                                    </span>
                                ) : (
                                    <button
                                        onClick={onVerifyEmail}
                                        disabled={sendingOtp}
                                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium cursor-pointer disabled:opacity-60 transition"
                                        style={{ background: "#E8B34A", color: "#2D2420" }}
                                    >
                                        <ShieldAlert size={12} />
                                        {sendingOtp ? "Sending..." : "Verify email"}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-4 py-4">
                    <p className="mb-2 px-2 text-[11px] font-medium tracking-wide" style={{ color: "#A99A8C" }}>Account</p>
                    <div className="space-y-1">
                        {editingUsername ? (
                            <div className="rounded-xl px-3 py-2.5">
                                <div className="flex items-center gap-2">
                                    <User size={16} className="shrink-0" style={{ color: "#A99A8C" }} />
                                    <input
                                        autoFocus
                                        value={usernameDraft}
                                        onChange={(e) => setUsernameDraft(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") saveUsername();
                                            if (e.key === "Escape") { setEditingUsername(false); setUsernameError(null); }
                                        }}
                                        className="flex-1 min-w-0 rounded-lg px-2 py-1 text-sm outline-none"
                                        style={{ border: "1px solid rgba(107,91,78,0.25)", color: "#2D2420", background: "#FFFFFF" }}
                                    />
                                </div>
                                {usernameError && (
                                    <p className="mt-1.5 pl-7 text-[11px]" style={{ color: "#C1440E" }}>{usernameError}</p>
                                )}
                                <div className="mt-2 flex justify-end gap-2 pl-7">
                                    <button
                                        onClick={() => { setEditingUsername(false); setUsernameError(null); setUsernameDraft(userName); }}
                                        className="rounded-lg px-3 py-1 text-xs cursor-pointer"
                                        style={{ color: "#6B5B4E" }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={saveUsername}
                                        disabled={savingUsername}
                                        className="rounded-lg px-3 py-1 text-xs font-medium cursor-pointer disabled:opacity-60"
                                        style={{ background: "#C1440E", color: "#FBF7F0" }}
                                    >
                                        {savingUsername ? "Saving..." : "Save"}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => { setUsernameDraft(userName); setEditingUsername(true); }}
                                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm cursor-pointer transition"
                                style={{ color: "#2D2420" }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "#F3EBDF")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                            >
                                <User size={16} style={{ color: "#A99A8C" }} />
                                Change username
                            </button>
                        )}

                        {hasPassword && (
                            <button
                                onClick={openPasswordFlow}
                                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm cursor-pointer transition"
                                style={{ color: "#2D2420" }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "#F3EBDF")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                            >
                                <Lock size={16} style={{ color: "#A99A8C" }} />
                                Change password
                            </button>
                        )}

                        {items.map(({ icon: Icon, label }) => (
                            <button
                                key={label}
                                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm cursor-pointer transition"
                                style={{ color: "#2D2420" }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "#F3EBDF")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                            >
                                <Icon size={16} style={{ color: "#A99A8C" }} />
                                {label}
                            </button>
                        ))}
                    </div>

                    <p className="mb-2 mt-4 px-2 text-[11px] font-medium tracking-wide" style={{ color: "#A99A8C" }}>Danger zone</p>
                    <div className="space-y-1">
                        <button
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm cursor-pointer transition"
                            style={{ color: "#C1440E" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(193,68,14,0.08)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                            <Trash2 size={16} />
                            Delete account
                        </button>
                        <button
                            onClick={onSignOut}
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm cursor-pointer transition"
                            style={{ color: "#C1440E" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(193,68,14,0.08)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                            <LogOut size={16} />
                            Sign out
                        </button>
                    </div>
                </div>
            </div>

            {passwordStep !== "closed" && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                    <div className="absolute inset-0 bg-black/40" onClick={() => setPasswordStep("closed")} />
                    <div className="relative z-[71] w-80 rounded-2xl p-5" style={{ background: "#FBF7F0", boxShadow: "0 20px 40px rgba(26,20,16,0.25)" }}>
                        {passwordStep === "otp" && (
                            <>
                                <h3 className="text-sm font-medium font-[family-name:var(--font-fraunces)]" style={{ color: "#2D2420" }}>Verify it&apos;s you</h3>
                                <p className="mt-1 text-xs" style={{ color: "#6B5B4E" }}>
                                    Enter the code we sent to {userEmail} to confirm you own this account.
                                </p>
                                <input
                                    autoFocus
                                    value={pwdOtp}
                                    onChange={(e) => setPwdOtp(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") verifyPasswordOtp(); }}
                                    placeholder="Enter code"
                                    className="mt-3 w-full rounded-lg px-3 py-2 text-sm outline-none"
                                    style={{ border: "1px solid rgba(107,91,78,0.25)", color: "#2D2420", background: "#FFFFFF" }}
                                />
                                {pwdOtpError && <p className="mt-1.5 text-[11px]" style={{ color: "#C1440E" }}>{pwdOtpError}</p>}
                                <div className="mt-3 flex items-center justify-between">
                                    <button
                                        onClick={sendPasswordOtp}
                                        disabled={sendingPwdOtp}
                                        className="text-[11px] cursor-pointer disabled:opacity-60"
                                        style={{ color: "#6B5B4E" }}
                                    >
                                        {sendingPwdOtp ? "Sending..." : "Resend code"}
                                    </button>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setPasswordStep("closed")}
                                            className="rounded-lg px-3 py-1.5 text-xs cursor-pointer"
                                            style={{ color: "#6B5B4E" }}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={verifyPasswordOtp}
                                            disabled={verifyingPwdOtp || !pwdOtp}
                                            className="rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer disabled:opacity-60"
                                            style={{ background: "#C1440E", color: "#FBF7F0" }}
                                        >
                                            {verifyingPwdOtp ? "Verifying..." : "Verify"}
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}

                        {passwordStep === "reset" && (
                            <>
                                <h3 className="text-sm font-medium font-[family-name:var(--font-fraunces)]" style={{ color: "#2D2420" }}>Set a new password</h3>
                                <p className="mt-1 text-xs" style={{ color: "#6B5B4E" }}>Choose a new password for your account.</p>

                                {pwdSuccess ? (
                                    <p className="mt-4 text-sm font-medium" style={{ color: "#E8B34A" }}>Password updated successfully.</p>
                                ) : (
                                    <>
                                        <input
                                            autoFocus
                                            type="password"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            placeholder="New password"
                                            className="mt-3 w-full rounded-lg px-3 py-2 text-sm outline-none"
                                            style={{ border: "1px solid rgba(107,91,78,0.25)", color: "#2D2420", background: "#FFFFFF" }}
                                        />
                                        <input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === "Enter") savePassword(); }}
                                            placeholder="Confirm new password"
                                            className="mt-2 w-full rounded-lg px-3 py-2 text-sm outline-none"
                                            style={{ border: "1px solid rgba(107,91,78,0.25)", color: "#2D2420", background: "#FFFFFF" }}
                                        />
                                        {pwdSaveError && <p className="mt-1.5 text-[11px]" style={{ color: "#C1440E" }}>{pwdSaveError}</p>}
                                        <div className="mt-3 flex justify-end gap-2">
                                            <button
                                                onClick={() => setPasswordStep("closed")}
                                                className="rounded-lg px-3 py-1.5 text-xs cursor-pointer"
                                                style={{ color: "#6B5B4E" }}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={savePassword}
                                                disabled={savingPassword || !newPassword || !confirmPassword}
                                                className="rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer disabled:opacity-60"
                                                style={{ background: "#C1440E", color: "#FBF7F0" }}
                                            >
                                                {savingPassword ? "Saving..." : "Save password"}
                                            </button>
                                        </div>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}