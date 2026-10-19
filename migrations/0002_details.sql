-- Memo, deadline and scheduled time block. Dates/times are the user's local wall-clock values
-- ('YYYY-MM-DD' / 'HH:MM') so a 17:00 deadline stays 17:00 regardless of the device's time zone.
ALTER TABLE tasks ADD COLUMN note TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN due_date TEXT;
ALTER TABLE tasks ADD COLUMN due_time TEXT;
ALTER TABLE tasks ADD COLUMN plan_date TEXT;
ALTER TABLE tasks ADD COLUMN plan_start TEXT;
ALTER TABLE tasks ADD COLUMN plan_end TEXT;
