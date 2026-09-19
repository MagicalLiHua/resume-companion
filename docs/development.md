# 开发说明

0.15.1 的产品代码使用严格 TypeScript。Resume Companion 实现本地资料服务和 Resume Browser MCP；后者在固定的 `chrome-devtools-mcp@1.9.0` 浏览器生命周期与诊断能力之上维护页面语义缓存、局部/增量观察、事务式表单动作和敏感值脱敏。

0.15.1 的浏览器层由同进程 TypeScript 组合服务实现：固定上游浏览器生命周期和诊断能力，在共享页面上下文中增加局部观察、语义重定位和事务式表单动作。架构讨论、竞品分析和阶段评测保留在本地研发资料中，不随公开仓库和安装包发布。

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

需要在专用持久 Chrome 中进行人工 Agent 验收时，先运行 `npm run lab`。完整四步网申使用 `tests/fixtures/acceptance-task.md`；十五类控件配方使用 `tests/fixtures/control-recipes-task.md`。两者都只读取配套虚构资料，且最终提交计数必须保持为 0。

商业插件研究材料和真实网站捕获保持在 git 忽略目录，只允许把重新设计后的原创实现和合成测试加入公开仓库。

专用 Chrome 已由另一个 Agent 任务持有时，不要再启动第二个浏览器 MCP。0.15.1 起，持有者在首次浏览器调用后会创建仅限本机用户访问的只读调试 socket。开发侧可运行 `npm run debug:browser -- status`、`npm run debug:browser -- pages`，或 `npm run debug:browser -- observe <page-id> [target] [scope]` 实时查看同一个浏览器上下文。调试通道只支持状态、列页和脱敏语义观察，不执行填写、点击、脚本或 Network 正文读取。

## 目录

| 目录 | 内容 |
| --- | --- |
| `plugins/resume-companion/src/index.ts` | 四工具资料 MCP |
| `plugins/resume-companion/src/profile-store.ts` | 本地 schema、原子写入、历史和 revision |
| `plugins/resume-companion/src/chrome-profile.ts` | 跨平台 Profile 路径与实例锁 |
| `plugins/resume-companion/src/chrome-launcher.ts` | 官方 MCP 参数、stdio 透传和脱敏诊断 |
| `plugins/resume-companion/src/browser/stale-uid-recovery.ts` | 失效 AX 句柄与动作期 Locator 的唯一语义恢复 |
| `plugins/resume-companion/src/devtools-resilience-preload.ts` | 在固定上游运行时安装兼容层 |
| `plugins/resume-companion/skills` | Agent 工作流与诊断边界 |
| `plugins/resume-companion/tests` | 资料、锁、策略和真实官方 MCP 集成 |
| `tests/fixtures` | 本地虚构招聘页面 |

## 构建边界

`plugins/resume-companion/scripts/build.mjs` 生成：

- `server.bundle.mjs`
- `chrome-launcher.bundle.mjs`
- `devtools-resilience-preload.mjs`
- `runtime/chrome-devtools-mcp/`

不要手工编辑 bundle 或 runtime。启动器不代理、不改名、不解析上游 MCP 工具，只计算稳定 Profile、获取锁、设置已审查参数、透传 stdio 和脱敏 stderr。预加载兼容层固定依赖 1.9.0 的 `McpPage` 导出；构建脚本还对该固定运行包的错误包装做精确签名校验，使 `stale_action_*` 能原样返回。上游结构不匹配时构建或启动直接失败，不会静默关闭恢复。兼容层只在旧 AX 句柄已经脱离文档或 Locator 动作期间丢失节点时运行，候选歧义和结果不确定时停止，不包含域名、CSS 选择器或站点 API。

专用 Profile 不放在插件缓存中。启动器允许 MCP 初始化和工具目录读取直接透传，只在第一条 `tools/call` 前获取锁；第二个任务不会静默改用临时 Profile。锁冲突作为当前工具调用的可重试 JSON-RPC 错误返回，不终止上游 MCP。正常或信号退出时，锁只在上游进程结束后释放。

## 变更规则

- 新页面能力优先通过官方稳定工具和 skill 组合，不增加站点专用选择器或 API 逆向写入。
- 上游补丁必须能由合成页面确定性复现，并保持错误不含字段值、页面内容、Cookie 或请求数据。
- 固定上游版本；升级前运行完整集成回归并检查工具 schema、默认行为和审批面。
- 资料 schema 变更需要兼容迁移、原子写入和旧 revision 测试。
- 浏览器权限变更需要同步 `.mcp.json`、文档和策略测试。
- 任何真实招聘网站验证先只读；普通填写或草稿保存需要明确的当前账号和范围授权。

旧版扩展、Native Host 与自研浏览器协议保存在 Git 标签 `archive/extension-0.10.0`，不在 0.11 主线继续维护。
