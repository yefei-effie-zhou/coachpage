const COLLECTIONS_SCHEMA_VERSION = 1;
export const COLLECTIONS_JSON_BIND_LIMIT = 1_500_000;
const COLLECTIONS_MAX_JSON_CHUNKS = 12;
const textEncoder = new TextEncoder();

export class CollectionError extends Error {
  constructor(status, code, message, current = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.current = current;
  }
}

export function normalizeCollectionName(value) {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

function nowIso() {
  return new Date().toISOString();
}

function rows(result) {
  return result?.results || [];
}

export function collectionJsonPayloads(values) {
  if (!Array.isArray(values)) throw new TypeError("Collections JSON payload must be an array.");
  if (!values.length) return ["[]"];
  const chunks = [];
  let current = [];
  let bytes = 2;
  for (const value of values) {
    const encoded = JSON.stringify(value);
    const valueBytes = textEncoder.encode(encoded).length;
    if (valueBytes + 2 > COLLECTIONS_JSON_BIND_LIMIT) {
      throw new CollectionError(413, "collection_row_too_large", "单条 Collections 数据超过 D1 安全写入上限。");
    }
    if (current.length && bytes + 1 + valueBytes > COLLECTIONS_JSON_BIND_LIMIT) {
      chunks.push(JSON.stringify(current));
      current = [];
      bytes = 2;
    }
    current.push(value);
    bytes += (current.length > 1 ? 1 : 0) + valueBytes;
  }
  if (current.length) chunks.push(JSON.stringify(current));
  if (chunks.length > COLLECTIONS_MAX_JSON_CHUNKS) {
    throw new CollectionError(413, "collection_command_too_large", "本次 Collections 修改过大，请缩小批量范围后重试。");
  }
  return chunks;
}

function taxonomyMap(settings) {
  return {
    languages: settings?.languages || [],
    types: settings?.types || [],
    tags: settings?.tags || [],
    decks: settings?.decks || [],
  };
}

export async function getCollectionsRuntime(db) {
  try {
    return await db.prepare(
      `SELECT schema_version,mode,source_sync_epoch,source_sync_head,cutover_at,updated_at,
        (SELECT state FROM app_schema_migrations WHERE version=1) AS migration_state
       FROM collection_runtime WHERE id=1`,
    ).first();
  } catch (error) {
    if (/no such table/i.test(String(error?.message || error))) return null;
    throw error;
  }
}

function taxonomyUpsert(db, table, items, revision, timestamp) {
  const payload = items.map(item => ({
    id: item.id,
    name: item.name,
    normalized_name: normalizeCollectionName(item.name),
    emoji: item.emoji || "",
    description: String(item.description || "").slice(0, 500),
    revision,
    created_at: table === "collection_decks" ? item.created_at || timestamp : timestamp,
    updated_at: table === "collection_decks" ? item.updated_at || item.created_at || timestamp : timestamp,
  }));
  if (table === "collection_decks") {
    return db.prepare(`INSERT INTO collection_decks
      (id,name,normalized_name,emoji,description,revision,created_at,updated_at,deleted_at,merged_into_id)
      SELECT json_extract(value,'$.id'),json_extract(value,'$.name'),
        json_extract(value,'$.normalized_name'),json_extract(value,'$.emoji'),
        json_extract(value,'$.description'),json_extract(value,'$.revision'),
        json_extract(value,'$.created_at'),json_extract(value,'$.updated_at'),NULL,NULL
      FROM json_each(?) WHERE 1
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,normalized_name=excluded.normalized_name,emoji=excluded.emoji,
        description=excluded.description,revision=excluded.revision,updated_at=excluded.updated_at,
        deleted_at=NULL,merged_into_id=NULL`)
      .bind(JSON.stringify(payload));
  }
  return db.prepare(`INSERT INTO ${table}
    (id,name,normalized_name${table === "collection_languages" ? "" : ",emoji"},revision,created_at,updated_at,deleted_at,merged_into_id)
    SELECT json_extract(value,'$.id'),json_extract(value,'$.name'),json_extract(value,'$.normalized_name')
      ${table === "collection_languages" ? "" : ",json_extract(value,'$.emoji')"},
      json_extract(value,'$.revision'),json_extract(value,'$.created_at'),json_extract(value,'$.updated_at'),NULL,NULL
    FROM json_each(?) WHERE 1
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,normalized_name=excluded.normalized_name${table === "collection_languages" ? "" : ",emoji=excluded.emoji"},
      revision=excluded.revision,updated_at=excluded.updated_at,deleted_at=NULL,merged_into_id=NULL`)
    .bind(JSON.stringify(payload));
}

export function collectionSettingsStatements(db, previous, next, revision, timestamp = nowIso()) {
  const statements = [];
  const definitions = [
    ["languages", "collection_languages"],
    ["types", "collection_types"],
    ["tags", "collection_tags"],
    ["decks", "collection_decks"],
  ];
  for (const [key, table] of definitions) {
    const after = next?.[key] || [];
    // Temporarily tombstone active rows so valid name swaps cannot trip the
    // partial normalized-name unique indexes inside the same D1 batch.
    statements.push(db.prepare(`UPDATE ${table}
      SET deleted_at=?,updated_at=?,revision=? WHERE deleted_at IS NULL`)
      .bind(timestamp, timestamp, revision));
    statements.push(taxonomyUpsert(db, table, after, revision, timestamp));
  }

  const groups = next?.groups || [];
  const groupIds = new Set(groups.map(item => item.id));
  statements.push(db.prepare(
    "UPDATE collection_legacy_groups SET active=0,updated_at=? WHERE active=1",
  ).bind(timestamp));
  const groupPayload = groups.map(group => ({
    id: group.id,
    name: group.name,
    source_json: JSON.stringify(group),
    created_at: timestamp,
    updated_at: timestamp,
  }));
  statements.push(db.prepare(`INSERT INTO collection_legacy_groups
    (id,name,source_json,active,created_at,updated_at)
    SELECT json_extract(value,'$.id'),json_extract(value,'$.name'),
      json_extract(value,'$.source_json'),1,json_extract(value,'$.created_at'),json_extract(value,'$.updated_at')
    FROM json_each(?) WHERE 1
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,source_json=excluded.source_json,active=1,updated_at=excluded.updated_at`)
    .bind(JSON.stringify(groupPayload)));
  statements.push(db.prepare("DELETE FROM collection_legacy_type_groups"));
  const relationPayload = (next?.types || [])
    .filter(type => type.group && groupIds.has(type.group))
    .map(type => ({ type_id: type.id, group_id: type.group }));
  statements.push(db.prepare(`INSERT OR IGNORE INTO collection_legacy_type_groups (type_id,group_id)
    SELECT json_extract(value,'$.type_id'),json_extract(value,'$.group_id') FROM json_each(?)`)
    .bind(JSON.stringify(relationPayload)));
  return statements;
}

export function collectionResourcesStatements(db, changes, revision, timestamp = nowIso()) {
  const payload = changes.map(({ data, deleted = false }) => ({
    id: data.id,
    name: data.name,
    url: data.url || "",
    type: data.type,
    language_id: data.language_id ?? null,
    legacy_language: data.legacy_language || "",
    topic: data.topic || "",
    description: data.description || "",
    emoji: data.emoji || "",
    status: data.status || "backlog",
    completed_at: data.completed_at || "",
    created_at: data.created_at || timestamp,
    updated_at: data.updated_at || timestamp,
    tag_ids: [...new Set(data.tag_ids || [])],
    deck_ids: [...new Set(data.deck_ids || [])],
    deleted: Boolean(deleted),
  }));
  return collectionJsonPayloads(payload).flatMap(input => [
    db.prepare(`INSERT INTO collection_resources
      (id,name,url,type_id,language_id,legacy_language,legacy_topic,description,emoji,status,
       completed_at,revision,created_at,updated_at,deleted_at)
      SELECT json_extract(value,'$.id'),json_extract(value,'$.name'),json_extract(value,'$.url'),
        json_extract(value,'$.type'),json_extract(value,'$.language_id'),json_extract(value,'$.legacy_language'),
        json_extract(value,'$.topic'),json_extract(value,'$.description'),json_extract(value,'$.emoji'),
        json_extract(value,'$.status'),json_extract(value,'$.completed_at'),?,
        json_extract(value,'$.created_at'),json_extract(value,'$.updated_at'),
        CASE WHEN json_extract(value,'$.deleted') THEN ? ELSE NULL END
      FROM json_each(?) WHERE 1
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,url=excluded.url,type_id=excluded.type_id,language_id=excluded.language_id,
        legacy_language=excluded.legacy_language,legacy_topic=excluded.legacy_topic,
        description=excluded.description,emoji=excluded.emoji,status=excluded.status,
        completed_at=excluded.completed_at,revision=excluded.revision,updated_at=excluded.updated_at,
        deleted_at=excluded.deleted_at`)
      .bind(revision, timestamp, input),
    db.prepare(`UPDATE collection_resource_tags SET deleted_at=?,updated_at=?,revision=?
      WHERE deleted_at IS NULL AND resource_id IN (
        SELECT json_extract(value,'$.id') FROM json_each(?)
      )`).bind(timestamp, timestamp, revision, input),
    db.prepare(`WITH resources AS (SELECT value AS data FROM json_each(?))
      INSERT INTO collection_resource_tags
        (resource_id,tag_id,revision,created_at,updated_at,deleted_at)
      SELECT json_extract(resources.data,'$.id'),tags.value,?,?,?,NULL
      FROM resources JOIN json_each(json_extract(resources.data,'$.tag_ids')) AS tags
      WHERE 1
      ON CONFLICT(resource_id,tag_id) DO UPDATE SET
        revision=excluded.revision,updated_at=excluded.updated_at,deleted_at=NULL`)
      .bind(input, revision, timestamp, timestamp),
    db.prepare(`UPDATE collection_deck_items SET deleted_at=?,updated_at=?,revision=?
      WHERE deleted_at IS NULL AND resource_id IN (
        SELECT json_extract(value,'$.id') FROM json_each(?)
      )`).bind(timestamp, timestamp, revision, input),
    db.prepare(`WITH
      resources AS (SELECT value AS data FROM json_each(?)),
      desired AS (
        SELECT json_extract(resources.data,'$.id') AS resource_id,decks.value AS deck_id
        FROM resources JOIN json_each(json_extract(resources.data,'$.deck_ids')) AS decks
      ),
      candidates AS (
        SELECT desired.*,
          (SELECT prior.position FROM collection_deck_items AS prior
           WHERE prior.deck_id=desired.deck_id AND prior.resource_id=desired.resource_id
             AND NOT EXISTS (
               SELECT 1 FROM collection_deck_items AS occupied
               WHERE occupied.deck_id=prior.deck_id AND occupied.position=prior.position
                 AND occupied.resource_id<>prior.resource_id AND occupied.deleted_at IS NULL
             )) AS old_position
        FROM desired
      ),
      ranked AS (
        SELECT reusable.*,
          SUM(CASE WHEN reusable_position IS NULL THEN 1 ELSE 0 END) OVER (
            PARTITION BY deck_id ORDER BY resource_id ROWS UNBOUNDED PRECEDING
          ) AS new_rank
        FROM (
          SELECT candidates.*,
            CASE WHEN old_position IS NOT NULL AND
              ROW_NUMBER() OVER (
                PARTITION BY deck_id,old_position ORDER BY resource_id
              )=1
            THEN old_position ELSE NULL END AS reusable_position
          FROM candidates
        ) AS reusable
      )
      INSERT INTO collection_deck_items
        (deck_id,resource_id,position,revision,created_at,updated_at,deleted_at)
      SELECT ranked.deck_id,ranked.resource_id,
        CASE WHEN ranked.reusable_position IS NOT NULL THEN ranked.reusable_position ELSE
          COALESCE((
            SELECT MAX(positions.position) FROM (
              SELECT active.position FROM collection_deck_items AS active
              WHERE active.deck_id=ranked.deck_id AND active.deleted_at IS NULL
              UNION ALL
              SELECT reusable.reusable_position FROM ranked AS reusable
              WHERE reusable.deck_id=ranked.deck_id AND reusable.reusable_position IS NOT NULL
            ) AS positions
          ),-1)+ranked.new_rank
        END,
        ?,?,?,NULL
      FROM ranked WHERE 1
      ON CONFLICT(deck_id,resource_id) DO UPDATE SET
        position=excluded.position,revision=excluded.revision,
        updated_at=excluded.updated_at,deleted_at=NULL`)
      .bind(input, revision, timestamp, timestamp),
  ]);
}

export function collectionResourceStatements(db, data, revision, {
  deleted = false,
  timestamp = nowIso(),
} = {}) {
  return collectionResourcesStatements(db, [{ data, deleted }], revision, timestamp);
}

export async function collectionStatementsForSyncOperation(db, {
  op,
  previousData,
  data,
  revision,
  deleted,
}) {
  const runtime = await getCollectionsRuntime(db);
  if (!runtime || runtime.mode === "retired") {
    return { runtime, statements: [] };
  }
  const timestamp = nowIso();
  const statements = op.entity === "settings"
    ? collectionSettingsStatements(db, previousData, data, revision, timestamp)
    : op.entity === "resource"
      ? collectionResourceStatements(db, data, revision, { deleted, timestamp })
      : [];
  statements.push(db.prepare(
    "UPDATE collection_runtime SET source_sync_head=?,updated_at=? WHERE id=1",
  ).bind(revision, timestamp));
  return { runtime, statements };
}

export async function canonicalCollectionsSnapshot(db) {
  const runtime = await getCollectionsRuntime(db);
  if (!runtime) throw new CollectionError(503, "collections_not_ready", "Collections 数据表尚未迁移。");
  const result = await db.batch([
    db.prepare("SELECT epoch,head FROM sync_v2_meta WHERE id=1"),
    db.prepare("SELECT revision,data FROM sync_v2_objects WHERE entity='settings' AND id='resources' AND deleted=0"),
    db.prepare("SELECT * FROM collection_languages ORDER BY created_at,id"),
    db.prepare("SELECT * FROM collection_types ORDER BY created_at,id"),
    db.prepare("SELECT * FROM collection_tags ORDER BY created_at,id"),
    db.prepare("SELECT * FROM collection_decks ORDER BY created_at,id"),
    db.prepare("SELECT id,name,source_json FROM collection_legacy_groups WHERE active=1 ORDER BY created_at,id"),
    db.prepare("SELECT type_id,group_id FROM collection_legacy_type_groups ORDER BY type_id,group_id"),
    db.prepare("SELECT * FROM collection_resources ORDER BY created_at,id"),
    db.prepare("SELECT resource_id,tag_id FROM collection_resource_tags WHERE deleted_at IS NULL ORDER BY resource_id,created_at,tag_id"),
    db.prepare("SELECT resource_id,deck_id,position FROM collection_deck_items WHERE deleted_at IS NULL ORDER BY resource_id,deck_id"),
    db.prepare("SELECT state,checksum FROM app_schema_migrations WHERE version=1"),
  ]);
  const meta = rows(result[0])[0];
  if (!meta) throw new CollectionError(503, "sync_not_ready", "同步元数据尚未初始化。");
  const ledger = rows(result[11])[0];
  const allowedStates = runtime.mode === "active" ? ["verified"] : ["applied", "verified"];
  if (!ledger || !allowedStates.includes(ledger.state)) {
    throw new CollectionError(503, "collections_unverified", "Collections 迁移尚未完成验证。");
  }
  if (runtime.source_sync_epoch !== meta.epoch || runtime.source_sync_head !== meta.head) {
    throw new CollectionError(503, "collections_stale", "Collections 投影落后于兼容数据，必须重新迁移并验证后才能启用。");
  }
  const settingsRow = rows(result[1])[0];
  const active = list => rows(list).filter(item => !item.deleted_at);
  const groupByType = new Map(rows(result[7]).map(item => [item.type_id, item.group_id]));
  const groups = rows(result[6]).map(item => {
    try { return JSON.parse(item.source_json); } catch { return { id: item.id, name: item.name }; }
  });
  const settings = {
    id: "resources",
    schema_version: 4,
    languages: active(result[2]).map(({ id, name }) => ({ id, name })),
    groups,
    types: active(result[3]).map(({ id, name, emoji }) => ({
      id, name, emoji, ...(groupByType.has(id) ? { group: groupByType.get(id) } : {}),
    })),
    tags: active(result[4]).map(({ id, name, emoji }) => ({ id, name, emoji })),
    decks: active(result[5]).map(({ id, name, emoji, description, created_at, updated_at }) => ({
      id, name, emoji, description, created_at, updated_at,
    })),
  };
  const languageNames = new Map(settings.languages.map(item => [item.id, item.name]));
  const tags = new Map();
  for (const row of rows(result[9])) {
    const ids = tags.get(row.resource_id) || [];
    ids.push(row.tag_id);
    tags.set(row.resource_id, ids);
  }
  const decks = new Map();
  for (const row of rows(result[10])) {
    const ids = decks.get(row.resource_id) || [];
    ids.push(row.deck_id);
    decks.set(row.resource_id, ids);
  }
  const objects = [{
    entity: "settings",
    id: "resources",
    revision: settingsRow?.revision || Math.max(1, ...[
      ...rows(result[2]), ...rows(result[3]), ...rows(result[4]), ...rows(result[5]),
    ].map(item => item.revision || 1)),
    deleted: false,
    data: settings,
  }];
  for (const row of rows(result[8])) {
    objects.push({
      entity: "resource",
      id: row.id,
      revision: row.revision,
      deleted: Boolean(row.deleted_at),
      data: {
        id: row.id,
        name: row.name,
        url: row.url,
        type: row.type_id,
        language_id: row.language_id,
        language: languageNames.get(row.language_id) || row.legacy_language || "不限语言",
        ...(row.legacy_language ? { legacy_language: row.legacy_language } : {}),
        topic: row.legacy_topic,
        description: row.description,
        emoji: row.emoji,
        tag_ids: tags.get(row.id) || [],
        deck_ids: decks.get(row.id) || [],
        status: row.status,
        completed_at: row.completed_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    });
  }
  return {
    protocol: 2,
    collections_schema: COLLECTIONS_SCHEMA_VERSION,
    mode: runtime.mode,
    epoch: meta.epoch,
    head: meta.head,
    objects,
  };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function semanticProjectionData(entity, value) {
  const data = value || {};
  if (entity === "settings") {
    const byId = values => [...values].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return {
      id: "resources",
      schema_version: Math.max(4, Number(data.schema_version) || 0),
      languages: byId((data.languages || []).map(item => ({ id: item.id, name: item.name }))),
      groups: byId((data.groups || []).map(item => ({ ...item }))),
      types: byId((data.types || []).map(item => ({
        id: item.id, name: item.name, emoji: item.emoji || "", ...(item.group ? { group: item.group } : {}),
      }))),
      tags: byId((data.tags || []).map(item => ({ id: item.id, name: item.name, emoji: item.emoji || "" }))),
      decks: byId((data.decks || []).map(item => ({
        id: item.id, name: item.name, emoji: item.emoji || "", description: item.description || "",
        created_at: item.created_at, updated_at: item.updated_at,
      }))),
    };
  }
  if (entity === "resource") {
    return {
      id: data.id,
      name: data.name || "",
      url: data.url || "",
      type: data.type,
      language_id: data.language_id ?? null,
      legacy_language: data.legacy_language || "",
      topic: data.topic || "",
      description: data.description || "",
      emoji: data.emoji || "",
      tag_ids: [...new Set(data.tag_ids || [])].sort(),
      deck_ids: [...new Set(data.deck_ids || [])].sort(),
      status: data.status || "backlog",
      completed_at: data.completed_at || "",
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }
  return data;
}

export async function verifyCollectionsProjection(db) {
  const canonical = await canonicalCollectionsSnapshot(db);
  const projectionRows = await db.prepare(
    "SELECT entity,id,revision,deleted,data FROM sync_v2_objects WHERE entity IN ('resource','settings') ORDER BY entity,id",
  ).all();
  const projected = new Map(rows(projectionRows).map(row => [
    `${row.entity}\n${row.id}`,
    { ...row, deleted: Boolean(row.deleted), data: JSON.parse(row.data) },
  ]));
  const mismatches = [];
  for (const object of canonical.objects) {
    const key = `${object.entity}\n${object.id}`;
    const other = projected.get(key);
    projected.delete(key);
    if (!other || other.revision !== object.revision || other.deleted !== object.deleted ||
        canonicalJson(semanticProjectionData(object.entity, other.data)) !==
          canonicalJson(semanticProjectionData(object.entity, object.data))) {
      mismatches.push({ entity: object.entity, id: object.id, reason: other ? "content" : "missing_projection" });
    }
  }
  for (const other of projected.values()) mismatches.push({ entity: other.entity, id: other.id, reason: "missing_canonical" });
  let foreignKeys = [];
  try {
    const check = await db.prepare("PRAGMA foreign_key_check").all();
    foreignKeys = rows(check);
  } catch {
    // D1 environments that reject PRAGMA still retain schema-level FKs; the
    // standalone verifier executes this check against the cloned SQLite DB.
  }
  return {
    ok: mismatches.length === 0 && foreignKeys.length === 0,
    source_head: canonical.head,
    canonical_objects: canonical.objects.length,
    mismatches,
    foreign_key_issues: foreignKeys,
  };
}

export function collectionSettingsFromSnapshot(snapshot) {
  return taxonomyMap(snapshot?.objects?.find(object => object.entity === "settings" && !object.deleted)?.data);
}
