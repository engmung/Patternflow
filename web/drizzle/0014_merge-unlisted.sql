-- Visibility drops from three states to two: shared, or not.
--
-- `unlisted` (off the wall, openable by link) was doing two jobs and answering
-- the picker's only real question — "so who can see this?" — with a shrug.
-- Everything that was unlisted becomes private, which is the stricter of the
-- two readings and therefore the safe direction to fold in: nothing becomes
-- MORE visible than its author left it.
--
-- Known consequence, accepted: a shared deck may only carry public patterns
-- now, so any unlisted pattern sitting in someone's public deck becomes a gap
-- in it ("made private by its author"). That gap is the honest rendering —
-- the deck's arrangement is still its author's work, and the pattern is still
-- its own author's.
--
-- No schema change: `visibility` is free text and the application is the thing
-- that narrowed. This migration only moves the rows.

UPDATE `patterns` SET `visibility` = 'private' WHERE `visibility` = 'unlisted';--> statement-breakpoint
UPDATE `decks` SET `visibility` = 'private' WHERE `visibility` = 'unlisted';
