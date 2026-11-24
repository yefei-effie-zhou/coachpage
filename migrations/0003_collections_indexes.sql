-- Active-name uniqueness and query indexes used by the Collections workbench.

CREATE UNIQUE INDEX IF NOT EXISTS collection_types_active_name
  ON collection_types(normalized_name)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS collection_languages_active_name
  ON collection_languages(normalized_name)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS collection_tags_active_name
  ON collection_tags(normalized_name)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS collection_decks_active_name
  ON collection_decks(normalized_name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS collection_resources_type_status
  ON collection_resources(type_id, status, updated_at);

CREATE INDEX IF NOT EXISTS collection_resources_language_status
  ON collection_resources(language_id, status, updated_at);

CREATE INDEX IF NOT EXISTS collection_resources_status_updated
  ON collection_resources(status, updated_at);

CREATE INDEX IF NOT EXISTS collection_resources_updated
  ON collection_resources(updated_at);

CREATE INDEX IF NOT EXISTS collection_resource_tags_by_tag
  ON collection_resource_tags(tag_id, resource_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS collection_resource_tags_by_resource
  ON collection_resource_tags(resource_id, tag_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS collection_deck_items_by_resource
  ON collection_deck_items(resource_id, deck_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS collection_deck_items_by_deck
  ON collection_deck_items(deck_id, position, resource_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS collection_deck_items_active_position
  ON collection_deck_items(deck_id, position)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS collection_migration_issues_by_severity
  ON collection_migration_issues(migration_version, severity, code);
