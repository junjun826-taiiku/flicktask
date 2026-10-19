-- 'task' = a to-do with a status (shown in the task list and the calendar)
-- 'event' = calendar-only schedule entry (shown in the schedule list and the calendar, never in the task list)
ALTER TABLE tasks ADD COLUMN kind TEXT NOT NULL DEFAULT 'task' CHECK (kind IN ('task', 'event'));
