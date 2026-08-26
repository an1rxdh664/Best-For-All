import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function GET( req : Request ) {
    try {
        const session = await auth();
        
        if(!session || !session.user?.id) {
            return NextResponse.json({
                error: "Unauthorized"
            }, {
                status: 401
            })
        }

        const userId = session.user.id

        const conversations = await prisma.conversation.findMany({
            where: { userId },
            include: {
                message : {
                    orderBy : {createdAt: "asc"}
                }
            },
            orderBy : { updatedAt : "desc" }
        });

        return NextResponse.json({ conversations });

    } catch (e) {
        console.error("GET Converstations error : ", e)
        return NextResponse.json(
            { error : "Failed to fetch conversations"},
            { status : 500 }
        )
    }
}

export async function POST(req : Request) {
    try {
        const session = await auth();

        if(!session || !session.user?.id) {
            return NextResponse.json( { error : "Unauthorized" }, { status : 401 } )
        } 

        const userId = session.user.id;

        const newConversation = await prisma.conversation.create({
            data: {
                userId,
                title: "New Chat"
            },
            include : {
                message: true,
            },
        })

        return NextResponse.json({ conversation : newConversation });
    } catch (e) {
        console.error("POST Conversation error : ", e)
        return NextResponse.json(
            { error : "Failed to create conversation" },
            { status : 500 }
        )
    }
}