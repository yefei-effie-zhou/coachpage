import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { NotebookSync } from '../assets/sync-v2.js';

const clients = [];
const databaseName = 'notebook-sync-v2';

function remoteFixture() {
  return {
    protocol: 2,
    collections_schema: 1,
    mode: 'active',
    epoch: 'sync-client-epoch',
    head: 2,
    objects: [
      {
        entity: 'settings',
        id: 'resources',
        revision: 1,
        deleted: false,
        data: {
          id: 'resources',
          schema_version: 4,
          languages: [{ id: 'lang-en', name: 'English' }],
          groups: [],
          types: [{ id: 'article', name: '文章', emoji: '📝' }],
          tags: [{ id: 'tag-base', name: '基础' }],
          decks: [],
        },
      },
      {
        entity: 'resource',
        id: 'resource-1',
        revision: 2,
        deleted: false,
        data: {
          id: 'resource-1',
          name: 'Article',
          url: '',
          type: 'article',
          language_id: 'lang-en',
          language: 'English',
          topic: '',
          description: '',
          emoji: '📝',
          tag_ids: ['tag-base'],
          deck_ids: [],
          status: 'backlog',
          completed_at: '',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      },
    ],
  };
}

function clone(value) {
  return structuredClone(value);
}

async function deleteDatabase() {
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB test database is blocked.'));
  });
}

afterEach(async () => {
  while (clients.length) clients.pop().close();
  await deleteDatabase();
});

test('offline Collections commands persist, keep an optimistic view, and retry the same opId', async () => {
  const remote = remoteFixture();
  const receipts = new Map();
  const sentOpIds = [];
  let loseFirstResponse = true;
  const endpoints = {
    fetchState: async () => clone(remote),
    sendOperation: async () => { throw new Error('not used'); },
    sendCommand: async operation => {
      sentOpIds.push(operation.opId);
      if (!receipts.has(operation.opId)) {
        const object = remote.objects.find(item => item.entity === 'resource' && item.id === 'resource-1');
        remote.head++;
        object.revision = remote.head;
        object.data.status = operation.value;
        object.data.updated_at = '2026-01-02T00:00:00.000Z';
        receipts.set(operation.opId, {
          ok: true,
          epoch: remote.epoch,
          head: remote.head,
          opId: operation.opId,
          command: operation.command,
          changed_resource_ids: ['resource-1'],
          settings_changed: false,
        });
        if (loseFirstResponse) {
          loseFirstResponse = false;
          throw new Error('simulated response loss');
        }
      }
      return clone(receipts.get(operation.opId));
    },
  };
  let client = await NotebookSync.open({
    scope: 'https://worker.example',
    storageKey: 'collections-test-retry',
    ...endpoints,
  });
  clients.push(client);
  assert.equal(client.status().collectionsSchema, 1);
  assert.equal(client.status().remoteMode, 'active');
  assert.equal(client.status().objects, remote.objects.length);

  await client.command(
    { command: 'bulk', resource_ids: ['resource-1'], action: 'status', value: 'completed' },
    [{ entity: 'resource', id: 'resource-1', kind: 'patch', patch: { status: 'completed' } }],
  );
  assert.equal(client.view('resource')[0].status, 'completed');
  await client.sync();
  assert.equal(client.status().commands, 1);
  assert.equal(sentOpIds.length, 1);

  client.close();
  clients.pop();
  client = await NotebookSync.open({
    scope: 'https://worker.example',
    storageKey: 'collections-test-retry',
    ...endpoints,
  });
  clients.push(client);
  assert.equal(client.status().commands, 0);
  assert.equal(client.view('resource')[0].status, 'completed');
  assert.equal(sentOpIds.length, 2);
  assert.equal(sentOpIds[0], sentOpIds[1], 'a response-loss retry must reuse the frozen opId');
});

test('settings arrays three-way merge independent additions and surface destructive conflicts', async () => {
  const remote = remoteFixture();
  const sendOperation = async operation => {
    const object = remote.objects.find(item => item.entity === operation.entity && item.id === operation.id);
    remote.head++;
    object.revision = remote.head;
    object.deleted = operation.kind === 'delete';
    object.data = { ...object.data, ...clone(operation.patch), id: object.id };
    return {
      ok: true,
      epoch: remote.epoch,
      head: remote.head,
      opId: operation.opId,
      object: clone(object),
    };
  };
  const client = await NotebookSync.open({
    scope: 'https://worker.example',
    storageKey: 'collections-test-merge',
    fetchState: async () => clone(remote),
    sendOperation,
  });
  clients.push(client);

  const localSettings = client.view('settings')[0];
  await client.put('settings', 'resources', {
    ...localSettings,
    tags: [...localSettings.tags, { id: 'tag-local', name: '本机' }],
  });
  const remoteSettings = remote.objects.find(item => item.entity === 'settings');
  remote.head++;
  remoteSettings.revision = remote.head;
  remoteSettings.data.tags.push({ id: 'tag-remote', name: '远端' });
  await client.sync();
  assert.deepEqual(
    new Set(client.view('settings')[0].tags.map(item => item.id)),
    new Set(['tag-base', 'tag-local', 'tag-remote']),
  );
  assert.equal(client.status().conflicts, 0);

  const resource = client.view('resource')[0];
  await client.put('resource', resource.id, { ...resource, description: '本机修改' });
  const remoteResource = remote.objects.find(item => item.entity === 'resource');
  remote.head++;
  remoteResource.revision = remote.head;
  remoteResource.deleted = true;
  await client.sync();
  assert.equal(client.status().conflicts, 1);
  assert.equal(client.details().conflicts[0].remote.deleted, true);
  await client.resolveConflict(client.details().conflicts[0].id, 'remote');
  assert.equal(client.status().conflicts, 0);
  assert.equal(client.view('resource').length, 0);
});

