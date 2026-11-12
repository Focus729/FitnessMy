CREATE TABLE hermes_meal_bridges (
  account_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  PRIMARY KEY (account_id, profile_id),
  FOREIGN KEY (account_id, profile_id) REFERENCES profiles(account_id, id) ON DELETE CASCADE
);

CREATE TABLE hermes_meal_jobs (
  account_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('plan', 'review')),
  snapshot TEXT NOT NULL,
  payload TEXT,
  result TEXT,
  lease TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, profile_id, purpose),
  FOREIGN KEY (account_id, profile_id) REFERENCES hermes_meal_bridges(account_id, profile_id) ON DELETE CASCADE
);
