-- Server-clock change stamp for incremental sync ("what changed since my cursor?").
-- updated_at is the client's clock (used for last-write-wins); synced_at is the server's.
ALTER TABLE tasks ADD COLUMN synced_at INTEGER NOT NULL DEFAULT 0;
UPDATE tasks SET synced_at = updated_at;
CREATE INDEX tasks_sync ON tasks(user_id, synced_at);
