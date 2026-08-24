"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatButtonProps {
  bookId: string;
}

export function ChatButton({ bookId }: ChatButtonProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleClick = () => {
    const params = new URLSearchParams(searchParams);
    params.set("book_id", bookId);
    router.push(`/chat?${params.toString()}`);
  };

  return (
    <Button onClick={handleClick} className="w-full gap-2 sm:w-auto">
      <MessageSquare className="size-4" />
      Chat con este libro
    </Button>
  );
}
