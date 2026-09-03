// ── Community queries ──────────────────────────────────────────────────────
// Every read the community makes, one file per domain under ./queries/;
// this is the barrel, and it re-exports exactly what the single file used
// to, so nothing that imports from here had to change.

export { newId, FEED_SORTS, parseFeedSort, countFeed, listFeed, listFeatured, listFeaturedIds, getPattern, getPatternStub, listComments, likedPatternIds, hasLiked, countLikes, listPatternsByUser, listPatternPorts, listPatternPerformances, getPerformanceStub, getPortStub } from "./queries/patterns";
export type { FeedSort, FeedItem } from "./queries/patterns";
export { listPublicDecks, listDecksWithPattern, listDecksByUser, getDeck, getDeckStub, listDeckItems, countPublicDecksByUser, getPatternsForDeck } from "./queries/decks";
export type { DeckListItem, DeckItem } from "./queries/decks";
export { countPosts, listPosts, listTerritories, listTerritoriesForAdmin, getTerritoryByCode, listTerritoryPins, listPinsByUser, listPresence, listAtlasPins, countUnmoved, listRecentThreads, listAttachments, getAttachment, countAttachments, attachmentBytesByUser, attachmentBytesTotal, getPost, getPostStub, getPostCommentStub, listPostComments } from "./queries/workshop";
export type { PostListItem, TerritoryListItem, TerritoryPin, PresencePerson, RecentThread, AttachmentView } from "./queries/workshop";
export { listReports, countOpenReports, getCommentStub, reportTarget } from "./queries/moderation";
export type { ReportRow } from "./queries/moderation";
export { getUserByUsername } from "./queries/users";
export { countUnreadNotifications, listNotifications, markNotificationsRead } from "./queries/notifications";
export type { NotificationRow } from "./queries/notifications";
