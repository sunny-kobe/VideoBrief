# 中文语音试听表

此目录提供隔离的静态试听页生成器与显式运行的语音探测脚本，不改正式项目。`build-listening-page.mjs`只整理已有音频，不调用语音服务；`run-available-providers.mjs`与`probe-gemini-generate-content.mjs`会使用本机配置发起真实请求，运行前核对模型额度和费用授权，切勿提交环境文件或凭据。

已验证的补充试听（相同热泵文稿、Charon声线、默认表达）：

```bash
node experiments/voice-benchmark-20261018/probe-gemini-generate-content.mjs --model=gemini-3.8-flash-lite-tts
node experiments/voice-benchmark-20261018/probe-gemini-generate-content.mjs --model=gemini-2.5-flash-preview-tts
```

以上命令依赖本地`output/voice-benchmark-20261018/available-api/results.json`中的文稿，以及`.env.local`中的`GEMINI_API_KEY`；这些文件不随Git提交。每个样本仅调用一次，已有音轨或收据则拒绝重试，避免无意重复消耗额度。`normalize-and-check.mjs`复用既有FFmpeg依赖统一响度并完整解码；页面生成命令如下。

```bash
node experiments/voice-benchmark-20261018/build-listening-page.mjs \
  --manifest=output/voice-benchmark-20261018/manifest.json \
  --output=output/voice-benchmark-20261018/listening \
  --public=public/renders/voice-benchmark-20261018/
```

输出目录和公开目录都必须尚未存在；重新生成时使用新目录，禁止覆盖旧结果。页面入口为公开目录的 `index.html`，音频和精简收据随页生成。

输入使用 `schemaVersion: 1`，顶层包含 `title`、`text`、`style`、`generatedAt` 和 `rows`。每行需有安全且唯一的 `id`，以及 `provider`、`model`、`voice`、`language` 和 `status`。模型不明确时填写“未公开”，费用不明时不填写 `costNote`，页面显示“实际费用未知”。

- `generated`：本轮同稿实测；必须有本地音频。行 `text` 可省略，提供时必须与顶层文稿一致。
- `historical`：历史本地音频；必须另填真实行 `text`，独立分区展示。兼容 `group: "historical"`。
- `official-demo`：官方不同稿示例；必须有 `sourceUrl`。可以提供本地音频，或 `demoAudioUrl` 指向官方 HTTPS 音频原站在线播放，二者不可同时提供。没有音频只显示官方入口，不给空播放控件。
- `blocked`：尚未生成；必须有具体 `reason` 和官方 `sourceUrl`。

本地音频使用 `audioPath` 和真实 `audioSha256`，只能位于当前工作区 `output/`。优先使用 `normalizedAudioPath` 时，必须提供对应的 `normalizedSha256`。可选 `durationSeconds`、`costNote`、`reason`。路径组件存在符号链接、越界路径、空文件、错误哈希、未知状态和危险链接时拒绝生成。音频会复制为不含供应商名称的序号文件。精简收据不携带原始配置、内部证据文件路径或其他未列明字段。

`sourceUrl` 和远程样音仅接受脚本中列出的官方域名，禁止含凭证参数的地址。新增官方域名应先核实来源，再修改域名列表。远程示例不下载、不重托管；浏览器仅在用户播放时向对应官方站点请求音频。远程网络可用性和音量未经本工具保证。

页面默认 1 倍速、不自动播放，同时只播放一个样本；可隐藏供应商与模型名称进行匿名试听。用户勾选和备注只存浏览器 `localStorage`，可下载 JSON；不会发送评价。历史与官方不同稿只能用于初筛，不能冒充本轮同稿排名。

生成器语法检查：

```bash
node --check experiments/voice-benchmark-20261018/build-listening-page.mjs
```

正式试听页生成后，仍应由主任务检查桌面和手机布局、逐项播放和完整音频解码。本工具不以“HTML 已生成”代替真实播放验证。
