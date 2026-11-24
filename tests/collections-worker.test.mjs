import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import worker from '../worker.js';
import { buildMigrationModel, renderBackfillSql } from '../scripts/lib/collections-migration.mjs';
import {
  COLLECTIONS_JSON_BIND_LIMIT,
  collectionJsonPayloads,
  collectionResourcesStatements,
} from '../worker/collections.js';

class D1Statement {
  constructor(database, source, parameters = []) {
    this.database = database;
    this.source = source;
    this.parameters = parameters;
  }

  bind(...parameters) {
    return new D1Statement(this.database, this.source, parameters);
  }

  execute() {
    const statement = this.database.sqlite.prepare(this.source);
    if (/^\s*(?:SELECT|PRAGMA)\b/i.test(this.source)) {
      return { results: statement.all(...this.parameters), success: true, meta: {} };
    }
    const result = statement.run(...this.parameters);
    return { results: [], success: true, meta: { changes: Number(result.changes) } };
  }

  async all() {
    return this.execute();
  }

  async first() {
    return this.database.sqlite.prepare(this.source).get(...this.parameters);
  }

  async run() {
    return this.execute();
  }
}

class TestD1 {
  constructor(sqlite) {
    this.sqlite = sqlite;
  }

  prepare(source) {
    return new D1Statement(this, source);
  }

  withSession() {
    return this;
  }

  async batch(statements) {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map(statement => statement.execute());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      if (this.sqlite.isTransaction) this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
}

const opened = [];
let originalFetch;
let env;
let token;

function encode(value) {
  return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
}

function tokenWithClaims(assertion, patch) {
  const [header, payload, signature] = assertion.split('.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  return `${header}.${encode({ ...claims, ...patch })}.${signature}`;
}

async function accessIdentity() {
  const pair = await crypto.subtle.generateKey({
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  }, true, ['sign', 'verify']);
  const kid = `test-${crypto.randomUUID()}`;
  const issuer = 'https://test-team.cloudflareaccess.com';
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'RS256', typ: 'JWT', kid });
  const payload = encode({
    iss: issuer,
    aud: ['collections-audience'],
    email: 'student@example.com',
    sub: 'test-user',
    nbf: now - 10,
    exp: now + 600,
  });
  const signingInput = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    pair.privateKey,
    new TextEncoder().encode(signingInput),
  );
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    if (String(url) === `${issuer}/cdn-cgi/access/certs`) {
      return Response.json({ keys: [{ ...jwk, kid, alg: 'RS256', use: 'sig' }] });
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  };
  return {
    token: `${signingInput}.${Buffer.from(signature).toString('base64url')}`,
    issuer,
  };
}

