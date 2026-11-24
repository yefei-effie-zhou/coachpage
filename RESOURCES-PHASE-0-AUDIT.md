# Resources / Collections Phase 0 Audit

审计日期：2026-11-23（Europe/Amsterdam）

本报告仅包含只读审计结果。未执行 D1 写入、迁移、删除或生产部署。

## 1. 结论摘要

当前生产环境同时存在两套资源存储：

1. 旧 `resources` 关系表：32 条资源。
2. 新 `sync_v2_objects` 同步对象：39 条未删除资源，另有 1 条 Resources 设置对象。

审计开始时，生产同步层比工作区中的 `worker.js` 新。随后已从 Cloudflare Quick Edit 取得当前生产源码，并在 2026-11-23 同步回本项目。生产库不存在旧 Worker 预期的 `resource_settings` 表。

旧 Worker 已保存为 `worker.legacy-before-sync-v2.js`，不得用于部署。当前 `worker.js` 已包含线上 `sync_v2` 实现，但仍不能把旧 `resources` 表当成唯一权威数据源。

建议将 `sync_v2_objects(entity='resource')` 作为当前生产资源基线。现在可以基于已同步的生产 Worker 编写正式迁移与兼容层。

## 2. 实际生产 D1

数据库：`dutch-transcript-db`

数据库 UUID：`c0c42df5-d121-493f-87bd-c9cc3746ab68`

Cloudflare 显示 8 个业务表；`sqlite_master` 实际还包含内部 `_cf_KV` 表。

业务表：

- `cards`
- `daily_review_plans`
- `documents`
- `resources`
- `review_preferences`
- `sync_v2_meta`
- `sync_v2_objects`
- `sync_v2_ops`

### 2.1 旧 resources 表

```sql
CREATE TABLE resources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT DEFAULT '',
  type TEXT NOT NULL,
  language TEXT DEFAULT '',
  topic TEXT DEFAULT '',
  description TEXT DEFAULT '',
  emoji TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'backlog',
  completed_at TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
```

仅有主键自动索引 `sqlite_autoindex_resources_1`；没有 Type、Status、Language 等查询索引。

### 2.2 sync_v2_meta

```sql
CREATE TABLE sync_v2_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  epoch TEXT NOT NULL,
  head INTEGER NOT NULL CHECK (head >= 0 AND head <= 9007199254740991)
)
```

### 2.3 sync_v2_objects

```sql
CREATE TABLE sync_v2_objects (
  entity TEXT NOT NULL CHECK (entity IN ('card','document','resource','settings')),
  id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  deleted INTEGER NOT NULL CHECK (deleted IN (0,1)),
  data TEXT NOT NULL,
  PRIMARY KEY (entity, id),
  CHECK (entity != 'settings' OR id = 'resources')
)
```

仅有复合主键自动索引 `sqlite_autoindex_sync_v2_objects_1`。

当前对象数量：

| Entity | 数量 |
|---|---:|
| card | 97 |
| document | 15 |
| resource | 39 |
| settings | 1 |

39 条 resource 均为 `deleted=0`，没有资源 tombstone。

资源 JSON 已确认包含：

- `id`
- `name`
- `url`
- `type`
- `language`
- `language_id`（部分为文本、部分为 null）
- `topic`
- `description`
- `emoji`
- `status`
- `completed_at`
- `created_at`
- `updated_at`

### 2.4 sync_v2_ops

```sql
CREATE TABLE sync_v2_ops (
  op_id TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  response TEXT NOT NULL,
  guard INTEGER NOT NULL CHECK (guard = 1)
)
```

该表明显用于写操作幂等保护。后续 API 必须继续复用这一机制，不能绕过它直接写业务对象。

### 2.5 线上 Resources 设置对象

`sync_v2_objects` 中存在：

- `entity='settings'`
- `id='resources'`

JSON 顶层字段：

- `id`
- `languages`
- `groups`
- `types`

现有 Groups：

| ID | 名称 |
|---|---|
| `work` | 工作 |
| `study` | 学习 |
| `personal` | 生活 |
| `eada7e3f-97f8-491c-92de-140f041ed015` | 看点男同文 |

现有 Types：

| ID | 名称 | Group |
|---|---|---|
| `project` | 项目资料 | work |
| `course` | 课程 | study |
| `website` | 学习网站 | study |
| `movie_series` | 电影 / 剧集 | personal |
| `book` | 书籍 | personal |
| `variety` | 综艺 | personal |
| `3fd6419d-70b6-4798-9ff1-1fa794be27a9` | magpie | personal |
| `c4cfcc3a-5f2a-4482-a938-0e2691439706` | 五夏 | eada7e3f-97f8-491c-92de-140f041ed015 |

Languages 已升级为 `{id,name}` 对象，而本地前端仍按字符串数组处理：中文、English、日本語、Nederlands。

