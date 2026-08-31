import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request){
    try {
        const { email, otp } = await req.json();
        if(!email || !otp) return NextResponse.json({error : "Email and OTP are required"}, {status: 400});

        const verificationToken = await prisma.verificationToken.findFirst({
            where : {
                identifier : email,
                token: otp
            }
        })

        if(!verificationToken) return NextResponse.json({error : "Invalid Verification token"}, {status: 400});

        if(new Date() > new Date(verificationToken.expires)){
            await prisma.verificationToken.delete({
                where : { token: verificationToken.token }
            })
            return NextResponse.json({error: "Verification token has expired"}, {status : 400})
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if(!user) {
            await prisma.verificationToken.delete({
                where : { token : verificationToken.token }
            })
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        await prisma.user.update({
            where : { id: user.id },
            data: { emailVerified : new Date() }
        })

        await prisma.verificationToken.delete({
            where : { token : verificationToken.token }
        })
        
        return NextResponse.json({ success: true, message: "Email Verified Successfully"})
    } catch (e : any) {
        console.error("An error occured while verifying token : ", e);
        return NextResponse.json({error: "Failed to verify OTP"}, {status: 500})
    }
}