-- Additive protocol foundation; not exposed through HTTP until reference validation is ready.
CREATE TABLE sync_receipts (
  account_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  commit_token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(account_id, profile_id, batch_id),
  FOREIGN KEY(account_id, profile_id) REFERENCES profiles(account_id, id)
);
CREATE TABLE sync_entities (
  account_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision > 0),
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  sequence INTEGER NOT NULL,
  PRIMARY KEY(account_id, profile_id, entity_type, entity_id),
  FOREIGN KEY(account_id, profile_id) REFERENCES profiles(account_id, id)
);
CREATE TABLE sync_changes (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  expected_revision INTEGER NOT NULL CHECK(expected_revision >= 0),
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  UNIQUE(account_id, profile_id, operation_id),
  FOREIGN KEY(account_id, profile_id, batch_id)
    REFERENCES sync_receipts(account_id, profile_id, batch_id)
);
CREATE INDEX sync_changes_pull ON sync_changes(account_id, profile_id, sequence);
CREATE INDEX sync_changes_receipt ON sync_changes(account_id, profile_id, batch_id);
CREATE INDEX sync_changes_snapshot ON sync_changes(account_id, profile_id, entity_type, entity_id, sequence);
CREATE UNIQUE INDEX sync_xp_dedupe ON sync_entities(account_id, profile_id, json_extract(payload, '$.dedupeKey'))
  WHERE entity_type = 'xpEvents';

CREATE TRIGGER sync_guard_revision BEFORE INSERT ON sync_changes BEGIN
  SELECT CASE WHEN NEW.expected_revision != COALESCE((
    SELECT revision FROM sync_entities WHERE account_id=NEW.account_id AND profile_id=NEW.profile_id
      AND entity_type=NEW.entity_type AND entity_id=NEW.entity_id
  ), 0) THEN RAISE(ABORT, 'sync_revision_conflict') END;
END;
CREATE TRIGGER sync_apply_change AFTER INSERT ON sync_changes BEGIN
  INSERT INTO sync_entities(account_id,profile_id,entity_type,entity_id,revision,payload,sequence)
  VALUES(NEW.account_id,NEW.profile_id,NEW.entity_type,NEW.entity_id,NEW.expected_revision+1,NEW.payload,NEW.sequence)
  ON CONFLICT(account_id,profile_id,entity_type,entity_id) DO UPDATE SET
    revision=excluded.revision,payload=excluded.payload,sequence=excluded.sequence;
END;
