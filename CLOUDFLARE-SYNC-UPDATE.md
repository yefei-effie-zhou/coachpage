# Collections 云端迁移与发布手册

本手册适用于当前的 `sync_v2` + Collections 规范化数据层。旧的 `API_SECRET` 和“请求时自动建表”流程已经废弃。

截至 2026-11-23，本次改造只在本地代码、测试数据库和浏览器本地数据中验证；没有部署 Worker，也没有写入或迁移生产 D1。

## 1. 访问边界

生产 Worker 必须放在 Cloudflare Access 保护的自定义域名后，并在 Worker 内再次验证 Access JWT。

必需配置：

- D1 binding：`DB`
- R2 binding：`AUDIO_BUCKET`
- `ALLOWED_ORIGIN`：前端唯一允许的 HTTPS Origin
- `ACCESS_ISSUER`：例如 `https://your-team.cloudflareaccess.com`
- `ACCESS_AUD`：Access Application Audience；多个值用逗号分隔
- `ACCESS_ALLOWED_EMAILS`：允许访问的邮箱；多个值用逗号分隔
- `SYNC_READ_ONLY`
- `COLLECTIONS_READ_ONLY`

要求：

1. `workers_dev=false`，不要留下未受 Access 保护的 `*.workers.dev` 入口。
2. Access Application 覆盖 Worker 的整个自定义域名，而不是只保护前端页面。
3. `/api/session`、`/api/sync/*`、`/api/collections/*` 和旧兼容 API 均校验 `Cf-Access-Jwt-Assertion`。
4. 不再配置、发送或记录 `API_SECRET`。
5. 不要把 Access Service Token、JWT 或应用密钥提交到仓库。

`wrangler.jsonc.example` 只提供变量结构，必须复制成不含真实密钥的环境配置后再使用。

## 2. 迁移前冻结与备份

迁移窗口开始时，同时设置：

```text
SYNC_READ_ONLY=1
COLLECTIONS_READ_ONLY=1
```

两个开关都需要开启，因为旧客户端可能仍通过通用 `/api/sync/operations` 写入 Resource。前端会保留本机队列，迁移完成后可以继续同步。

在任何生产 D1 写入前：

1. 在 Cloudflare Dashboard 记录 D1 Time Travel 恢复点或 bookmark。
2. 导出完整数据库，而不只是旧 `resources` 表。
3. 读取冻结后的 `/api/sync/raw-state`，保存 epoch、head 和数据库中的原始同步对象。
4. 记录导出文件与快照文件的 SHA-256。

示例：

```bash
mkdir -p backups generated
npx wrangler d1 export dutch-transcript-db --remote \
  --output="backups/d1-before-collections.sql"

cloudflared access curl \
  "https://your-protected-worker.example.com/api/sync/raw-state" \
  > "backups/sync-state-before-collections.json"

shasum -a 256 backups/d1-before-collections.sql \
  backups/sync-state-before-collections.json
```

确认快照是 JSON、`raw: true`，且其中的 `epoch`、`head`、Resource 数量与审计记录一致。
普通 `/api/sync/state` 会计算 Resource 的展示语言，不能作为迁移源。不要使用旧
`resources` 表覆盖 `sync_v2_objects`。

## 3. Dry-run 与本地克隆验证

默认迁移命令只生成 SQL 和报告，不修改数据库：

```bash
npm run collections:migrate -- \
  --snapshot backups/sync-state-before-collections.json \
  --out generated/collections-backfill.local.sql \
  --report generated/collections-backfill.report.json
```

报告中出现 error 级问题时停止。warning 中的 `magpie`、`五夏`、AI 或其他自定义 Type 必须人工复核。

将 D1 导出导入一个新的本地 SQLite 文件，然后只对该克隆执行迁移：

```bash
sqlite3 backups/collections-clone.sqlite \
  < backups/d1-before-collections.sql

npm run collections:migrate -- \
  --snapshot backups/sync-state-before-collections.json \
  --database backups/collections-clone.sqlite \
  --apply \
  --out generated/collections-backfill.local.sql \
  --report generated/collections-backfill.report.json

npm run collections:verify -- \
  --snapshot backups/sync-state-before-collections.json \
  --database backups/collections-clone.sqlite \
  --report generated/collections-verification.json \
  --mark-verified
```

`--apply` 只接受本地文件，并会先创建逐字节备份。再次运行相同迁移和验证，结果必须仍通过，且不得新增重复关联或降低 `verified` ledger 状态。

验证至少包括：

- Resource 总数、ID、迁移后 revision、业务字段和 tombstone 一致
- Type、Language、Tag、Deck 数量与名称唯一性
- Tag/Deck 关联无重复、无孤立记录
- Deck position 与迁移模型逐项一致
- 兼容 `sync_v2_objects` 与规范化投影一致
- `PRAGMA foreign_key_check` 为空
- migration checksum 与 ledger 一致

## 4. 生成 D1 migration artifact

本地 SQL 包含显式事务，仅供 SQLite 克隆使用。Wrangler D1 migrations 会自己提供事务边界，因此生产 artifact 不能包含 `BEGIN` 或 `COMMIT`。