## 3. 数据差异

旧表：32 条；同步层：39 条。两者不能简单互相覆盖。

旧 `resources` 类型分布：

| Type | 数量 |
|---|---:|
| movie_series | 21 |
| website | 4 |
| book | 3 |
| course | 1 |
| project | 1 |
| type-ai-mtyu5daq | 1 |
| type-家居-mux0vtcz | 1 |

同步层资源的已观测类型分布：

| Type | 数量 |
|---|---:|
| movie_series | 24 |
| book | 3 |
| course | 1 |
| magpie UUID | 2 |
| 五夏 UUID | 1 |

其余同步资源类型需要在迁移脚本编写前导出完整清单复核。不能根据旧表的 32 条分布推断 39 条同步资源。

## 4. 本地实现审计

### 前端

- `index.html`：Resources 工作台、添加表单、筛选器、设置页。
- `assets/app.js`：Resources 状态、localStorage、渲染、同步、CRUD、设置管理。
- `assets/styles.css`：资源卡片、筛选器、设置页和移动端样式。

本地 Resources 模型仍为：

```text
Resource -> type(string) + language(string) + topic(string) + status
Settings -> languages[] + groups[] + types[{id,name,group}]
```

Type 仍强制要求 `group`；设置页长期显示输入框；只支持 topic/type 筛选；批量操作只有删除。

### Worker

- `worker.js`：旧资源表 CRUD 与旧 `resource_settings` JSON 单行设置。
- `/api/resources`：GET/POST。
- `/api/resources/:id`：PATCH/DELETE。
- `/api/resource-settings`：GET/PUT。

当前 `worker.js` 已与生产同步层对齐；与旧版相比新增 384 行同步实现。语法检查通过。

保留文件：

- `worker.js`：当前生产基线，SHA-256 `b03aa926b12e41f0612b4b05d4b6c5f526de364f0e2ce3628d2465bcb45a8043`
- `worker.legacy-before-sync-v2.js`：同步前旧版，仅用于对照，禁止部署

### 本地缓存

主状态键：`dutch-transcript-notebook-v1`

备份键：`dutch-transcript-notebook-backup-v1`

API 配置键：`dutch-transcript-api-config`

Resources 当前嵌入主 Notebook state：

- `resources`
- `resourceLanguages`
- `resourceGroups`
- `resourceTypes`
- `resourceSettingsUpdatedAt`

Emoji 最近使用键：`notebook-resource-emojis`

不得清空主状态键，否则会同时影响 Notebook、词卡、历史全文与其他设置。

## 5. 资源 ID 与其他模块关联

在当前工作区中，没有发现 Notebook、文档、词卡表对 Resource ID 的直接外键或字段引用。

但生产同步层使用 `(entity,id)` 作为对象身份，并通过 revision/head/op 维持跨设备一致性。因此：

- Resource ID 必须原样保留。
- 迁移必须保持 revision 语义或通过当前生产同步 API 写入。
- 不能直接重建 Resource ID。
- 不能用旧 `resources.updated_at` 覆盖较新的同步对象。

## 6. 技术栈差异

附件中写的是“无 Vite”，但当前工作区已经完成 Tiptap 前端迁移，并使用 Vite 7 打包。Resources 本次不应再引入 React/Vue/Next.js，也不应拆掉现有 Vite；应继续使用 Vanilla JS ES Modules + Vite，并保持 Cloudflare Worker/D1 架构。

## 7. 最终实现架构（本地完成，尚未部署）

实现采用规范化 D1 数据层，同时保留 `sync_v2_objects` 作为兼容投影：

```text
collection_resources
  -> collection_types
  -> collection_languages
  <-> collection_tags through collection_resource_tags
  <-> collection_decks through collection_deck_items

sync_v2_objects
  -> 旧客户端与离线同步兼容投影
```

新增表：

- `app_schema_migrations`
- `collection_runtime`
- `collection_migration_source_objects`
- `collection_migration_guards`
- `collection_migration_issues`
- `collection_languages`
- `collection_types`
- `collection_tags`
- `collection_decks`
- `collection_resources`
- `collection_resource_tags`
- `collection_deck_items`
- `collection_legacy_groups`
- `collection_legacy_type_groups`

运行模式：

- `shadow`：规范化投影仅用于核对，前端仍读取兼容投影；写入双写。
- `active`：验证后的正式模式，继续双写。
- `retired`：紧急改读 `sync_v2_objects`；原子批量命令禁用。

`0001`–`0003` 只会创建 `retired` runtime；精确 backfill 成功后才进入
`shadow`，验证和受保护的 cutover 完成后才进入 `active`。

Worker 新增：

- `/api/session`
- `/api/collections/state`
- `/api/collections/operations`
- `/api/collections/commands`
- `/api/collections/verify`

