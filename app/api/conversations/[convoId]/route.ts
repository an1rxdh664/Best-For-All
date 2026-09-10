export const runtime = 'nodejs';
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request, { params }: { params: { convoId: string } }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;
    const { convoId } = params;

    const convo = await prisma.conversation.findUnique({
      where: { convoId },
      include: { message: { orderBy: { createdAt: "asc" } } },
    });

    if (!convo || convo.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ conversation: convo });
  } catch (error) {
    console.error("GET /api/conversations/[convoId] error:", error);
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: { convoId: string } }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;
    const { convoId } = params;
    const body = await req.json();

    const convo = await prisma.conversation.findUnique({ where: { convoId } });
    if (!convo || convo.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated = await prisma.conversation.update({ where: { convoId }, data: { title: body.title ?? convo.title, updatedAt: new Date() } });

    return NextResponse.json({ conversation: updated });
  } catch (error) {
    console.error("PATCH /api/conversations/[convoId] error:", error);
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  }
}

// 4aa332e2d5d8 -> Docker image idfr cf

export async function DELETE(req: Request, { params }: { params: { convoId: string } }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;
    const { convoId } = await params;

    const convo = await prisma.conversation.findUnique({ where: { convoId : convoId } });
    if (!convo || convo.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.conversation.delete({ where: { convoId: convoId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/conversations/[convoId] error:", error);
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  }
}
