"use client";
import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function VerifyOtpPage() {
    const searchParams = useSearchParams();
    const email = searchParams.get("email") || "";
    const [otp, setOtp] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
        const res = await fetch("/api/auth/verify-otp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, otp }),
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || "Failed to verify OTP");
        }

        // Automatically redirect to login or chat upon verification
        // router.push("/api/auth/login");
        router.push("/chat");
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-neutral-50 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-md border border-neutral-100">
            <h2 className="mb-2 text-xl font-semibold text-neutral-800 text-center">Verify Your Email</h2>
            <p className="mb-6 text-xs text-neutral-500 text-center">We sent a 6-digit code to <span className="font-semibold text-neutral-800">{email}</span></p>

            {error && (
                <div className="mb-4 rounded-lg bg-rose-50 p-3 text-xs text-rose-500 border border-rose-100">{error}</div>
            )}

            <form onSubmit={handleVerify} className="space-y-4">
            <div>
                <input
                    type="text"
                    maxLength={6}
                    required
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    className="w-full text-center tracking-[0.5em] text-lg font-mono rounded-lg border border-neutral-200 p-3 outline-none focus:border-neutral-900 transition-colors"
                    placeholder="000000"
                />
            </div>

            <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 cursor-pointer transition-colors"
            >
                {loading ? "Verifying..." : "Verify Code"}
            </button>
            </form>
        </div>
        </div>
    );
}