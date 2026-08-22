// app/chat/page.tsx
"use client";

import { useSession } from "next-auth/react";
import { useChat } from "@/hooks/useChat";
import Sidebar from "@/components/chat/Sidebar";
import ChatCanvas from "@/components/chat/ChatCanvas";

export default function ChatPage() {
    const { status } = useSession();
    const {
        conversations,
        activeId,
        activeConversation,
        createNewChat,
        selectChat,
        sendMessage,
    } = useChat();

    if (status === "loading") {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                Loading session...
            </div>
        );
    }

    return (
        <div className="flex h-screen w-full bg-white p-3">
            <div className="flex h-full w-full overflow-hidden rounded-2xl bg-white">
                <Sidebar
                conversations={conversations}
                activeId={activeId}
                onSelect={selectChat}
                onNewChat={createNewChat}
                />
                <ChatCanvas
                conversation={activeConversation}
                onSendMessage={sendMessage}
                />
            </div>
        </div>
    );
}