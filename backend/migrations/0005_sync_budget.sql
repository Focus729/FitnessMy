-- Conservative logical storage budget; this is not a substitute for physical D1 size monitoring.
-- Separate attachment reservations are capped at 128 MiB; sync payloads/index allowances at 96 MiB.
CREATE TABLE sync_budget (
  id INTEGER PRIMARY KEY CHECK(id=1),
  used_bytes INTEGER NOT NULL CHECK(used_bytes>=0 AND used_bytes<=100663296)
);
INSERT INTO sync_budget VALUES(1,
  (SELECT COALESCE(SUM(length(CAST(payload AS BLOB))+1024),0) FROM sync_entities) +
  (SELECT COALESCE(SUM(length(CAST(payload AS BLOB))+1024),0) FROM sync_changes) +
  (SELECT COUNT(*)*4096 FROM sync_receipts)
);
CREATE TRIGGER sync_budget_guard BEFORE UPDATE ON sync_budget
WHEN NEW.used_bytes>100663296 BEGIN SELECT RAISE(ABORT,'sync_storage_quota'); END;
CREATE TRIGGER sync_receipt_budget_add AFTER INSERT ON sync_receipts BEGIN
  UPDATE sync_budget SET used_bytes=used_bytes+4096 WHERE id=1;
END;
CREATE TRIGGER sync_receipt_budget_remove AFTER DELETE ON sync_receipts BEGIN
  UPDATE sync_budget SET used_bytes=used_bytes-4096 WHERE id=1;
END;
CREATE TRIGGER sync_change_budget_add AFTER INSERT ON sync_changes BEGIN
  UPDATE sync_budget SET used_bytes=used_bytes+length(CAST(NEW.payload AS BLOB))+1024 WHERE id=1;
END;
CREATE TRIGGER sync_change_budget_remove AFTER DELETE ON sync_changes BEGIN
  UPDATE sync_budget SET used_bytes=used_bytes-length(CAST(OLD.payload AS BLOB))-1024 WHERE id=1;
END;
CREATE TRIGGER sync_entity_budget_add AFTER INSERT ON sync_entities BEGIN
  UPDATE sync_budget SET used_bytes=used_bytes+length(CAST(NEW.payload AS BLOB))+1024 WHERE id=1;
END;
CREATE TRIGGER sync_entity_budget_edit AFTER UPDATE OF payload ON sync_entities BEGIN
  UPDATE sync_budget SET used_bytes=used_bytes+length(CAST(NEW.payload AS BLOB))-length(CAST(OLD.payload AS BLOB)) WHERE id=1;
END;
CREATE TRIGGER sync_entity_budget_remove AFTER DELETE ON sync_entities BEGIN
  UPDATE sync_budget SET used_bytes=used_bytes-length(CAST(OLD.payload AS BLOB))-1024 WHERE id=1;
END;
