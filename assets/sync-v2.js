const DATABASE = 'notebook-sync-v2';
const STORE = 'scopes';
const ENTITIES = new Set(['card', 'document', 'resource', 'settings']);
const locks = new Map();
const peers = new Set();
const copy = value => value === undefined ? undefined : structuredClone(value);
const uuid = () => crypto.randomUUID();
const keyOf = (entity, id) => JSON.stringify([entity, id]);
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const equal = (a, b) => canonical(a) === canonical(b);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const freeze = value => {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
};

function checkTarget(entity, id) {
  if (!ENTITIES.has(entity) || typeof id !== 'string' || !id || (entity === 'settings' && id !== 'resources')) {
    throw new TypeError('无效的 entity 或 id。');
  }
}

function clean(entity, data) {
  return Object.fromEntries(Object.entries(data || {}).filter(([key, value]) => value !== undefined &&
    !['id', 'revision', 'created_at', 'updated_at', 'timestamp', 'timestamps'].includes(key) &&
    !key.startsWith('_sync') && !(entity === 'resource' && key === 'language')));
}

function apply(base, entry) {
  return {
    entity: entry.entity, id: entry.id, revision: base?.revision ?? 0,
    deleted: entry.kind === 'delete',
    data: { ...base?.data, ...copy(entry.patch), id: entry.id },
  };
}

function projection(state, entity, id) {
  let object = copy(state.base[keyOf(entity, id)] || null);
  for (const entry of state.queue) {
    if (entry.paused || entry.entity !== entity || entry.id !== id || (entry.epoch !== null && entry.epoch !== state.epoch)) continue;
    // 冲突继续保留本地投影，但绝不能让普通 patch 在远端墓碑上显示为复活。
    if (object?.deleted && entry.kind !== 'restore' && entry.kind !== 'delete') continue;
    object = apply(object || entry.base, entry);
  }
  return object;
}

function addEntry(state, entity, id, kind, patch, base) {
  const previous = state.queue.filter(entry => !entry.paused && entry.entity === entity && entry.id === id &&
    (entry.epoch === null || entry.epoch === state.epoch)).at(-1);
  const entry = { token: uuid(), entity, id, kind, patch: copy(patch), base: copy(base),
    after: previous?.token || null, epoch: state.epoch, paused: false, op: null, conflictId: null };
  state.queue.push(entry);
  for (const item of Object.values(state.conflicts)) {
    if (!item.paused && item.entity === entity && item.entityId === id && item.epoch === state.epoch) item.local = apply(item.local, entry);
  }
  return entry;
}

function safeRebase(entry, remote) {
  if (!entry.base || !remote || entry.kind === 'create') return false;
  if (entry.kind === 'restore' ? !remote.deleted : remote.deleted) return false;
  if (entry.base.deleted !== remote.deleted) return false;
  const old = clean(entry.entity, entry.base.data);
  const next = clean(entry.entity, remote.data);
  return entry.kind === 'patch'
    ? Object.keys(entry.patch).every(key => equal(old[key], next[key]))
    : equal(old, next);
}

function conflict(state, entry, remote, reason) {
  let local = copy(entry.base);
  for (const pending of state.queue) {
    if (!pending.paused && pending.entity === entry.entity && pending.id === entry.id && pending.epoch === entry.epoch) local = apply(local, pending);
  }
  const id = entry.conflictId || uuid();
  entry.conflictId = id;
  state.conflicts[id] = { id, entity: entry.entity, entityId: entry.id,
    local, remote: copy(remote), reason, entryId: entry.token, epoch: entry.epoch, paused: false };
}

function legacyComparable(entity, value, other, settings) {
  const data = clean(entity, value);
  if (entity === 'card') {
    for (const field of ['sentence', 'meaning', 'note']) data[field] ??= '';
    data.level ??= 0;
    data.language ||= 'nl';
  }
  if (entity === 'document') {
    data.title = data.title?.trim() || '未命名 transcript';
    for (const field of ['video_url', 'audio_url']) data[field] ??= '';
    data.language ||= 'nl';
    if (!data.annotations && typeof data.annotations_json === 'string') {
      try { data.annotations = JSON.parse(data.annotations_json); } catch { return data; }
    }
    delete data.annotations_json;
    data.annotations ??= [];
  }
  if (entity === 'resource') {
    for (const field of ['url', 'topic', 'description', 'emoji', 'completed_at']) data[field] ??= '';
    data.type ??= 'website';
    data.status ??= 'backlog';
    if (!Object.hasOwn(data, 'language_id')) {
      const name = value.language;
      const language = settings?.languages?.find(item => item.name === name);
      data.language_id = language?.id ?? ((other?.language === name && name) ? other.language_id : null) ?? null;
      if (!data.language_id && name && name !== '不限语言') data.legacy_language = name;
    }
    if (data.language_id !== null || !data.legacy_language) delete data.legacy_language;
  }
  for (const field of ['next_review', 'completed_at']) {
    if (data[field] && Number.isFinite(Date.parse(data[field]))) data[field] = new Date(data[field]).toISOString();
  }
  return data;
}

// 只比较保存过的时间，不用本次打开/同步/迁移的时间给旧缓存“刷新年龄”。
// 必须带时区、有相同的原始创建时间；时间损坏、明显超前或来源不明时不猜。
function savedTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= Date.now() + 300_000 ? time : null;
}

function preserveCandidate(state, candidate, remote, choice) {
  state.preservedCandidates ??= [];
  state.preservedCandidates.push({ ...copy(candidate), remote: copy(remote), choice, preservedAt: new Date().toISOString() });
  delete state.candidates[candidate.id];
}

