-- Multi-day 予定: plan_date..plan_end_date inclusive (local dates). NULL = a single day.
-- Multi-day entries are all-day, so plan_start/plan_end stay NULL for them.
ALTER TABLE tasks ADD COLUMN plan_end_date TEXT;
