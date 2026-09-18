# 开发指南

产品逻辑、MCP、Chrome 扩展、Native Host 和页面执行引擎使用严格 TypeScript。只有构建、打包、调试客户端和兼容启动器保留为短小的 `.mjs` 或 shell 脚本。

## 安装与回归

使用 Node.js 24：

~~~sh
npm ci
npm ci --prefix plugins/resume-companion
npm run typecheck
npm run build
npm test
npm run test:e2e
npm run test:core
npm run test:devtools
npm run package
~~~

`npm test` 覆盖共享协议、Native Host 中继集成、本地资料、快照、安全策略和驱动故障。`test:e2e` 在 Playwright 中运行完整页面执行引擎；`test:devtools` 则验证官方 Chrome DevTools MCP 备用驱动的隔离与持久 Profile。所有自动化回归只使用合成资料。

## 目录

| 目录 | 内容 |
| --- | --- |
| `shared` | MCP、Native Host 与扩展共享的版本化桥接协议 |
| `extension/src/background` | Native Messaging、标签页管理、`chrome.debugger` 可信输入与工具路由 |
| `extension/src/content` | 页面观察、动作、动态控件、策略、回读与撤销 |
| `native-host/src` | Chrome Native Messaging 长度帧、来源校验和私有 socket 中继 |
| `plugins/resume-companion/src` | MCP、本地资料库、协议、扩展驱动与 DevTools 备用驱动 |
| `tests/fixtures` | 虚构的单页和多步招聘表单 |
| `tests/e2e` | 复杂页面控件与操作语义回归 |
| `plugins/resume-companion/tests` | MCP 契约、资料库、扩展 socket 和 DevTools 回归 |

## 扩展驱动约束

新增能力应继续满足：

- 对模型只暴露 Resume Companion 的十个稳定工具。
- 使用不透明引用和页面快照，不接受任意选择器或脚本。
- 每次写入前校验当前值 token，写入后回读。
- 有副作用的操作使用 `operation_id` 去重。
- 保存和页面迁移形成撤销边界。
- 扩展不保存简历、Cookie、页面正文、表单值或桥接 token。
- Native Host 只连接当前 MCP 生成的私有 socket，不增加固定 localhost 监听端口。
- 最终提交及敏感操作保持手动。

Manifest 的公钥固定扩展 ID，不应在普通版本更新中替换。扩展、共享协议、Native Host 和 MCP 的 bridge protocol 版本必须一致。

## DevTools 备用驱动

`RESUME_COMPANION_BROWSER_DRIVER=devtools` 显式启用 `DevToolsDriver`。它通过固定版本的官方 Chrome DevTools MCP 连接 Chrome。上游运行时在构建时复制到 `runtime/chrome-devtools-mcp`，发布包不依赖全局 `npx` 或运行时下载。

默认日常模式不调用该驱动，也不依赖 `DevToolsActivePort`。它仍然保留隔离 Profile、持久专用 Profile、安全错误归一化和连接失败后重建客户端的回归。

## 虚构表单与打包

~~~sh
npm run lab
npm run package
~~~

实验页位于 `http://127.0.0.1:4174/agent-lab.html`。发布包包含自包含 MCP、Chrome 扩展、Native Host、固定 DevTools 备用运行时、skill 和公开文档。不要手工编辑 `server.bundle.mjs`、`host.bundle.mjs` 或扩展构建产物；修改 TypeScript 后运行根目录构建。
