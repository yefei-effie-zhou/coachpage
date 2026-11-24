-- Collections migration ledger and shadow-runtime controls.
-- This migration is additive: it does not modify or delete legacy tables.

CREATE TABLE IF NOT EXISTS app_schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  state TEXT NOT NULL
    CHECK (state IN ('started', 'applied', 'verified', 'rolled_back')),
  source_epoch TEXT,
  source_head INTEGER,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  report_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS collection_runtime (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
  mode TEXT NOT NULL CHECK (mode IN ('shadow', 'active', 'retired')),
  source_sync_epoch TEXT,
  source_sync_head INTEGER,
  cutover_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_migration_source_objects (
  migration_version INTEGER NOT NULL,
  entity TEXT NOT NULL,
  id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  deleted INTEGER NOT NULL CHECK (deleted IN (0, 1)),
  data_sha256 TEXT NOT NULL,
  source_chunk_count INTEGER NOT NULL CHECK (source_chunk_count > 0),
  target_revision INTEGER NOT NULL CHECK (target_revision > 0),
  target_deleted INTEGER NOT NULL CHECK (target_deleted IN (0, 1)),
  target_data_sha256 TEXT NOT NULL,
  target_chunk_count INTEGER NOT NULL CHECK (target_chunk_count > 0),
  PRIMARY KEY (migration_version, entity, id)
);

-- Payloads are chunked into separate rows so a valid large settings object can
-- never place both source and target JSON over D1's per-row size limit.
CREATE TABLE IF NOT EXISTS collection_migration_object_json_chunks (
  migration_version INTEGER NOT NULL,
  entity TEXT NOT NULL,
  id TEXT NOT NULL,
  payload TEXT NOT NULL CHECK (payload IN ('source', 'target')),
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  data_chunk TEXT NOT NULL,
  PRIMARY KEY (migration_version, entity, id, payload, chunk_index),
  FOREIGN KEY (migration_version, entity, id)
    REFERENCES collection_migration_source_objects(migration_version, entity, id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS collection_migration_target_rows (
  migration_version INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'language', 'type', 'tag', 'deck', 'resource', 'resource_tag',
    'deck_item', 'legacy_group', 'legacy_type_group'
  )),
  primary_id TEXT NOT NULL,
  secondary_id TEXT NOT NULL DEFAULT '',
  data_json TEXT NOT NULL,
  PRIMARY KEY (migration_version, kind, primary_id, secondary_id)
);

CREATE TABLE IF NOT EXISTS collection_migration_guards (
  migration_version INTEGER PRIMARY KEY,
  valid INTEGER NOT NULL CHECK (valid = 1)
);

CREATE TABLE IF NOT EXISTS collection_migration_issues (
  migration_version INTEGER NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('warning', 'error')),
  code TEXT NOT NULL,
  entity TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  details_json TEXT NOT NULL,
  PRIMARY KEY (migration_version, code, entity, entity_id)
);

INSERT OR IGNORE INTO collection_runtime (
  id, schema_version, mode, updated_at
) VALUES (
  1, 1, 'retired', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
