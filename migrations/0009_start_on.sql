-- 準備 tasks: 着手目安日 (when to start), optional. On that day a task still 未着手 moves to 進行中 by itself.
ALTER TABLE tasks ADD COLUMN start_on TEXT;
