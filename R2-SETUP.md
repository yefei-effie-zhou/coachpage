# 音频文件存储设置

音频文件保存在 Cloudflare R2，D1 的 `documents.audio_url` 字段保存播放地址。

## Cloudflare Dashboard

1. 打开 **R2 Object Storage**，创建 bucket，例如 `notebook-audio`。
2. 打开 `ducknotebook` Worker。
3. 进入 **Settings → Bindings → Add binding → R2 bucket**。
4. Variable name 填写 `AUDIO_BUCKET`。
5. 选择刚创建的 `notebook-audio` bucket，保存并重新部署 Worker。

无需将 bucket 设为公开。音频统一通过 Worker 的 `/api/audio/:key` 接口读取，并支持 Range 请求和时间轴跳转。

## 限制

- 前端和 Worker 均限制单个音频文件不超过 50 MB。
- 允许浏览器识别的 `audio/*` 文件类型。
- 删除历史全文目前不会自动删除 R2 对象，以避免同一音频被多篇全文引用时误删。
