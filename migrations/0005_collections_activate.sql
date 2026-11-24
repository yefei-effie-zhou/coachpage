PRAGMA defer_foreign_keys=ON;

INSERT INTO collection_migration_guards (migration_version,valid)
VALUES (1,CASE WHEN
  EXISTS (
    SELECT 1 FROM app_schema_migrations
    WHERE version=1 AND checksum='9816418c606c49421f12a7c6660abcaaf7774181e44060ba5c58ab9415c001f4'
      AND state IN ('applied','verified')
  )
  AND NOT EXISTS (
    SELECT 1 FROM collection_migration_issues
    WHERE migration_version=1 AND severity='error'
  )
  AND EXISTS (
    SELECT 1 FROM collection_runtime AS runtime
    JOIN sync_v2_meta AS meta ON meta.id=1
    WHERE runtime.id=1 AND runtime.mode IN ('shadow','active')
      AND runtime.source_sync_epoch=meta.epoch
      AND runtime.source_sync_head=meta.head
      AND meta.epoch='70d0ee17-ff63-48a8-96fe-73d9ef019423' AND meta.head=209
  )
  AND (SELECT COUNT(*) FROM collection_migration_source_objects
    WHERE migration_version=1) = (
      SELECT COUNT(*) FROM sync_v2_objects WHERE entity IN ('resource','settings')
    )
  AND NOT EXISTS (
    SELECT 1 FROM collection_migration_source_objects AS expected
    WHERE expected.migration_version=1 AND (
      expected.source_chunk_count<>(SELECT COUNT(*) FROM collection_migration_object_json_chunks AS chunks
    WHERE chunks.migration_version=expected.migration_version
      AND chunks.entity=expected.entity AND chunks.id=expected.id
      AND chunks.payload='source') OR
      expected.source_chunk_count<>COALESCE((SELECT MAX(chunk_index)+1
    FROM collection_migration_object_json_chunks AS chunks
    WHERE chunks.migration_version=expected.migration_version
      AND chunks.entity=expected.entity AND chunks.id=expected.id
      AND chunks.payload='source'),0) OR
      expected.target_chunk_count<>(SELECT COUNT(*) FROM collection_migration_object_json_chunks AS chunks
    WHERE chunks.migration_version=expected.migration_version
      AND chunks.entity=expected.entity AND chunks.id=expected.id
      AND chunks.payload='target') OR
      expected.target_chunk_count<>COALESCE((SELECT MAX(chunk_index)+1
    FROM collection_migration_object_json_chunks AS chunks
    WHERE chunks.migration_version=expected.migration_version
      AND chunks.entity=expected.entity AND chunks.id=expected.id
      AND chunks.payload='target'),0)
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM collection_migration_source_objects AS expected
    LEFT JOIN sync_v2_objects AS actual
      ON actual.entity=expected.entity AND actual.id=expected.id
    WHERE expected.migration_version=1 AND (
      actual.entity IS NULL OR actual.revision<>expected.target_revision OR
      actual.deleted<>expected.target_deleted OR actual.data IS NOT (SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks AS payload_chunks
    WHERE payload_chunks.migration_version=expected.migration_version
      AND payload_chunks.entity=expected.entity
      AND payload_chunks.id=expected.id
      AND payload_chunks.payload='target'
    ORDER BY payload_chunks.chunk_index
  ))
    )
  )
  AND ((SELECT COUNT(*) FROM collection_migration_target_rows
      WHERE migration_version=1 AND kind='language') = (
      SELECT COUNT(*) FROM collection_languages AS actual WHERE actual.deleted_at IS NULL
    )) AND (NOT EXISTS (
      SELECT 1 FROM collection_migration_target_rows AS expected
      LEFT JOIN collection_languages AS actual ON actual.id=expected.primary_id AND actual.deleted_at IS NULL
      WHERE expected.migration_version=1 AND expected.kind='language'
        AND (actual.rowid IS NULL OR actual.name IS NOT json_extract(expected.data_json,'$.name') OR actual.normalized_name IS NOT json_extract(expected.data_json,'$.normalized_name') OR actual.revision IS NOT json_extract(expected.data_json,'$.revision') OR actual.created_at IS NOT json_extract(expected.data_json,'$.created_at') OR actual.updated_at IS NOT json_extract(expected.data_json,'$.updated_at') OR actual.deleted_at IS NOT json_extract(expected.data_json,'$.deleted_at') OR actual.merged_into_id IS NOT json_extract(expected.data_json,'$.merged_into_id'))
    )) AND ((SELECT COUNT(*) FROM collection_migration_target_rows
      WHERE migration_version=1 AND kind='type') = (
      SELECT COUNT(*) FROM collection_types AS actual WHERE actual.deleted_at IS NULL
    )) AND (NOT EXISTS (
      SELECT 1 FROM collection_migration_target_rows AS expected
      LEFT JOIN collection_types AS actual ON actual.id=expected.primary_id AND actual.deleted_at IS NULL
      WHERE expected.migration_version=1 AND expected.kind='type'
        AND (actual.rowid IS NULL OR actual.name IS NOT json_extract(expected.data_json,'$.name') OR actual.normalized_name IS NOT json_extract(expected.data_json,'$.normalized_name') OR actual.emoji IS NOT json_extract(expected.data_json,'$.emoji') OR actual.revision IS NOT json_extract(expected.data_json,'$.revision') OR actual.created_at IS NOT json_extract(expected.data_json,'$.created_at') OR actual.updated_at IS NOT json_extract(expected.data_json,'$.updated_at') OR actual.deleted_at IS NOT json_extract(expected.data_json,'$.deleted_at') OR actual.merged_into_id IS NOT json_extract(expected.data_json,'$.merged_into_id'))
    )) AND ((SELECT COUNT(*) FROM collection_migration_target_rows
      WHERE migration_version=1 AND kind='tag') = (
      SELECT COUNT(*) FROM collection_tags AS actual WHERE actual.deleted_at IS NULL
    )) AND (NOT EXISTS (
      SELECT 1 FROM collection_migration_target_rows AS expected
      LEFT JOIN collection_tags AS actual ON actual.id=expected.primary_id AND actual.deleted_at IS NULL
      WHERE expected.migration_version=1 AND expected.kind='tag'
        AND (actual.rowid IS NULL OR actual.name IS NOT json_extract(expected.data_json,'$.name') OR actual.normalized_name IS NOT json_extract(expected.data_json,'$.normalized_name') OR actual.emoji IS NOT json_extract(expected.data_json,'$.emoji') OR actual.revision IS NOT json_extract(expected.data_json,'$.revision') OR actual.created_at IS NOT json_extract(expected.data_json,'$.created_at') OR actual.updated_at IS NOT json_extract(expected.data_json,'$.updated_at') OR actual.deleted_at IS NOT json_extract(expected.data_json,'$.deleted_at') OR actual.merged_into_id IS NOT json_extract(expected.data_json,'$.merged_into_id'))
    )) AND ((SELECT COUNT(*) FROM collection_migration_target_rows
      WHERE migration_version=1 AND kind='deck') = (
      SELECT COUNT(*) FROM collection_decks AS actual WHERE actual.deleted_at IS NULL
    )) AND (NOT EXISTS (
      SELECT 1 FROM collection_migration_target_rows AS expected
      LEFT JOIN collection_decks AS actual ON actual.id=expected.primary_id AND actual.deleted_at IS NULL
      WHERE expected.migration_version=1 AND expected.kind='deck'
        AND (actual.rowid IS NULL OR actual.name IS NOT json_extract(expected.data_json,'$.name') OR actual.normalized_name IS NOT json_extract(expected.data_json,'$.normalized_name') OR actual.emoji IS NOT json_extract(expected.data_json,'$.emoji') OR actual.description IS NOT json_extract(expected.data_json,'$.description') OR actual.revision IS NOT json_extract(expected.data_json,'$.revision') OR actual.created_at IS NOT json_extract(expected.data_json,'$.created_at') OR actual.updated_at IS NOT json_extract(expected.data_json,'$.updated_at') OR actual.deleted_at IS NOT json_extract(expected.data_json,'$.deleted_at') OR actual.merged_into_id IS NOT json_extract(expected.data_json,'$.merged_into_id'))
    )) AND ((SELECT COUNT(*) FROM collection_migration_target_rows
      WHERE migration_version=1 AND kind='resource') = (
      SELECT COUNT(*) FROM collection_resources AS actual WHERE 1=1
    )) AND (NOT EXISTS (
      SELECT 1 FROM collection_migration_target_rows AS expected
      LEFT JOIN collection_resources AS actual ON actual.id=expected.primary_id AND 1=1
      WHERE expected.migration_version=1 AND expected.kind='resource'
        AND (actual.rowid IS NULL OR actual.name IS NOT json_extract(expected.data_json,'$.name') OR actual.url IS NOT json_extract(expected.data_json,'$.url') OR actual.type_id IS NOT json_extract(expected.data_json,'$.type_id') OR actual.language_id IS NOT json_extract(expected.data_json,'$.language_id') OR actual.legacy_language IS NOT json_extract(expected.data_json,'$.legacy_language') OR actual.legacy_topic IS NOT json_extract(expected.data_json,'$.legacy_topic') OR actual.description IS NOT json_extract(expected.data_json,'$.description') OR actual.emoji IS NOT json_extract(expected.data_json,'$.emoji') OR actual.status IS NOT json_extract(expected.data_json,'$.status') OR actual.completed_at IS NOT json_extract(expected.data_json,'$.completed_at') OR actual.revision IS NOT json_extract(expected.data_json,'$.revision') OR actual.created_at IS NOT json_extract(expected.data_json,'$.created_at') OR actual.updated_at IS NOT json_extract(expected.data_json,'$.updated_at') OR actual.deleted_at IS NOT json_extract(expected.data_json,'$.deleted_at'))
    )) AND ((SELECT COUNT(*) FROM collection_migration_target_rows
      WHERE migration_version=1 AND kind='resource_tag') = (
      SELECT COUNT(*) FROM collection_resource_tags AS actual WHERE actual.deleted_at IS NULL
    )) AND (NOT EXISTS (
      SELECT 1 FROM collection_migration_target_rows AS expected
      LEFT JOIN collection_resource_tags AS actual ON actual.resource_id=expected.primary_id AND actual.tag_id=expected.secondary_id AND actual.deleted_at IS NULL
      WHERE expected.migration_version=1 AND expected.kind='resource_tag'
        AND (actual.rowid IS NULL OR actual.revision IS NOT json_extract(expected.data_json,'$.revision') OR actual.created_at IS NOT json_extract(expected.data_json,'$.created_at') OR actual.updated_at IS NOT json_extract(expected.data_json,'$.updated_at') OR actual.deleted_at IS NOT json_extract(expected.data_json,'$.deleted_at'))
    )) AND ((SELECT COUNT(*) FROM collection_migration_target_rows
      WHERE migration_version=1 AND kind='deck_item') = (
      SELECT COUNT(*) FROM collection_deck_items AS actual WHERE actual.deleted_at IS NULL
    )) AND (NOT EXISTS (
      SELECT 1 FROM collection_migration_target_rows AS expected
      LEFT JOIN collection_deck_items AS actual ON actual.deck_id=expected.primary_id AND actual.resource_id=expected.secondary_id AND actual.deleted_at IS NULL
      WHERE expected.migration_version=1 AND expected.kind='deck_item'
        AND (actual.rowid IS NULL OR actual.position IS NOT json_extract(expected.data_json,'$.position') OR actual.revision IS NOT json_extract(expected.data_json,'$.revision') OR actual.created_at IS NOT json_extract(expected.data_json,'$.created_at') OR actual.updated_at IS NOT json_extract(expected.data_json,'$.updated_at') OR actual.deleted_at IS NOT json_extract(expected.data_json,'$.deleted_at'))
    )) AND ((SELECT COUNT(*) FROM collection_migration_target_rows
      WHERE migration_version=1 AND kind='legacy_group') = (
      SELECT COUNT(*) FROM collection_legacy_groups AS actual WHERE actual.active=1
    )) AND (NOT EXISTS (
      SELECT 1 FROM collection_migration_target_rows AS expected
      LEFT JOIN collection_legacy_groups AS actual ON actual.id=expected.primary_id AND actual.active=1
      WHERE expected.migration_version=1 AND expected.kind='legacy_group'
        AND (actual.rowid IS NULL OR actual.name IS NOT json_extract(expected.data_json,'$.name') OR actual.source_json IS NOT json_extract(expected.data_json,'$.source_json') OR actual.active IS NOT json_extract(expected.data_json,'$.active') OR actual.created_at IS NOT json_extract(expected.data_json,'$.created_at') OR actual.updated_at IS NOT json_extract(expected.data_json,'$.updated_at'))
    )) AND ((SELECT COUNT(*) FROM collection_migration_target_rows
      WHERE migration_version=1 AND kind='legacy_type_group') = (
      SELECT COUNT(*) FROM collection_legacy_type_groups
    )) AND (NOT EXISTS (
      SELECT 1 FROM collection_migration_target_rows AS expected
      LEFT JOIN collection_legacy_type_groups AS actual
        ON actual.type_id=expected.primary_id AND actual.group_id=expected.secondary_id
      WHERE expected.migration_version=1 AND expected.kind='legacy_type_group'
        AND actual.type_id IS NULL
    ))
  THEN 1 ELSE 0 END)
ON CONFLICT(migration_version) DO UPDATE SET valid=excluded.valid;

UPDATE app_schema_migrations
SET state='verified',completed_at='2026-11-23T23:29:27.246Z'
WHERE version=1 AND checksum='9816418c606c49421f12a7c6660abcaaf7774181e44060ba5c58ab9415c001f4'
  AND state IN ('applied','verified');

UPDATE collection_runtime
SET mode='active',cutover_at=COALESCE(cutover_at,'2026-11-23T23:29:27.246Z'),updated_at='2026-11-23T23:29:27.246Z'
WHERE id=1 AND source_sync_epoch='70d0ee17-ff63-48a8-96fe-73d9ef019423' AND source_sync_head=209
  AND EXISTS (
    SELECT 1 FROM app_schema_migrations
    WHERE version=1 AND checksum='9816418c606c49421f12a7c6660abcaaf7774181e44060ba5c58ab9415c001f4' AND state='verified'
  );
