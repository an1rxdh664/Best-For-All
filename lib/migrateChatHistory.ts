export async function syncLocalStorageToNeon(userId: string) {
    const localData = localStorage.getItem("chat_conversations");
    if(!localData) return;

    try {
        const parsedConversations = JSON.parse(localData);
        if(!Array.isArray(parsedConversations) || parsedConversations.length === 0) {
            localStorage.removeItem("chat_conversations");
            return;
        }

        const response = await fetch("/api/migrate-localStorage", {
            method: "POST",
            headers: { "Content-Type" : "application/json" },
            body: JSON.stringify({
                userId,
                localConversations: parsedConversations
            })
        })

        if(response.ok){
            localStorage.removeItem("chat_conversations");
            console.log("Local storage history successfully migrated to Neon DB")
        }
    } catch(error){
        console.error("Failed to migrate local storage to database: ", error);
    }
}