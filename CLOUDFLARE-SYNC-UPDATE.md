# Resources 云端同步更新

当前网页默认连接：

`https://ducknotebook.yefeizhou0086.workers.dev`

如果 Resources 显示“云端 Worker 版本过旧”，说明网页已经更新，但上述 Worker 仍在运行不含 `/api/resources` 的旧代码。

## 更新方式

1. 在 Cloudflare Dashboard 打开现有的 `ducknotebook` Worker。
2. 保留已有的绑定和变量，尤其是：
   - D1 binding：`DB`
   - R2 binding：`AUDIO_BUCKET`
   - `ALLOWED_ORIGIN`
   - `API_SECRET`
   - 已有的翻译、TTS 和对话服务密钥
3. 使用本文件同目录的 `worker.js` 替换 Worker 代码并部署。
4. 打开以下地址确认接口不再返回 404：

   `https://ducknotebook.yefeizhou0086.workers.dev/api/resources`

首次请求时，新版 Worker 会在现有 D1 数据库中自动创建 `resources`、`resource_settings`、`review_preferences` 和 `daily_review_plans` 表，并补齐资源的 `description`、`emoji` 字段；不会删除词卡、历史全文或音频。

其中 `resource_settings` 保存 Resources 使用的语言标签、资源分组和类型名称；`review_preferences` 保存每组数量和练习方式，`daily_review_plans` 保存当天固定的随机复习顺序，以便不同设备继续同一批复习。

## 同步本机已有资源

部署完成后，先在保存有完整自定义类型名称的原设备打开 Resources 页面并点击“立即同步”。看到“资源同步完成”后，再在其他设备连接同一个云端地址并打开 Resources 页面，即可读取资源和对应的类型、分组及语言设置。
