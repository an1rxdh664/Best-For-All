import { useState, useEffect } from "react";
import { Conversation, Message } from "@/types/chat";

export function useChat() {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);

    // Loading from localStorage
    useEffect(() => {
        const saved = localStorage.getItem("chat_conversations");
        if (saved) {
            try {
                const parsed: Conversation[] = JSON.parse(saved);
                setConversations(parsed);
                if (parsed.length > 0) setActiveId(parsed[0].id);
            } catch (e) {
                console.error("Failed to parse stored conversations", e);
            }
        }
    }, []);

    // Syncing changes with localStorage
    useEffect(() => {
        if (conversations.length > 0) {
            localStorage.setItem("chat_conversations", JSON.stringify(conversations));
        }
    }, [conversations]);

    const activeConversation = conversations.find((c) => c.id === activeId);

    const createNewChat = () => {
        const newChat: Conversation = {
            id: crypto.randomUUID(),
            title: "New Chat",
            updatedAt: new Date().toISOString(),
            messages: [],
        };
        setConversations((prev) => [newChat, ...prev]);
        setActiveId(newChat.id);
    };

    const selectChat = (id: string) => {
        setActiveId(id);
    };

    const sendMessage = (content: string) => {
        if (!content.trim()) return;

        let targetId = activeId;
        let updatedConversations = [...conversations];

        // Auto creating chat if no chat is open
        if (!targetId) {
            const newChat: Conversation = {
                id: crypto.randomUUID(),
                title: content.slice(0, 20) + "...",
                updatedAt: new Date().toISOString(),
                messages: [],
            };
            updatedConversations = [newChat, ...updatedConversations];
            targetId = newChat.id;
            setActiveId(targetId);
        }

        const userMsg: Message = {
            id: crypto.randomUUID(),
            sender: "user",
            content : content,
            createdAt: new Date().toISOString(),
        };

        setConversations(
            updatedConversations.map((c) => {
                if (c.id === targetId) {
                    const isFirstMessage = c.messages.length === 0;
                    return {
                        ...c,
                        title: isFirstMessage ? content.slice(0, 25) + "..." : c.title,
                        updatedAt: new Date().toISOString(),
                        messages: [...c.messages, userMsg],
                    };
                }
                return c;
            })
        );
    };

    return {
        conversations,
        activeId,
        activeConversation,
        createNewChat,
        selectChat,
        sendMessage,
    };
}