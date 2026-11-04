-- One bounded row per authenticated account and operation class.
CREATE TABLE sync_rate_limits (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK(operation IN ('read','write','attachment')),
  window_start INTEGER NOT NULL,
  requests INTEGER NOT NULL CHECK(requests > 0),
  PRIMARY KEY(account_id, operation)
);
