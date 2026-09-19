# 开发说明

0.11.1 的产品代码使用严格 TypeScript。Resume Companion 只实现本地资料服务和一个薄的 Chrome MCP 启动器；浏览器协议、页面快照和输入能力来自固定的官方 `chrome-devtools-mcp@1.9.0`。

## 命令

~~~sh
npm ci
npm ci --prefix plugins/resume-companion
npm run typecheck
npm run build
npm test
npm run test:core
npm run test:e2e
npm run package
~~~

`test:e2e` 启动本地虚构招聘站点和无头 Chrome，直接调用官方 MCP。测试只使用合成数据。某些受限环境需要允许监听 `127.0.0.1:4174` 和启动 Chrome。

需要在专用持久 Chrome 中进行人工 Agent 验收时，先运行 `npm run lab`，然后把 `tests/fixtures/acceptance-task.md` 作为新会话任务。该任务会读取配套虚构简历并打开四步综合表单；页面最终会显示自动化字段完成率和边界违规计数。

## 目录

| 目录 | 内容 |
| --- | --- |
| `plugins/resume-companion/src/index.ts` | 四工具资料 MCP |
| `plugins/resume-companion/src/profile-store.ts` | 本地 schema、原子写入、历史和 revision |
| `plugins/resume-companion/src/chrome-profile.ts` | 跨平台 Profile 路径与实例锁 |
| `plugins/resume-companion/src/chrome-launcher.ts` | 官方 MCP 参数、stdio 透传和脱敏诊断 |
| `plugins/resume-companion/skills` | Agent 工作流与诊断边界 |
| `plugins/resume-companion/tests` | 资料、锁、策略和真实官方 MCP 集成 |
| `tests/fixtures` | 本地虚构招聘页面 |

## 构建边界

`plugins/resume-companion/scripts/build.mjs` 生成：

- `server.bundle.mjs`
- `chrome-launcher.bundle.mjs`
- `runtime/chrome-devtools-mcp/`

不要手工编辑 bundle 或 runtime。启动器不代理、不改名、不解析上游 MCP 工具，只计算稳定 Profile、获取锁、设置已审查参数、透传 stdio 和脱敏 stderr。

专用 Profile 不放在插件缓存中。启动器允许 MCP 初始化和工具目录读取直接透传，只在第一条 `tools/call` 前获取锁；第二个任务不会静默改用临时 Profile。锁冲突作为当前工具调用的可重试 JSON-RPC 错误返回，不终止上游 MCP。正常或信号退出时，锁只在上游进程结束后释放。

## 变更规则

- 新页面能力优先通过官方稳定工具和 skill 组合，不增加站点专用选择器或 API 逆向写入。
- 固定上游版本；升级前运行完整集成回归并检查工具 schema、默认行为和审批面。
- 资料 schema 变更需要兼容迁移、原子写入和旧 revision 测试。
- 浏览器权限变更需要同步 `.mcp.json`、文档和策略测试。
- 任何真实招聘网站验证先只读；普通填写或草稿保存需要明确的当前账号和范围授权。

旧版扩展、Native Host 与自研浏览器协议保存在 Git 标签 `archive/extension-0.10.0`，不在 0.11 主线继续维护。
