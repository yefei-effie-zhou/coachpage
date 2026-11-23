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

## 7. 建议的新数据模型

由于生产已采用通用同步对象表，建议不要立刻把 `resources` 主记录拆回多张普通表。更安全的增量方案是：

1. 资源主记录继续作为 `sync_v2_objects(entity='resource')`。
2. 新增同步实体类型需要先扩展 `entity` CHECK；或者把 Tag/Deck 定义放入 Resources settings，并把资源关联保存为稳定 ID 数组。
3. 若使用独立关系表，则必须同时设计 sync v2 的变更传播，不能只更新 D1 表。

推荐最终逻辑模型：

```text
resource.data:
  id, name, type_id, language_id, status,
  url, description, emoji, notes,
  tag_ids[], deck_ids[], created_at, updated_at

settings/resources:
  schema_version, languages[], types[], tags[], decks[]
```

如果生产同步 API 已支持通用 entity，优先把 `type`、`tag`、`deck` 作为独立实体；若不支持，则先采用版本化 settings + ID 数组，避免未经验证地改 CHECK 约束。

## 8. 迁移映射（草案）

| 旧 Type | 新 Type | 附加 Tag | 处理方式 |
|---|---|---|---|
| project | 项目资料 | 无 | 自动 |
| course | 课程 | 无 | 自动 |
| website | 网站 / 工具 | 无 | 自动 |
| movie_series | 影视 | 无 | 自动 |
| variety | 影视 | 综艺 | 自动 |
| book | 书籍 | 无 | 自动 |
| magpie UUID | 待人工确认 | magpie | 逐资源检查 |
| 五夏 UUID | 待人工确认 | 五夏 | 逐资源检查 |
| type-ai-mtyu5daq | 待人工确认 | AI（如内容吻合） | 逐资源检查 |
| type-家居-mux0vtcz | 待人工确认 | 家居（如内容吻合） | 逐资源检查 |

未知类型不能强制映射为文章或书籍。

## 9. 可恢复迁移方案

正式迁移前必须：

1. 使用 D1 Time Travel 或导出方式生成可恢复备份点。
2. 导出 `sync_v2_meta`、全部 `sync_v2_objects` 和 `sync_v2_ops`。
3. 导出旧 `resources` 表用于差异核对，但不作为唯一源。
4. 保存迁移前资源 ID、revision、JSON hash 与总数清单。
5. 迁移脚本使用独立版本号和幂等 migration ledger。
6. 先在测试数据库复制 39 条同步资源并运行迁移。
7. 验证 39 个资源 ID、字段和状态完整，再更新前端。
8. 保留旧字段和 Group 数据至少一个兼容版本。
9. 新旧客户端并存期间，服务端拒绝低 schema version 覆盖新对象。

回滚应恢复完整 sync v2 三表，而不仅是 `resources` 表。

## 10. 受影响文件清单

确定需要修改：

- `index.html`
- `assets/app.js`
- `assets/styles.css`
- 最新生产 Worker 源码（当前工作区版本不是最新）
- 新增版本化 D1 迁移文件
- 新增迁移验证脚本/报告
- `CLOUDFLARE-SYNC-UPDATE.md`

可能需要修改：

- `package.json`（只增加验证脚本时；不增加框架）
- `vite.config.js`（预计不需要）

不应修改：

- `assets/editor-adapter.js`
- Notebook 文档、翻译、朗读与 Flashcard 数据模型

## 11. 下一阶段开始条件

当前生产 Worker 已取得并完成初步审计，已确认：

- `/api/sync/state` 与 `/api/sync/operations` 路由存在。
- revision/head/epoch 采用乐观并发控制，并有最多 4 次重试。
- `sync_v2_ops` 通过 `op_id`、请求 hash 与 guard 实现幂等。
- `settings` 对象限制为 `id='resources'`。
- 旧 cards/documents/resources/resource-settings API 在 sync v2 初始化后返回迁移提示，避免继续覆盖新数据。
- 语言设置在同步层使用稳定的 `{id,name}` 对象。

现在可以进入 Phase 1：先扩展同步层数据规范与兼容读取，再实现独立 Type、Tags 和 Decks。正式 D1 写入仍需先准备备份与测试数据库。
## 2026-11-23 前端同步基线合并记录

- 已从当前生产站点保存前端同步客户端快照：`assets/app.production-sync.js`。
- 已保存独立同步引擎快照：`assets/sync-v2.production.js`，并作为本地 `assets/sync-v2.js` 使用。
- 已将同步 v2 数据层接入本地 Tiptap 编辑器；没有退回旧 contenteditable 编辑器。
- 已补齐同步版历史全文管理和同步处理面板所需的 HTML 节点。
- 本地构建通过；浏览器验证编辑/阅读状态切换、Resources 同步投影和页面初始化均正常。
- 线上 Worker 与 D1 尚未改写或部署；下一步才进入 Type 脱离 Group 的数据契约修改。

## Phase 1 数据契约变更（尚未部署）

- 同步设置升级为 `schema_version: 3`。
- `types[]` 的新契约为 `{ id, name, emoji? }`；历史 `group` 字段允许保留，但不再必填或参与有效性校验。
- 设置对象新增 `tags[]` 与 `decks[]`，现阶段默认空数组，使用稳定 ID 并进行规范化名称去重。
- Resource 新增 `tag_ids[]` 与 `deck_ids[]` 兼容字段；服务端验证引用存在，旧资源不要求立即回填。
- 删除仍被活动资源引用的 Type 继续返回引用冲突，避免资源失去有效类型。
- 资源设置页已去掉 Group 编辑和 Type→Group 选择；旧 Groups 继续随同步设置保留，未删除生产数据。
- 本阶段不迁移或重写现有资源 ID，也不自动处理 `magpie`、`五夏` 等需要人工判断的旧 Type。

