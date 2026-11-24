-- Canonical Collections schema.
-- Resources are never deleted through taxonomy/deck cascades. Application
-- operations use deleted_at tombstones; physical cascades only clean join rows
-- during an explicit administrative purge of a Resource, Tag, or Deck.

CREATE TABLE IF NOT EXISTS collection_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL CHECK (normalized_name <> ''),
  emoji TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL CHECK (revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  merged_into_id TEXT REFERENCES collection_types(id) ON DELETE RESTRICT,
  CHECK (merged_into_id IS NULL OR merged_into_id <> id)
);

CREATE TABLE IF NOT EXISTS collection_languages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL CHECK (normalized_name <> ''),
  revision INTEGER NOT NULL CHECK (revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  merged_into_id TEXT REFERENCES collection_languages(id) ON DELETE RESTRICT,
  CHECK (merged_into_id IS NULL OR merged_into_id <> id)
);

CREATE TABLE IF NOT EXISTS collection_tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL CHECK (normalized_name <> ''),
  emoji TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL CHECK (revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  merged_into_id TEXT REFERENCES collection_tags(id) ON DELETE RESTRICT,
  CHECK (merged_into_id IS NULL OR merged_into_id <> id)
);

CREATE TABLE IF NOT EXISTS collection_decks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL CHECK (normalized_name <> ''),
  emoji TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL CHECK (revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  merged_into_id TEXT REFERENCES collection_decks(id) ON DELETE RESTRICT,
  CHECK (merged_into_id IS NULL OR merged_into_id <> id)
);

CREATE TABLE IF NOT EXISTS collection_resources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 300),
  url TEXT NOT NULL DEFAULT '' CHECK (length(url) <= 2000),
  type_id TEXT NOT NULL REFERENCES collection_types(id) ON DELETE RESTRICT,
  language_id TEXT REFERENCES collection_languages(id) ON DELETE RESTRICT,
  legacy_language TEXT NOT NULL DEFAULT '',
  legacy_topic TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  emoji TEXT NOT NULL DEFAULT '' CHECK (length(emoji) <= 32),
  status TEXT NOT NULL CHECK (status IN ('backlog', 'active', 'completed')),
  completed_at TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL CHECK (revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS collection_resource_tags (
  resource_id TEXT NOT NULL REFERENCES collection_resources(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES collection_tags(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (resource_id, tag_id)
);

CREATE TABLE IF NOT EXISTS collection_deck_items (
  deck_id TEXT NOT NULL REFERENCES collection_decks(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL REFERENCES collection_resources(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  revision INTEGER NOT NULL CHECK (revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (deck_id, resource_id)
);

CREATE TABLE IF NOT EXISTS collection_legacy_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_legacy_type_groups (
  type_id TEXT NOT NULL REFERENCES collection_types(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES collection_legacy_groups(id) ON DELETE RESTRICT,
  PRIMARY KEY (type_id, group_id)
);