async function seededDatabase() {
  const snapshot = JSON.parse(await readFile(new URL('fixtures/sync-v2-collections.json', import.meta.url), 'utf8'));
  const sqlite = new DatabaseSync(':memory:');
  opened.push(sqlite);
  sqlite.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE sync_v2_meta (
      id INTEGER PRIMARY KEY CHECK (id=1),
      epoch TEXT NOT NULL,
      head INTEGER NOT NULL CHECK (head>=0)
    );
    CREATE TABLE sync_v2_objects (
      entity TEXT NOT NULL CHECK (entity IN ('card','document','resource','settings')),
      id TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK (revision>0),
      deleted INTEGER NOT NULL CHECK (deleted IN (0,1)),
      data TEXT NOT NULL,
      PRIMARY KEY (entity,id),
      CHECK (entity!='settings' OR id='resources')
    );
    CREATE TABLE sync_v2_ops (
      op_id TEXT PRIMARY KEY,
      request_hash TEXT NOT NULL,
      response TEXT NOT NULL,
      guard INTEGER NOT NULL CHECK (guard=1)
    );
  `);
  sqlite.prepare('INSERT INTO sync_v2_meta (id,epoch,head) VALUES (1,?,?)').run(snapshot.epoch, snapshot.head);
  const insert = sqlite.prepare('INSERT INTO sync_v2_objects (entity,id,revision,deleted,data) VALUES (?,?,?,?,?)');
  for (const object of snapshot.objects) {
    insert.run(object.entity, object.id, object.revision, object.deleted ? 1 : 0, JSON.stringify(object.data));
  }
  for (const file of [
    '../migrations/0001_collections_migration_runtime.sql',
    '../migrations/0002_collections_schema.sql',
    '../migrations/0003_collections_indexes.sql',
  ]) {
    sqlite.exec(await readFile(new URL(file, import.meta.url), 'utf8'));
  }
  sqlite.exec(renderBackfillSql(buildMigrationModel(snapshot)));
  return new TestD1(sqlite);
}

function request(path, { method = 'GET', body, assertion = token, origin = 'https://app.example' } = {}) {
  return new Request(`https://worker.example${path}`, {
    method,
    headers: {
      Origin: origin,
      ...(assertion ? { 'Cf-Access-Jwt-Assertion': assertion } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function call(path, options) {
  const response = await worker.fetch(request(path, options), env);
  const payload = await response.json();
  return { response, payload };
}

beforeEach(async () => {
  const identity = await accessIdentity();
  token = identity.token;
  env = {
    DB: await seededDatabase(),
    ALLOWED_ORIGIN: 'https://app.example',
    ACCESS_ISSUER: identity.issuer,
    ACCESS_AUD: 'collections-audience',
    ACCESS_ALLOWED_EMAILS: 'student@example.com',
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  while (opened.length) opened.pop().close();
});

test('Cloudflare Access is mandatory and CORS rejects an unapproved origin', async () => {
  const missing = await call('/api/session', { assertion: '' });
  assert.equal(missing.response.status, 401);
  assert.equal(missing.payload.code, 'access_required');

  const wrongOrigin = await call('/api/session', { origin: 'https://evil.example' });
  assert.equal(wrongOrigin.response.status, 403);

  const session = await call('/api/session');
  assert.equal(session.response.status, 200);
  assert.equal(session.payload.email, 'student@example.com');
});

test('Cloudflare Access rejects invalid claims and forged signatures', async () => {
  const now = Math.floor(Date.now() / 1000);
  for (const assertion of [
    tokenWithClaims(token, { aud: ['wrong-audience'] }),
    tokenWithClaims(token, { email: 'intruder@example.com' }),
    tokenWithClaims(token, { exp: now - 120 }),
    tokenWithClaims(token, { nbf: now + 120 }),
    tokenWithClaims(token, { iss: 'https://other.cloudflareaccess.com' }),
  ]) {
    const result = await call('/api/session', { assertion });
    assert.equal(result.response.status, 403);
    assert.equal(result.payload.code, 'access_forbidden');
  }

  const [header, payload, signature] = token.split('.');
  const forged = `${header}.${payload}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
  const result = await call('/api/session', { assertion: forged });
  assert.equal(result.response.status, 401);
  assert.equal(result.payload.code, 'access_invalid');
});

test('Collections conflicts preserve an explicit null current object', async () => {
  const state = await call('/api/collections/state');
  const result = await call('/api/collections/operations', {
    method: 'POST',
    body: {
      protocol: 2,
      epoch: state.payload.epoch,
      opId: 'missing-resource-conflict',
      entity: 'resource',
      id: 'missing-resource',
      kind: 'patch',
      baseRevision: 1,
      patch: { status: 'active' },
    },
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.code, 'revision_conflict');
  assert.ok(Object.hasOwn(result.payload, 'current'));
  assert.equal(result.payload.current, null);
});

test('raw migration snapshots preserve stored JSON while normal state projects display language', async () => {
  const initial = await call('/api/sync/state');
  const settings = initial.payload.objects.find(object => object.entity === 'settings');
  const renamed = await call('/api/sync/operations', {
    method: 'POST',
    body: {
      protocol: 2,
      epoch: initial.payload.epoch,
      opId: 'rename-language-for-raw-snapshot',
      entity: 'settings',
      id: 'resources',
      kind: 'patch',
      baseRevision: settings.revision,
      patch: { languages: [{ id: 'lang-ja', name: 'Japanese' }] },
    },
  });
  assert.equal(renamed.response.status, 200);

  const visible = await call('/api/sync/state');
  const raw = await call('/api/sync/raw-state');
  assert.equal(raw.response.status, 200);
  assert.equal(raw.payload.raw, true);
  assert.equal(
    visible.payload.objects.find(object => object.entity === 'resource' && object.id === 'resource-1').data.language,
    'Japanese',
  );
  assert.equal(
    raw.payload.objects.find(object => object.entity === 'resource' && object.id === 'resource-1').data.language,
    '日本語',
  );
});

test('Collections operations and atomic commands keep canonical and compatibility projections equal', async () => {
  let result = await call('/api/collections/state');
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.objects.filter(object => object.entity === 'resource').length, 2);
  let head = result.payload.head;
  const initialSettings = result.payload.objects.find(object => object.entity === 'settings');
  const initialResource = result.payload.objects.find(object => object.entity === 'resource' && object.id === 'resource-1');

  const tags = [...initialSettings.data.tags, { id: 'tag-new', name: 'AI', emoji: '✨' }];
  result = await call('/api/collections/operations', {
    method: 'POST',
    body: {
      protocol: 2,
      epoch: 'fixture-epoch',
      opId: 'settings-add-tag',
      entity: 'settings',
      id: 'resources',
      kind: 'patch',
      baseRevision: initialSettings.revision,
      patch: { tags },
    },
  });
  assert.equal(result.response.status, 200);
  head = result.payload.head;

  result = await call('/api/collections/operations', {
    method: 'POST',
    body: {
      protocol: 2,
      epoch: 'fixture-epoch',
      opId: 'resource-add-tag',
      entity: 'resource',
      id: 'resource-1',
      kind: 'patch',
      baseRevision: initialResource.revision,
      patch: { tag_ids: ['tag-japan', 'tag-new'] },
    },
  });
  assert.equal(result.response.status, 200);
  head = result.payload.head;

  result = await call('/api/collections/commands', {
    method: 'POST',
    body: {
      protocol: 2,
      epoch: 'fixture-epoch',
      opId: 'merge-new-tag',
      baseHead: head,
      command: 'merge_tag',
      source_id: 'tag-new',
      target_id: 'tag-japan',
    },
  });
  assert.equal(result.response.status, 200);
  head = result.payload.head;

  result = await call('/api/collections/commands', {
    method: 'POST',
    body: {
      protocol: 2,
      epoch: 'fixture-epoch',
      opId: 'bulk-complete',
      baseHead: head,
      command: 'bulk',
      resource_ids: ['resource-1'],
      action: 'status',
      value: 'completed',
      completed_at: '2026-11-23T12:34:56.000Z',
    },
  });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload.changed_resource_ids, ['resource-1']);
  assert.equal(
    (await call('/api/collections/state')).payload.objects
      .find(object => object.entity === 'resource' && object.id === 'resource-1').data.completed_at,
    '2026-11-23T12:34:56.000Z',
  );
  head = result.payload.head;

  result = await call('/api/collections/commands', {
    method: 'POST',
    body: {
      protocol: 2,
      epoch: 'fixture-epoch',
      opId: 'delete-deck',
      baseHead: head,
      command: 'delete_deck',
      source_id: 'deck-weekend',
    },
  });
  assert.equal(result.response.status, 200);
  head = result.payload.head;

  result = await call('/api/collections/commands', {
    method: 'POST',
    body: {
      protocol: 2,
      epoch: 'fixture-epoch',
      opId: 'delete-tombstone-tag',
      baseHead: head,
      command: 'delete_tag',
      source_id: 'tag-writing',
    },
  });
  assert.equal(result.response.status, 200);
  head = result.payload.head;

  const state = await call('/api/collections/state');
  const settings = state.payload.objects.find(object => object.entity === 'settings');
  result = await call('/api/collections/operations', {
    method: 'POST',
    body: {
      protocol: 2,
      epoch: 'fixture-epoch',
      opId: 'unsafe-type-delete',
      entity: 'settings',
      id: 'resources',
      kind: 'patch',
      baseRevision: settings.revision,
      patch: { types: settings.data.types.filter(type => type.id !== 'movie') },
    },
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.code, 'reference_conflict');

  result = await call('/api/collections/commands', {
    method: 'POST',
    body: {
      protocol: 2,
      epoch: 'fixture-epoch',
      opId: 'safe-type-delete',
      baseHead: head,
      command: 'delete_type',
      source_id: 'movie',
      target_id: 'article',
    },
  });
  assert.equal(result.response.status, 200);

  const verification = await call('/api/collections/verify');
  assert.equal(verification.response.status, 200);
  assert.equal(verification.payload.ok, true, JSON.stringify(verification.payload.mismatches));

  const finalState = await call('/api/collections/state');
  const resource1 = finalState.payload.objects.find(object => object.entity === 'resource' && object.id === 'resource-1');
  const resource2 = finalState.payload.objects.find(object => object.entity === 'resource' && object.id === 'resource-2');
  assert.equal(resource1.data.type, 'article');
  assert.equal(resource1.data.status, 'completed');
  assert.deepEqual(resource1.data.tag_ids, ['tag-japan']);
  assert.deepEqual(resource1.data.deck_ids, []);
  assert.deepEqual(resource2.data.tag_ids, []);
  assert.equal(resource2.deleted, true);
});

test('Collections writes honor read-only mode', async () => {
  env.COLLECTIONS_READ_ONLY = '1';
  let result = await call('/api/collections/commands', {
    method: 'POST',
    body: {
      protocol: 2,
      epoch: 'fixture-epoch',
      opId: 'read-only-command',
      baseHead: 5,
      command: 'bulk',
      resource_ids: ['resource-1'],
      action: 'status',
      value: 'active',
    },
  });
  assert.equal(result.response.status, 503);
  assert.equal(result.payload.code, 'collections_read_only');

  const state = await call('/api/collections/state');
  const resource = state.payload.objects.find(object => object.entity === 'resource' && object.id === 'resource-1');
  result = await call('/api/sync/operations', {
    method: 'POST',
    body: {
      protocol: 2,
      epoch: 'fixture-epoch',
      opId: 'read-only-legacy-operation',
      entity: 'resource',
      id: resource.id,
      kind: 'patch',
      baseRevision: resource.revision,
      patch: { status: 'active' },
    },
  });
  assert.equal(result.response.status, 503);
  assert.equal(result.payload.code, 'collections_read_only');
});

test('queued sync-v2 resource patches remain compatible after Collections activation', async () => {
  env.DB.sqlite.prepare("UPDATE app_schema_migrations SET state='verified' WHERE version=1").run();
  env.DB.sqlite.prepare("UPDATE collection_runtime SET mode='active' WHERE id=1").run();
  const initial = await call('/api/collections/state');
  const resource = initial.payload.objects.find(object => object.entity === 'resource' && object.id === 'resource-1');

  const result = await call('/api/sync/operations', {
    method: 'POST',
    body: {
      protocol: 2,
      epoch: 'fixture-epoch',
      opId: 'queued-legacy-resource-patch',
      entity: 'resource',
      id: resource.id,
      kind: 'patch',
      baseRevision: resource.revision,
      patch: { status: 'active' },
    },
  });
  assert.equal(result.response.status, 200);

  const current = await call('/api/collections/state');
  const updated = current.payload.objects.find(object => object.entity === 'resource' && object.id === resource.id);
  assert.equal(updated.data.status, 'active');
  assert.deepEqual(updated.data.tag_ids, resource.data.tag_ids);
  assert.deepEqual(updated.data.deck_ids, resource.data.deck_ids);

  const settings = current.payload.objects.find(object => object.entity === 'settings');
  const deckBefore = settings.data.decks[0];
  const legacySettingsWrite = await call('/api/sync/operations', {
    method: 'POST',
    body: {
      protocol: 2,
      epoch: 'fixture-epoch',
      opId: 'queued-legacy-settings-patch',
      entity: 'settings',
      id: 'resources',
      kind: 'patch',
      baseRevision: settings.revision,
      patch: { groups: settings.data.groups },
    },
  });
  assert.equal(legacySettingsWrite.response.status, 200);
  const settingsAfter = (await call('/api/collections/state')).payload.objects
    .find(object => object.entity === 'settings').data;
  assert.equal(settingsAfter.decks[0].created_at, deckBefore.created_at);
  assert.equal(settingsAfter.decks[0].updated_at, deckBefore.updated_at);

  const verification = await call('/api/collections/verify');
  assert.equal(verification.payload.ok, true, JSON.stringify(verification.payload.mismatches));
});

test('active mode refuses stale canonical data after a retired-mode write', async () => {
  env.DB.sqlite.prepare("UPDATE app_schema_migrations SET state='verified' WHERE version=1").run();
  env.DB.sqlite.prepare("UPDATE collection_runtime SET mode='retired' WHERE id=1").run();
  const state = await call('/api/sync/state');
  const resource = state.payload.objects.find(object => object.entity === 'resource' && object.id === 'resource-1');
  const write = await call('/api/sync/operations', {
    method: 'POST',
    body: {
      protocol: 2,
      epoch: state.payload.epoch,
      opId: 'retired-write-before-reactivation',
      entity: 'resource',
      id: resource.id,
      kind: 'patch',
      baseRevision: resource.revision,
      patch: { status: 'active' },
    },
  });
  assert.equal(write.response.status, 200);

  env.DB.sqlite.prepare("UPDATE collection_runtime SET mode='active' WHERE id=1").run();
  const stale = await call('/api/collections/state');
  assert.equal(stale.response.status, 503);
  assert.equal(stale.payload.code, 'collections_stale');
});

test('re-adding a Deck membership allocates a free position', async () => {
  let state = await call('/api/collections/state');
  let head = state.payload.head;

  let result = await call('/api/collections/commands', {
    method: 'POST',
    body: {
      protocol: 2,
      epoch: state.payload.epoch,
      opId: 'remove-original-deck-membership',
      baseHead: head,
      command: 'bulk',
      resource_ids: ['resource-1'],
      action: 'remove_decks',
      ids: ['deck-weekend'],
    },
  });
  assert.equal(result.response.status, 200);
  head = result.payload.head;

  result = await call('/api/collections/operations', {
    method: 'POST',
    body: {
      protocol: 2,
      epoch: state.payload.epoch,
      opId: 'create-position-occupier',
      entity: 'resource',
      id: 'resource-3',
      kind: 'create',
      baseRevision: 0,
      patch: {
        name: 'Position occupier',
        type: 'article',
        language_id: null,
        tag_ids: [],
        deck_ids: ['deck-weekend'],
        status: 'backlog',
      },
    },
  });
  assert.equal(result.response.status, 200);
  head = result.payload.head;

  result = await call('/api/collections/commands', {
    method: 'POST',
    body: {
      protocol: 2,
      epoch: state.payload.epoch,
      opId: 'readd-original-deck-membership',
      baseHead: head,
      command: 'bulk',
      resource_ids: ['resource-1'],
      action: 'add_decks',
      ids: ['deck-weekend'],
    },
  });
  assert.equal(result.response.status, 200);
  const positions = env.DB.sqlite.prepare(`SELECT resource_id,position FROM collection_deck_items
    WHERE deck_id='deck-weekend' AND deleted_at IS NULL ORDER BY position`).all();
  assert.deepEqual(positions.map(row => ({ ...row })), [
    { resource_id: 'resource-3', position: 0 },
    { resource_id: 'resource-1', position: 1 },
  ]);
});

test('bulk Deck reactivation assigns unique positions when tombstones share an old position', async () => {
  let state = await call('/api/collections/state');
  let result = await call('/api/collections/operations', {
    method: 'POST',
    body: {
      protocol: 2,
      epoch: state.payload.epoch,
      opId: 'create-second-reactivation-resource',
      entity: 'resource',
      id: 'resource-reactivate',
      kind: 'create',
      baseRevision: 0,
      patch: {
        name: 'Second reactivation',
        type: 'article',
        language_id: null,
        tag_ids: [],
        deck_ids: [],
        status: 'backlog',
      },
    },
  });
  assert.equal(result.response.status, 200);
  const timestamp = '2026-11-23T00:00:00.000Z';
  env.DB.sqlite.prepare(`UPDATE collection_deck_items SET deleted_at=?,updated_at=?
    WHERE deck_id='deck-weekend' AND resource_id='resource-1'`).run(timestamp, timestamp);
  env.DB.sqlite.prepare(`INSERT INTO collection_deck_items
    (deck_id,resource_id,position,revision,created_at,updated_at,deleted_at)
    VALUES ('deck-weekend','resource-reactivate',0,?,?,?,?)`)
    .run(result.payload.head, timestamp, timestamp, timestamp);

  state = await call('/api/collections/state');
  result = await call('/api/collections/commands', {
    method: 'POST',
    body: {
      protocol: 2,
      epoch: state.payload.epoch,
      opId: 'reactivate-duplicate-old-positions',
      baseHead: state.payload.head,
      command: 'bulk',
      resource_ids: ['resource-1', 'resource-reactivate'],
      action: 'add_decks',
      ids: ['deck-weekend'],
    },
  });
  assert.equal(result.response.status, 200);
  const positions = env.DB.sqlite.prepare(`SELECT resource_id,position FROM collection_deck_items
    WHERE deck_id='deck-weekend' AND deleted_at IS NULL ORDER BY position,resource_id`).all();
  assert.deepEqual(positions.map(row => ({ ...row })), [
    { resource_id: 'resource-1', position: 0 },
    { resource_id: 'resource-reactivate', position: 1 },
  ]);
});

test('set-based Collections writes split every JSON bind below the D1 limit', () => {
  const changes = Array.from({ length: 1000 }, (_, index) => ({
    data: {
      id: `resource-${index}`,
      name: `Resource ${index}`,
      url: `https://example.com/${'x'.repeat(2000)}`,
      type: 'article',
      language_id: null,
      tag_ids: [],
      deck_ids: [],
      status: 'backlog',
    },
    deleted: false,
  }));
  const payloads = collectionJsonPayloads(changes.map(({ data, deleted }) => ({ ...data, deleted })));
  assert.ok(payloads.length > 1);
  assert.ok(payloads.every(payload => Buffer.byteLength(payload) <= COLLECTIONS_JSON_BIND_LIMIT));

  const bound = [];
  const db = {
    prepare(source) {
      return {
        bind(...parameters) {
          bound.push({ source, parameters });
          return { source, parameters };
        },
      };
    },
  };
  const statements = collectionResourcesStatements(db, changes, 10, '2026-11-23T00:00:00.000Z');
  assert.equal(statements.length, payloads.length * 5);
  assert.ok(bound.flatMap(item => item.parameters)
    .filter(value => typeof value === 'string' && value.startsWith('['))
    .every(value => Buffer.byteLength(value) <= COLLECTIONS_JSON_BIND_LIMIT));
  assert.throws(
    () => collectionJsonPayloads([{ id: 'too-large', value: 'x'.repeat(COLLECTIONS_JSON_BIND_LIMIT) }]),
    /安全写入上限/,
  );
});

