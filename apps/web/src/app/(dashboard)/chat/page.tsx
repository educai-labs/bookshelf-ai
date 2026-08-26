"use client";

import { Suspense } from "react";

import { ChatPage } from "@/components/chat/ChatPage";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Ruta `/chat` (feature 017), dentro del route group protegido `(dashboard)`.
 * Envuelve `ChatPage` en `Suspense` porque usa `useSearchParams` (requiere un
 * límite durante el prerender estático de Next.js App Router).
 */
export default function ChatRoute() {
  return (
    <Suspense
      fallback={<Skeleton className="mx-auto h-[calc(100vh-8rem)] max-w-3xl" />}
    >
      <ChatPage />
    </Suspense>
  );
}