test('same-name settings additions become a conflict before an invalid request is sent', async () => {
  const remote = remoteFixture();
  let sends = 0;
  const client = await NotebookSync.open({
    scope: 'https://worker.example',
    storageKey: 'collections-test-settings-name-conflict',
    fetchState: async () => clone(remote),
    sendOperation: async () => { sends++; throw new Error('must not send duplicate settings'); },
  });
  clients.push(client);
  const local = client.view('settings')[0];
  await client.put('settings', 'resources', {
    ...local,
    tags: [...local.tags, { id: 'tag-local-ai', name: 'AI' }],
  });
  const remoteSettings = remote.objects.find(item => item.entity === 'settings');
  remote.head++;
  remoteSettings.revision = remote.head;
  remoteSettings.data.tags.push({ id: 'tag-remote-ai', name: 'ＡＩ' });

  await client.sync();
  assert.equal(sends, 0);
  assert.equal(client.status().conflicts, 1);
  assert.equal(client.details().conflicts[0].entity, 'settings');
});

test('permanent operation errors become discardable conflicts instead of retry poison', async () => {
  const remote = remoteFixture();
  let attempts = 0;
  const client = await NotebookSync.open({
    scope: 'https://worker.example',
    storageKey: 'collections-test-terminal-operation',
    fetchState: async () => clone(remote),
    sendOperation: async () => {
      attempts++;
      const error = new Error('invalid request');
      error.status = 400;
      error.payload = { code: 'invalid_request', error: 'invalid request' };
      throw error;
    },
  });
  clients.push(client);
  const resource = client.view('resource')[0];
  await client.put('resource', resource.id, { ...resource, description: 'invalid local edit' });
  await client.sync();
  assert.equal(client.status().conflicts, 1);
  await client.sync();
  assert.equal(attempts, 1);
  await client.resolveConflict(client.details().conflicts[0].id, 'remote');
  assert.equal(client.status().pending, 0);
});

test('same-scope backup imports preserve IDs while cross-scope imports create copies', async () => {
  const remote = remoteFixture();
  const client = await NotebookSync.open({
    scope: 'https://worker.example',
    storageKey: 'collections-test-imports',
    fetchState: async () => clone(remote),
    sendOperation: async () => { throw new Error('not used'); },
  });
  clients.push(client);
  const resource = {
    id: 'backup-resource',
    name: 'Backup item',
    type: 'article',
    language_id: null,
    tag_ids: ['tag-base'],
    deck_ids: [],
    status: 'backlog',
    created_at: '2026-02-01T00:00:00.000Z',
  };

  await client.stageBackup({
    version: 3,
    scope: 'https://worker.example',
    state: { resources: [resource] },
  });
  let candidate = client.details().candidates.find(item => item.entityId === resource.id);
  const preservedId = await client.importCandidate(candidate.id, {
    type: 'article',
    language_id: null,
    tag_ids: ['tag-base'],
    deck_ids: [],
  });
  assert.equal(preservedId, resource.id);

  await client.stageBackup({
    version: 3,
    scope: 'https://another-worker.example',
    state: { resources: [{ ...resource, id: 'cross-scope-resource' }] },
  }, { allowDifferentScope: true });
  candidate = client.details().candidates.find(item => item.entityId === 'cross-scope-resource');
  const copyId = await client.importCandidate(candidate.id, {
    type: 'article',
    language_id: null,
    tag_ids: ['tag-base'],
    deck_ids: [],
  });
  assert.notEqual(copyId, 'cross-scope-resource');
});

