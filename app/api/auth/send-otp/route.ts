import { NextResponse } from "next/server";
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

export async function POST(req: Request){
    try {
        const { email } = await req.json();

        if(!email) return NextResponse.json({error : "Email is required"}, {status : 400})
        
        const otp = Math.floor(100000 + Math.random() * 900000).toString(); // a random OTP of 6 digits
        const expires = new Date(Date.now() + 10 * 60 * 1000); // token expires in 10 minutes

        await prisma.verificationToken.deleteMany({
            where : { identifier : email }
        }) // deleting previous tokens for the email

        await prisma.verificationToken.create({
            data: {
                identifier: email,
                token: otp,
                expires
            }
        })

        await mailer.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: email,
            subject: "Account Verification Code",
            html: `
                <p>Your email verification code is <strong>${otp}</strong>. It will expire in 10 minutes.</p>
            `
        })

        return NextResponse.json(
            { success: true, message: "OTP sent successfully" }
        )
    } catch (e : any) {
        console.error("An error occured while sending the verification code : ", e);
        return NextResponse.json({ error: "Failed to send verification code" }, { status : 500 })
    }
}