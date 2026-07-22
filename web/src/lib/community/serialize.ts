import type { PatternCardItem } from "@/components/community/PatternCard";
import type { FeedItem } from "./queries";

/** Server → client boundary: Dates become ISO strings. */
export function toCardItem(item: FeedItem): PatternCardItem {
  return {
    id: item.id,
    title: item.title,
    code: item.code,
    parentId: item.parentId,
    createdAt: item.createdAt.toISOString(),
    username: item.username,
    displayUsername: item.displayUsername,
  };
}