所有 API 都在 Cloudflare Access JWT 校验之后执行；不再接受共享 `API_SECRET`。

## 8. 最终迁移映射

迁移只在旧 ID 与名称都符合已知默认定义时自动映射：

| 旧 ID / 名称 | 目标 Type | 附加 Tag | 结果 |
|---|---|---|---|
| `project` / 项目资料 | 项目资料 | 无 | 自动 |
| `course` / 课程 | 课程 | 无 | 自动 |
| `website` / 学习网站 | 网站 / 工具 | 无 | 自动 |
| `movie_series` / 电影 / 剧集 | 影视 | 无 | 自动 |
| `book` / 书籍 | 书籍 | 无 | 自动 |
| `variety` / 综艺 | 影视 | 综艺 | 自动 |
| 任意 ID / 精确名称 `magpie` | 原 Type | magpie | 保留并列入人工复核 |
| 任意 ID / 精确名称 `五夏` | 原 Type | 五夏 | 保留并列入人工复核 |
| AI、家居或其他自定义 Type | 原 Type | 无 | 不猜测，列入人工复核 |

默认 Type 会补齐：

- 影视
- 书籍
- 文章
- 音频
- 课程
- 网站 / 工具
- 项目资料
- 游戏
- 其他

如果默认 ID 已被自定义名称占用，迁移会保留该自定义 Type，并为缺失默认 Type 创建新的稳定 ID；不会覆盖用户名称。迁移生成的 `综艺`、`magpie`、`五夏` Tag ID 由规范化名称哈希确定，重复 dry-run 得到相同 ID。

迁移报告包含每个旧 Type 的 source、target、action 和 added tag。无法确定的资源不被强制改成文章、书籍或其他。

## 9. 数据安全与兼容实现

- Resource ID、业务字段、创建时间和 tombstone 原样保留。
- 迁移会为 settings 与每个 Resource 分配新的连续 revision，并同步推进全局
  head；这样旧离线操作只能安全 rebase 或进入冲突，不能用旧 revision 覆盖新分类。
- 迁移前后的 settings/resource JSON、revision 与 SHA-256 都写入迁移源表。
- epoch/head、对象数量、任一 revision/deleted/data 不匹配都会触发约束失败并
  原子回滚。
- 相同版本不同 checksum 被拒绝。
- 相同迁移重复运行不会重复创建多对多关联，也不会降低 `verified` 状态。
- 规范化名称使用 NFKC、首尾空白移除、连续空白折叠和大小写规范化。
- 数据库唯一索引与应用校验共同防止重复名称。
- Tag/Deck 删除只删除或 tombstone 关联，不级联删除 Resource。
- Type 删除必须提供目标 Type，服务端在同一原子命令中重新分配。
- Tag 合并在同一命令中去重关联并 tombstone 源 Tag。
- 兼容 settings/resource 投影在 backfill 中同步更新，防止旧客户端重新写回旧分类。
- localStorage 不做全量清空；Collections 使用独立同步存储键并保留旧备份候选。
- 已打开的 v1 标签页后续写入通过 `storage` 事件转为待确认恢复内容，不会静默覆盖 v2。
- Worker 支持 `SYNC_READ_ONLY`、`COLLECTIONS_READ_ONLY` 和 runtime mode 回滚。
- 生产 D1 artifact 不含显式 `BEGIN`/`COMMIT`，交由 Wrangler D1 migration 事务处理。

## 10. 最终变更文件

前端：

- `index.html`
- `assets/app.js`
- `assets/styles.css`
- `assets/sync-v2.js`

Worker：

- `worker.js`
- `worker/collections.js`
- `wrangler.jsonc.example`

数据库与工具：

- `migrations/0001_collections_migration_runtime.sql`
- `migrations/0002_collections_schema.sql`
- `migrations/0003_collections_indexes.sql`
- `scripts/lib/collections-migration.mjs`
- `scripts/migrate-collections.mjs`
- `scripts/verify-collections.mjs`
- `scripts/render-collections-mode.mjs`

测试：

- `tests/migration.test.mjs`
- `tests/collections-worker.test.mjs`
- `tests/sync-client.test.mjs`
- `tests/fixtures/sync-v2-collections.json`

文档与命令：

- `CLOUDFLARE-SYNC-UPDATE.md`
- `RESOURCES-PHASE-0-AUDIT.md`
- `package.json`
- `package-lock.json`

没有修改 Notebook 编辑器适配器、文档内容模型、翻译/朗读逻辑或 Flashcard 数据模型。

## 11. 已实现的产品行为

Collections 工作台：