在最终冻结快照上生成 D1 版本：

```bash
npm run collections:migrate -- \
  --snapshot backups/sync-state-before-collections.json \
  --out generated/collections-backfill.local.sql \
  --d1-out migrations/0004_collections_backfill.sql \
  --report generated/collections-backfill.report.json
```

生成后检查：

1. `0004` 的 checksum 与报告一致。
2. 文件没有 `BEGIN` 或 `COMMIT`。
3. `0001`–`0003` 只新增表、索引和 runtime/ledger。
4. `0004` 的 source epoch/head 与冻结快照完全一致；target head 按
   settings + Resource 数量连续推进。
5. 大 JSON bind 已按 D1 上限分块；source/target ledger JSON 使用独立分块行，
   超长 SQL payload 已拆成小于 95 KB 的语句，避免同时触发 D1 单行和单语句
   限制。审查时不得手工重新拼接。
6. 先对独立的测试 D1 应用并验证，不得直接以生产库作为第一次 D1 演练。

## 5. 分阶段发布

只有在本地克隆、测试 D1、自动化测试和浏览器回归全部通过后，才进入生产发布。

建议顺序：

1. 保持两个只读开关为 `1`。
2. 部署受 Access 保护且 `workers_dev=false` 的新 Worker。
3. 对测试 D1 执行 `0001`–`0004`，验证重复执行与失败回滚。
4. 经人工批准后，才对生产 D1 执行：

   ```bash
   npx wrangler d1 migrations apply dutch-transcript-db --remote
   ```

5. 通过 Access 读取：

   ```text
   GET /api/collections/state
   GET /api/collections/verify
   ```

6. `/api/collections/verify` 必须返回 `ok: true`，且 mismatch 与 foreign-key issue 都为空。
7. 保持 `collection_runtime.mode='shadow'` 完成一轮真实只读核对；此时正式前端
   仍读取兼容投影。
8. 核对 Resource 数量、ID、Type、Language、Status、Tags、Decks 和 Notebook 回归。
9. 使用同一冻结快照生成受保护的 cutover artifact：

   ```bash
   npm run collections:mode -- \
     --snapshot backups/sync-state-before-collections.json \
     --mode active \
     --out migrations/0005_collections_activate.sql
   ```

10. 审查并应用 `0005`。它会再次核对 checksum、epoch、target head、对象数量、
    每个兼容投影及规范化 taxonomy/resource/relation/Deck position；任一不一致都会
    约束失败并回滚。
11. 再次确认 `/api/collections/state` 为 `mode: "active"` 且
    `/api/collections/verify` 为 `ok: true`。
12. 最后将两个只读开关改为 `0`，再观察新旧投影是否持续一致。

不要在验证前删除旧 Group、旧 `resources` 表、迁移源快照或兼容投影。

## 6. Shadow、Active 与 Retired

- `shadow`：规范化 Collections 只用于验证；正式前端继续读取
  `sync_v2_objects`，写入同时维护两边。
- `active`：完成验证后的正式状态；仍保留兼容投影与双写。
- `retired`：紧急回滚到 `sync_v2_objects` 兼容读取；普通单条操作仍可使用，原子批量/合并命令被禁用。

切换 mode 前必须先开启 `COLLECTIONS_READ_ONLY=1`，并确认没有未完成的迁移或批量命令。

## 7. 回滚

出现显示或 API 问题，但数据校验仍完整时：

1. 立即开启两个只读开关。
2. 导出故障时数据库和 `/api/sync/raw-state`，不要覆盖迁移前备份。
3. 用 `npm run collections:mode -- --snapshot <冻结快照> --mode retired
   --out generated/collections-retire.sql` 生成并审查回退 SQL，再切到 `retired`。
4. 确认 `/api/collections/state` 返回 `mode: "retired"`，并从兼容投影读取相同 Resource。
5. 修复并在克隆库重新验证后，才考虑恢复 `shadow`/`active`。

如果在 `retired` 状态重新开放写入，规范化表会停止跟随兼容投影；之后不能直接切回 `active`，必须创建新的版本化重同步迁移。

出现数据完整性问题时：

1. 保持只读。
2. 使用迁移前 D1 Time Travel 恢复点，或在新的 D1 中恢复完整导出。
3. 恢复范围必须包含 `sync_v2_meta`、`sync_v2_objects`、`sync_v2_ops` 及原有业务表。
4. 不要只恢复旧 `resources` 表。
5. 恢复后更换 epoch 或按同步恢复流程让客户端确认新基线，防止旧队列覆盖恢复结果。

## 8. 发布闸门

发布前必须全部满足：

```bash
npm test
npm run check
npm run build
```

此外还要有：

- 迁移 dry-run 报告
- 本地克隆 verification 报告
- 测试 D1 验证记录
- D1 导出与 Time Travel 恢复点
- Access 策略截图或变更记录
- `workers_dev=false` 检查
- 明确的人工确认清单

本仓库中的实现不会自动部署 Worker、自动应用远端 migration，或自动清空任何 localStorage。