test('removing a legacy Group does not reappear in the canonical projection', async () => {
  const initial = await call('/api/collections/state');
  const settings = initial.payload.objects.find(object => object.entity === 'settings');
  const result = await call('/api/collections/operations', {
    method: 'POST',
    body: {
      protocol: 2,
      epoch: initial.payload.epoch,
      opId: 'remove-legacy-group',
      entity: 'settings',
      id: 'resources',
      kind: 'patch',
      baseRevision: settings.revision,
      patch: {
        groups: [],
        types: settings.data.types.map(({ group, ...type }) => type),
      },
    },
  });
  assert.equal(result.response.status, 200);

  const current = await call('/api/collections/state');
  assert.deepEqual(current.payload.objects.find(object => object.entity === 'settings').data.groups, []);
  assert.equal(
    env.DB.sqlite.prepare("SELECT active FROM collection_legacy_groups WHERE id='legacy-study'").get().active,
    0,
  );
  const verification = await call('/api/collections/verify');
  assert.equal(verification.payload.ok, true, JSON.stringify(verification.payload.mismatches));
});

test('Deck timestamps are exposed and multi-Deck verification is order independent', async () => {
  let state = await call('/api/collections/state');
  const settings = state.payload.objects.find(object => object.entity === 'settings');
  let result = await call('/api/collections/operations', {
    method: 'POST',
    body: {
      protocol: 2,
      epoch: state.payload.epoch,
      opId: 'add-second-deck',
      entity: 'settings',
      id: 'resources',
      kind: 'patch',
      baseRevision: settings.revision,
      patch: {
        decks: [...settings.data.decks, {
          id: 'deck-alpha',
          name: 'Alpha',
          emoji: '🅰️',
          description: 'Second deck',
        }],
      },
    },
  });
  assert.equal(result.response.status, 200);

  state = await call('/api/collections/state');
  const resource = state.payload.objects.find(object => object.entity === 'resource' && object.id === 'resource-1');
  result = await call('/api/collections/operations', {
    method: 'POST',
    body: {
      protocol: 2,
      epoch: state.payload.epoch,
      opId: 'add-second-deck-membership',
      entity: 'resource',
      id: resource.id,
      kind: 'patch',
      baseRevision: resource.revision,
      patch: { deck_ids: ['deck-weekend', 'deck-alpha'] },
    },
  });
  assert.equal(result.response.status, 200);

  state = await call('/api/collections/state');
  const decks = state.payload.objects.find(object => object.entity === 'settings').data.decks;
  assert.ok(decks.every(deck => Number.isFinite(Date.parse(deck.created_at)) && Number.isFinite(Date.parse(deck.updated_at))));
  const verification = await call('/api/collections/verify');
  assert.equal(verification.payload.ok, true, JSON.stringify(verification.payload.mismatches));
});

