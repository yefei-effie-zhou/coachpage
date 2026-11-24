import { createHash } from 'node:crypto';

export const COLLECTIONS_MIGRATION_VERSION = 1;

export const DEFAULT_COLLECTION_TYPES = Object.freeze([
  { id: 'movie_series', name: '影视', emoji: '🎬' },
  { id: 'book', name: '书籍', emoji: '📚' },
  { id: 'article', name: '文章', emoji: '📝' },
  { id: 'audio', name: '音频', emoji: '🎧' },
  { id: 'course', name: '课程', emoji: '🎓' },
  { id: 'website', name: '网站 / 工具', emoji: '🌐' },
  { id: 'project', name: '项目资料', emoji: '📁' },
  { id: 'game', name: '游戏', emoji: '🎮' },
  { id: 'other', name: '其他', emoji: '📌' },
]);

const LEGACY_TYPE_MAPPINGS = Object.freeze({
  project: { names: ['项目资料'], target: 'project' },
  course: { names: ['课程'], target: 'course' },
  website: { names: ['学习网站'], target: 'website' },
  movie_series: { names: ['电影 / 剧集', '电影/剧集'], target: 'movie_series' },
  book: { names: ['书籍'], target: 'book' },
  variety: { names: ['综艺'], target: 'movie_series', tag: '综艺' },
});

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function normalizeName(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
}

