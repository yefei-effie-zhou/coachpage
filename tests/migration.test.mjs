import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  buildMigrationModel,
  renderBackfillSql,
  renderCollectionsModeSql,
  renderD1BackfillSql,
} from '../scripts/lib/collections-migration.mjs';

const root = new URL('../', import.meta.url);
const openDatabases = [];

afterEach(() => {
  while (openDatabases.length) openDatabases.pop().close();
});

async function fixture() {
  return JSON.parse(await readFile(new URL('fixtures/sync-v2-collections.json', import.meta.url), 'utf8'));
}

async function databaseFor(snapshot) {
  const db = new DatabaseSync(':memory:');
  openDatabases.push(db);
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE sync_v2_meta (
      id INTEGER PRIMARY KEY CHECK (id=1),
      epoch TEXT NOT NULL,
      head INTEGER NOT NULL
    );
    CREATE TABLE sync_v2_objects (
      entity TEXT NOT NULL,
      id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      deleted INTEGER NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (entity,id)
    );
    CREATE TABLE sync_v2_ops (
      op_id TEXT PRIMARY KEY,
      request_hash TEXT NOT NULL,
      response TEXT NOT NULL,
      guard INTEGER NOT NULL CHECK (guard=1)
    );
  `);
  db.prepare('INSERT INTO sync_v2_meta (id,epoch,head) VALUES (1,?,?)')
    .run(snapshot.epoch, snapshot.head);
  const insert = db.prepare('INSERT INTO sync_v2_objects (entity,id,revision,deleted,data) VALUES (?,?,?,?,?)');
  for (const object of snapshot.objects) {
    insert.run(object.entity, object.id, object.revision, object.deleted ? 1 : 0, JSON.stringify(object.data));
  }
  for (const file of [
    'migrations/0001_collections_migration_runtime.sql',
    'migrations/0002_collections_schema.sql',
    'migrations/0003_collections_indexes.sql',
  ]) {
    db.exec(await readFile(new URL(file, root), 'utf8'));
  }
  return db;
}

test('schema migrations keep Collections retired until an exact backfill completes', async () => {
  const snapshot = await fixture();
  const db = await databaseFor(snapshot);
  assert.equal(db.prepare('SELECT mode FROM collection_runtime WHERE id=1').get().mode, 'retired');

  const model = buildMigrationModel(snapshot);
  db.exec(renderBackfillSql(model));
  const runtime = db.prepare('SELECT mode,source_sync_head FROM collection_runtime WHERE id=1').get();
  assert.equal(runtime.mode, 'shadow');
  assert.equal(runtime.source_sync_head, model.targetHead);
});

test('Collections backfill preserves IDs, fields, relations, and tombstones', async () => {
  const snapshot = await fixture();
  const model = buildMigrationModel(snapshot);
  const db = await databaseFor(snapshot);
  db.exec(renderBackfillSql(model));

  const resources = db.prepare('SELECT id,type_id,language_id,deleted_at FROM collection_resources ORDER BY id').all();
  assert.deepEqual(resources.map(row => row.id), ['resource-1', 'resource-2']);
  assert.equal(resources[0].type_id, 'movie');
  assert.equal(resources[0].language_id, 'lang-ja');
  assert.equal(resources[0].deleted_at, null);
  assert.ok(resources[1].deleted_at);
  assert.deepEqual(
    db.prepare('SELECT resource_id,tag_id FROM collection_resource_tags ORDER BY resource_id,tag_id').all().map(row => ({ ...row })),
    [
      { resource_id: 'resource-1', tag_id: 'tag-japan' },
      { resource_id: 'resource-2', tag_id: 'tag-writing' },
    ],
  );
  assert.deepEqual(
    db.prepare('SELECT deck_id,resource_id,position FROM collection_deck_items').all().map(row => ({ ...row })),
    [{ deck_id: 'deck-weekend', resource_id: 'resource-1', position: 0 }],
  );
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(db.prepare('SELECT state FROM app_schema_migrations WHERE version=1').get().state, 'applied');
  assert.equal(db.prepare('SELECT head FROM sync_v2_meta WHERE id=1').get().head, model.targetHead);
  assert.equal(
    db.prepare("SELECT revision FROM sync_v2_objects WHERE entity='settings' AND id='resources'").get().revision,
    model.settingsRevision,
  );
});

test('backfill is idempotent and never downgrades a verified ledger', async () => {
  const snapshot = await fixture();
  const model = buildMigrationModel(snapshot);
  const sql = renderBackfillSql(model);
  const db = await databaseFor(snapshot);
  db.exec(sql);
  db.prepare("UPDATE app_schema_migrations SET state='verified' WHERE version=1").run();
  db.exec(sql);

  assert.equal(db.prepare('SELECT state FROM app_schema_migrations WHERE version=1').get().state, 'verified');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM collection_resources').get().count, 2);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM collection_resource_tags').get().count, 2);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM collection_deck_items').get().count, 1);
});

test('backfill aborts atomically when snapshot head no longer matches', async () => {
  const snapshot = await fixture();
  const db = await databaseFor(snapshot);
  const changed = structuredClone(snapshot);
  changed.head += 1;
  assert.throws(() => db.exec(renderBackfillSql(buildMigrationModel(changed))), /constraint/i);
  if (db.isTransaction) db.exec('ROLLBACK');

  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM collection_resources').get().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM app_schema_migrations').get().count, 0);
});

test('backfill aborts when source content changes without an epoch/head change', async () => {
  const snapshot = await fixture();
  const db = await databaseFor(snapshot);
  const row = db.prepare("SELECT data FROM sync_v2_objects WHERE entity='resource' AND id='resource-1'").get();
  const data = JSON.parse(row.data);
  data.name = 'tampered without revision';
  db.prepare("UPDATE sync_v2_objects SET data=? WHERE entity='resource' AND id='resource-1'")
    .run(JSON.stringify(data));

  assert.throws(() => db.exec(renderBackfillSql(buildMigrationModel(snapshot))), /constraint/i);
  if (db.isTransaction) db.exec('ROLLBACK');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM collection_resources').get().count, 0);
});

test('D1 migration artifact relies on Wrangler migration transaction wrappers', async () => {
  const sql = renderD1BackfillSql(buildMigrationModel(await fixture()));
  assert.match(sql, /^PRAGMA defer_foreign_keys=ON;/);
  assert.doesNotMatch(sql, /\bBEGIN(?:\s+TRANSACTION)?\b/i);
  assert.doesNotMatch(sql, /\bCOMMIT\b/i);
});

test('active cutover SQL is guarded by the verified migration target snapshot', async () => {
  const snapshot = await fixture();
  const model = buildMigrationModel(snapshot);
  const db = await databaseFor(snapshot);
  db.exec(renderBackfillSql(model));
  db.exec(renderCollectionsModeSql(model, 'active', '2026-11-23T00:00:00.000Z'));
  assert.equal(db.prepare('SELECT state FROM app_schema_migrations WHERE version=1').get().state, 'verified');
  assert.equal(db.prepare('SELECT mode FROM collection_runtime WHERE id=1').get().mode, 'active');

  db.exec(renderCollectionsModeSql(model, 'retired', '2026-11-23T01:00:00.000Z'));
  assert.equal(db.prepare('SELECT mode FROM collection_runtime WHERE id=1').get().mode, 'retired');
});

test('active cutover aborts if target projection content changed without a head change', async () => {
  const snapshot = await fixture();
  const model = buildMigrationModel(snapshot);
  const db = await databaseFor(snapshot);
  db.exec(renderBackfillSql(model));
  db.prepare("UPDATE sync_v2_objects SET data='{}' WHERE entity='resource' AND id='resource-1'").run();
  assert.throws(
    () => db.exec(renderCollectionsModeSql(model, 'active', '2026-11-23T00:00:00.000Z')),
    /constraint/i,
  );
  assert.equal(db.prepare('SELECT mode FROM collection_runtime WHERE id=1').get().mode, 'shadow');
});

test('active cutover fails closed when a target ledger payload is missing', async () => {
  const snapshot = await fixture();
  const model = buildMigrationModel(snapshot);
  const db = await databaseFor(snapshot);
  db.exec(renderBackfillSql(model));
  db.prepare(`DELETE FROM collection_migration_object_json_chunks
    WHERE migration_version=1 AND entity='resource' AND id='resource-1' AND payload='target'`).run();
  db.prepare("UPDATE sync_v2_objects SET data='{}' WHERE entity='resource' AND id='resource-1'").run();
  assert.throws(
    () => db.exec(renderCollectionsModeSql(model, 'active', '2026-11-23T00:00:00.000Z')),
    /constraint/i,
  );
  assert.equal(db.prepare('SELECT mode FROM collection_runtime WHERE id=1').get().mode, 'shadow');
  assert.equal(db.prepare('SELECT state FROM app_schema_migrations WHERE version=1').get().state, 'applied');
});

test('active cutover aborts if normalized Collections rows diverge', async () => {
  const snapshot = await fixture();
  const model = buildMigrationModel(snapshot);
  const db = await databaseFor(snapshot);
  db.exec(renderBackfillSql(model));
  db.prepare("UPDATE collection_resources SET status='active' WHERE id='resource-1'").run();
  assert.throws(
    () => db.exec(renderCollectionsModeSql(model, 'active', '2026-11-23T00:00:00.000Z')),
    /constraint/i,
  );
  assert.equal(db.prepare('SELECT mode FROM collection_runtime WHERE id=1').get().mode, 'shadow');
  assert.equal(db.prepare('SELECT state FROM app_schema_migrations WHERE version=1').get().state, 'applied');
});

test('deployable migration artifacts require a raw sync snapshot', async () => {
  const snapshot = await fixture();
  delete snapshot.raw;
  const model = buildMigrationModel(snapshot);
  assert.ok(model.issues.some(issue => issue.code === 'raw_snapshot_required' && issue.severity === 'error'));
  assert.throws(() => renderD1BackfillSql(model), /error-level issues/i);
  assert.throws(() => renderCollectionsModeSql(model, 'active'), /error-level issues/i);
});

test('large migration JSON is fragmented below D1 statement limits without data loss', async () => {
  const snapshot = await fixture();
  const settings = snapshot.objects.find(object => object.entity === 'settings').data;
  const extraTags = Array.from({ length: 998 }, (_, index) => ({
    id: `tag-${String(index).padStart(4, '0')}-${'x'.repeat(76)}`,
    name: `Tag ${index}`,
    emoji: '',
  }));
  settings.tags.push(...extraTags);
  settings.decks.push(...Array.from({ length: 499 }, (_, index) => ({
    id: `deck-${String(index).padStart(3, '0')}-${'界'.repeat(100)}`,
    name: `${'名'.repeat(70)}${index}`,
    emoji: '📚'.repeat(16),
    description: '说明'.repeat(250),
  })));
  const resource = snapshot.objects.find(object => object.id === 'resource-1');
  resource.data.tag_ids = settings.tags.map(tag => tag.id);
  const model = buildMigrationModel(snapshot);
  const settingsSource = model.sourceObjects.find(object => object.entity === 'settings');
  const settingsTarget = model.compatibilityObjects.find(object => object.entity === 'settings');
  assert.ok(Buffer.byteLength(JSON.stringify(settingsSource.data)) +
    Buffer.byteLength(JSON.stringify(settingsTarget.data)) > 2 * 1024 * 1024);
  const d1 = renderD1BackfillSql(model);
  assert.match(d1, /INSERT INTO collection_migration_object_json_chunks/);

  const statements = [];
  let start = 0;
  let quoted = false;
  for (let index = 0; index < d1.length; index++) {
    if (d1[index] === "'") {
      if (quoted && d1[index + 1] === "'") index++;
      else quoted = !quoted;
    } else if (d1[index] === ';' && !quoted) {
      statements.push(d1.slice(start, index + 1).trim());
      start = index + 1;
    }
  }
  assert.ok(Math.max(...statements.map(statement => Buffer.byteLength(statement))) <= 95_000);

  const db = await databaseFor(snapshot);
  db.exec(renderBackfillSql(model));
  assert.ok(db.prepare(`SELECT COUNT(*) AS count
    FROM collection_migration_object_json_chunks
    WHERE entity='settings' AND id='resources'`).get().count > 2);
  assert.ok(db.prepare(`SELECT MAX(length(CAST(data_chunk AS BLOB))) AS bytes
    FROM collection_migration_object_json_chunks`).get().bytes < 50_000);
  const stored = JSON.parse(db.prepare(
    "SELECT data FROM sync_v2_objects WHERE entity='resource' AND id='resource-1'",
  ).get().data);
  assert.deepEqual(stored.tag_ids, resource.data.tag_ids);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM collection_resource_tags WHERE resource_id='resource-1' AND deleted_at IS NULL").get().count,
    settings.tags.length,
  );
});

test('migration reports normalized-name collisions instead of dropping data', async () => {
  const snapshot = await fixture();
  snapshot.objects[0].data.tags.push({ id: 'tag-collision', name: '  写作参考  ' });
  const model = buildMigrationModel(snapshot);
  assert.ok(model.issues.some(issue => issue.code === 'duplicate_normalized_name' && issue.entity === 'tags'));
});

test('migration resolves display-language names and preserves unknown language text', async () => {
  const snapshot = await fixture();
  const [known, unknown] = snapshot.objects.filter(object => object.entity === 'resource');
  known.data.language_id = null;
  delete known.data.legacy_language;
  known.data.language = '日本語';
  unknown.data.language_id = null;
  delete unknown.data.legacy_language;
  unknown.data.language = 'Klingon';

  const model = buildMigrationModel(snapshot);
  assert.equal(model.resources.find(resource => resource.id === known.id).language_id, 'lang-ja');
  const preserved = model.resources.find(resource => resource.id === unknown.id);
  assert.equal(preserved.language_id, null);
  assert.equal(preserved.legacy_language, 'Klingon');
  assert.ok(model.issues.some(issue =>
    issue.code === 'display_language_preserved' && issue.entity_id === unknown.id));
});

test('legacy taxonomy maps only exact known types and creates deterministic semantic tags', async () => {
  const snapshot = await fixture();
  const settings = snapshot.objects.find(object => object.entity === 'settings');
  settings.data.groups.push({ id: 'legacy-life', name: '生活' });
  settings.data.types = [
    { id: 'project', name: '项目资料' },
    { id: 'course', name: '课程' },
    { id: 'website', name: '学习网站' },
    { id: 'movie_series', name: '电影 / 剧集', group: 'legacy-life' },
    { id: 'book', name: '书籍' },
    { id: 'variety', name: '综艺', group: 'legacy-life' },
    { id: 'magpie', name: 'magpie' },
    { id: 'five_xia', name: '五夏' },
    { id: 'custom-ai', name: 'AI research' },
  ];
  const resourceTemplate = snapshot.objects.find(object => object.entity === 'resource' && !object.deleted).data;
  snapshot.objects = [
    settings,
    ...settings.data.types.map((type, index) => ({
      entity: 'resource',
      id: `legacy-${index}`,
      revision: index + 2,
      deleted: false,
      data: {
        ...resourceTemplate,
        id: `legacy-${index}`,
        name: type.name,
        type: type.id,
        tag_ids: [],
        deck_ids: [],
      },
    })),
  ];
  snapshot.head = snapshot.objects.at(-1).revision;

  const first = buildMigrationModel(snapshot);
  const second = buildMigrationModel(snapshot);
  const byResource = new Map(first.resources.map(resource => [resource.name, resource]));
  const typeName = id => first.types.find(type => type.id === id)?.name;
  const tagName = id => first.tags.find(tag => tag.id === id)?.name;

  assert.equal(typeName(byResource.get('项目资料').type_id), '项目资料');
  assert.equal(typeName(byResource.get('课程').type_id), '课程');
  assert.equal(typeName(byResource.get('学习网站').type_id), '网站 / 工具');
  assert.equal(typeName(byResource.get('电影 / 剧集').type_id), '影视');
  assert.equal(typeName(byResource.get('书籍').type_id), '书籍');
  assert.equal(typeName(byResource.get('综艺').type_id), '影视');
  assert.deepEqual(byResource.get('综艺').tag_ids.map(tagName), ['综艺']);
  assert.equal(byResource.get('magpie').type_id, 'magpie');
  assert.deepEqual(byResource.get('magpie').tag_ids.map(tagName), ['magpie']);
  assert.equal(byResource.get('五夏').type_id, 'five_xia');
  assert.deepEqual(byResource.get('五夏').tag_ids.map(tagName), ['五夏']);
  assert.equal(byResource.get('AI research').type_id, 'custom-ai');
  assert.deepEqual(byResource.get('AI research').tag_ids, []);
  assert.deepEqual(
    first.tags.filter(tag => ['综艺', 'magpie', '五夏'].includes(tag.name)).map(tag => tag.id),
    second.tags.filter(tag => ['综艺', 'magpie', '五夏'].includes(tag.name)).map(tag => tag.id),
  );
  assert.ok(first.taxonomyMappings.some(item =>
    item.source_type_id === 'variety' && item.target_name === '影视' && item.added_tag === '综艺'));
  assert.ok(first.issues.some(issue =>
    issue.code === 'taxonomy_review_required' && issue.entity_id === 'magpie'));
  assert.ok(first.issues.some(issue =>
    issue.code === 'taxonomy_review_required' && issue.entity_id === 'five_xia'));
});

test('default types are complete without overwriting customized legacy IDs or creating duplicate names', async () => {
  const snapshot = await fixture();
  const settings = snapshot.objects.find(object => object.entity === 'settings');
  settings.data.types = [
    { id: 'course', name: '我的自定义分类', emoji: '🧭' },
    { id: 'existing-screen', name: '影视', emoji: '📺' },
  ];
  for (const object of snapshot.objects.filter(object => object.entity === 'resource')) {
    object.data.type = object.id === 'resource-1' ? 'course' : 'existing-screen';
  }

  const model = buildMigrationModel(snapshot);
  const normalizedNames = model.types.map(type =>
    type.name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US'));
  const required = ['影视', '书籍', '文章', '音频', '课程', '网站 / 工具', '项目资料', '游戏', '其他'];

  assert.equal(model.types.find(type => type.id === 'course').name, '我的自定义分类');
  assert.ok(model.types.some(type => type.name === '课程' && type.id !== 'course'));
  assert.equal(model.resources.find(resource => resource.id === 'resource-1').type_id, 'course');
  assert.ok(required.every(name => model.types.some(type => type.name === name)));
  assert.equal(new Set(normalizedNames).size, normalizedNames.length);
  assert.ok(model.taxonomyMappings.some(item =>
    item.source_type_id === 'course' && item.action === 'preserved'));
});
