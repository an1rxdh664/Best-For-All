import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { SenderType } from "@/lib/generated/prisma/client"

export async function POST(req : Request){
    try {
        const { userId, localConversations } = await req.json();

        if(!userId || !Array.isArray(localConversations) || localConversations.length === 0) {
            return NextResponse.json({ error: "Invalid payload or empty data" }, { status: 400 })
        }

        for(const conv of localConversations){
            // Prefer client-provided conversation id when available to make migration idempotent
            const clientConvoId = conv.id;

            let createdConversation = null;

            if (clientConvoId) {
                const existing = await prisma.conversation.findUnique({ where: { convoId: clientConvoId } });
                if (existing) {
                    createdConversation = existing;
                    // update timestamps if incoming is newer
                    const incomingUpdatedAt = conv.updatedAt ? new Date(conv.updatedAt) : undefined;
                    if (incomingUpdatedAt && incomingUpdatedAt > existing.updatedAt) {
                        await prisma.conversation.update({ where: { convoId: clientConvoId }, data: { updatedAt: incomingUpdatedAt } });
                    }
                } else {
                    createdConversation = await prisma.conversation.create({
                        data: {
                            convoId: clientConvoId,
                            userId: userId,
                            title: conv.title || "New Chat",
                            createdAt: conv.updatedAt ? new Date(conv.updatedAt) : new Date(),
                            updatedAt: conv.updatedAt ? new Date(conv.updatedAt) : new Date(),
                        }
                    })
                }
            } else {
                // create a new conversation (no client id available)
                createdConversation = await prisma.conversation.create({
                    data : {
                        userId: userId,
                        title: conv.title || "New Chat",
                        createdAt: conv.updatedAt ? new Date(conv.updatedAt) : new Date(),
                        updatedAt: conv.updatedAt ? new Date(conv.updatedAt) : new Date()
                    }
                })
            }

            if(Array.isArray(conv.messages) && conv.messages.length > 0) {
                for (const msg of conv.messages) {
                    // If client provided id, use it and skip if exists
                    if (msg.id) {
                        const exists = await prisma.message.findUnique({ where: { id: msg.id } });
                        if (exists) continue;

                        await prisma.message.create({
                            data: {
                                id: msg.id,
                                convoId: createdConversation.convoId,
                                senderType: msg.sender?.toUpperCase() === "USER" ? SenderType.USER : SenderType.ASSISTANT,
                                content: msg.content,
                                createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date()
                            }
                        })
                    } else {
                        // fallback dedupe by convoId + content + createdAt
                        const createdAt = msg.createdAt ? new Date(msg.createdAt) : undefined;
                        const found = createdAt ? await prisma.message.findFirst({ where: { convoId: createdConversation.convoId, content: msg.content, createdAt } }) : null;
                        if (found) continue;

                        await prisma.message.create({
                            data: {
                                convoId: createdConversation.convoId,
                                senderType: msg.sender?.toUpperCase() === "USER" ? SenderType.USER : SenderType.ASSISTANT,
                                content: msg.content,
                                createdAt: createdAt || new Date()
                            }
                        })
                    }
                }
            }
        }

        return NextResponse.json({ success: true, message: "Migration completed successfully" })
    } catch (error: any) {
        console.error("Migration endpoint error : ", error);
        return NextResponse.json({ error : error.message || "Failed to migrate data" }, { status : 500 });
    }
}