test('backup staging can split Notebook and Collections content without duplicating candidates', async () => {
  const client = await NotebookSync.open({
    scope: 'https://worker.example',
    storageKey: 'collections-test-filtered-backup',
    fetchState: async () => clone(remoteFixture()),
    sendOperation: async () => { throw new Error('not used'); },
  });
  clients.push(client);
  const payload = {
    version: 3,
    scope: 'https://worker.example',
    state: {
      cards: [{ id: 'backup-card', text: 'hello' }],
      resources: [{ id: 'backup-filter-resource', name: 'Resource' }],
      resourceLanguages: [{ id: 'lang-en', name: 'English' }],
      resourceGroups: [],
      resourceTypes: [{ id: 'article', name: '文章' }],
      resourceTags: [],
      resourceDecks: [],
      html: '<p>draft</p>',
    },
  };

  const collections = await client.stageBackup(payload, {
    entities: ['resource'],
    includeSettings: true,
    includeDrafts: false,
  });
  assert.equal(collections.added, 1);
  assert.equal(collections.drafts, 0);
  assert.deepEqual(client.details().candidates.map(item => item.entity), ['resource']);
  assert.equal(client.settingsSources().length, 1);

  const notebook = await client.stageBackup(payload, {
    entities: ['card', 'document'],
    includeSettings: false,
    includeDrafts: true,
  });
  assert.equal(notebook.added, 1);
  assert.equal(notebook.drafts, 1);
  assert.deepEqual(new Set(client.details().candidates.map(item => item.entity)), new Set(['resource', 'card']));
  assert.equal(client.settingsSources().length, 1);

  const duplicate = await client.stageBackup(payload, {
    entities: ['card', 'document'],
    includeSettings: false,
    includeDrafts: true,
  });
  assert.equal(duplicate.duplicate, true);
});

test('paused Collections commands can be retried or explicitly discarded', async () => {
  const remote = remoteFixture();
  let reject = true;
  const client = await NotebookSync.open({
    scope: 'https://worker.example',
    storageKey: 'collections-test-paused-command',
    fetchState: async () => clone(remote),
    sendOperation: async () => { throw new Error('not used'); },
    sendCommand: async operation => {
      if (reject) {
        const error = new Error('tag was removed');
        error.status = 409;
        error.payload = { code: 'reference_conflict', error: 'tag was removed' };
        throw error;
      }
      remote.head++;
      return {
        ok: true,
        epoch: remote.epoch,
        head: remote.head,
        opId: operation.opId,
        command: operation.command,
        changed_resource_ids: [],
        settings_changed: false,
      };
    },
  });
  clients.push(client);
  await client.command(
    { command: 'bulk', resource_ids: ['resource-1'], action: 'remove_tags', ids: ['tag-base'] },
    [{ entity: 'resource', id: 'resource-1', kind: 'patch', patch: { tag_ids: [] } }],
  );
  await client.sync();
  let command = client.details().commands[0];
  assert.equal(command.paused, true);
  await client.retryCommand(command.token);
  reject = false;
  await client.sync();
  assert.equal(client.status().commands, 0);

  await client.command(
    { command: 'bulk', resource_ids: ['resource-1'], action: 'status', value: 'active' },
    [{ entity: 'resource', id: 'resource-1', kind: 'patch', patch: { status: 'active' } }],
  );
  command = client.details().commands[0];
  await client.discardCommand(command.token);
  assert.equal(client.status().commands, 0);
  assert.equal(client.view('resource')[0].status, 'backlog');
});

test('first-use offline settings merge safely with the server baseline on reconnect', async () => {
  const remote = remoteFixture();
  let online = false;
  const client = await NotebookSync.open({
    scope: 'https://worker.example',
    storageKey: 'collections-test-provisional-settings',
    fetchState: async () => {
      if (!online) throw new Error('offline');
      return clone(remote);
    },
    sendOperation: async operation => {
      const object = remote.objects.find(item => item.entity === operation.entity && item.id === operation.id);
      remote.head++;
      object.revision = remote.head;
      object.data = { ...object.data, ...clone(operation.patch), id: object.id };
      return { ok: true, epoch: remote.epoch, head: remote.head, opId: operation.opId, object: clone(object) };
    },
  });
  clients.push(client);
  assert.equal(client.status().ready, false);
  await client.put('settings', 'resources', {
    id: 'resources',
    schema_version: 4,
    languages: [{ id: 'lang-en', name: 'English' }],
    groups: [],
    types: [{ id: 'article', name: '文章', emoji: '📝' }],
    tags: [{ id: 'tag-offline', name: '离线创建' }],
    decks: [],
  });
  online = true;
  await client.sync();
  assert.equal(client.status().conflicts, 0);
  assert.equal(client.status().pending, 0);
  assert.deepEqual(
    new Set(client.view('settings')[0].tags.map(item => item.id)),
    new Set(['tag-base', 'tag-offline']),
  );
});

