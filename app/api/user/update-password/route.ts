import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
        }

        const { resetToken, newPassword, confirmPassword } = await req.json();

        if (!resetToken || !newPassword || !confirmPassword) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        if (newPassword !== confirmPassword) {
            return NextResponse.json({ error: "Passwords do not match" }, { status: 400 });
        }

        if (newPassword.length < 6) {
            return NextResponse.json(
                { error: "Password must be at least 6 characters long" },
                { status: 400 }
            );
        }

        const email = session.user.email;

        const ticket = await prisma.passwordResetTicket.findUnique({
            where: { token: resetToken },
        });

        if (!ticket || ticket.email !== email) {
            return NextResponse.json({ error: "Invalid or expired session, please verify again" }, { status: 400 });
        }

        if (new Date() > new Date(ticket.expires)) {
            await prisma.passwordResetTicket.delete({ where: { token: resetToken } });
            return NextResponse.json({ error: "Verification expired, please verify again" }, { status: 400 });
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.password) {
            return NextResponse.json({ error: "Password change is not available for this account" }, { status: 403 });
        }

        const isSameAsOld = await bcrypt.compare(newPassword, user.password);
        if (isSameAsOld) {
            return NextResponse.json(
                { error: "New password cannot be the same as your current password" },
                { status: 400 }
            );
        }

        const hashed = await bcrypt.hash(newPassword, 10);

        await prisma.user.update({
            where: { id: user.id },
            data: { password: hashed },
        });

        await prisma.passwordResetTicket.delete({ where: { token: resetToken } });

        return NextResponse.json({ success: true, message: "Password updated successfully" });
    } catch (e: any) {
        console.error("update-password error", e);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}