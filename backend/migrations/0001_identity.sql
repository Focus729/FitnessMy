CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  github_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE TABLE oauth_requests (
  state_hash TEXT PRIMARY KEY,
  verifier TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX oauth_requests_expiry ON oauth_requests(expires_at);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE auth_rate_limits (
  bucket TEXT PRIMARY KEY,
  requests INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