test('chained writes rebase from their original base and surface concurrent edits', async () => {
  const remote = remoteFixture();
  const sendOperation = async operation => {
    const object = remote.objects.find(item => item.entity === operation.entity && item.id === operation.id);
    assert.equal(operation.baseRevision, object.revision);
    remote.head++;
    object.revision = remote.head;
    object.data = { ...object.data, ...clone(operation.patch), id: object.id };
    return {
      ok: true,
      epoch: remote.epoch,
      head: remote.head,
      opId: operation.opId,
      object: clone(object),
    };
  };
  const client = await NotebookSync.open({
    scope: 'https://worker.example',
    storageKey: 'collections-test-chained-rebase',
    fetchState: async () => clone(remote),
    sendOperation,
  });
  clients.push(client);

  let resource = client.view('resource')[0];
  await client.put('resource', resource.id, { ...resource, description: 'first local edit' });
  resource = client.view('resource')[0];
  await client.put('resource', resource.id, { ...resource, status: 'active' });

  const remoteResource = remote.objects.find(item => item.entity === 'resource');
  remote.head++;
  remoteResource.revision = remote.head;
  remoteResource.data.status = 'completed';
  await client.sync();

  assert.equal(remoteResource.data.description, 'first local edit');
  assert.equal(remoteResource.data.status, 'completed');
  assert.equal(client.status().conflicts, 1);
  assert.equal(client.details().conflicts[0].remote.data.status, 'completed');
});

test('local conflict resolution preserves its position before a later command', async () => {
  const remote = remoteFixture();
  const client = await NotebookSync.open({
    scope: 'https://worker.example',
    storageKey: 'collections-test-conflict-order',
    fetchState: async () => clone(remote),
    sendOperation: async () => { throw new Error('must resolve before send'); },
    sendCommand: async () => { throw new Error('must resolve before send'); },
  });
  clients.push(client);
  const resource = client.view('resource')[0];
  await client.put('resource', resource.id, { ...resource, status: 'active' });
  await client.command(
    { command: 'bulk', resource_ids: ['resource-1'], action: 'status', value: 'completed' },
    [{ entity: 'resource', id: 'resource-1', kind: 'patch', patch: { status: 'completed' } }],
  );
  const remoteResource = remote.objects.find(item => item.entity === 'resource');
  remote.head++;
  remoteResource.revision = remote.head;
  remoteResource.data.status = 'completed';
  await client.sync();
  const conflictId = client.details().conflicts[0].id;
  await client.resolveConflict(conflictId, 'local');

  const backup = client.exportBackup();
  assert.ok(backup.queue[0].order < backup.commands[0].order);
  assert.equal(client.view('resource')[0].status, 'completed');
});

test('operations and Collections commands flush in enqueue order', async () => {
  const remote = remoteFixture();
  const sent = [];
  const optimisticCompletedAt = '2026-02-02T03:04:05.000Z';
  const client = await NotebookSync.open({
    scope: 'https://worker.example',
    storageKey: 'collections-test-outbox-order',
    fetchState: async () => clone(remote),
    sendOperation: async operation => {
      sent.push('operation');
      const object = remote.objects.find(item => item.entity === operation.entity && item.id === operation.id);
      assert.equal(operation.baseRevision, object.revision);
      remote.head++;
      object.revision = remote.head;
      object.data = { ...object.data, ...clone(operation.patch), id: object.id };
      return { ok: true, epoch: remote.epoch, head: remote.head, opId: operation.opId, object: clone(object) };
    },
    sendCommand: async operation => {
      sent.push('command');
      const object = remote.objects.find(item => item.entity === 'resource' && item.id === 'resource-1');
      assert.equal(operation.baseHead, remote.head);
      assert.equal(operation.completed_at, optimisticCompletedAt);
      remote.head++;
      object.revision = remote.head;
      object.data.status = operation.value;
      object.data.completed_at = operation.completed_at;
      return {
        ok: true,
        epoch: remote.epoch,
        head: remote.head,
        opId: operation.opId,
        command: operation.command,
        changed_resource_ids: [object.id],
        settings_changed: false,
      };
    },
  });
  clients.push(client);

  await client.command(
    { command: 'bulk', resource_ids: ['resource-1'], action: 'status', value: 'completed' },
    [{
      entity: 'resource',
      id: 'resource-1',
      kind: 'patch',
      patch: { status: 'completed', completed_at: optimisticCompletedAt },
    }],
  );
  const projected = client.view('resource')[0];
  assert.equal(projected.status, 'completed');
  await client.put('resource', projected.id, { ...projected, status: 'active' });
  assert.equal(client.view('resource')[0].status, 'active');

  await client.sync();
  assert.deepEqual(sent, ['command', 'operation']);
  assert.equal(remote.objects.find(item => item.id === 'resource-1').data.status, 'active');
  assert.equal(client.status().pending, 0);
});

