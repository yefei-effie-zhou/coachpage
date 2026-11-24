#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  COLLECTIONS_MIGRATION_VERSION,
  buildMigrationModel,
  canonicalJson,
  migrationPayloadChunkCount,
  migrationTargetRows,
  normalizeName,
  sha256,
} from './lib/collections-migration.mjs';

function parseArgs(argv) {
  const options = { markVerified: false };
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === '--mark-verified') options.markVerified = true;
    else if (value.startsWith('--')) {
      const key = value.slice(2).replace(/-([a-z])/g, (_, character) => character.toUpperCase());
      const next = argv[++index];
      if (!next || next.startsWith('--')) throw new Error(`${value} requires a value.`);
      options[key] = next;
    } else throw new Error(`Unknown argument: ${value}`);
  }
  return options;
}

function normalizedResource(row, tags, decks) {
  return {
    id: row.id,
    revision: row.revision,
    deleted: Boolean(row.deleted_at),
    name: row.name,
    url: row.url,
    type_id: row.type_id,
    language_id: row.language_id,
    legacy_language: row.legacy_language,
    legacy_topic: row.legacy_topic,
    description: row.description,
    emoji: row.emoji,
    status: row.status,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    tag_ids: tags,
    deck_ids: decks,
  };
}

function expectedResource(resource) {
  const { source_data, source_revision, deleted_at, ...values } = resource;
  return {
    id: values.id,
    revision: values.revision,
    deleted: values.deleted,
    name: values.name,
    url: values.url,
    type_id: values.type_id,
    language_id: values.language_id,
    legacy_language: values.legacy_language,
    legacy_topic: values.legacy_topic,
    description: values.description,
    emoji: values.emoji,
    status: values.status,
    completed_at: values.completed_at,
    created_at: values.created_at,
    updated_at: values.updated_at,
    tag_ids: [...values.tag_ids].sort(),
    deck_ids: [...values.deck_ids].sort(),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.snapshot || !options.database) {
    throw new Error('Usage: node scripts/verify-collections.mjs --snapshot sync-state.json --database cloned.sqlite [--report report.json] [--mark-verified]');
  }
  const payload = JSON.parse(await readFile(resolve(options.snapshot), 'utf8'));
  const model = buildMigrationModel(payload?.protocol === 2 ? payload : payload.state);
  const db = new DatabaseSync(resolve(options.database));
  db.exec('PRAGMA foreign_keys=ON;');
  const failures = [];
  const warnings = [];
  try {
    const meta = db.prepare('SELECT epoch,head FROM sync_v2_meta WHERE id=1').get();
    if (!meta || meta.epoch !== model.epoch || meta.head !== model.targetHead) {
      failures.push({ code: 'source_changed', expected: { epoch: model.epoch, head: model.targetHead }, actual: meta || null });
    }
    const runtime = db.prepare('SELECT * FROM collection_runtime WHERE id=1').get();
    if (!runtime || runtime.source_sync_epoch !== model.epoch || runtime.source_sync_head !== model.targetHead) {
      failures.push({ code: 'runtime_source_mismatch', actual: runtime || null });
    }
    const ledger = db.prepare('SELECT * FROM app_schema_migrations WHERE version=?').get(COLLECTIONS_MIGRATION_VERSION);
    if (!ledger || ledger.checksum !== model.checksum || !['applied', 'verified'].includes(ledger.state)) {
      failures.push({ code: 'migration_ledger_mismatch', actual: ledger || null });
    }

    const tagRows = db.prepare('SELECT resource_id,tag_id FROM collection_resource_tags WHERE deleted_at IS NULL ORDER BY resource_id,tag_id').all();
    const deckRows = db.prepare('SELECT resource_id,deck_id,position FROM collection_deck_items WHERE deleted_at IS NULL ORDER BY resource_id,position,deck_id').all();
    const tagsByResource = new Map();
    const decksByResource = new Map();
    for (const row of tagRows) {
      const list = tagsByResource.get(row.resource_id) || [];
      list.push(row.tag_id);
      tagsByResource.set(row.resource_id, list);
    }
    for (const row of deckRows) {
      const list = decksByResource.get(row.resource_id) || [];
      list.push(row.deck_id);
      decksByResource.set(row.resource_id, list);
    }
    const actualDeckPositions = deckRows.map(({ deck_id, resource_id, position }) =>
      ({ deck_id, resource_id, position }))
      .sort((a, b) => a.deck_id.localeCompare(b.deck_id) || a.resource_id.localeCompare(b.resource_id));
    const expectedDeckPositions = model.deckPositions.map(item => ({ ...item }))
      .sort((a, b) => a.deck_id.localeCompare(b.deck_id) || a.resource_id.localeCompare(b.resource_id));
    if (canonicalJson(actualDeckPositions) !== canonicalJson(expectedDeckPositions)) {
      failures.push({
        code: 'deck_position_mismatch',
        expected: expectedDeckPositions,
        actual: actualDeckPositions,
      });
    }
    const actualRows = db.prepare('SELECT * FROM collection_resources ORDER BY id').all();
    const actual = new Map(actualRows.map(row => [row.id, normalizedResource(
      row,
      [...(tagsByResource.get(row.id) || [])].sort(),
      [...(decksByResource.get(row.id) || [])].sort(),
    )]));
    const expected = new Map(model.resources.map(resource => [resource.id, expectedResource(resource)]));
    for (const [id, resource] of expected) {
      const row = actual.get(id);
      actual.delete(id);
      if (!row) failures.push({ code: 'missing_resource', resource_id: id });
      else if (canonicalJson(row) !== canonicalJson(resource)) {
        failures.push({ code: 'resource_mismatch', resource_id: id, expected: resource, actual: row });
      }
    }
    for (const id of actual.keys()) failures.push({ code: 'unexpected_resource', resource_id: id });

    const projectedRows = db.prepare(`SELECT entity,id,revision,deleted,data FROM sync_v2_objects
      WHERE entity IN ('resource','settings') ORDER BY entity,id`).all();
    const projected = new Map(projectedRows.map(row => [`${row.entity}\n${row.id}`, {
      entity: row.entity,
      id: row.id,
      revision: row.revision,
      deleted: Boolean(row.deleted),
      data: JSON.parse(row.data),
    }]));
    for (const object of model.compatibilityObjects) {
      const key = `${object.entity}\n${object.id}`;
      const row = projected.get(key);
      projected.delete(key);
      if (!row) failures.push({ code: 'missing_compatibility_projection', entity: object.entity, id: object.id });
      else if (canonicalJson(row) !== canonicalJson(object)) {
        failures.push({ code: 'compatibility_projection_mismatch', entity: object.entity, id: object.id });
      }
    }
    for (const row of projected.values()) {
      failures.push({ code: 'unexpected_compatibility_projection', entity: row.entity, id: row.id });
    }

    const taxonomy = [
      ['collection_languages', model.languages, item => ({
        id: item.id, name: item.name, normalized_name: normalizeName(item.name), revision: model.settingsRevision,
      })],
      ['collection_types', model.types, item => ({
        id: item.id, name: item.name, normalized_name: normalizeName(item.name), emoji: item.emoji || '', revision: model.settingsRevision,
      })],
      ['collection_tags', model.tags, item => ({
        id: item.id, name: item.name, normalized_name: normalizeName(item.name), emoji: item.emoji || '', revision: model.settingsRevision,
      })],
      ['collection_decks', model.decks, item => ({
        id: item.id, name: item.name, normalized_name: normalizeName(item.name), emoji: item.emoji || '',
        description: item.description || '', revision: model.settingsRevision,
        created_at: item.created_at, updated_at: item.updated_at,
      })],
    ];
    for (const [table, definitions, expectedRow] of taxonomy) {
      const columns = table === 'collection_languages'
        ? 'id,name,normalized_name,revision'
        : table === 'collection_decks'
          ? 'id,name,normalized_name,emoji,description,revision,created_at,updated_at'
          : 'id,name,normalized_name,emoji,revision';
      const actualDefinitions = db.prepare(`SELECT ${columns} FROM ${table} WHERE deleted_at IS NULL ORDER BY id`).all();
      const expectedDefinitions = definitions.map(expectedRow).sort((a, b) => a.id.localeCompare(b.id));
      if (canonicalJson(actualDefinitions) !== canonicalJson(expectedDefinitions)) {
        failures.push({ code: 'taxonomy_mismatch', table, expected: expectedDefinitions, actual: actualDefinitions });
      }
    }
    const actualGroups = db.prepare(
      'SELECT id,name,source_json FROM collection_legacy_groups WHERE active=1 ORDER BY id',
    ).all();
    const expectedGroups = model.groups.map(group => ({
      id: group.id, name: group.name, source_json: JSON.stringify(group),
    })).sort((a, b) => a.id.localeCompare(b.id));
    if (canonicalJson(actualGroups) !== canonicalJson(expectedGroups)) {
      failures.push({ code: 'legacy_group_mismatch', expected: expectedGroups, actual: actualGroups });
    }
    const actualTypeGroups = db.prepare(
      'SELECT type_id,group_id FROM collection_legacy_type_groups ORDER BY type_id,group_id',
    ).all();
    const expectedTypeGroups = [...model.legacyTypeGroups]
      .sort((a, b) => a.type_id.localeCompare(b.type_id) || a.group_id.localeCompare(b.group_id));
    if (canonicalJson(actualTypeGroups) !== canonicalJson(expectedTypeGroups)) {
      failures.push({ code: 'legacy_type_group_mismatch', expected: expectedTypeGroups, actual: actualTypeGroups });
    }

    const targetByKey = new Map(model.compatibilityObjects.map(object => [`${object.entity}\n${object.id}`, object]));
    const sourceRows = db.prepare(`SELECT entity,id,revision,deleted,data_sha256,source_chunk_count,
      target_revision,target_deleted,target_data_sha256,target_chunk_count
      FROM collection_migration_source_objects WHERE migration_version=? ORDER BY entity,id`)
      .all(COLLECTIONS_MIGRATION_VERSION);
    const payloadRows = db.prepare(`SELECT entity,id,payload,chunk_index,data_chunk
      FROM collection_migration_object_json_chunks WHERE migration_version=?
      ORDER BY entity,id,payload,chunk_index`).all(COLLECTIONS_MIGRATION_VERSION);
    const payloads = new Map();
    for (const row of payloadRows) {
      const key = `${row.entity}\n${row.id}\n${row.payload}`;
      const current = payloads.get(key) || { next: 0, value: '' };
      if (row.chunk_index !== current.next) {
        failures.push({ code: 'migration_payload_chunk_gap', entity: row.entity, id: row.id, payload: row.payload });
      }
      current.next = row.chunk_index + 1;
      current.value += row.data_chunk;
      payloads.set(key, current);
    }
    for (const row of sourceRows) {
      const sourcePayload = payloads.get(`${row.entity}\n${row.id}\nsource`);
      const targetPayload = payloads.get(`${row.entity}\n${row.id}\ntarget`);
      row.data_json = sourcePayload?.value ?? null;
      row.target_data_json = targetPayload?.value ?? null;
      if (sourcePayload?.next !== row.source_chunk_count || targetPayload?.next !== row.target_chunk_count) {
        failures.push({ code: 'migration_payload_chunk_count', entity: row.entity, id: row.id });
      }
    }
    const expectedSourceRows = model.sourceObjects.map(object => {
      const target = targetByKey.get(`${object.entity}\n${object.id}`);
      return {
        entity: object.entity,
        id: object.id,
        revision: object.revision,
        deleted: object.deleted ? 1 : 0,
        data_json: JSON.stringify(object.data),
        data_sha256: sha256(canonicalJson(object.data)),
        source_chunk_count: migrationPayloadChunkCount(JSON.stringify(object.data)),
        target_revision: target.revision,
        target_deleted: target.deleted ? 1 : 0,
        target_data_json: JSON.stringify(target.data),
        target_data_sha256: sha256(canonicalJson(target.data)),
        target_chunk_count: migrationPayloadChunkCount(JSON.stringify(target.data)),
      };
    }).sort((a, b) => a.entity.localeCompare(b.entity) || a.id.localeCompare(b.id));
    if (canonicalJson(sourceRows) !== canonicalJson(expectedSourceRows)) {
      failures.push({ code: 'migration_source_ledger_mismatch' });
    }
    const targetRows = db.prepare(`SELECT kind,primary_id,secondary_id,data_json
      FROM collection_migration_target_rows WHERE migration_version=?
      ORDER BY kind,primary_id,secondary_id`).all(COLLECTIONS_MIGRATION_VERSION);
    const expectedTargetRows = migrationTargetRows(model).map(item => ({
      kind: item.kind,
      primary_id: item.primaryId,
      secondary_id: item.secondaryId,
      data_json: JSON.stringify(item.data),
    }));
    if (canonicalJson(targetRows) !== canonicalJson(expectedTargetRows)) {
      failures.push({ code: 'migration_target_ledger_mismatch' });
    }
    const duplicateChecks = [
      ['collection_languages', 'language'],
      ['collection_types', 'type'],
      ['collection_tags', 'tag'],
      ['collection_decks', 'deck'],
    ];
    for (const [table, entity] of duplicateChecks) {
      const duplicates = db.prepare(`SELECT normalized_name,COUNT(*) AS count FROM ${table}
        WHERE deleted_at IS NULL GROUP BY normalized_name HAVING COUNT(*) > 1`).all();
      if (duplicates.length) failures.push({ code: 'duplicate_normalized_name', entity, rows: duplicates });
    }
    const foreignKeys = db.prepare('PRAGMA foreign_key_check').all();
    if (foreignKeys.length) failures.push({ code: 'foreign_key_check', rows: foreignKeys });
    const issueCounts = db.prepare(`SELECT severity,COUNT(*) AS count
      FROM collection_migration_issues WHERE migration_version=? GROUP BY severity`).all(COLLECTIONS_MIGRATION_VERSION);
    if (issueCounts.some(row => row.severity === 'error' && row.count > 0)) {
      failures.push({ code: 'migration_error_issues', rows: issueCounts });
    }
    warnings.push(...model.issues.filter(issue => issue.severity === 'warning'));

    const report = {
      ok: failures.length === 0,
      verified_at: new Date().toISOString(),
      migration_version: COLLECTIONS_MIGRATION_VERSION,
      checksum: model.checksum,
      source: { epoch: model.epoch, head: model.head, resources: model.resources.length },
      target: {
        resources: expected.size,
        resource_tags: tagRows.length,
        deck_items: deckRows.length,
      },
      failures,
      warnings,
    };
    if (options.report) await writeFile(resolve(options.report), JSON.stringify(report, null, 2) + '\n', 'utf8');
    if (!report.ok) {
      console.error(JSON.stringify(report, null, 2));
      process.exitCode = 1;
      return;
    }
    if (options.markVerified) {
      const result = db.prepare(`UPDATE app_schema_migrations
        SET state='verified',completed_at=?,report_json=?
        WHERE version=? AND checksum=? AND state IN ('applied','verified')`)
        .run(report.verified_at, JSON.stringify(report), COLLECTIONS_MIGRATION_VERSION, model.checksum);
      if (result.changes !== 1) throw new Error('Could not mark the migration verified.');
    }
    console.log(`Collections verification passed for ${model.resources.length} Resources.`);
    console.log(`${warnings.length} warning(s) remain in the manual-review report.`);
  } finally {
    db.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
