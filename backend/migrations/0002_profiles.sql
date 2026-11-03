CREATE TABLE profiles (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  id TEXT NOT NULL,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
  tint TEXT NOT NULL CHECK(tint IN ('a', 'b')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(account_id, id)
);