test('legacy orderless mixed outboxes recover command-before-operation causality', async () => {
  const remote = remoteFixture();
  let client = await NotebookSync.open({
    scope: 'https://worker.example',
    storageKey: 'collections-test-legacy-mixed-order',
    fetchState: async () => clone(remote),
    sendOperation: async () => { throw new Error('not used'); },
    sendCommand: async () => { throw new Error('not used'); },
  });
  clients.push(client);
  await client.command(
    { command: 'bulk', resource_ids: ['resource-1'], action: 'status', value: 'completed' },
    [{ entity: 'resource', id: 'resource-1', kind: 'patch', patch: { status: 'completed' } }],
  );
  const projected = client.view('resource')[0];
  await client.put('resource', projected.id, { ...projected, status: 'active' });
  await client._transaction(state => {
    for (const entry of [...state.queue, ...state.commands]) delete entry.order;
    state.nextOrder = 1;
    delete state.outboxOrderVersion;
  });
  client.close();
  clients.pop();

  client = await NotebookSync.open({
    scope: 'https://worker.example',
    storageKey: 'collections-test-legacy-mixed-order',
    fetchState: async () => { throw new Error('offline'); },
    sendOperation: async () => { throw new Error('not used'); },
    sendCommand: async () => { throw new Error('not used'); },
  });
  clients.push(client);
  const backup = client.exportBackup();
  assert.ok(backup.commands[0].order < backup.queue[0].order);
  assert.equal(client.view('resource')[0].status, 'active');
});

test('legacy queue-first mixed orders are corrected from causal state', async () => {
  const remote = remoteFixture();
  let client = await NotebookSync.open({
    scope: 'https://worker.example',
    storageKey: 'collections-test-legacy-queue-first-order',
    fetchState: async () => clone(remote),
    sendOperation: async () => { throw new Error('not used'); },
    sendCommand: async () => { throw new Error('not used'); },
  });
  clients.push(client);
  await client.command(
    { command: 'bulk', resource_ids: ['resource-1'], action: 'status', value: 'completed' },
    [{ entity: 'resource', id: 'resource-1', kind: 'patch', patch: { status: 'completed' } }],
  );
  const projected = client.view('resource')[0];
  await client.put('resource', projected.id, { ...projected, status: 'active' });
  const active = client.view('resource')[0];
  await client.put('resource', active.id, { ...active, description: 'newer edit' });
  await client._transaction(state => {
    state.queue[0].order = 1;
    state.commands[0].order = 2;
    state.queue[1].order = 3;
    state.nextOrder = 4;
    delete state.outboxOrderVersion;
  });
  client.close();
  clients.pop();

  client = await NotebookSync.open({
    scope: 'https://worker.example',
    storageKey: 'collections-test-legacy-queue-first-order',
    fetchState: async () => { throw new Error('offline'); },
    sendOperation: async () => { throw new Error('not used'); },
    sendCommand: async () => { throw new Error('not used'); },
  });
  clients.push(client);
  const backup = client.exportBackup();
  assert.ok(backup.commands[0].order < backup.queue[0].order);
  assert.ok(backup.queue[0].order < backup.queue[1].order);
  assert.equal(backup.commands[0].paused, false);
  assert.ok(backup.queue.every(entry => !entry.paused));
  assert.equal(client.view('resource')[0].status, 'active');
  assert.equal(client.view('resource')[0].description, 'newer edit');
});

test('retired Collections commands pause visibly instead of poisoning automatic retries', async () => {
  const remote = remoteFixture();
  let attempts = 0;
  const client = await NotebookSync.open({
    scope: 'https://worker.example',
    storageKey: 'collections-test-retired-command',
    fetchState: async () => clone(remote),
    sendOperation: async () => { throw new Error('not used'); },
    sendCommand: async () => {
      attempts++;
      const error = new Error('Collections retired');
      error.status = 503;
      error.payload = { code: 'collections_retired', error: 'Collections retired' };
      throw error;
    },
  });
  clients.push(client);
  await client.command(
    { command: 'bulk', resource_ids: ['resource-1'], action: 'status', value: 'active' },
    [{ entity: 'resource', id: 'resource-1', kind: 'patch', patch: { status: 'active' } }],
  );
  await client.sync();
  const command = client.details().commands[0];
  assert.equal(command.paused, true);
  assert.equal(command.failure.code, 'collections_retired');
  await client.sync();
  assert.equal(attempts, 1);
});

test('Collections commands cannot optimistically revive a remote tombstone', async () => {
  const remote = remoteFixture();
  remote.objects.find(object => object.entity === 'resource').deleted = true;
  const client = await NotebookSync.open({
    scope: 'https://worker.example',
    storageKey: 'collections-test-command-tombstone',
    fetchState: async () => clone(remote),
    sendOperation: async () => { throw new Error('not used'); },
    sendCommand: async () => { throw new Error('must not send'); },
  });
  clients.push(client);
  await assert.rejects(
    client.command(
      { command: 'bulk', resource_ids: ['resource-1'], action: 'status', value: 'active' },
      [{ entity: 'resource', id: 'resource-1', kind: 'patch', patch: { status: 'active' } }],
    ),
    /已删除/,
  );
  assert.equal(client.view('resource').length, 0);
});