function candidateSubmission(entity, data) {
  const source = copy(data);
  if (entity === 'card' && Object.hasOwn(source, 'nextReview')) {
    source.next_review ??= source.nextReview;
    delete source.nextReview;
  }
  if (entity === 'document' && Object.hasOwn(source, 'annotations_json')) {
    if (!Object.hasOwn(source, 'annotations')) source.annotations = JSON.parse(source.annotations_json);
    delete source.annotations_json;
  }
  const values = clean(entity, source);
  const fields = {
    card: ['text', 'sentence', 'meaning', 'note', 'level', 'next_review', 'language'],
    document: ['document_date', 'title', 'html', 'video_url', 'audio_url', 'annotations', 'language'],
    resource: ['name', 'url', 'type', 'language_id', 'legacy_language', 'topic', 'description', 'emoji', 'status', 'completed_at'],
  };
  if (!fields[entity] || Object.keys(values).some(key => !fields[entity].includes(key))) {
    throw new Error('这份旧内容含有无法识别的字段，已保留原备份，未覆盖现有内容。');
  }
  return values;
}

function candidatePatch(state, candidate, remote) {
  const settingsObject = state.base[keyOf('settings', 'resources')];
  const settings = settingsObject && !settingsObject.deleted ? settingsObject.data : null;
  const submitted = candidateSubmission(candidate.entity, candidate.data);
  // 比较时的兼容默认值不是用户编辑，缺字段不能被写成空字符串覆盖新字段。
  if (candidate.entity === 'resource' && !Object.hasOwn(submitted, 'language_id') && Object.hasOwn(candidate.data, 'language')) {
    const normalized = legacyComparable('resource', candidate.data, remote.data, settings);
    submitted.language_id = normalized.language_id;
    if (normalized.legacy_language) submitted.legacy_language = normalized.legacy_language;
  }
  const values = { ...remote.data, ...submitted };
  if (candidate.entity === 'resource') {
    // 同名标签可以自动匹配；已删除的标签不重建，也不把未知语言改成不限语言。
    const oldSettings = backupSettings(state.legacyBackup?.settings);
    if (!settings || state.queue.some(entry => entry.entity === 'settings')) throw new Error('分类尚未同步，请稍后重试。');
    const oldType = oldSettings?.types.find(item => item.id === values.type);
    const currentType = settings.types.find(item => item.id === values.type) ||
      (oldType && settings.types.find(item => item.name === oldType.name));
    if (!currentType) throw new Error('这份内容的类型已不存在，旧内容已保留在备份中。');
    values.type = currentType.id;
    if (values.language_id !== null && !settings.languages.some(item => item.id === values.language_id)) {
      const oldLanguage = oldSettings?.languages.find(item => item.id === values.language_id);
      const currentLanguage = oldLanguage && settings.languages.find(item => item.name === oldLanguage.name);
      if (!currentLanguage) throw new Error('这份内容的语言标签已不存在，旧内容已保留在备份中。');
      values.language_id = currentLanguage.id;
    }
    if (values.legacy_language && values.legacy_language !== remote.data.legacy_language) throw new Error('无法确定这份内容的语言，旧内容已保留。');
  }
  return Object.fromEntries(Object.keys(submitted).filter(key => !equal(values[key], remote.data[key])).map(key => [key, values[key]]));
}

function reconcileCandidates(state) {
  const settings = state.base[keyOf('settings', 'resources')]?.data;
  for (const [id, candidate] of Object.entries(state.candidates)) {
    const remote = state.base[keyOf(candidate.entity, candidate.entityId)];
    if (!candidate.asCopy && remote && !remote.deleted && equal(
      legacyComparable(candidate.entity, candidate.data, remote.data, settings),
      legacyComparable(candidate.entity, remote.data, candidate.data, settings))) {
      delete state.candidates[id];
      continue;
    }
    candidate.reason = remote?.deleted ? 'remote_deleted' : remote ? 'different' : 'missing';
    // 文件恢复是明确的独立操作，不能被自动择新吞掉；首次离线/旧世代也不能做决定。
    if (candidate.sourceId || candidate.asCopy || !state.ready || state.epochChanged || !remote ||
      state.queue.some(entry => entry.entity === candidate.entity && entry.id === candidate.entityId) ||
      Object.values(state.conflicts).some(item => item.entity === candidate.entity && item.entityId === candidate.entityId)) continue;
    const created = savedTime(candidate.data.created_at);
    if (created === null || created !== savedTime(remote.data.created_at)) continue;
    if (remote.deleted) {
      preserveCandidate(state, candidate, remote, 'deleted');
      continue;
    }
    const localTime = savedTime(candidate.data.updated_at), remoteTime = savedTime(remote.data.updated_at);
    if (localTime === null || remoteTime === null || localTime < created || remoteTime < created || localTime === remoteTime) continue;
    if (remoteTime - localTime > 300_000) {
      preserveCandidate(state, candidate, remote, 'remote-newer');
    }
    // v1 缓存时间没有服务器校准：看似本机较新不代表可以覆盖云端。
    // 不能让旧缓存先上传后获得“现在”的服务器时间，再压掉另一设备真正的新内容。
    // 明确的新编辑由原有 v2 队列自动同步；这些无来源的旧差异仅保留简短内容选择。
  }
}

function backupCandidateData(entity, data) {
  const values = clean(entity, data);
  if (entity === 'resource' && data.language_id == null && data.language) values.language = data.language;
  return values;
}

