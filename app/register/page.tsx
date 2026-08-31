"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
        // 1. Post to signup endpoint
        const res = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, name }),
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || "Failed to create account");
        }

        // 2. Automatically log in after successful registration
        const signInRes = await signIn("credentials", {
            email,
            password,
            redirect: false,
        });

        if (signInRes?.error) {
            setError("Account created, but log in failed. Please log in manually.");
        } else {
            router.push("/chat");
        }
        } catch (err: any) { setError(err.message);} 
        finally { setLoading(false);}
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <form onSubmit={handleRegister} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-md border border-neutral-100">
            <h2 className="mb-6 text-xl font-semibold text-neutral-800">Create Account</h2>
            
            {error && <p className="mb-4 text-xs text-rose-500">{error}</p>}

            <div className="mb-4">
            <label className="block text-xs text-neutral-600 mb-1">Name</label>
            <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 p-2.5 text-sm outline-none focus:border-neutral-900"
                placeholder="John Doe"
            />
            </div>

            <div className="mb-4">
            <label className="block text-xs text-neutral-600 mb-1">Email</label>
            <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 p-2.5 text-sm outline-none focus:border-neutral-900"
                placeholder="name@example.com"
            />
            </div>

            <div className="mb-6">
            <label className="block text-xs text-neutral-600 mb-1">Password</label>
            <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 p-2.5 text-sm outline-none focus:border-neutral-900"
                placeholder="••••••••"
            />
            </div>

            <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 cursor-pointer"
            >
            {loading ? "Creating account..." : "Sign Up"}
            </button>
        </form>
        </div>
    );
}