test('an old-epoch command acknowledgement cannot remove a command paused by another tab', async () => {
  const remote = remoteFixture();
  let client;
  client = await NotebookSync.open({
    scope: 'https://worker.example',
    storageKey: 'collections-test-stale-command-ack',
    fetchState: async () => clone(remote),
    sendOperation: async () => { throw new Error('not used'); },
    sendCommand: async operation => {
      await client._transaction(state => {
        state.epochBackups.push({ epoch: state.epoch, head: state.head, base: clone(state.base) });
        state.epoch = 'new-epoch-from-other-tab';
        state.head = 1;
        state.snapshotHead = 1;
        state.epochChanged = true;
        for (const command of state.commands) command.paused = true;
      });
      return {
        ok: true,
        epoch: operation.epoch,
        head: operation.baseHead + 1,
        opId: operation.opId,
        command: operation.command,
        changed_resource_ids: ['resource-1'],
        settings_changed: false,
      };
    },
  });
  clients.push(client);
  await client.command(
    { command: 'bulk', resource_ids: ['resource-1'], action: 'status', value: 'active' },
    [{ entity: 'resource', id: 'resource-1', kind: 'patch', patch: { status: 'active' } }],
  );
  await client.sync();
  const backup = client.exportBackup();
  assert.equal(backup.epoch, 'new-epoch-from-other-tab');
  assert.equal(backup.head, 1);
  assert.equal(backup.commands.length, 1);
  assert.equal(backup.commands[0].paused, true);
});

test('epoch recovery coalesces an edit chain and retains same-ID conflict resolution', async () => {
  const remote = remoteFixture();
  const client = await NotebookSync.open({
    scope: 'https://worker.example',
    storageKey: 'collections-test-epoch-chain-recovery',
    fetchState: async () => clone(remote),
    sendOperation: async () => { throw new Error('not used'); },
  });
  clients.push(client);
  let resource = client.view('resource')[0];
  await client.put('resource', resource.id, { ...resource, description: 'first offline edit' });
  resource = client.view('resource')[0];
  await client.put('resource', resource.id, { ...resource, status: 'active' });

  remote.epoch = 'replacement-epoch';
  await client.sync();
  assert.equal(client.status().epochChanged, true);
  await client.resolveEpochChange({ backupConfirmed: true });

  const candidates = client.details().candidates.filter(item =>
    item.entity === 'resource' && item.entityId === 'resource-1');
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].asCopy, false);
  assert.equal(candidates[0].data.description, 'first offline edit');
  assert.equal(candidates[0].data.status, 'active');

  await client.resolveCandidate(candidates[0].id, 'local');
  const restored = client.view('resource').find(item => item.id === 'resource-1');
  assert.equal(restored.description, 'first offline edit');
  assert.equal(restored.status, 'active');
});

test('epoch recovery folds commands and operations as one ordered outbox', async () => {
  const remote = remoteFixture();
  const client = await NotebookSync.open({
    scope: 'https://worker.example',
    storageKey: 'collections-test-epoch-mixed-outbox',
    fetchState: async () => clone(remote),
    sendOperation: async () => { throw new Error('not used'); },
    sendCommand: async () => { throw new Error('not used'); },
  });
  clients.push(client);
  await client.command(
    { command: 'bulk', resource_ids: ['resource-1'], action: 'status', value: 'completed' },
    [{ entity: 'resource', id: 'resource-1', kind: 'patch', patch: { status: 'completed' } }],
  );
  const completed = client.view('resource')[0];
  await client.put('resource', completed.id, { ...completed, status: 'active' });
  remote.epoch = 'mixed-replacement-epoch';
  await client.sync();
  await client.resolveEpochChange({ backupConfirmed: true });
  const candidates = client.details().candidates.filter(item => item.entityId === 'resource-1');
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].data.status, 'active');

  const remoteDelete = remoteFixture();
  const deleteClient = await NotebookSync.open({
    scope: 'https://worker.example',
    storageKey: 'collections-test-epoch-operation-delete',
    fetchState: async () => clone(remoteDelete),
    sendOperation: async () => { throw new Error('not used'); },
    sendCommand: async () => { throw new Error('not used'); },
  });
  clients.push(deleteClient);
  const resource = deleteClient.view('resource')[0];
  await deleteClient.put('resource', resource.id, { ...resource, description: 'edit before delete' });
  await deleteClient.command(
    { command: 'bulk', resource_ids: ['resource-1'], action: 'delete' },
    [{ entity: 'resource', id: 'resource-1', kind: 'delete', patch: {} }],
  );
  remoteDelete.epoch = 'delete-replacement-epoch';
  await deleteClient.sync();
  await deleteClient.resolveEpochChange({ backupConfirmed: true });
  assert.equal(deleteClient.details().candidates.filter(item => item.entityId === 'resource-1').length, 0);
});

