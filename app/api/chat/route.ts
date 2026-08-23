import { NextResponse } from "next/server";
import { Ollama } from "ollama";

const ollama = new Ollama({ host: "http://127.0.0.1:11434" })

export async function POST(req : Request) {
    try {
        const { messages } = await req.json();

        const response = ollama.chat({
            model: "llama3.2",
            messages: messages,
            stream: false
        });

        return NextResponse.json({ reply: (await response).message.content })
    } catch (error) {
        console.log("Ollama API Error", error);
        return NextResponse.json(
            {error: "Failed to communitcate with local model."},
            {status : 500}
        )
    }
}