import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
        }

        const { otp } = await req.json();
        if (!otp) {
            return NextResponse.json({ error: "OTP is required" }, { status: 400 });
        }

        const email = session.user.email;
        const identifier = `pwdreset:${email}`;

        const verificationToken = await prisma.verificationToken.findFirst({
            where: { identifier, token: otp },
        });

        if (!verificationToken) {
            return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
        }

        if (new Date() > new Date(verificationToken.expires)) {
            await prisma.verificationToken.delete({ where: { token: verificationToken.token } });
            return NextResponse.json({ error: "Verification code has expired" }, { status: 400 });
        }

        await prisma.verificationToken.delete({ where: { token: verificationToken.token } });

        // Issue a short-lived reset ticket proving ownership was just verified
        await prisma.passwordResetTicket.deleteMany({ where: { email } });
        const resetToken = crypto.randomBytes(32).toString("hex");
        const ticketExpires = new Date(Date.now() + 10 * 60 * 1000);

        await prisma.passwordResetTicket.create({
            data: { email, token: resetToken, expires: ticketExpires },
        });

        return NextResponse.json({ success: true, resetToken });
    } catch (e: any) {
        console.error("verify-password-otp error", e);
        return NextResponse.json({ error: "Failed to verify code" }, { status: 500 });
    }
}