test('non-retryable command failures pause visibly and retain retry controls', async () => {
  const remote = remoteFixture();
  let reject = true;
  let attempts = 0;
  const client = await NotebookSync.open({
    scope: 'https://worker.example',
    storageKey: 'collections-test-terminal-command',
    fetchState: async () => clone(remote),
    sendOperation: async () => { throw new Error('not used'); },
    sendCommand: async operation => {
      attempts++;
      if (reject) {
        const error = new Error('request is too large');
        error.status = 413;
        error.payload = { code: 'collection_command_too_large', error: 'request is too large' };
        throw error;
      }
      remote.head++;
      return {
        ok: true,
        epoch: remote.epoch,
        head: remote.head,
        opId: operation.opId,
        command: operation.command,
        changed_resource_ids: [],
        settings_changed: false,
      };
    },
  });
  clients.push(client);

  await client.command(
    { command: 'bulk', resource_ids: ['resource-1'], action: 'status', value: 'active' },
    [{ entity: 'resource', id: 'resource-1', kind: 'patch', patch: { status: 'active' } }],
  );
  await client.sync();
  let command = client.details().commands[0];
  assert.equal(command.paused, true);
  assert.equal(command.failure.code, 'collection_command_too_large');
  assert.match(command.failure.message, /too large/);
  await client.sync();
  assert.equal(attempts, 1, 'a terminal failure must not poison automatic retries');

  reject = false;
  await client.retryCommand(command.token);
  await client.sync();
  assert.equal(attempts, 2);
  assert.equal(client.status().commands, 0);
});

test('collectionsSync backups recover paused and archived command projections', async () => {
  const remote = remoteFixture();
  const source = await NotebookSync.open({
    scope: 'https://worker.example',
    storageKey: 'collections-test-command-backup-source',
    fetchState: async () => clone(remote),
    sendOperation: async () => { throw new Error('not used'); },
    sendCommand: async () => {
      const error = new Error('target changed');
      error.status = 409;
      error.payload = { code: 'reference_conflict', error: 'target changed' };
      throw error;
    },
  });
  clients.push(source);
  await source.command(
    { command: 'bulk', resource_ids: ['resource-1'], action: 'status', value: 'active' },
    [{ entity: 'resource', id: 'resource-1', kind: 'patch', patch: { status: 'active' } }],
  );
  await source.sync();
  const pausedBackup = source.exportBackup();
  const pausedToken = source.details().commands[0].token;
  await source.discardCommand(pausedToken);
  const archivedBackup = source.exportBackup();

  for (const [name, backup] of [['paused', pausedBackup], ['archived', archivedBackup]]) {
    const target = await NotebookSync.open({
      scope: 'https://worker.example',
      storageKey: `collections-test-command-backup-${name}`,
      fetchState: async () => clone(remote),
      sendOperation: async () => { throw new Error('not used'); },
    });
    clients.push(target);
    const result = await target.stageBackup({
      version: 3,
      scope: 'https://worker.example',
      collectionsSync: backup,
    }, {
      entities: ['resource'],
      includeSettings: true,
      includeDrafts: false,
    });
    assert.ok(result.added >= 1);
    assert.ok(target.details().candidates.some(candidate =>
      candidate.entityId === 'resource-1' && candidate.data.status === 'active'));
  }
});