function backupSettings(value) {
  if (!record(value)) return null;
  const fields = [['languages', 'resourceLanguages'], ['groups', 'resourceGroups'], ['types', 'resourceTypes'], ['tags', 'resourceTags'], ['decks', 'resourceDecks']];
  if (!fields.some(([key, alias]) => Array.isArray(value[key]) || Array.isArray(value[alias]))) return null;
  return Object.fromEntries(fields.map(([key, alias]) => [key, (value[key] ?? value[alias] ?? []).map((item, index) => {
    if (typeof item === 'string') return { id: `legacy-${key}-${index}`, name: item };
    if (!record(item)) throw new TypeError('备份配置项必须是名称或对象。');
    return { ...copy(item), id: typeof item.id === 'string' && item.id ? item.id : `legacy-${key}-${index}` };
  })]));
}

function settingsSources(state) {
  const sources = [];
  const legacy = backupSettings(state.legacyBackup?.settings);
  if (legacy) sources.push({ id: 'legacy', label: '旧版本本机配置', settings: legacy });
  for (const backup of state.stagedBackups || []) {
    backup.settings.forEach((settings, index) => sources.push({ id: `${backup.id}:${index}`, label: `恢复备份 · ${backup.scope || '来源未标注'} · 配置 ${index + 1}`, settings }));
  }
  return sources;
}

function validateSettings(settings) {
  settings.tags ??= [];
  settings.decks ??= [];
  for (const [key, limit] of [['languages', 200], ['groups', 200], ['types', 500], ['tags', 1000], ['decks', 500]]) {
    const ids = new Set(), names = new Set();
    if (!Array.isArray(settings[key]) || settings[key].length > limit) throw new Error('配置数量无效。');
    for (const item of settings[key]) {
      const normalizedName = key === 'tags' || key === 'decks'
        ? item.name?.trim().normalize('NFKC').toLocaleLowerCase()
        : item.name?.trim();
      if (typeof item.id !== 'string' || !item.id || ids.has(item.id) || typeof item.name !== 'string' ||
        !item.name.trim() || item.name.length > 80 || names.has(normalizedName) || key === 'languages' && item.name.trim() === '不限语言') {
        throw new Error('配置名称或 ID 无效、重复；请保留原始备份并手动修正。');
      }
      ids.add(item.id); names.add(normalizedName);
    }
  }
  // group 是旧版迁移字段；Type 自 v3 起独立存在。
}

function extractBackup(payload) {
  const rows = new Map(), settings = [], drafts = [];
  let recognized = false;
  const addSettings = value => {
    const config = backupSettings(value);
    if (config) { recognized = true; if (!settings.some(item => equal(item, config))) settings.push(config); }
  };
  const addRow = (entity, data, id = data?.id) => {
    if (!record(data)) throw new TypeError('备份数据项必须是对象。');
    const values = copy(data);
    if (entity === 'card' && values.nextReview) { values.next_review ??= values.nextReview; delete values.nextReview; }
    const entityId = typeof id === 'string' && id ? id : null;
    rows.set(keyOf(entity, entityId || canonical(values)), { entity, entityId, data: values });
  };
  for (const value of [payload, payload.state]) {
    if (!record(value)) continue;
    for (const [field, entity] of [['items', 'card'], ['cards', 'card'], ['archives', 'document'], ['documents', 'document'], ['resources', 'resource']]) {
      if (!Object.hasOwn(value, field)) continue;
      if (!Array.isArray(value[field])) throw new TypeError(`备份 ${field} 必须是数组。`);
      recognized = true;
      for (const data of value[field]) addRow(entity, data);
    }
    addSettings(value); addSettings(value.settings);
    if (typeof value.html === 'string') {
      recognized = true;
      drafts.push(copy({ title: value.title || '', html: value.html, documentId: value.documentId,
        documentDate: value.documentDate, currentLanguage: value.currentLanguage, videoUrl: value.videoUrl,
        audioUrl: value.audioUrl, editorAnnotations: value.editorAnnotations || [] }));
    }
  }
  const sync = payload.sync ?? (payload.protocol === 2 && payload.base ? payload : null);
  if (sync) {
    if (!record(sync) || !record(sync.base) || !Array.isArray(sync.queue)) throw new TypeError('备份同步投影无效。');
    recognized = true;
    const ids = new Map();
    for (const object of Object.values(sync.base)) {
      validateObject(object);
      ids.set(keyOf(object.entity, object.id), [object.entity, object.id]);
    }
    for (const entry of sync.queue) {
      if (!record(entry)) throw new TypeError('备份队列项无效。');
      checkTarget(entry.entity, entry.id);
      if (!['create', 'patch', 'delete', 'restore'].includes(entry.kind) || !record(entry.patch)) throw new TypeError('备份队列操作无效。');
      ids.set(keyOf(entry.entity, entry.id), [entry.entity, entry.id]);
    }
    for (const [key, [entity, id]] of ids) {
      const object = projection(sync, entity, id);
      // 同步投影优先于旧 UI 缓存，墓碑也抑制缓存候选；永不导入同步元数据。
      rows.delete(key);
      if (!object || object.deleted) continue;
      if (entity === 'settings') addSettings(object.data);
      else addRow(entity, object.data, id);
    }
    // 暂停的旧 epoch 和墓碑上的本地编辑只能保留为副本候选，不能恢复成操作队列。
    const pending = new Map();
    for (const entry of sync.queue) {
      const projected = projection(sync, entry.entity, entry.id);
      if (!entry.paused && (entry.epoch === null || entry.epoch === sync.epoch) && !projected?.deleted) continue;
      const key = canonical([entry.epoch, entry.entity, entry.id]);
      pending.set(key, apply(pending.get(key) || entry.base, entry));
    }
    for (const object of pending.values()) {
      if (object.deleted) continue;
      if (object.entity === 'settings') addSettings(object.data);
      else rows.set(canonical(['pending', object.entity, object.id, object.data]), { entity: object.entity, entityId: object.id, data: object.data });
    }
    for (const candidate of Object.values(sync.candidates || {})) {
      checkTarget(candidate.entity, candidate.entityId);
      if (candidate.entity === 'settings') addSettings(candidate.data);
      else {
        if (!record(candidate.data)) throw new TypeError('备份候选无效。');
        rows.set(canonical(['candidate', candidate.entity, candidate.entityId, candidate.data]),
          { entity: candidate.entity, entityId: candidate.entityId, data: copy(candidate.data) });
      }
    }
    if (sync.preservedCandidates !== undefined && !Array.isArray(sync.preservedCandidates)) {
      throw new TypeError('备份中的保留版本必须是数组。');
    }
    for (const item of sync.preservedCandidates || []) {
      if (!record(item) || !record(item.data)) throw new TypeError('备份中的保留版本无效。');
      checkTarget(item.entity, item.entityId);
      const addVersion = (entity, id, data) => {
        if (entity === 'settings') addSettings(data);
        else rows.set(canonical(['preserved', entity, id, data]), { entity, entityId: id, data: copy(data) });
      };
      addVersion(item.entity, item.entityId, item.data);
      if (item.remote != null) {
        validateObject(item.remote);
        if (item.remote.entity !== item.entity || item.remote.id !== item.entityId) throw new TypeError('备份中的保留版本不匹配。');
        // 历史云端版本只成为手工候选；不重放旧操作，也不导入墓碑为活跃内容。
        if (!item.remote.deleted) addVersion(item.remote.entity, item.remote.id, item.remote.data);
      }
    }
    addSettings(sync.legacyBackup?.settings);
    for (const saved of sync.stagedBackups || []) {
      if (!record(saved) || !Array.isArray(saved.settings) || !Array.isArray(saved.drafts)) throw new TypeError('已保留备份来源无效。');
      for (const config of saved.settings) addSettings(config);
      for (const draft of saved.drafts) {
        if (!record(draft) || typeof draft.html !== 'string') throw new TypeError('已保留草稿无效。');
        if (!drafts.some(item => equal(item, draft))) drafts.push(copy(draft));
      }
    }
  }
  if (!recognized) throw new TypeError('未识别到可恢复的 Notebook 备份内容。');
  return { rows: [...rows.values()], settings, drafts };
}