test('retired mode serves and updates the compatibility projection while disabling atomic commands', async () => {
  env.DB.sqlite.prepare("UPDATE collection_runtime SET mode='retired' WHERE id=1").run();

  let result = await call('/api/collections/state');
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.mode, 'retired');
  assert.equal(result.payload.collections_schema, 0);
  const resource = result.payload.objects.find(object => object.entity === 'resource' && object.id === 'resource-1');

  result = await call('/api/collections/operations', {
    method: 'POST',
    body: {
      protocol: 2,
      epoch: 'fixture-epoch',
      opId: 'retired-resource-patch',
      entity: 'resource',
      id: 'resource-1',
      kind: 'patch',
      baseRevision: resource.revision,
      patch: { status: 'active' },
    },
  });
  assert.equal(result.response.status, 200);

  result = await call('/api/collections/state');
  assert.equal(result.payload.mode, 'retired');
  assert.equal(
    result.payload.objects.find(object => object.entity === 'resource' && object.id === 'resource-1').data.status,
    'active',
  );

  result = await call('/api/collections/commands', {
    method: 'POST',
    body: {
      protocol: 2,
      epoch: 'fixture-epoch',
      opId: 'retired-command',
      baseHead: 6,
      command: 'bulk',
      resource_ids: ['resource-1'],
      action: 'status',
      value: 'completed',
    },
  });
  assert.equal(result.response.status, 503);
  assert.equal(result.payload.code, 'collections_retired');
});
