export const runtime = 'nodejs';
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    try {
        const { email, password, name } = await req.json();

        if(!email || !password) {
            return NextResponse.json(
                { error : "Email and password are required" },
                { status : 400 }
            )
        }

        if(password.length < 6) {
            return NextResponse.json(
                { error: "Password must be at least 6 characters long" },
                { status: 400 }
            )
        }

        const existingUser = await prisma.user.findUnique({
            where : { email }
        });

        if(existingUser){
            return NextResponse.json(
                { error : "User with this email already exists" },
                { status: 409 }
            )
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data : {
                email,
                name: name || email.split("@")[0],
                password: hashedPassword
            }
        })

        return NextResponse.json(
            { 
                success : true,
                user : { id: user.id, email: user.email, name: user.name }
            },
            { status : 201 }
        )
    } catch (error : any) {
        console.error("Registration error : ", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}