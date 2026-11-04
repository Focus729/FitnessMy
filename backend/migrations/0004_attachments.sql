-- Resumable immutable chunks; reservations also count abandoned unfinished uploads.
CREATE TABLE attachments (
  account_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  id TEXT NOT NULL,
  mime TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK(byte_length > 0 AND byte_length <= 16777216),
  digest TEXT NOT NULL,
  chunk_count INTEGER NOT NULL CHECK(chunk_count > 0 AND chunk_count <= 256),
  reserved_bytes INTEGER NOT NULL CHECK(reserved_bytes > 0),
  finalized INTEGER NOT NULL DEFAULT 0 CHECK(finalized IN (0,1)),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(account_id,profile_id,id),
  FOREIGN KEY(account_id,profile_id) REFERENCES profiles(account_id,id)
);
CREATE TABLE attachment_chunks (
  account_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  attachment_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL CHECK(chunk_index >= 0 AND chunk_index < 256),
  digest TEXT NOT NULL,
  data TEXT NOT NULL CHECK(length(data) <= 87384),
  PRIMARY KEY(account_id,profile_id,attachment_id,chunk_index),
  FOREIGN KEY(account_id,profile_id,attachment_id) REFERENCES attachments(account_id,profile_id,id)
);
CREATE TRIGGER attachment_reservation BEFORE INSERT ON attachments
WHEN NOT EXISTS(SELECT 1 FROM attachments WHERE account_id=NEW.account_id AND profile_id=NEW.profile_id AND id=NEW.id)
BEGIN
  SELECT CASE WHEN (SELECT COALESCE(SUM(reserved_bytes),0) FROM attachments) + NEW.reserved_bytes > 134217728
    THEN RAISE(ABORT,'attachment_quota') END;
END;
CREATE TRIGGER attachment_chunk_guard BEFORE INSERT ON attachment_chunks
WHEN NOT EXISTS(SELECT 1 FROM attachment_chunks WHERE account_id=NEW.account_id AND profile_id=NEW.profile_id
  AND attachment_id=NEW.attachment_id AND chunk_index=NEW.chunk_index)
BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM attachments WHERE account_id=NEW.account_id
    AND profile_id=NEW.profile_id AND id=NEW.attachment_id AND finalized=0 AND NEW.chunk_index<chunk_count)
    THEN RAISE(ABORT,'attachment_closed') END;
END;
