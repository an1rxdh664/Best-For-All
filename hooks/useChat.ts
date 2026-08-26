import { useState, useEffect } from "react";
import { Conversation, Message } from "@/types/chat";
import { useSession } from "next-auth/react";

export function useChat() {
    const { data: session, status } = useSession();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);

    // Loading from server when authenticated, otherwise from localStorage
    useEffect(() => {
        async function load() {
            if (status === "authenticated" && session?.user?.id) {
                try {
                    const res = await fetch("/api/conversations");
                    const data = await res.json();
                    if (data?.conversations) {
                        const mapped = data.conversations.map((c: any) => ({
                            id: c.convoId,
                            title: c.title,
                            updatedAt: c.updatedAt,
                            messages: (c.message || []).map((m: any) => ({
                                id: m.id,
                                sender: m.senderType === "USER" ? "user" : "assistant",
                                content: m.content,
                                createdAt: m.createdAt,
                            })),
                        }));
                        setConversations(mapped);
                        if (mapped.length > 0) setActiveId(mapped[0].id);
                        return;
                    }
                } catch (e) {
                    console.error("Failed to load conversations from server:", e);
                }
            }

            // fallback to localStorage
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
        }

        load();
    }, [status, session]);

    // Syncing changes with localStorage for offline fallback
    useEffect(() => {
        if (conversations.length > 0) {
            try {
                localStorage.setItem("chat_conversations", JSON.stringify(conversations));
            } catch (e) {
                console.error("Failed to write conversations to localStorage", e);
            }
        }
    }, [conversations]);

    const activeConversation = conversations.find((c) => c.id === activeId);

    const createNewChat = async () => {
        // If authenticated, create on server so we get a stable convoId
        if (status === "authenticated" && session?.user?.id) {
            try {
                const res = await fetch("/api/conversations", { method: "POST" });
                const data = await res.json();
                if (data?.conversation) {
                    const serverConv = data.conversation;
                    const newChat: Conversation = {
                        id: serverConv.convoId,
                        title: serverConv.title,
                        updatedAt: serverConv.updatedAt,
                        messages: [],
                    };
                    setConversations((prev) => [newChat, ...prev]);
                    setActiveId(newChat.id);
                    return;
                }
            } catch (e) {
                console.error("Failed to create server conversation:", e);
            }
        }

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

    const deleteChat = async (id : string) => {
        // delete on server if authenticated
        if (status === "authenticated" && session?.user?.id) {
            try {
                await fetch(`/api/conversations/${id}`, { method: "DELETE" });
            } catch (e) {
                console.error("Failed to delete conversation on server", e);
            }
        }

        setConversations((prev) => {
            const remaining = prev.filter((c) => c.id !== id);

            if(activeId === id) {
                setActiveId(remaining.length > 0 ? remaining[0].id : null);
            }

            return remaining;
        })
    }

    const renameChat = async (id: string, title: string) => {
        const trimmed = title.trim();
        if(!trimmed) return;

        // persist rename server-side if authenticated
        if (status === "authenticated" && session?.user?.id) {
            try {
                await fetch(`/api/conversations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: trimmed }) });
            } catch (e) {
                console.error("Failed to rename conversation on server", e);
            }
        }

        setConversations((prev) => prev.map((c) => (
                c.id === id ? {...c, title: trimmed} : c
            ))
        )
    }

    const sendMessage = async (content: string) => {
        if (!content.trim()) return;

        let targetId = activeId;
        let updatedConversations = [...conversations];

        // Auto creating chat if no chat is open
        if (!targetId) {
            // If authenticated create on server
            if (status === "authenticated" && session?.user?.id) {
                try {
                    const res = await fetch("/api/conversations", { method: "POST" });
                    const data = await res.json();
                    if (data?.conversation) {
                        const serverConv = data.conversation;
                        const newChat: Conversation = {
                            id: serverConv.convoId,
                            title: content.slice(0, 20) + "...",
                            updatedAt: serverConv.updatedAt,
                            messages: [],
                        };
                        updatedConversations = [newChat, ...updatedConversations];
                        targetId = newChat.id;
                        setActiveId(targetId);
                    }
                } catch (e) {
                    console.error("Failed to create server conversation:", e);
                }
            }

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
        
        const restrucutredPayload = [{ role: "user", content: userMsg.content }];

        // persist user message if authenticated
        if (status === "authenticated" && session?.user?.id) {
            try {
                await fetch("/api/messages", {
                    method: "POST",
                    headers: { "Content-Type" : "application/json" },
                    body: JSON.stringify({ convoId: targetId, clientId: userMsg.id, sender: "user", content: userMsg.content, createdAt: userMsg.createdAt })
                });
            } catch (e) {
                console.error("Failed to persist user message:", e);
            }
        }

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type" : "application/json" },
                body: JSON.stringify({ messages : restrucutredPayload })
            });

            const data = await res.json();

            const assistantMsg : Message = {
                id: crypto.randomUUID(),
                sender: "assistant",
                content : data.reply || "Sorry i could not generate a response.",
                createdAt : new Date().toISOString(),
            };

            setConversations((prev) => prev.map((c) => {
                if(c.id === targetId) {
                    return {
                        ...c,
                        updatedAt: new Date().toISOString(),
                        messages: [...c.messages, assistantMsg]
                    };
                }
                return c;
            }))

            // persist assistant message if authenticated
            if (status === "authenticated" && session?.user?.id) {
                try {
                    await fetch("/api/messages", {
                        method: "POST",
                        headers: { "Content-Type" : "application/json" },
                        body: JSON.stringify({ convoId: targetId, clientId: assistantMsg.id, sender: "assistant", content: assistantMsg.content, createdAt: assistantMsg.createdAt })
                    });
                } catch (e) {
                    console.error("Failed to persist assistant message:", e);
                }
            }
        } catch (e) {
            console.error("Error communicating to the ollama API route : ", e);
        }
    };


    return {
        conversations,
        activeId,
        activeConversation,
        createNewChat,
        selectChat,
        deleteChat,
        renameChat,
        sendMessage,
    };
}
