export interface Message {
    id: string;
    sender : "user" | "assistant";
    content : string;
    createdAt: string;
}

export interface Conversation {
    id: string;
    title: string;
    updatedAt: string;
    messages: Message[];
}