export const runtime = 'nodejs';
import { NextResponse } from "next/server";
import { Ollama } from "ollama";
import { prisma } from "@/lib/prisma"

const ollama = new Ollama({ host: process.env.OLLAMA_HOST || "http://127.0.0.1:11434" })
// const ollama = new Ollama({ host: "http://127.0.0.1:11434" })

// The Python NLP service (api.py / uvicorn) runs locally alongside this
// Next.js app — no Docker networking involved, just a plain loopback call.
const NLP_SERVICE_URL = process.env.NLP_SERVICE_URL || "http://127.0.0.1:8000";
// const NLP_SERVICE_URL = "http://127.0.0.1:8000";

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

export async function POST(req: Request) {
    try {
        const { messages, convoId, lat, lon } = await req.json();

        const latestUserMessage = [...messages].reverse().find((m: any) => m.role === "user")?.content ?? "";

        // 1. Ask the local NLP pipeline (Phase_2 + nlp_layer via final.py)
        //    to turn the raw text into structured data (intent + cards).
        let structured: NlpQueryResult;
        try {
            structured = await queryNlpService(latestUserMessage, convoId, lat, lon);
        } catch (nlpError) {
            console.error("NLP service error:", nlpError);
            // Fail soft: let Ollama answer from the raw message alone rather
            // than failing the whole request if the NLP service is down.
            structured = { intent: "nlp_unavailable", raw_user_text: latestUserMessage, cards: [] };
        }

        // 2. Build the prompt Ollama sees: the structured JSON as context,
        //    plus the actual conversation so far.
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

        // 3. Local LLM turns the structured data into the final reply.
        const response = await ollama.chat({
            model: "llama3.2",
            messages: augmentedMessages,
            stream: false,
        });

        return NextResponse.json({ reply: response.message.content });
    } catch (error) {
        console.log("Chat pipeline error", error);
        return NextResponse.json(
            { error: "Failed to communicate with local model." },
            { status: 500 }
        );
    }
}