function initial(scope) {
  return { protocol: 2, scope, version: 0, generation: 0, epoch: null, head: -1, snapshotHead: -1,
    ready: false, error: null, epochChanged: false, base: {}, seen: {}, queue: [], conflicts: {},
    candidates: {}, legacyBackup: null, migrationDone: false, epochBackups: [] };
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

function validateObject(object) {
  if (!record(object)) throw new Error('无效的远端对象。');
  checkTarget(object.entity, object.id);
  if (!Number.isSafeInteger(object.revision) || object.revision < 0 || typeof object.deleted !== 'boolean' || !record(object.data)) {
    throw new Error('无效的远端版本或数据。');
  }
}

function validateSnapshot(snapshot) {
  if (snapshot?.protocol !== 2 || typeof snapshot.epoch !== 'string' || !snapshot.epoch ||
    !Number.isSafeInteger(snapshot.head) || snapshot.head < 0 || !Array.isArray(snapshot.objects)) throw new Error('无效的同步状态。');
  const keys = new Set();
  for (const object of snapshot.objects) {
    validateObject(object);
    const key = keyOf(object.entity, object.id);
    if (keys.has(key) || object.revision > snapshot.head) throw new Error('远端快照版本不一致。');
    keys.add(key);
  }
}

export class NotebookSync {
  static async open({ scope, fetchState, sendOperation, onChange } = {}) {
    if (typeof scope !== 'string' || !scope || typeof fetchState !== 'function' || typeof sendOperation !== 'function') {
      throw new TypeError('必须提供 scope、fetchState 和 sendOperation。');
    }
    const client = new NotebookSync();
    client._scope = scope;
    client._fetchState = fetchState;
    client._sendOperation = sendOperation;
    client._onChange = onChange;
    client._db = await openDatabase();
    client._state = initial(scope);
    client._running = null;
    peers.add(new WeakRef(client));
    if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
      client._channel = new BroadcastChannel(DATABASE);
      client._channel.onmessage = event => {
        if (event.data === scope) client._transaction(() => {}, false).catch(() => {});
      };
    }
    await client._transaction(() => {}, false);
    await client.sync();
    return client;
  }

  _accept(state) {
    if (state.version < this._state.version) return;
    this._state = copy(state);
    try { Promise.resolve(this._onChange?.()).catch(() => {}); } catch { /* 通知失败不能回滚持久化。 */ }
  }

  _transaction(change, write = true) {
    return new Promise((resolve, reject) => {
      const transaction = this._db.transaction(STORE, write ? 'readwrite' : 'readonly');
      const store = transaction.objectStore(STORE);
      const request = store.get(this._scope);
      let state, result, failure;
      request.onsuccess = () => {
        try {
          state = request.result || initial(this._scope);
          result = change(state);
          if (write) {
            state.version++;
            store.put(state, this._scope);
          }
        } catch (error) { failure = error; transaction.abort(); }
      };
      transaction.onabort = () => reject(failure || transaction.error || new Error('IndexedDB 事务已中止。'));
      transaction.onerror = () => {};
      transaction.oncomplete = () => {
        this._accept(state);
        if (write) {
          for (const ref of peers) {
            const peer = ref.deref();
            if (!peer) peers.delete(ref);
            else if (peer !== this && peer._scope === this._scope) peer._accept(state);
          }
          this._channel?.postMessage(this._scope);
        }
        resolve(copy(result));
      };
    });
  }

  async migrateLegacy({ cards = [], documents = [], resources = [], settings = null } = {}) {
    const backup = copy({ cards, documents, resources, settings });
    await this._transaction(state => {
      if (state.migrationDone) return;
      state.legacyBackup = backup;
      state.migrationDone = true;
      for (const [entity, items] of [['card', backup.cards], ['document', backup.documents], ['resource', backup.resources]]) {
        if (!Array.isArray(items)) throw new TypeError('旧数据必须是数组。');
        for (const data of items) {
          if (!record(data)) throw new TypeError('旧数据项必须是对象。');
          const id = uuid();
          const entityId = typeof data.id === 'string' && data.id ? data.id : uuid();
          state.candidates[id] = { id, entity, entityId, data: copy(data), reason: 'missing' };
        }
      }
      // 旧 settings 只保留原始备份，不产生默认值合并或导入操作。
      reconcileCandidates(state);
    });
  }

  async put(entity, id, data) {
    checkTarget(entity, id);
    if (!record(data) || (data.id !== undefined && data.id !== id)) throw new TypeError('data 必须是同一 ID 的对象。');
    const input = copy(data);
    await this._transaction(state => {
      if (input._syncCandidate || Object.values(state.candidates).some(item => item.entity === entity && item.entityId === id &&
        !state.base[keyOf(entity, id)])) throw new Error('候选只能手动以新 ID 导入。');
      const base = projection(state, entity, id);
      if (base?.deleted) throw new Error('墓碑必须使用 restore 显式恢复。');
      if (!base && (state.seen[keyOf(entity, id)] || state.queue.some(entry => entry.entity === entity && entry.id === id))) {
        throw new Error('已知旧对象缺失，不能自动创建；请以新 ID 导入。');
      }
      const values = clean(entity, input);
      const patch = Object.fromEntries(Object.entries(values).filter(([key, value]) => !equal(value, base?.data[key])));
      if (base && !Object.keys(patch).length) return;
      addEntry(state, entity, id, base ? 'patch' : 'create', patch, base);
    });
  }

  async remove(entity, id) {
    checkTarget(entity, id);
    await this._transaction(state => {
      const base = projection(state, entity, id);
      if (!base) throw new Error('对象不存在；候选请使用 discardCandidate。');
      if (!base.deleted) addEntry(state, entity, id, 'delete', {}, base);
    });
  }

  async restore(entity, id) {
    checkTarget(entity, id);
    await this._transaction(state => {
      const base = projection(state, entity, id);
      if (!base?.deleted) throw new Error('只能显式恢复已知墓碑。');
      addEntry(state, entity, id, 'restore', {}, base);
    });
  }

  view(entity) {
    if (!ENTITIES.has(entity)) throw new TypeError('无效的 entity。');
    const state = this._state;
    const ids = new Set(Object.values(state.base).filter(item => item.entity === entity).map(item => item.id));
    for (const entry of state.queue) if (entry.entity === entity) ids.add(entry.id);
    const rows = [];
    const settings = projection(state, 'settings', 'resources');
    for (const id of ids) {
      const object = projection(state, entity, id);
      if (!object || object.deleted) continue;
      const data = { ...object.data, id };
      if (entity === 'resource') {
        data.language_id ??= null;
        data.language = (!settings?.deleted && settings?.data.languages?.find(item => item.id === data.language_id)?.name) ||
          data.legacy_language || (data.language_id === null ? '不限语言' : data.language);
      }
      rows.push(data);
    }
    for (const candidate of Object.values(state.candidates)) {
      if (candidate.entity === entity && !ids.has(candidate.entityId)) {
        const data = { ...candidate.data, id: candidate.entityId, _syncCandidate: candidate.id };
        if (entity === 'resource') {
          const language = settings?.data.languages?.find(item => item.id === data.language_id || item.name === data.language);
          data.language_id = language?.id ?? null;
          if (!language && data.language && data.language !== '不限语言') data.legacy_language ||= data.language;
          data.language = language?.name || data.legacy_language || '不限语言';
        }
        rows.push(data);
        ids.add(candidate.entityId);
      }
    }
    return copy(rows);
  }

  // Recycle-bin projection shares the exact same baseline/outbox semantics as view().
  // It never persists an independent cache or treats candidates as deleted cloud objects.
  trash(entity) {
    if (!ENTITIES.has(entity)) throw new TypeError('无效的 entity。');
    const state = this._state;
    const ids = new Set(Object.values(state.base).filter(item => item.entity === entity).map(item => item.id));
    const entries = new Map(), conflicted = new Set();
    for (const entry of state.queue) {
      if (entry.entity !== entity) continue;
      ids.add(entry.id);
      const list = entries.get(entry.id) || [];
      list.push(entry);
      entries.set(entry.id, list);
    }
    for (const item of Object.values(state.conflicts)) {
      if (item.entity === entity) conflicted.add(item.entityId);
    }
    const rows = [];
    for (const id of ids) {
      const object = projection(state, entity, id);
      if (!object?.deleted) continue;
      const queue = entries.get(id) || [];
      const isPaused = entry => entry.paused || (entry.epoch !== null && entry.epoch !== state.epoch);
      const pending = queue.some(entry => !isPaused(entry));
      const paused = !!state.epochChanged || queue.some(isPaused);
      const conflict = conflicted.has(id);
      rows.push({ ...object, pending, paused, conflict, canRestore: !paused && !conflict });
    }
    return copy(rows);
  }

  status() {
    const state = this._state;
    return { pending: state.queue.length, conflicts: Object.keys(state.conflicts).length,
      candidates: Object.keys(state.candidates).length, ready: state.ready, error: state.error, epochChanged: state.epochChanged };
  }

  details() {
    return copy({ conflicts: Object.values(this._state.conflicts).map(({ id, entity, entityId, local, remote }) =>
      ({ id, entity, entityId, local, remote })), candidates: Object.values(this._state.candidates) });
  }

  exportBackup() {
    return JSON.parse(JSON.stringify(this._state));
  }

  settingsSources() {
    return copy(settingsSources(this._state));
  }

  async stageBackup(payload, { allowDifferentScope = false } = {}) {
    if (!record(payload)) throw new TypeError('备份必须是 JSON 对象。');
    const original = copy(payload);
    const scopes = [original.scope, original.sync?.scope, original.state?.scope].filter(value => typeof value === 'string' && value);
    const asCopy = scopes.some(scope => scope.replace(/\/+$/, '') !== this._scope.replace(/\/+$/, ''));
    if (asCopy && !allowDifferentScope) throw new Error('备份 scope 不同，必须明确确认作为副本导入。');
    const extracted = extractBackup(original);
    return this._transaction(state => {
      state.stagedBackups ??= [];
      state.backupCandidateKeys ??= [];
      const existing = state.stagedBackups.find(item => equal(item.payload, original));
      if (existing) return { id: existing.id, added: 0, duplicate: true, drafts: existing.drafts.length };
      const id = uuid(), scope = scopes[0] || null;
      state.stagedBackups.push({ id, scope, payload: original, settings: extracted.settings, drafts: extracted.drafts });
      const keys = new Set(state.backupCandidateKeys);
      for (const row of extracted.rows) {
        const fingerprint = canonical([scope || state.scope, row.entity, row.entityId, backupCandidateData(row.entity, row.data)]);
        if (keys.has(fingerprint)) continue;
        keys.add(fingerprint);
        if (Object.values(state.candidates).some(item => item.entity === row.entity && item.entityId === row.entityId &&
          equal(backupCandidateData(row.entity, item.data), backupCandidateData(row.entity, row.data)))) continue;
        const candidateId = uuid();
        state.candidates[candidateId] = { ...row, entityId: row.entityId || uuid(), id: candidateId, sourceId: id, asCopy, reason: 'missing' };
      }
      state.backupCandidateKeys = [...keys];
      reconcileCandidates(state);
      return { id, added: Object.values(state.candidates).filter(item => item.sourceId === id).length, duplicate: false, drafts: extracted.drafts.length };
    });
  }

  async importSettings(sourceId, selection = {}) {
    const selected = copy(selection);
    return this._transaction(state => {
      const source = settingsSources(state).find(item => item.id === sourceId);
      if (!source) throw new Error('配置备份来源不存在。');
      const base = projection(state, 'settings', 'resources');
      if (base?.deleted || !base && state.seen[keyOf('settings', 'resources')]) throw new Error('配置已删除或缺失，请先显式处理配置墓碑。');
      const settings = { languages: [], groups: [], types: [], ...copy(base?.data) };
      const mappings = { languages: new Map(), groups: new Map(), types: new Map() };
      const prior = state.settingsImports?.[sourceId] || {};
      for (const key of ['languages', 'groups', 'types']) {
        if (selected[key] !== undefined && !Array.isArray(selected[key])) throw new TypeError('请选择要导入的配置 ID。');
        for (const id of selected[key] || []) {
          const item = source.settings[key].find(value => value.id === id);
          if (!item) throw new Error('所选旧配置不存在。');
          const previousId = Object.hasOwn(prior[key] || {}, id) ? prior[key][id] : null;
          const current = settings[key].find(value => value.id === id || value.id === previousId) ||
            settings[key].find(value => value.name === item.name);
          if (current) { mappings[key].set(id, current.id); continue; }
          const newItem = { id: uuid(), name: item.name };
          if (key === 'types') {
            const group = Object.hasOwn(selected.typeGroups || {}, id) ? selected.typeGroups[id] : null;
            const sourceGroup = group?.source || item.group;
            newItem.group = group?.current || mappings.groups.get(sourceGroup) ||
              settings.groups.find(value => value.id === sourceGroup)?.id;
          }
          settings[key].push(newItem);
          mappings[key].set(id, newItem.id);
        }
      }
      validateSettings(settings);
      const patch = Object.fromEntries(['languages', 'groups', 'types'].filter(key => !equal(settings[key], base?.data[key])).map(key => [key, settings[key]]));
      if (Object.keys(patch).length) addEntry(state, 'settings', 'resources', base ? 'patch' : 'create', patch, base);
      const result = Object.fromEntries(Object.entries(mappings).map(([key, value]) => [key, Object.fromEntries(value)]));
      state.settingsImports ??= {};
      state.settingsImports[sourceId] = Object.fromEntries(['languages', 'groups', 'types'].map(key => [key, { ...prior[key], ...result[key] }]));
      return result;
    });
  }

  async importCandidate(id, options) {
    const mapping = copy(options);
    return this._transaction(state => {
      const candidate = Object.hasOwn(state.candidates, id) ? state.candidates[id] : null;
      if (!candidate || candidate.entity === 'settings') throw new Error('候选不存在或不允许导入。');
      const entityId = uuid();
      let patch = candidateSubmission(candidate.entity, candidate.data);
      if (candidate.entity === 'resource') {
        const settings = projection(state, 'settings', 'resources')?.data;
        const language = settings?.languages?.find(item => item.id === patch.language_id || item.name === candidate.data.language);
        patch.language_id = language?.id ?? null;
        if (mapping !== undefined) {
          if (!record(mapping) || !Object.hasOwn(mapping, 'type') || !Object.hasOwn(mapping, 'language_id')) throw new Error('请明确选择当前有效类型和语言，或确认不限语言。');
          // UI 分两步导入：配置先经过 CAS 并收到确认，资源不能引用未确认或冲突中的配置。
          const confirmed = state.base[keyOf('settings', 'resources')];
          if (!state.ready || !confirmed || confirmed.deleted || state.queue.some(entry => entry.entity === 'settings')) throw new Error('请先保存资源配置并同步确认，再选择类型和语言导入。');
          if (!confirmed.data.types?.some(item => item.id === mapping.type) ||
            mapping.language_id !== null && !confirmed.data.languages?.some(item => item.id === mapping.language_id)) throw new Error('所选类型或语言已失效，请重新选择。');
          patch.type = mapping.type;
          patch.language_id = mapping.language_id;
        }
        // 后端禁止新建伪造孤立语言；原始 legacy_language 仍完整保留在旧备份中。
        delete patch.legacy_language;
      }
      if (candidate.entity === 'document' && typeof patch.annotations_json === 'string') {
        patch.annotations ??= JSON.parse(patch.annotations_json);
        delete patch.annotations_json;
      }
      addEntry(state, candidate.entity, entityId, 'create', patch, null);
      delete state.candidates[id];
      return entityId;
    });
  }

  async resolveCandidate(id, choice) {
    if (!['local', 'remote'].includes(choice)) throw new TypeError('请选择要保留的内容。');
    // 先读取当前版本；用户判断期间又有修改时仍由 CAS 保护，不盲写。
    await this._pull({ reconcile: false });
    return this._transaction(state => {
      const candidate = Object.hasOwn(state.candidates, id) ? state.candidates[id] : null;
      if (!candidate) throw new Error('这份内容已在另一处处理，请查看最新内容。');
      if (!state.ready || state.epochChanged) throw new Error('连接状态已变化，请稍后重试。');
      const remote = state.base[keyOf(candidate.entity, candidate.entityId)];
      if (!remote || candidate.asCopy) throw new Error('没有可以直接替换的同一条记录，原内容已保留。');
      if (state.queue.some(entry => entry.entity === candidate.entity && entry.id === candidate.entityId) ||
        Object.values(state.conflicts).some(item => item.entity === candidate.entity && item.entityId === candidate.entityId)) {
        throw new Error('这条记录还有未同步的修改，请先完成同步。');
      }
      if (choice === 'local') {
        if (remote.deleted) throw new Error('这条记录已删除，请从回收站恢复，不会自动重新添加。');
        const patch = candidatePatch(state, candidate, remote);
        if (Object.keys(patch).length) addEntry(state, candidate.entity, candidate.entityId, 'patch', patch, remote);
      }
      preserveCandidate(state, candidate, remote, `selected-${choice}`);
    });
  }

  async discardCandidate(id) {
    await this._transaction(state => {
      const candidate = Object.hasOwn(state.candidates, id) ? state.candidates[id] : null;
      if (candidate) preserveCandidate(state, candidate, state.base[keyOf(candidate.entity, candidate.entityId)] || null, 'dismissed');
    });
  }

  async resolveConflict(id, choice) {
    if (!['remote', 'local'].includes(choice)) throw new TypeError('选择必须是 remote 或 local。');
    if (choice === 'local') await this._pull();
    await this._transaction(state => {
      const item = Object.hasOwn(state.conflicts, id) ? state.conflicts[id] : null;
      if (!item) throw new Error('冲突不存在。');
      const entries = state.queue.filter(entry => entry.entity === item.entity && entry.id === item.entityId &&
        entry.epoch === item.epoch && entry.paused === item.paused);
      const remote = state.base[keyOf(item.entity, item.entityId)] || null;
      let kind, patch;
      if (choice === 'local') {
        if (item.paused || item.epoch !== state.epoch) throw new Error('epoch 已变化，旧操作不能重放。');
        const local = entries.reduce((value, entry) => apply(value, entry), copy(entries[0]?.base || item.local));
        if ((!remote && (entries[0]?.kind !== 'create' || local.deleted)) ||
          (remote?.deleted && !local.deleted && !entries.some(entry => entry.kind === 'restore'))) {
          throw new Error('远端已缺失或删除；不能通过冲突处理隐式复活。');
        }
        kind = !remote ? 'create' : local.deleted ? 'delete' : remote.deleted ? 'restore' : 'patch';
        patch = {};
        if (kind !== 'delete') {
          // 只提交用户的修改字段，不能把未编辑的旧字段整体覆盖到最新远端。
          for (const entry of entries) patch = { ...patch, ...entry.patch };
          patch = Object.fromEntries(Object.entries(patch).filter(([key, value]) => !equal(value, remote?.data[key])));
        }
      }
      state.queue = state.queue.filter(entry => !entries.includes(entry));
      for (const [conflictId, value] of Object.entries(state.conflicts)) {
        if (value.entity === item.entity && value.entityId === item.entityId && value.epoch === item.epoch &&
          value.paused === item.paused) delete state.conflicts[conflictId];
      }
      if (choice === 'local' && !(kind === 'delete' && remote.deleted) && (kind !== 'patch' || Object.keys(patch).length)) {
        addEntry(state, item.entity, item.entityId, kind, patch, remote);
      }
    });
  }

  async _pull({ reconcile = true } = {}) {
    const generation = await this._transaction(state => state.generation, false);
    const snapshot = copy(await this._fetchState());
    validateSnapshot(snapshot);
    await this._transaction(state => {
      if (state.generation !== generation) return;
      if (state.epoch === snapshot.epoch && snapshot.head < state.head) return;
      if (state.epoch !== snapshot.epoch) {
        if (state.epoch !== null) {
          state.epochBackups.push({ epoch: state.epoch, head: state.head, base: copy(state.base) });
          state.epochChanged = true;
          for (const entry of state.queue) entry.paused = true;
          for (const item of Object.values(state.conflicts)) item.paused = true;
        }
        state.generation++;
      }
      state.epoch = snapshot.epoch;
      state.head = snapshot.head;
      state.snapshotHead = snapshot.head;
      state.base = Object.fromEntries(snapshot.objects.map(object => [keyOf(object.entity, object.id), object]));
      for (const object of snapshot.objects) state.seen[keyOf(object.entity, object.id)] = true;
      for (const entry of state.queue) if (entry.epoch === null) entry.epoch = state.epoch;
      for (const item of Object.values(state.conflicts)) {
        if (!item.paused && item.epoch === state.epoch) item.remote = copy(state.base[keyOf(item.entity, item.entityId)] || null);
      }
      state.ready = true;
      state.error = null;
      if (reconcile) reconcileCandidates(state);
    });
  }

  async _next() {
    return this._transaction(state => {
      if (!state.ready) return null;
      for (const entry of state.queue) {
        if (entry.paused || entry.epoch !== state.epoch || entry.conflictId || entry.after) continue;
        // 首次发包前原子冻结；未知网络结果只能重发完全相同的 payload/opId。
        if (entry.op) return entry;
        const remote = state.base[keyOf(entry.entity, entry.id)] || null;
        const unchanged = entry.kind === 'create' ? remote === null : remote && entry.base &&
          remote.revision === entry.base.revision && remote.deleted === entry.base.deleted;
        if (!unchanged) {
          if (safeRebase(entry, remote)) entry.base = copy(remote);
          else { conflict(state, entry, remote, 'revision_conflict'); continue; }
        }
        entry.op = { protocol: 2, epoch: state.epoch, opId: uuid(), entity: entry.entity, id: entry.id,
          kind: entry.kind, baseRevision: entry.base?.revision ?? 0, patch: copy(entry.patch) };
        return entry;
      }
      return null;
    });
  }

  async _ack(sent, response) {
    validateObject(response?.object);
    if (response.ok !== true || response.opId !== sent.op.opId || response.epoch !== sent.op.epoch ||
      response.object.entity !== sent.entity || response.object.id !== sent.id ||
      !Number.isSafeInteger(response.head) || response.head < response.object.revision) throw new Error('无效的同步回执。');
    await this._transaction(state => {
      if (state.epoch !== sent.op.epoch) return;
      const entry = state.queue.find(item => !item.paused && item.token === sent.token && item.op?.opId === sent.op.opId);
      if (!entry) return;
      const key = keyOf(sent.entity, sent.id);
      const current = state.base[key];
      if (response.head > state.snapshotHead && (!current || response.object.revision > current.revision)) state.base[key] = copy(response.object);
      state.seen[key] = true;
      state.head = Math.max(state.head, response.head);
      state.queue = state.queue.filter(item => item !== entry);
      for (const child of state.queue) {
        if (child.after === entry.token) {
          child.after = null;
          child.base = copy(response.object);
        }
      }
      state.error = null;
      reconcileCandidates(state);
    });
  }

  async _rejected(sent, error) {
    const payload = error.payload;
    if (error.status !== 409 || !payload) throw error;
    if (payload.code === 'epoch_mismatch') {
      await this._transaction(state => {
        if (state.epoch === sent.op.epoch) {
          state.epochChanged = true;
          state.ready = false;
          state.error = 'epoch_mismatch';
          for (const entry of state.queue) entry.paused = true;
          for (const item of Object.values(state.conflicts)) item.paused = true;
        }
      });
      await this._pull();
      return false;
    }
    if (!['revision_conflict', 'reference_conflict', 'op_id_conflict'].includes(payload.code)) throw error;
    if (payload.current !== null) {
      validateObject(payload.current);
      if (payload.current.entity !== sent.entity || payload.current.id !== sent.id) throw new Error('冲突回执的对象不匹配。');
    }
    await this._transaction(state => {
      if (state.epoch !== sent.op.epoch) return;
      const entry = state.queue.find(item => !item.paused && item.token === sent.token && item.op?.opId === sent.op.opId);
      if (!entry) return;
      const key = keyOf(entry.entity, entry.id);
      const current = state.base[key];
      if (payload.current && (!current || payload.current.revision > current.revision)) {
        state.base[key] = copy(payload.current);
        state.head = Math.max(state.head, payload.current.revision);
      }
      const remote = copy(payload.current === null ? null : state.base[key] || payload.current);
      if (payload.code === 'revision_conflict' && safeRebase(entry, remote)) {
        entry.base = remote;
        entry.op = null;
      } else conflict(state, entry, remote, payload.code);
    });
    return true;
  }

  async _run() {
    try {
      await this._pull();
      let rejections = 0;
      while (rejections < 100) {
        const sent = await this._next();
        if (!sent) break;
        try {
          const response = await this._sendOperation(freeze(copy(sent.op)));
          await this._ack(sent, copy(response));
          rejections = 0;
        } catch (error) {
          if (!await this._rejected(sent, error)) break;
          rejections++;
        }
      }
      if (rejections === 100) throw new Error('连续版本竞争过多，队列已保留，请稍后同步。');
    } catch (error) {
      await this._transaction(state => { state.error = String(error?.message || error); });
    }
    return this.status();
  }

  async sync() {
    if (this._running) return this._running;
    const previous = locks.get(this._scope) || Promise.resolve();
    const run = previous.catch(() => {}).then(() => this._run());
    locks.set(this._scope, run);
    this._running = run;
    try { return await run; }
    finally {
      if (locks.get(this._scope) === run) locks.delete(this._scope);
      this._running = null;
    }
  }
}