- 快速添加只要求 Title、Type 和 Status。
- URL、Description、Language、Tags、Decks、Emoji 和旧 Topic 位于更多信息。
- Type 直接选择，不再先选 Group。
- Tag 可搜索、多选、移除和行内创建。
- Deck 可搜索、多选，Resource 可以不属于任何 Deck。
- 搜索覆盖标题、说明、旧 Topic、Type、Tag 与 Deck 名称。
- Type、Language、Status、Tags、Deck 和 Deck 视图可组合筛选。
- Tag 多选使用 OR；不同维度使用 AND。
- 显示结果数、筛选 Chip、清空筛选与空状态。
- 支持当前筛选结果全选和批量 Status、Type、Tag、Deck 操作。

设置与管理：

- Type、Tag、Language 默认只读展示，点击 Edit 后出现 Save/Cancel。
- Tag 支持搜索、按名称/使用量排序、重命名、合并和安全删除。
- Type 支持 Emoji、重命名、合并和带重新分配的安全删除。
- Language 沿用稳定 ID；使用中的 Language 不允许直接删除。
- Deck 支持名称、Emoji、说明、编辑和安全删除。
- Deck 内继续使用相同搜索与筛选器。

同步：

- 原子 command 使用 opId、baseHead 和 epoch。
- 离线普通编辑保留本机队列。
- 已有云端基线后，离线批量命令保留 optimistic projection，并可在冲突后重试或明确放弃。
- 首次完全离线、尚无服务器基线时，不执行破坏性合并/删除命令。
- 同步冲突不会静默覆盖远端 tombstone 或新 schema。

## 12. 测试与验收结果

自动化覆盖：

- 当前结果：52/52 tests passed；静态检查与构建通过
- Cloudflare Access、Origin 拒绝和 read-only 模式
- 规范化与兼容投影一致性
- Type 安全删除、Tag 合并/删除、Deck 删除和批量修改
- Resource ID、字段、关系与 tombstone 迁移
- 默认 Type、精确旧 Type 映射和模糊分类保留
- 幂等重跑、checksum/head/规范化 target ledger、逐对象内容防护和名称碰撞报告
- D1 大 bind/statement 分块和精确 Deck position 验证
- 本地备份导入、跨 scope 复制、离线队列和三方 settings 合并
- 跨标签页 epoch 回执竞态、同 ID 恢复和终止性 4xx 冲突处理
- retired 兼容读取

浏览器回归覆盖：

- Resource 新建、编辑、详情、筛选、空结果和 URL 状态
- Tag 行内创建与多选
- Deck 创建、编辑、导航、搜索和 Resource 关联
- Type/Tag/Language Edit、Save、Cancel
- Tag 合并、Tag/Deck 删除和 Type 重分配确认中的影响数量
- 英文界面不翻译用户自定义 taxonomy 名称
- 批量操作值不会在选择后被错误重置

最终发布前仍必须在冻结的生产快照克隆和独立测试 D1 上执行迁移验证；本地 fixture 不能替代生产数据核对。

## 13. 已知限制

- 多语言 Resource 关联未实现；保留一个主要 Language。
- Tag 多选第一版只支持 OR，不支持“匹配全部标签”。
- Deck 手动排序、拖拽、复制、分享和导出不在本期。
- Tag 合并与 Type 重分配当前通过精确目标名称确认；后续可换成可搜索选择器。
- `retired` 模式禁用原子批量/合并命令；若在 retired 下重新开放写入，恢复 active 前需要新的重同步 migration。
- `magpie`、`五夏` 和其他不明确 Type 仍需要生产迁移报告中的人工复核。
- 没有在生产数据量上取得查询计划与性能指标；索引依据当前查询模式预置。

## 14. 部署闸门与当前状态

生产发布前必须：

1. 设置 Cloudflare Access，并关闭 `workers.dev`。
2. 同时开启两个只读开关。
3. 创建 D1 Time Travel 恢复点与完整导出。
4. 保存冻结后的 `/api/sync/raw-state`，并确认响应包含 `raw: true`。普通
   `/api/sync/state` 会计算 Resource 的展示语言，不能作为可重放迁移源。
5. 完成本地 clone dry-run、apply、重复运行和 verification。
6. 在独立测试 D1 应用 `0001`–`0004`。
7. 运行 `npm test`、`npm run check`、`npm run build`。
8. 浏览器回归 Notebook、翻译、朗读、Flashcard 和 Collections。
9. 人工批准后才允许生产 D1 migration 与 Worker deploy。
10. verify 通过后生成并审查 guarded mode artifact；其 target ledger 必须核对
    兼容投影、规范化 taxonomy、Resource、全部关联和精确 Deck position，才从
    shadow 切换 active 并关闭只读。

迁移生成器会把大 JSON bind 分块到 D1 上限以下，将 source/target ledger JSON
存成独立的分块行，并将超长 SQL payload 拆成小于 95 KB 的语句；审查 artifact
时不得手工合并这些片段。

当前状态：代码与本地验证已完成；没有执行生产部署、生产 D1 migration、生产 mode 切换或生产数据删除。

