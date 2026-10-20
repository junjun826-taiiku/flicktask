-- イベント (大会・行事): groups preparation tasks, 予定 and the day-of plan.
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  place TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'blue',
  -- 当日の担当: JSON [{"name":"受付","color":"blue"}, ...] in display order
  roles TEXT NOT NULL DEFAULT '[]',
  -- 来年への申し送り
  note TEXT NOT NULL DEFAULT '',
  closed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  synced_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX events_sync ON events(user_id, synced_at);

-- tasks / 予定 belong to an event; day-of moves carry 担当 (JSON array of role names), 場所, 持ち物
ALTER TABLE tasks ADD COLUMN event_id TEXT;
ALTER TABLE tasks ADD COLUMN roles TEXT NOT NULL DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN place TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN items TEXT NOT NULL DEFAULT '';
CREATE INDEX tasks_event ON tasks(user_id, event_id);
