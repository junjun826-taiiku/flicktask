-- New design: イベント担当 (people who run the preparation), 予定 tags, and who each task is assigned to.
-- イベント担当: JSON [{"name":"佐藤","color":"blue"}, ...] in display order; any number of people
ALTER TABLE events ADD COLUMN members TEXT NOT NULL DEFAULT '[]';
-- custom 予定 tags beyond the built-in ones (MTG / 読み合わせ / 幹部読み合わせ): JSON ["打ち上げ", ...]
ALTER TABLE events ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
-- 準備 tasks: JSON array of member names; 予定: one tag name ('' = none)
ALTER TABLE tasks ADD COLUMN assignees TEXT NOT NULL DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN tag TEXT NOT NULL DEFAULT '';
