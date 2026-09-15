import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import nodemailer from "nodemailer";

const mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
    },
});

export async function POST() {
    try {
        const session = await auth();
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: { password: true },
        });

        if (!user?.password) {
            return NextResponse.json(
                { error: "Password change is not available for this account" },
                { status: 403 }
            );
        }

        const email = session.user.email;
        const identifier = `pwdreset:${email}`;
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = new Date(Date.now() + 10 * 60 * 1000);

        await prisma.verificationToken.deleteMany({ where: { identifier } });
        await prisma.verificationToken.create({
            data: { identifier, token: otp, expires },
        });

        await mailer.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: email,
            subject: "Password Change Verification Code",
            html: `<p>Your password change verification code is <strong>${otp}</strong>. It will expire in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
        });

        return NextResponse.json({ success: true, message: "OTP sent successfully" });
    } catch (e: any) {
        console.error("send-password-otp error", e);
        return NextResponse.json({ error: "Failed to send verification code" }, { status: 500 });
    }
}