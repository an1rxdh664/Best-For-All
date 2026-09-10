import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { email } });
    return NextResponse.json({ verified: !!(user?.emailVerified) });
  } catch (e: any) {
    console.error("email-verified error", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}