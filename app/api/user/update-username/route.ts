import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
        }

        const { username } = await req.json();

        if (!username || typeof username !== "string" || !username.trim()) {
            return NextResponse.json({ error: "Username is required" }, { status: 400 });
        }

        const trimmed = username.trim();

        if (trimmed.length < 3 || trimmed.length > 30) {
            return NextResponse.json(
                { error: "Username must be between 3 and 30 characters" },
                { status: 400 }
            );
        }

        const currentUser = await prisma.user.findUnique({
            where: { email: session.user.email },
        });

        if (!currentUser) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        if (currentUser.name === trimmed) {
            return NextResponse.json(
                { error: "This is already your current username" },
                { status: 409 }
            );
        }

        const existing = await prisma.user.findFirst({
            where: {
                name: { equals: trimmed, mode: "insensitive" },
                NOT: { id: currentUser.id },
            },
            select: { id: true },
        });

        if (existing) {
            return NextResponse.json({ error: "This username is already taken" }, { status: 409 });
        }

        const updated = await prisma.user.update({
            where: { id: currentUser.id },
            data: { name: trimmed },
        });

        return NextResponse.json({ success: true, name: updated.name });
    } catch (e: any) {
        console.error("update-username error", e);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}