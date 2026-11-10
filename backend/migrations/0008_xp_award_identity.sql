-- Keep distinct device record IDs for receipts and CAS. A shared award key
-- may recur only with the same award meaning, including after deletion.
DROP INDEX sync_xp_dedupe;
CREATE INDEX sync_xp_award_key ON sync_entities(account_id, profile_id, json_extract(payload, '$.dedupeKey'))
  WHERE entity_type = 'xpEvents';

CREATE TRIGGER sync_guard_xp_award BEFORE INSERT ON sync_changes
WHEN NEW.entity_type = 'xpEvents' BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM sync_entities
    WHERE account_id=NEW.account_id AND profile_id=NEW.profile_id
      AND entity_type='xpEvents' AND entity_id=NEW.entity_id
      AND json_extract(payload, '$.dedupeKey') != json_extract(NEW.payload, '$.dedupeKey')
  ) OR EXISTS (
    SELECT 1 FROM sync_entities
    WHERE account_id=NEW.account_id AND profile_id=NEW.profile_id
      AND entity_type='xpEvents'
      AND json_extract(payload, '$.dedupeKey') = json_extract(NEW.payload, '$.dedupeKey')
      AND (
        json_extract(payload, '$.amount') != json_extract(NEW.payload, '$.amount')
        OR json_extract(payload, '$.reason') != json_extract(NEW.payload, '$.reason')
        OR json_extract(payload, '$.date') != json_extract(NEW.payload, '$.date')
      )
  ) THEN RAISE(ABORT, 'sync_xp_award_conflict') END;
END;
