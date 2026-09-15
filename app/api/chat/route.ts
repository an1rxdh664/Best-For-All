export const runtime = 'nodejs';
import { NextResponse } from "next/server";
import { Ollama } from "ollama";
import { prisma } from "@/lib/prisma"

// const ollama = new Ollama({ host: process.env.OLLAMA_HOST || "http://127.0.0.1:11434" })
// const ollamaModel = process.env.OLLAMA_MODEL || "llama3.2:1b";
const ollamaModel = "llama3.2:1b";
const ollama = new Ollama({ host: "http://127.0.0.1:11434" })

// The Python NLP service (api.py / uvicorn) runs locally alongside this
// Next.js app — no Docker networking involved, just a plain loopback call.
// const NLP_SERVICE_URL = process.env.NLP_SERVICE_URL || "http://127.0.0.1:8000";
const NLP_SERVICE_URL = "http://127.0.0.1:8000";

interface NlpQueryResult {
    intent: string;
    message?: string;
    query?: string;
    dish?: string | null;
    user_city?: string | null;
    cards?: unknown[];
    raw_user_text?: string;
}

async function queryNlpService(userText: string, sessionId?: string, lat?: number, lon?: number): Promise<NlpQueryResult> {
    const res = await fetch(`${NLP_SERVICE_URL}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // lat/lon can be threaded through from the frontend later if you
        // want location-aware search instead of a fixed default.
        body: JSON.stringify({ query: userText, session_id: sessionId, lat, lon}),
    });

    if (!res.ok) {
        throw new Error(`NLP service responded with ${res.status}`);
    }

    return res.json();
}

async function generateTitle(userText: string, structured: NlpQueryResult): Promise<string | null> {
    try {
        const titlePrompt = {
            role: "system",
            content:
                "You generate short chat titles. Read the user's message below and reply with ONLY a " +
                "3-6 word title summarizing it. No quotes, no punctuation at the end, no prefix like " +
                "'Title:', just the plain title text.\n\n" +
                `User message: "${userText}"\n` +
                (structured?.dish ? `Dish mentioned: ${structured.dish}\n` : "") +
                (structured?.user_city ? `City mentioned: ${structured.user_city}\n` : ""),
        };

        const response = await ollama.chat({
            model: ollamaModel,
            messages: [titlePrompt, { role: "user", content: "Generate the title now." }],
            stream: false,
        });

        let title = response.message.content?.trim() ?? "";

        title = title.replace(/^title\s*:\s*/i, "").trim();
        title = title.replace(/^["']|["']$/g, "").trim();
        title = title.split("\n")[0].trim();

        if (!title || title.length < 2 || title.length > 60) {
            return null;
        }

        return title;
    } catch (e) {
        console.error("Title generation failed:", e);
        return null;
    }
}

export async function POST(req: Request) {
    try {
        const { messages, convoId, lat, lon, isFirstMessage } = await req.json();

        const latestUserMessage = [...messages].reverse().find((m: any) => m.role === "user")?.content ?? "";

        let structured: NlpQueryResult;
        try {
            structured = await queryNlpService(latestUserMessage, convoId, lat, lon);
        } catch (nlpError) {
            console.error("NLP service error:", nlpError);
            structured = { intent: "nlp_unavailable", raw_user_text: latestUserMessage, cards: [] };
        }

        const systemPrompt = {
            role: "system",
            content:
                "You are a helpful assistant. Use the structured data below (if present) " +
                "to answer the user's question in a natural, friendly way. Do not mention " +
                "JSON, fields, or that you were given structured data — just answer naturally. " +
                "If intent is 'nlp_unavailable' or cards is empty, just answer conversationally.\n\n" +
                `Structured data:\n${JSON.stringify(structured)}`,
        };

        const augmentedMessages = [systemPrompt, ...messages];

        const response = await ollama.chat({
            model: ollamaModel,
            messages: augmentedMessages,
            stream: false,
        });

        let title: string | null = null;
        if (isFirstMessage) {
            title = await generateTitle(latestUserMessage, structured);
        }

        return NextResponse.json({ reply: response.message.content, title });
    } catch (error) {
        console.log("Chat pipeline error", error);
        return NextResponse.json(
            { error: "Failed to communicate with local model." },
            { status: 500 }
        );
    }
}