export function sql(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Cannot serialize a non-finite number to SQL.');
    return String(value);
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

const D1_SAFE_STATEMENT_BYTES = 95_000;
const D1_JSON_FRAGMENT_BYTES = 48_000;

function utf8Length(value) {
  return Buffer.byteLength(String(value), 'utf8');
}

function sqlTextChunks(value, maxBytes = D1_JSON_FRAGMENT_BYTES) {
  const chunks = [];
  let chunk = '';
  let bytes = 0;
  for (const character of String(value)) {
    const escaped = character === "'" ? "''" : character;
    const size = utf8Length(escaped);
    if (chunk && bytes + size > maxBytes) {
      chunks.push(chunk);
      chunk = '';
      bytes = 0;
    }
    chunk += character;
    bytes += size;
  }
  if (chunk || !chunks.length) chunks.push(chunk);
  return chunks;
}

export function migrationPayloadChunkCount(value) {
  return sqlTextChunks(value).length;
}

function splitSqlStatements(source) {
  const statements = [];
  let start = 0;
  let quoted = false;
  for (let index = 0; index < source.length; index++) {
    if (source[index] === "'") {
      if (quoted && source[index + 1] === "'") {
        index++;
        continue;
      }
      quoted = !quoted;
    } else if (source[index] === ';' && !quoted) {
      const statement = source.slice(start, index + 1).trim();
      if (statement) statements.push(statement);
      start = index + 1;
    }
  }
  const remainder = source.slice(start).trim();
  if (remainder) statements.push(remainder);
  return statements;
}

function assertD1StatementSizes(source) {
  for (const statement of splitSqlStatements(source)) {
    const bytes = utf8Length(statement);
    if (bytes > D1_SAFE_STATEMENT_BYTES) {
      throw new Error(`Generated D1 statement is ${bytes} bytes; the safe limit is ${D1_SAFE_STATEMENT_BYTES}.`);
    }
  }
}

function iso(value, fallback) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function requireSnapshot(snapshot) {
  if (!snapshot || snapshot.protocol !== 2 || typeof snapshot.epoch !== 'string' ||
      !Number.isSafeInteger(snapshot.head) || !Array.isArray(snapshot.objects)) {
    throw new TypeError('Snapshot must be a sync-v2 state response.');
  }
  const keys = new Set();
  for (const object of snapshot.objects) {
    if (!object || typeof object.entity !== 'string' || typeof object.id !== 'string' || !object.id ||
        !Number.isSafeInteger(object.revision) || object.revision < 1 ||
        !object.data || typeof object.data !== 'object' || Array.isArray(object.data)) {
      throw new TypeError('Snapshot contains an invalid sync object.');
    }
    const key = `${object.entity}\n${object.id}`;
    if (keys.has(key)) throw new TypeError(`Snapshot contains duplicate object ${object.entity}/${object.id}.`);
    keys.add(key);
  }
  return snapshot;
}

function definitionList(settings, key) {
  const list = settings?.[key] ?? [];
  if (!Array.isArray(list)) throw new TypeError(`settings.${key} must be an array.`);
  return list.map(item => {
    if (!item || typeof item.id !== 'string' || !item.id || typeof item.name !== 'string' || !item.name.trim()) {
      throw new TypeError(`settings.${key} contains an invalid definition.`);
    }
    return { ...item, name: item.name.trim() };
  });
}

function uniqueDefinitions(definitions, key, issues) {
  const ids = new Set();
  const names = new Map();
  for (const item of definitions) {
    const normalized = normalizeName(item.name);
    if (ids.has(item.id)) {
      issues.push({ severity: 'error', code: 'duplicate_id', entity: key, entity_id: item.id, details: { name: item.name } });
    }
    if (names.has(normalized) && names.get(normalized) !== item.id) {
      issues.push({
        severity: 'error',
        code: 'duplicate_normalized_name',
        entity: key,
        entity_id: item.id,
        details: { name: item.name, collides_with: names.get(normalized) },
      });
    }
    ids.add(item.id);
    names.set(normalized, item.id);
  }
}

function legacyTypeMapping(type) {
  const mapping = LEGACY_TYPE_MAPPINGS[type.id];
  if (!mapping) return null;
  return mapping.names.some(name => normalizeName(name) === normalizeName(type.name)) ? mapping : null;
}

function ambiguousLegacyTag(type) {
  const normalized = normalizeName(type.name);
  if (normalized === 'magpie') return 'magpie';
  if (normalized === normalizeName('五夏')) return '五夏';
  return '';
}

function ensureDefaultTypes(types) {
  const logicalIds = new Map();
  for (const definition of DEFAULT_COLLECTION_TYPES) {
    const byId = types.find(type => type.id === definition.id);
    if (byId && normalizeName(byId.name) === normalizeName(definition.name)) {
      logicalIds.set(definition.id, byId.id);
      continue;
    }
    const byName = types.find(type => normalizeName(type.name) === normalizeName(definition.name));
    if (byName) {
      logicalIds.set(definition.id, byName.id);
      continue;
    }
    let id = definition.id;
    let suffix = 1;
    while (types.some(type => type.id === id)) id = `type_default_${definition.id}_${suffix++}`;
    types.push({ ...definition, id });
    logicalIds.set(definition.id, id);
  }
  return logicalIds;
}

function ensureMigrationTag(tags, byId, name) {
  const normalized = normalizeName(name);
  const existing = tags.find(tag => normalizeName(tag.name) === normalized);
  if (existing) return existing.id;
  let id = `tag_migrated_${sha256(normalized).slice(0, 24)}`;
  let suffix = 1;
  while (byId.has(id)) id = `tag_migrated_${sha256(normalized).slice(0, 20)}_${suffix++}`;
  const tag = { id, name, emoji: '🏷️' };
  tags.push(tag);
  byId.set(id, tag);
  return id;
}

export function buildMigrationModel(input) {
  const snapshot = requireSnapshot(structuredClone(input));
  const sourceTimes = snapshot.objects.flatMap(object => [
    Date.parse(object?.data?.created_at),
    Date.parse(object?.data?.updated_at),
  ]).filter(Number.isFinite);
  // Migration artifacts must be reproducible for the same source snapshot.
  const generatedAt = new Date(sourceTimes.length ? Math.max(...sourceTimes) : 0).toISOString();
  const settingsObject = snapshot.objects.find(object =>
    object.entity === 'settings' && object.id === 'resources' && !object.deleted);
  if (!settingsObject?.data) throw new TypeError('Snapshot does not contain the active Resources settings object.');

  const issues = [];
  if (snapshot.raw !== true) {
    issues.push({
      severity: 'error',
      code: 'raw_snapshot_required',
      entity: 'snapshot',
      entity_id: '',
      details: { action: 'download_api_sync_raw_state' },
    });
  }
  const settings = settingsObject.data;
  const languages = definitionList(settings, 'languages');
  const groups = definitionList(settings, 'groups');
  const sourceTypes = definitionList(settings, 'types');
  const tags = definitionList(settings, 'tags');
  const decks = definitionList(settings, 'decks').map(deck => {
    const createdAt = iso(deck.created_at, generatedAt);
    return {
      description: '',
      ...deck,
      created_at: createdAt,
      updated_at: iso(deck.updated_at, createdAt),
    };
  });
  for (const [key, definitions] of Object.entries({ languages, groups, types: sourceTypes, tags, decks })) {
    uniqueDefinitions(definitions, key, issues);
  }

  const taxonomyMappings = [];
  const types = [];
  const sourceTypeMappings = new Map();
  for (const sourceType of sourceTypes) {
    const mapping = legacyTypeMapping(sourceType);
    if (!mapping) {
      types.push(sourceType);
      sourceTypeMappings.set(sourceType.id, {
        targetLogicalId: sourceType.id,
        tagName: ambiguousLegacyTag(sourceType),
        mapped: false,
      });
      continue;
    }
    if (mapping.target === sourceType.id) {
      const canonical = DEFAULT_COLLECTION_TYPES.find(type => type.id === mapping.target);
      types.push({
        ...sourceType,
        name: canonical.name,
        emoji: sourceType.emoji || canonical.emoji,
      });
    }
    sourceTypeMappings.set(sourceType.id, {
      targetLogicalId: mapping.target,
      tagName: mapping.tag || '',
      mapped: true,
    });
  }
  const defaultTypeIds = ensureDefaultTypes(types);
  for (const sourceType of sourceTypes) {
    const mapping = sourceTypeMappings.get(sourceType.id);
    const targetId = mapping.mapped
      ? defaultTypeIds.get(mapping.targetLogicalId) || mapping.targetLogicalId
      : sourceType.id;
    mapping.targetId = targetId;
    const target = types.find(type => type.id === targetId);
    taxonomyMappings.push({
      source_type_id: sourceType.id,
      source_name: sourceType.name,
      target_type_id: targetId,
      target_name: target?.name || sourceType.name,
      added_tag: mapping.tagName || null,
      action: mapping.tagName || sourceType.id !== targetId || sourceType.name !== target?.name
        ? 'mapped'
        : 'preserved',
    });
  }

  const byId = {
    languages: new Map(languages.map(item => [item.id, item])),
    types: new Map(types.map(item => [item.id, item])),
    tags: new Map(tags.map(item => [item.id, item])),
    decks: new Map(decks.map(item => [item.id, item])),
  };
  const resources = snapshot.objects.filter(object => object.entity === 'resource').map(object => {
    const data = { ...object.data, id: object.id };
    const fallbackTime = generatedAt;
    const createdAt = iso(data.created_at, fallbackTime);
    const updatedAt = iso(data.updated_at, createdAt);
    const sourceTypeId = String(data.type || 'other');
    const typeMapping = sourceTypeMappings.get(sourceTypeId);
    let typeId = typeMapping?.targetId || sourceTypeId;
    if (!byId.types.has(typeId)) {
      const preserved = { id: typeId, name: typeId, emoji: '' };
      types.push(preserved);
      byId.types.set(typeId, preserved);
      issues.push({
        severity: 'warning',
        code: 'missing_type_preserved',
        entity: 'resource',
        entity_id: object.id,
        details: { type_id: typeId },
      });
    }
    let languageId = data.language_id ?? null;
    let legacyLanguage = String(data.legacy_language || '');
    if (languageId !== null && !byId.languages.has(languageId)) {
      legacyLanguage ||= String(data.language || languageId);
      issues.push({
        severity: 'warning',
        code: 'missing_language_unassigned',
        entity: 'resource',
        entity_id: object.id,
        details: { language_id: languageId, preserved_as: legacyLanguage },
      });
      languageId = null;
    }
    const displayedLanguage = String(data.language || '').trim();
    if (languageId === null && !legacyLanguage && displayedLanguage &&
        normalizeName(displayedLanguage) !== normalizeName('不限语言')) {
      const matches = languages.filter(language => normalizeName(language.name) === normalizeName(displayedLanguage));
      if (matches.length === 1) {
        languageId = matches[0].id;
      } else {
        legacyLanguage = displayedLanguage;
        issues.push({
          severity: 'warning',
          code: 'display_language_preserved',
          entity: 'resource',
          entity_id: object.id,
          details: { language: displayedLanguage, reason: matches.length ? 'ambiguous_name' : 'unknown_name' },
        });
      }
    }
    const tagIds = [...new Set(Array.isArray(data.tag_ids) ? data.tag_ids.map(String) : [])];
    if (typeMapping?.tagName) {
      const migrationTagId = ensureMigrationTag(tags, byId.tags, typeMapping.tagName);
      if (!tagIds.includes(migrationTagId)) tagIds.push(migrationTagId);
      issues.push({
        severity: 'warning',
        code: 'resource_taxonomy_review_required',
        entity: 'resource',
        entity_id: object.id,
        details: { source_type_id: sourceTypeId, preserved_type_id: typeId, added_tag: typeMapping.tagName },
      });
    }
    const deckIds = [...new Set(Array.isArray(data.deck_ids) ? data.deck_ids.map(String) : [])];
    for (const [key, ids, list] of [['tags', tagIds, tags], ['decks', deckIds, decks]]) {
      for (const id of ids) {
        if (byId[key].has(id)) continue;
        const preserved = { id, name: id, emoji: '', ...(key === 'decks' ? { description: '' } : {}) };
        list.push(preserved);
        byId[key].set(id, preserved);
        issues.push({
          severity: 'warning',
          code: `missing_${key.slice(0, -1)}_preserved`,
          entity: 'resource',
          entity_id: object.id,
          details: { id },
        });
      }
    }
    return {
      id: object.id,
      source_revision: object.revision,
      revision: object.revision,
      deleted: Boolean(object.deleted),
      name: String(data.name || '').trim(),
      url: String(data.url || ''),
      type_id: typeId,
      language_id: languageId,
      legacy_language: legacyLanguage,
      legacy_topic: String(data.topic || ''),
      description: String(data.description || ''),
      emoji: String(data.emoji || ''),
      status: ['backlog', 'active', 'completed'].includes(data.status) ? data.status : 'backlog',
      completed_at: data.completed_at ? iso(data.completed_at, '') : '',
      created_at: createdAt,
      updated_at: updatedAt,
      deleted_at: object.deleted ? updatedAt : null,
      tag_ids: tagIds,
      deck_ids: deckIds,
      source_data: object.data,
    };
  });

  for (const type of types) {
    if (['magpie', normalizeName('五夏')].includes(normalizeName(type.name)) ||
        /^(ai|家居)(?:\b|[-_])/iu.test(type.name)) {
      issues.push({
        severity: 'warning',
        code: 'taxonomy_review_required',
        entity: 'type',
        entity_id: type.id,
        details: {
          name: type.name,
          action: ambiguousLegacyTag(type)
            ? 'preserved_with_exact_name_tag'
            : 'preserved_without_guessing',
        },
      });
    }
  }

  const settingsRevision = snapshot.head + 1;
  const revisionByResource = new Map(
    [...resources]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((resource, index) => [resource.id, snapshot.head + index + 2]),
  );
  const targetHead = snapshot.head + resources.length + 1;
  if (!Number.isSafeInteger(settingsRevision) || !Number.isSafeInteger(targetHead)) {
    throw new RangeError('Snapshot head is too large to allocate migration revisions safely.');
  }
  for (const resource of resources) resource.revision = revisionByResource.get(resource.id);

  const deckPositions = [];
  for (const deck of decks) {
    resources.filter(resource => resource.deck_ids.includes(deck.id))
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
      .forEach((resource, position) => deckPositions.push({ deck_id: deck.id, resource_id: resource.id, position }));
  }

  const legacyTypeGroups = [];
  const seenTypeGroups = new Set();
  for (const sourceType of sourceTypes) {
    if (!sourceType.group || !groups.some(group => group.id === sourceType.group)) continue;
    const typeId = sourceTypeMappings.get(sourceType.id)?.targetId;
    if (!typeId || !byId.types.has(typeId)) continue;
    const key = `${typeId}\u0000${sourceType.group}`;
    if (seenTypeGroups.has(key)) continue;
    seenTypeGroups.add(key);
    legacyTypeGroups.push({ type_id: typeId, group_id: sourceType.group });
  }
  const compatibilityGroupByType = new Map(
    [...legacyTypeGroups]
      .sort((a, b) => a.type_id.localeCompare(b.type_id) || a.group_id.localeCompare(b.group_id))
      .map(relation => [relation.type_id, relation.group_id]),
  );
  const compatibilitySettings = {
    ...settings,
    id: 'resources',
    schema_version: Math.max(4, Number(settings.schema_version) || 0),
    languages: languages.map(({ id, name }) => ({ id, name })),
    groups,
    types: types.map(({ id, name, emoji = '' }) => ({
      id,
      name,
      emoji,
      ...(compatibilityGroupByType.has(id) ? { group: compatibilityGroupByType.get(id) } : {}),
    })),
    tags: tags.map(({ id, name, emoji = '' }) => ({ id, name, emoji })),
    decks: decks.map(({ id, name, emoji = '', description = '', created_at, updated_at }) => ({
      id, name, emoji, description, created_at, updated_at,
    })),
  };
  const compatibilityObjects = [
    {
      entity: 'settings',
      id: 'resources',
      revision: settingsRevision,
      deleted: false,
      data: compatibilitySettings,
    },
    ...resources.map(resource => ({
      entity: 'resource',
      id: resource.id,
      revision: resource.revision,
      deleted: resource.deleted,
      data: compatibilityResourceData(resource, languages),
    })),
  ];

  const checksumInput = {
    generated_at: generatedAt,
    epoch: snapshot.epoch,
    source_head: snapshot.head,
    target_head: targetHead,
    source_settings_revision: settingsObject.revision,
    settings_revision: settingsRevision,
    languages,
    groups,
    types,
    tags,
    decks,
    resources,
    deckPositions,
    legacyTypeGroups,
    taxonomyMappings,
    compatibilitySettings,
    compatibilityObjects,
  };
  const checksum = sha256(canonicalJson(checksumInput));
  return {
    migrationVersion: COLLECTIONS_MIGRATION_VERSION,
    generatedAt,
    epoch: snapshot.epoch,
    head: snapshot.head,
    targetHead,
    checksum,
    sourceSettingsRevision: settingsObject.revision,
    settingsRevision,
    settings,
    languages,
    groups,
    types,
    tags,
    decks,
    resources,
    deckPositions,
    legacyTypeGroups,
    taxonomyMappings,
    compatibilitySettings,
    compatibilityObjects,
    sourceObjects: snapshot.objects.filter(object => ['settings', 'resource'].includes(object.entity)),
    issues,
  };
}

function upsertDefinition(table, item, revision, timestamp, includeDescription = false) {
  const createdAt = includeDescription ? item.created_at || timestamp : timestamp;
  const updatedAt = includeDescription ? item.updated_at || createdAt : timestamp;
  const columns = includeDescription
    ? 'id,name,normalized_name,emoji,description,revision,created_at,updated_at,deleted_at,merged_into_id'
    : `id,name,normalized_name${table === 'collection_languages' ? '' : ',emoji'},revision,created_at,updated_at,deleted_at,merged_into_id`;
  const values = includeDescription
    ? [item.id, item.name, normalizeName(item.name), item.emoji || '', item.description || '', revision, createdAt, updatedAt, null, null]
    : [item.id, item.name, normalizeName(item.name), ...(table === 'collection_languages' ? [] : [item.emoji || '']), revision, timestamp, timestamp, null, null];
  const updates = includeDescription
    ? 'name=excluded.name,normalized_name=excluded.normalized_name,emoji=excluded.emoji,description=excluded.description,updated_at=excluded.updated_at'
    : `name=excluded.name,normalized_name=excluded.normalized_name${table === 'collection_languages' ? '' : ',emoji=excluded.emoji'},updated_at=excluded.updated_at`;
  return `INSERT INTO ${table} (${columns}) VALUES (${values.map(sql).join(',')})
ON CONFLICT(id) DO UPDATE SET ${updates},revision=excluded.revision,deleted_at=NULL,merged_into_id=NULL
WHERE ${table}.revision < excluded.revision;`;
}

function compatibilityResourceData(resource, languages) {
  const languageName = languages.find(language => language.id === resource.language_id)?.name;
  return {
    ...resource.source_data,
    id: resource.id,
    name: resource.name,
    url: resource.url,
    type: resource.type_id,
    language_id: resource.language_id,
    language: languageName || resource.legacy_language || '不限语言',
    ...(resource.legacy_language ? { legacy_language: resource.legacy_language } : {}),
    topic: resource.legacy_topic,
    description: resource.description,
    emoji: resource.emoji,
    tag_ids: resource.tag_ids,
    deck_ids: resource.deck_ids,
    status: resource.status,
    completed_at: resource.completed_at,
    created_at: resource.created_at,
    updated_at: resource.updated_at,
  };
}

export function migrationTargetRows(model) {
  const values = [];
  const add = (kind, primaryId, data, secondaryId = '') => {
    values.push({ kind, primaryId, secondaryId, data });
  };
  for (const item of model.languages) {
    add('language', item.id, {
      name: item.name,
      normalized_name: normalizeName(item.name),
      revision: model.settingsRevision,
      created_at: model.generatedAt,
      updated_at: model.generatedAt,
      deleted_at: null,
      merged_into_id: null,
    });
  }
  for (const [kind, items] of [['type', model.types], ['tag', model.tags]]) {
    for (const item of items) {
      add(kind, item.id, {
        name: item.name,
        normalized_name: normalizeName(item.name),
        emoji: item.emoji || '',
        revision: model.settingsRevision,
        created_at: model.generatedAt,
        updated_at: model.generatedAt,
        deleted_at: null,
        merged_into_id: null,
      });
    }
  }
  for (const item of model.decks) {
    add('deck', item.id, {
      name: item.name,
      normalized_name: normalizeName(item.name),
      emoji: item.emoji || '',
      description: item.description || '',
      revision: model.settingsRevision,
      created_at: item.created_at || model.generatedAt,
      updated_at: item.updated_at || item.created_at || model.generatedAt,
      deleted_at: null,
      merged_into_id: null,
    });
  }
  for (const resource of model.resources) {
    add('resource', resource.id, {
      name: resource.name,
      url: resource.url,
      type_id: resource.type_id,
      language_id: resource.language_id,
      legacy_language: resource.legacy_language,
      legacy_topic: resource.legacy_topic,
      description: resource.description,
      emoji: resource.emoji,
      status: resource.status,
      completed_at: resource.completed_at,
      revision: resource.revision,
      created_at: resource.created_at,
      updated_at: resource.updated_at,
      deleted_at: resource.deleted_at,
    });
    for (const tagId of resource.tag_ids) {
      add('resource_tag', resource.id, {
        revision: resource.revision,
        created_at: resource.created_at,
        updated_at: resource.updated_at,
        deleted_at: null,
      }, tagId);
    }
  }
  const resourcesById = new Map(model.resources.map(resource => [resource.id, resource]));
  for (const item of model.deckPositions) {
    const resource = resourcesById.get(item.resource_id);
    add('deck_item', item.deck_id, {
      position: item.position,
      revision: resource.revision,
      created_at: resource.created_at,
      updated_at: resource.updated_at,
      deleted_at: null,
    }, item.resource_id);
  }
  for (const group of model.groups) {
    add('legacy_group', group.id, {
      name: group.name,
      source_json: JSON.stringify(group),
      active: 1,
      created_at: model.generatedAt,
      updated_at: model.generatedAt,
    });
  }
  for (const relation of model.legacyTypeGroups) {
    add('legacy_type_group', relation.type_id, {}, relation.group_id);
  }
  return values.sort((a, b) =>
    a.kind.localeCompare(b.kind) || a.primaryId.localeCompare(b.primaryId) || a.secondaryId.localeCompare(b.secondaryId));
}

function appendJsonColumnStatements(statements, {
  table,
  column,
  value,
  where,
}) {
  for (const chunk of sqlTextChunks(value)) {
    statements.push(`UPDATE ${table} SET ${column}=${column}||${sql(chunk)} WHERE ${where};`);
  }
}

function appendObjectPayloadStatements(statements, {
  migrationVersion,
  entity,
  id,
  payload,
  chunks,
}) {
  for (const [chunkIndex, chunk] of chunks.entries()) {
    statements.push(`INSERT INTO collection_migration_object_json_chunks
      (migration_version,entity,id,payload,chunk_index,data_chunk)
      VALUES (${migrationVersion},${sql(entity)},${sql(id)},${sql(payload)},${chunkIndex},${sql(chunk)});`);
  }
}

function correlatedObjectPayloadSql(payload, alias = 'expected') {
  return `(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks AS payload_chunks
    WHERE payload_chunks.migration_version=${alias}.migration_version
      AND payload_chunks.entity=${alias}.entity
      AND payload_chunks.id=${alias}.id
      AND payload_chunks.payload=${sql(payload)}
    ORDER BY payload_chunks.chunk_index
  ))`;
}

function fixedObjectPayloadSql(migrationVersion, entity, id, payload) {
  return `(SELECT group_concat(data_chunk,'') FROM (
    SELECT data_chunk
    FROM collection_migration_object_json_chunks
    WHERE migration_version=${migrationVersion}
      AND entity=${sql(entity)}
      AND id=${sql(id)}
      AND payload=${sql(payload)}
    ORDER BY chunk_index
  ))`;
}

function objectPayloadsCompleteSql(migrationVersion) {
  const count = payload => `(SELECT COUNT(*) FROM collection_migration_object_json_chunks AS chunks
    WHERE chunks.migration_version=expected.migration_version
      AND chunks.entity=expected.entity AND chunks.id=expected.id
      AND chunks.payload=${sql(payload)})`;
  const span = payload => `COALESCE((SELECT MAX(chunk_index)+1
    FROM collection_migration_object_json_chunks AS chunks
    WHERE chunks.migration_version=expected.migration_version
      AND chunks.entity=expected.entity AND chunks.id=expected.id
      AND chunks.payload=${sql(payload)}),0)`;
  return `NOT EXISTS (
    SELECT 1 FROM collection_migration_source_objects AS expected
    WHERE expected.migration_version=${migrationVersion} AND (
      expected.source_chunk_count<>${count('source')} OR
      expected.source_chunk_count<>${span('source')} OR
      expected.target_chunk_count<>${count('target')} OR
      expected.target_chunk_count<>${span('target')}
    )
  )`;
}

function targetRowsMatchSql(migrationVersion) {
  const scalarMismatch = (columns, actual = 'actual', expected = 'expected') =>
    columns.map(column => `${actual}.${column} IS NOT json_extract(${expected}.data_json,'$.${column}')`).join(' OR ');
  const checks = [
    ['language', 'collection_languages', 'actual.id=expected.primary_id', 'actual.deleted_at IS NULL',
      ['name', 'normalized_name', 'revision', 'created_at', 'updated_at', 'deleted_at', 'merged_into_id']],
    ['type', 'collection_types', 'actual.id=expected.primary_id', 'actual.deleted_at IS NULL',
      ['name', 'normalized_name', 'emoji', 'revision', 'created_at', 'updated_at', 'deleted_at', 'merged_into_id']],
    ['tag', 'collection_tags', 'actual.id=expected.primary_id', 'actual.deleted_at IS NULL',
      ['name', 'normalized_name', 'emoji', 'revision', 'created_at', 'updated_at', 'deleted_at', 'merged_into_id']],
    ['deck', 'collection_decks', 'actual.id=expected.primary_id', 'actual.deleted_at IS NULL',
      ['name', 'normalized_name', 'emoji', 'description', 'revision', 'created_at', 'updated_at', 'deleted_at', 'merged_into_id']],
    ['resource', 'collection_resources', 'actual.id=expected.primary_id', '1=1',
      ['name', 'url', 'type_id', 'language_id', 'legacy_language', 'legacy_topic', 'description', 'emoji',
        'status', 'completed_at', 'revision', 'created_at', 'updated_at', 'deleted_at']],
    ['resource_tag', 'collection_resource_tags',
      'actual.resource_id=expected.primary_id AND actual.tag_id=expected.secondary_id', 'actual.deleted_at IS NULL',
      ['revision', 'created_at', 'updated_at', 'deleted_at']],
    ['deck_item', 'collection_deck_items',
      'actual.deck_id=expected.primary_id AND actual.resource_id=expected.secondary_id', 'actual.deleted_at IS NULL',
      ['position', 'revision', 'created_at', 'updated_at', 'deleted_at']],
    ['legacy_group', 'collection_legacy_groups', 'actual.id=expected.primary_id', 'actual.active=1',
      ['name', 'source_json', 'active', 'created_at', 'updated_at']],
  ];
  const clauses = checks.flatMap(([kind, table, join, active, columns]) => [
    `(SELECT COUNT(*) FROM collection_migration_target_rows
      WHERE migration_version=${migrationVersion} AND kind=${sql(kind)}) = (
      SELECT COUNT(*) FROM ${table} AS actual WHERE ${active}
    )`,
    `NOT EXISTS (
      SELECT 1 FROM collection_migration_target_rows AS expected
      LEFT JOIN ${table} AS actual ON ${join} AND ${active}
      WHERE expected.migration_version=${migrationVersion} AND expected.kind=${sql(kind)}
        AND (actual.rowid IS NULL OR ${scalarMismatch(columns)})
    )`,
  ]);
  clauses.push(`(SELECT COUNT(*) FROM collection_migration_target_rows
      WHERE migration_version=${migrationVersion} AND kind='legacy_type_group') = (
      SELECT COUNT(*) FROM collection_legacy_type_groups
    )`);
  clauses.push(`NOT EXISTS (
      SELECT 1 FROM collection_migration_target_rows AS expected
      LEFT JOIN collection_legacy_type_groups AS actual
        ON actual.type_id=expected.primary_id AND actual.group_id=expected.secondary_id
      WHERE expected.migration_version=${migrationVersion} AND expected.kind='legacy_type_group'
        AND actual.type_id IS NULL
    )`);
  return clauses.map(clause => `(${clause})`).join(' AND ');
}

export function renderBackfillSql(model) {
  const targets = new Map(model.compatibilityObjects.map(object => [`${object.entity}\n${object.id}`, object]));
  const canonicalTargets = migrationTargetRows(model);
  const hasErrors = model.issues.some(issue => issue.severity === 'error');
  const statements = [
    'PRAGMA defer_foreign_keys=ON;',
    'BEGIN TRANSACTION;',
    `INSERT INTO app_schema_migrations
      (version,name,checksum,state,source_epoch,source_head,started_at,report_json)
      VALUES (${model.migrationVersion},'collections-backfill',${sql(model.checksum)},'started',${sql(model.epoch)},${model.head},${sql(model.generatedAt)},'{}')
      ON CONFLICT(version) DO UPDATE SET
        name=excluded.name,
        state=app_schema_migrations.state
      WHERE app_schema_migrations.checksum=excluded.checksum;`,
    `DELETE FROM collection_migration_object_json_chunks
      WHERE migration_version=${model.migrationVersion};`,
    `DELETE FROM collection_migration_source_objects
      WHERE migration_version=${model.migrationVersion};`,
    `DELETE FROM collection_migration_target_rows
      WHERE migration_version=${model.migrationVersion};`,
  ];

  for (const object of model.sourceObjects) {
    const target = targets.get(`${object.entity}\n${object.id}`);
    if (!target) throw new Error(`Missing migration target for ${object.entity}/${object.id}.`);
    const sourceData = JSON.stringify(object.data);
    const targetData = JSON.stringify(target.data);
    const sourceChunks = sqlTextChunks(sourceData);
    const targetChunks = sqlTextChunks(targetData);
    statements.push(`INSERT INTO collection_migration_source_objects
      (migration_version,entity,id,revision,deleted,data_sha256,source_chunk_count,
       target_revision,target_deleted,target_data_sha256,target_chunk_count)
      VALUES (${model.migrationVersion},${sql(object.entity)},${sql(object.id)},${object.revision},${object.deleted ? 1 : 0},
        ${sql(sha256(canonicalJson(object.data)))},${sourceChunks.length},
        ${target.revision},${target.deleted ? 1 : 0},${sql(sha256(canonicalJson(target.data)))},${targetChunks.length});`);
    appendObjectPayloadStatements(statements, {
      migrationVersion: model.migrationVersion,
      entity: object.entity,
      id: object.id,
      payload: 'source',
      chunks: sourceChunks,
    });
    appendObjectPayloadStatements(statements, {
      migrationVersion: model.migrationVersion,
      entity: object.entity,
      id: object.id,
      payload: 'target',
      chunks: targetChunks,
    });
  }
  for (const target of canonicalTargets) {
    const data = JSON.stringify(target.data);
    const inline = `INSERT INTO collection_migration_target_rows
      (migration_version,kind,primary_id,secondary_id,data_json)
      VALUES (${model.migrationVersion},${sql(target.kind)},${sql(target.primaryId)},${sql(target.secondaryId)},${sql(data)});`;
    if (utf8Length(inline) <= D1_SAFE_STATEMENT_BYTES) {
      statements.push(inline);
    } else {
      statements.push(`INSERT INTO collection_migration_target_rows
        (migration_version,kind,primary_id,secondary_id,data_json)
        VALUES (${model.migrationVersion},${sql(target.kind)},${sql(target.primaryId)},${sql(target.secondaryId)},'');`);
      appendJsonColumnStatements(statements, {
        table: 'collection_migration_target_rows',
        column: 'data_json',
        value: data,
        where: `migration_version=${model.migrationVersion} AND kind=${sql(target.kind)} AND ` +
          `primary_id=${sql(target.primaryId)} AND secondary_id=${sql(target.secondaryId)}`,
      });
    }
  }
  const sourceMatches = `EXISTS (
        SELECT 1 FROM sync_v2_meta WHERE id=1 AND epoch=${sql(model.epoch)} AND head=${model.head}
      ) AND ${objectPayloadsCompleteSql(model.migrationVersion)}
      AND (SELECT COUNT(*) FROM collection_migration_source_objects
        WHERE migration_version=${model.migrationVersion}) = (
          SELECT COUNT(*) FROM sync_v2_objects WHERE entity IN ('resource','settings')
        ) AND NOT EXISTS (
          SELECT 1 FROM collection_migration_source_objects AS expected
          LEFT JOIN sync_v2_objects AS actual
            ON actual.entity=expected.entity AND actual.id=expected.id
          WHERE expected.migration_version=${model.migrationVersion} AND (
            actual.entity IS NULL OR actual.revision<>expected.revision OR
            actual.deleted<>expected.deleted OR actual.data IS NOT ${correlatedObjectPayloadSql('source')}
          )
        )`;
  const targetMatches = `EXISTS (
        SELECT 1 FROM sync_v2_meta WHERE id=1 AND epoch=${sql(model.epoch)} AND head=${model.targetHead}
      ) AND ${objectPayloadsCompleteSql(model.migrationVersion)}
      AND (SELECT COUNT(*) FROM collection_migration_source_objects
        WHERE migration_version=${model.migrationVersion}) = (
          SELECT COUNT(*) FROM sync_v2_objects WHERE entity IN ('resource','settings')
        ) AND NOT EXISTS (
          SELECT 1 FROM collection_migration_source_objects AS expected
          LEFT JOIN sync_v2_objects AS actual
            ON actual.entity=expected.entity AND actual.id=expected.id
          WHERE expected.migration_version=${model.migrationVersion} AND (
            actual.entity IS NULL OR actual.revision<>expected.target_revision OR
            actual.deleted<>expected.target_deleted OR actual.data IS NOT ${correlatedObjectPayloadSql('target')}
          )
        )`;
  statements.push(`INSERT INTO collection_migration_guards (migration_version,valid)
    VALUES (${model.migrationVersion},CASE WHEN
      ${hasErrors ? '0' : '1'}=1 AND EXISTS (
        SELECT 1 FROM app_schema_migrations
        WHERE version=${model.migrationVersion} AND checksum=${sql(model.checksum)}
      ) AND ((${sourceMatches}) OR (${targetMatches}))
      THEN 1 ELSE 0 END)
    ON CONFLICT(migration_version) DO UPDATE SET valid=excluded.valid;`);
  for (const issue of model.issues) {
    statements.push(`INSERT OR REPLACE INTO collection_migration_issues
      (migration_version,severity,code,entity,entity_id,details_json)
      VALUES (${model.migrationVersion},${sql(issue.severity)},${sql(issue.code)},${sql(issue.entity)},${sql(issue.entity_id)},${sql(JSON.stringify(issue.details))});`);
  }
  for (const item of model.languages) statements.push(upsertDefinition('collection_languages', item, model.settingsRevision, model.generatedAt));
  for (const item of model.types) statements.push(upsertDefinition('collection_types', item, model.settingsRevision, model.generatedAt));
  for (const item of model.tags) statements.push(upsertDefinition('collection_tags', item, model.settingsRevision, model.generatedAt));
  for (const item of model.decks) statements.push(upsertDefinition('collection_decks', item, model.settingsRevision, model.generatedAt, true));

  for (const group of model.groups) {
    statements.push(`INSERT INTO collection_legacy_groups
      (id,name,source_json,active,created_at,updated_at)
      VALUES (${sql(group.id)},${sql(group.name)},${sql(JSON.stringify(group))},1,${sql(model.generatedAt)},${sql(model.generatedAt)})
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,source_json=excluded.source_json,active=1,updated_at=excluded.updated_at;`);
  }
  for (const relation of model.legacyTypeGroups) {
    statements.push(`INSERT OR IGNORE INTO collection_legacy_type_groups (type_id,group_id)
      VALUES (${sql(relation.type_id)},${sql(relation.group_id)});`);
  }

  for (const resource of model.resources) {
    const values = [
      resource.id, resource.name, resource.url, resource.type_id, resource.language_id,
      resource.legacy_language, resource.legacy_topic, resource.description, resource.emoji,
      resource.status, resource.completed_at, resource.revision, resource.created_at,
      resource.updated_at, resource.deleted_at,
    ];
    statements.push(`INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      VALUES (${values.map(sql).join(',')})
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,created_at=excluded.created_at,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      WHERE collection_resources.revision < excluded.revision;`);
    for (const tagId of resource.tag_ids) {
      statements.push(`INSERT INTO collection_resource_tags
        (resource_id,tag_id,revision,created_at,updated_at,deleted_at)
        VALUES (${sql(resource.id)},${sql(tagId)},${resource.revision},${sql(resource.created_at)},${sql(resource.updated_at)},NULL)
        ON CONFLICT(resource_id,tag_id) DO UPDATE SET
          revision=excluded.revision,updated_at=excluded.updated_at,deleted_at=NULL
        WHERE collection_resource_tags.revision < excluded.revision;`);
    }
  }
  const resourcesById = new Map(model.resources.map(resource => [resource.id, resource]));
  for (const item of model.deckPositions) {
    const resource = resourcesById.get(item.resource_id);
    statements.push(`INSERT INTO collection_deck_items
      (deck_id,resource_id,position,revision,created_at,updated_at,deleted_at)
      VALUES (${sql(item.deck_id)},${sql(item.resource_id)},${item.position},${resource.revision},${sql(resource.created_at)},${sql(resource.updated_at)},NULL)
      ON CONFLICT(deck_id,resource_id) DO UPDATE SET
        position=excluded.position,revision=excluded.revision,updated_at=excluded.updated_at,deleted_at=NULL
      WHERE collection_deck_items.revision < excluded.revision;`);
  }

  for (const object of model.compatibilityObjects) {
    const source = model.sourceObjects.find(item => item.entity === object.entity && item.id === object.id);
    statements.push(`UPDATE sync_v2_objects
      SET revision=${object.revision},deleted=${object.deleted ? 1 : 0},
        data=${fixedObjectPayloadSql(model.migrationVersion, object.entity, object.id, 'target')}
      WHERE entity=${sql(object.entity)} AND id=${sql(object.id)}
        AND revision=${source.revision} AND deleted=${source.deleted ? 1 : 0}
        AND data=${fixedObjectPayloadSql(model.migrationVersion, object.entity, object.id, 'source')};`);
  }

  statements.push(`UPDATE sync_v2_meta SET head=${model.targetHead}
    WHERE id=1 AND epoch=${sql(model.epoch)} AND head=${model.head};`);
  statements.push(`UPDATE collection_migration_guards
    SET valid=CASE WHEN ${targetRowsMatchSql(model.migrationVersion)} THEN 1 ELSE 0 END
    WHERE migration_version=${model.migrationVersion};`);
  statements.push(`UPDATE collection_runtime SET
    schema_version=${model.migrationVersion},
    mode='shadow',
    source_sync_epoch=${sql(model.epoch)},
    source_sync_head=${model.targetHead},
    updated_at=${sql(model.generatedAt)}
    WHERE id=1;`);
  statements.push(`UPDATE app_schema_migrations SET
    state=CASE WHEN state='verified' THEN state ELSE 'applied' END,
    report_json=${sql(JSON.stringify({
      resources: model.resources.length,
      active: model.resources.filter(resource => !resource.deleted).length,
      deleted: model.resources.filter(resource => resource.deleted).length,
      warnings: model.issues.filter(issue => issue.severity === 'warning').length,
      errors: model.issues.filter(issue => issue.severity === 'error').length,
    }))}
    WHERE version=${model.migrationVersion} AND checksum=${sql(model.checksum)};`);
  statements.push('COMMIT;');
  return statements.join('\n\n') + '\n';
}

export function renderD1BackfillSql(model) {
  if (model.issues.some(issue => issue.severity === 'error')) {
    throw new Error('Migration report contains error-level issues; deployable D1 SQL is forbidden.');
  }
  const source = renderBackfillSql(model)
    .replace(/^PRAGMA defer_foreign_keys=ON;\n\nBEGIN TRANSACTION;\n\n/, 'PRAGMA defer_foreign_keys=ON;\n\n')
    .replace(/\n\nCOMMIT;\n$/, '\n');
  assertD1StatementSizes(source);
  return source;
}

export function renderCollectionsModeSql(model, mode, timestamp = new Date().toISOString()) {
  if (!['active', 'retired'].includes(mode)) throw new TypeError('Collections mode must be active or retired.');
  if (mode === 'retired') {
    return `UPDATE collection_runtime
SET mode='retired',updated_at=${sql(timestamp)}
WHERE id=1;\n`;
  }
  if (model.issues.some(issue => issue.severity === 'error')) {
    throw new Error('Migration report contains error-level issues; active cutover is forbidden.');
  }
  return `PRAGMA defer_foreign_keys=ON;

INSERT INTO collection_migration_guards (migration_version,valid)
VALUES (${model.migrationVersion},CASE WHEN
  EXISTS (
    SELECT 1 FROM app_schema_migrations
    WHERE version=${model.migrationVersion} AND checksum=${sql(model.checksum)}
      AND state IN ('applied','verified')
  )
  AND NOT EXISTS (
    SELECT 1 FROM collection_migration_issues
    WHERE migration_version=${model.migrationVersion} AND severity='error'
  )
  AND EXISTS (
    SELECT 1 FROM collection_runtime AS runtime
    JOIN sync_v2_meta AS meta ON meta.id=1
    WHERE runtime.id=1 AND runtime.mode IN ('shadow','active')
      AND runtime.source_sync_epoch=meta.epoch
      AND runtime.source_sync_head=meta.head
      AND meta.epoch=${sql(model.epoch)} AND meta.head=${model.targetHead}
  )
  AND (SELECT COUNT(*) FROM collection_migration_source_objects
    WHERE migration_version=${model.migrationVersion}) = (
      SELECT COUNT(*) FROM sync_v2_objects WHERE entity IN ('resource','settings')
    )
  AND ${objectPayloadsCompleteSql(model.migrationVersion)}
  AND NOT EXISTS (
    SELECT 1 FROM collection_migration_source_objects AS expected
    LEFT JOIN sync_v2_objects AS actual
      ON actual.entity=expected.entity AND actual.id=expected.id
    WHERE expected.migration_version=${model.migrationVersion} AND (
      actual.entity IS NULL OR actual.revision<>expected.target_revision OR
      actual.deleted<>expected.target_deleted OR actual.data IS NOT ${correlatedObjectPayloadSql('target')}
    )
  )
  AND ${targetRowsMatchSql(model.migrationVersion)}
  THEN 1 ELSE 0 END)
ON CONFLICT(migration_version) DO UPDATE SET valid=excluded.valid;

UPDATE app_schema_migrations
SET state='verified',completed_at=${sql(timestamp)}
WHERE version=${model.migrationVersion} AND checksum=${sql(model.checksum)}
  AND state IN ('applied','verified');

UPDATE collection_runtime
SET mode='active',cutover_at=COALESCE(cutover_at,${sql(timestamp)}),updated_at=${sql(timestamp)}
WHERE id=1 AND source_sync_epoch=${sql(model.epoch)} AND source_sync_head=${model.targetHead}
  AND EXISTS (
    SELECT 1 FROM app_schema_migrations
    WHERE version=${model.migrationVersion} AND checksum=${sql(model.checksum)} AND state='verified'
  );\n`;
}

export function migrationReport(model) {
  return {
    migration_version: model.migrationVersion,
    generated_at: model.generatedAt,
    checksum: model.checksum,
    source: {
      epoch: model.epoch,
      head: model.head,
      resources: model.resources.length,
      active_resources: model.resources.filter(resource => !resource.deleted).length,
      deleted_resources: model.resources.filter(resource => resource.deleted).length,
    },
    target: {
      head: model.targetHead,
      languages: model.languages.length,
      types: model.types.length,
      tags: model.tags.length,
      decks: model.decks.length,
      resource_tags: model.resources.reduce((sum, resource) => sum + resource.tag_ids.length, 0),
      deck_items: model.deckPositions.length,
    },
    taxonomy_mappings: model.taxonomyMappings,
    issues: model.issues,
  };
}
