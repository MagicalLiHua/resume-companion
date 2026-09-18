# 开发指南

核心 MCP 与浏览器驱动使用严格 TypeScript。只有构建、打包和兼容启动器保留为短小的 `.mjs` 脚本。

## 安装与回归

使用 Node.js 24：

~~~sh
npm ci
npm ci --prefix plugins/resume-companion
npx playwright install chromium
npm run check
npm test --prefix plugins/resume-companion
npm run test:core --prefix plugins/resume-companion
npm run test:devtools --prefix plugins/resume-companion
npm run test:live --prefix plugins/resume-companion
~~~

`test:devtools` 会启动本地虚构表单和临时隔离 Chrome，通过真正的 Chrome DevTools MCP 填写、核对和撤销字段，不加载项目扩展。`test:live` 验证可选扩展回退。测试只使用合成资料和临时数据目录。

## 目录

| 目录 | 内容 |
| --- | --- |
| `plugins/resume-companion/src` | MCP、资料库、协议和浏览器驱动 TypeScript 源码 |
| `plugins/resume-companion/src/browser` | DevTools 主驱动、扩展回退、快照、安全策略和操作日志 |
| `extension/src` | 可选 Chrome 扩展回退 |
| `tests/fixtures` | 虚构多步骤招聘表单 |
| `tests/unit`、`plugins/resume-companion/tests` | 协议、资料库、驱动和策略测试 |

## 浏览器驱动约束

`DevToolsDriver` 通过官方 Chrome DevTools MCP 的 stdio 客户端连接 Chrome。上游包固定版本并在构建时复制到 `runtime/chrome-devtools-mcp`，发布包不依赖全局 `npx` 或运行时下载。

新增能力时应继续满足：

- 只暴露 Resume Companion 的十个稳定工具，不把上游工具目录直接交给模型。
- 使用无障碍树快照和不透明引用，不接受任意选择器或脚本。
- 每次写入前校验当前值 token，写入后回读。
- 有副作用的操作使用 `operation_id` 去重。
- 保存和页面迁移形成撤销边界。
- 最终提交及敏感操作保持手动。

## 虚构表单与打包

~~~sh
npm run lab
npm run package
~~~

实验页位于 `http://127.0.0.1:4174/agent-lab.html`。发布包包含自包含 MCP、固定的 DevTools 运行时、skill、公开文档和 `extension-fallback`。不要手工编辑 `server.bundle.mjs`；修改 TypeScript 后运行插件构建。
