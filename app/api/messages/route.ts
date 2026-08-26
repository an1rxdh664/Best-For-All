import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SenderType } from "@/lib/generated/prisma/client";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;
    const { convoId, clientId, sender, content, createdAt } = await req.json();

    // validate payload
    if (!content || !sender) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    let conversation = null;
    if (convoId) {
      conversation = await prisma.conversation.findUnique({ where: { convoId } });
      if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
      if (conversation.userId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    } else {
      // create a new conversation for the user
      conversation = await prisma.conversation.create({ data: { userId, title: "New Chat" } });
    }

    // dedupe by client-provided id when available
    if (clientId) {
      const existing = await prisma.message.findUnique({ where: { id: clientId } });
      if (existing) return NextResponse.json({ message: existing });
    } else if (createdAt) {
      const existing = await prisma.message.findFirst({ where: { convoId: conversation.convoId, content, createdAt: new Date(createdAt) } });
      if (existing) return NextResponse.json({ message: existing });
    }

    const msg = await prisma.message.create({
      data: {
        ...(clientId ? { id: clientId } : {}),
        convoId: conversation.convoId,
        senderType: sender === "user" ? SenderType.USER : SenderType.ASSISTANT,
        content,
        ...(createdAt ? { createdAt: new Date(createdAt) } : {}),
      },
    });

    // update conversation's updatedAt
    await prisma.conversation.update({ where: { convoId: conversation.convoId }, data: { updatedAt: new Date() } });

    return NextResponse.json({ message: msg });
  } catch (error) {
    console.error("/api/messages POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
