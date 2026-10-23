-- LINE bot: which LINE group (or 1:1 chat) reads which account's tasks.
-- target_id = LINE groupId / roomId / userId; linked by sending 「連携 123456」 with a code made in the app.
CREATE TABLE line_links (
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  -- 1 = gets the Monday-morning 今週のまとめ (pushes count against the LINE monthly quota)
  weekly INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX line_links_user ON line_links(user_id);

-- one-time link codes (6 digits, 10 minutes)
CREATE TABLE line_codes (
  code TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
