ALTER TABLE attachments ADD COLUMN upload_revision INTEGER NOT NULL DEFAULT 0 CHECK(upload_revision>=0);
