"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { syncLocalStorageToNeon } from "@/lib/migrateChatHistory";

export function AuthSyncListener() {
  const { data: session, status } = useSession();

  useEffect(() => {
    // Only run when authenticated and user ID is available
    if (status === "authenticated" && session?.user?.id) {
      syncLocalStorageToNeon(session.user.id);
    }
  }, [status, session]);

  return null; // This component renders nothing UI-wise
}