test('archived taxonomy commands preserve explicit, reference-safe deletion recovery', async () => {
  const remote = remoteFixture();
  const source = await NotebookSync.open({
    scope: 'https://worker.example',
    storageKey: 'collections-test-taxonomy-recovery-source',
    fetchState: async () => clone(remote),
    sendOperation: async () => { throw new Error('not used'); },
    sendCommand: async () => {
      const error = new Error('target changed');
      error.status = 409;
      error.payload = { code: 'reference_conflict', error: 'target changed' };
      throw error;
    },
  });
  clients.push(source);
  await source.command(
    { command: 'delete_tag', source_id: 'tag-base' },
    [
      { entity: 'settings', id: 'resources', kind: 'patch', patch: { tags: [] } },
      { entity: 'resource', id: 'resource-1', kind: 'patch', patch: { tag_ids: [] } },
    ],
  );
  await source.sync();
  await source.discardCommand(source.details().commands[0].token);

  const target = await NotebookSync.open({
    scope: 'https://worker.example',
    storageKey: 'collections-test-taxonomy-recovery-target',
    fetchState: async () => clone(remote),
    sendOperation: async () => { throw new Error('not used'); },
  });
  clients.push(target);
  await target.stageBackup({
    version: 3,
    scope: 'https://worker.example',
    collectionsSync: source.exportBackup(),
  });
  const recovery = target.settingsSources().find(item => item.removals?.tags?.some(tag => tag.id === 'tag-base'));
  assert.ok(recovery);
  await assert.rejects(
    target.importSettings(recovery.id, { removals: { tags: ['tag-base'] } }),
    /仍被资源或可恢复记录引用/,
  );
  const candidate = target.details().candidates.find(item =>
    item.entityId === 'resource-1' && item.data.tag_ids?.length === 0);
  assert.ok(candidate);
  await target.resolveCandidate(candidate.id, 'local');
  await target.importSettings(recovery.id, { removals: { tags: ['tag-base'] } });
  assert.deepEqual(target.view('resource')[0].tag_ids, []);
  assert.deepEqual(target.view('settings')[0].tags, []);

  const crossScope = await NotebookSync.open({
    scope: 'https://worker.example',
    storageKey: 'collections-test-taxonomy-recovery-cross-scope',
    fetchState: async () => clone(remote),
    sendOperation: async () => { throw new Error('not used'); },
  });
  clients.push(crossScope);
  await crossScope.stageBackup({
    version: 3,
    scope: 'https://other-worker.example',
    collectionsSync: source.exportBackup(),
  }, { allowDifferentScope: true });
  const crossRecovery = crossScope.settingsSources().find(item =>
    item.removals?.tags?.some(tag => tag.id === 'tag-base'));
  assert.ok(crossRecovery?.asCopy);
  await assert.rejects(
    crossScope.importSettings(crossRecovery.id, { removals: { tags: ['tag-base'] } }),
    /其他云端来源的删除命令/,
  );
  assert.deepEqual(crossScope.view('settings')[0].tags.map(tag => tag.id), ['tag-base']);

  const mixedScope = await NotebookSync.open({
    scope: 'https://worker.example',
    storageKey: 'collections-test-taxonomy-recovery-mixed-scope',
    fetchState: async () => clone(remote),
    sendOperation: async () => { throw new Error('not used'); },
  });
  clients.push(mixedScope);
  const foreignCollections = source.exportBackup();
  foreignCollections.scope = 'https://other-worker.example';
  await mixedScope.stageBackup({
    version: 3,
    scope: 'https://worker.example',
    collectionsSync: foreignCollections,
  }, { allowDifferentScope: true });
  const mixedRecovery = mixedScope.settingsSources().find(item =>
    item.removals?.tags?.some(tag => tag.id === 'tag-base'));
  assert.ok(mixedRecovery?.asCopy);
  await assert.rejects(
    mixedScope.importSettings(mixedRecovery.id, { removals: { tags: ['tag-base'] } }),
    /其他云端来源的删除命令/,
  );
});

test('same-name Tags and Decks map old IDs during cross-scope restore', async () => {
  const remote = remoteFixture();
  const settings = remote.objects.find(object => object.entity === 'settings').data;
  settings.decks = [{ id: 'deck-current', name: '收藏', emoji: '📚', description: '' }];
  const client = await NotebookSync.open({
    scope: 'https://worker.example',
    storageKey: 'collections-test-same-name-mapping',
    fetchState: async () => clone(remote),
    sendOperation: async () => { throw new Error('not used'); },
  });
  clients.push(client);

  await client.stageBackup({
    version: 3,
    scope: 'https://other-worker.example',
    state: {
      resourceLanguages: [{ id: 'lang-old', name: 'English' }],
      resourceGroups: [],
      resourceTypes: [{ id: 'type-old', name: '文章', emoji: '📝' }],
      resourceTags: [{ id: 'tag-old', name: '基础' }],
      resourceDecks: [{ id: 'deck-old', name: '收藏', emoji: '📦', description: 'old' }],
      resources: [{
        id: 'cross-scope-mapped-resource',
        name: 'Mapped resource',
        type: 'type-old',
        language_id: 'lang-old',
        tag_ids: ['tag-old'],
        deck_ids: ['deck-old'],
        status: 'backlog',
      }],
    },
  }, { allowDifferentScope: true });

  const source = client.settingsSources()[0];
  const mappings = await client.importSettings(source.id, {
    languages: [],
    groups: [],
    types: [],
    tags: [],
    decks: [],
  });
  assert.equal(mappings.tags['tag-old'], 'tag-base');
  assert.equal(mappings.decks['deck-old'], 'deck-current');
  const candidate = client.details().candidates.find(item => item.entityId === 'cross-scope-mapped-resource');
  const id = await client.importCandidate(candidate.id, {
    type: 'article',
    language_id: 'lang-en',
  });
  const restored = client.view('resource').find(item => item.id === id);
  assert.deepEqual(restored.tag_ids, ['tag-base']);
  assert.deepEqual(restored.deck_ids, ['deck-current']);
});
