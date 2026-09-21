# 开发说明

0.24.0 的产品代码使用严格 TypeScript。ApplyMCP 实现本地资料服务、Browser Supervisor 和 ApplyMCP Browser；后者在固定的 `chrome-devtools-mcp@1.9.0` 浏览器生命周期与诊断能力之上维护页面语义缓存、局部/增量观察、事务式表单动作和敏感值脱敏。

0.24.0 的浏览器层由独立 TypeScript Supervisor 和每任务 MCP 会话组成：固定上游浏览器生命周期和诊断能力，在一个共享页面上下文中增加租约、局部观察、语义重定位和事务式表单动作。架构讨论、竞品分析和阶段评测保留在本地研发资料中，不随公开仓库和安装包发布。

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

Browser Supervisor 通过按 Profile 派生且权限为 0600 的本机 socket 复用同一个专用 Chrome。新任务首次调用浏览器工具时会转移操作租约，旧任务的后续浏览器调用被拒绝。开发侧可运行 `npm run debug:browser -- status`、`npm run debug:browser -- pages`，或 `npm run debug:browser -- observe <page-id> [target] [scope]` 实时查看同一个浏览器上下文。调试通道只支持状态、列页和脱敏语义观察，不执行填写、点击、脚本或 Network 正文读取。

## 目录

| 目录 | 内容 |
| --- | --- |
| `plugins/resume-companion/src/index.ts` | 资料与补充表 MCP |
| `plugins/resume-companion/src/profile-store.ts` | 本地 schema、原子写入、历史和 revision |
| `plugins/resume-companion/src/chrome-profile.ts` | 跨平台 Profile 路径与实例锁 |
| `plugins/resume-companion/src/chrome-launcher.ts` | 每任务 stdio 与 Supervisor socket 的轻量代理 |
| `plugins/resume-companion/src/browser-supervisor.ts` | 共享 Chrome 生命周期、页面上下文和任务租约 |
| `plugins/resume-companion/src/resume-browser-server.ts` | 官方工具、语义工具与每任务 MCP 会话 |
| `plugins/resume-companion/src/browser/stale-uid-recovery.ts` | 失效 AX 句柄与动作期 Locator 的唯一语义恢复 |
| `plugins/resume-companion/src/browser/form-dom.ts` | 共用的字段、栏目、候选与展示值语义读取 |
| `plugins/resume-companion/src/browser/controls` | 真实组件 DOM 状态、日期/路径/多选执行、严格验证与取消收尾 |
| `plugins/resume-companion/src/devtools-resilience-preload.ts` | 在固定上游运行时安装兼容层 |
| `plugins/resume-companion/skills` | Agent 工作流与诊断边界 |
| `plugins/resume-companion/tests` | 资料、锁、策略和真实官方 MCP 集成 |
| `tests/fixtures` | 本地虚构招聘页面 |
| `tests/real-controls` | 固定真实组件、独立受控值断言、行为契约和基线/性能报告 |

## 构建边界

`plugins/resume-companion/scripts/build.mjs` 生成：

- `server.bundle.mjs`
- `chrome-launcher.bundle.mjs`
- `browser-supervisor.bundle.mjs`
- `runtime/chrome-devtools-mcp/`

不要手工编辑 bundle 或 runtime。轻量启动器只完成 Supervisor 握手和 stdio/socket 透传；Supervisor 在共享页面上下文中注册官方工具与语义工具。短命节点恢复固定依赖 1.9.0 的 `McpPage` 导出；上游结构不匹配时构建或启动直接失败，不会静默关闭恢复。恢复层只在旧 AX 句柄已经脱离文档或 Locator 动作期间丢失节点时运行，候选歧义和结果不确定时停止，不包含域名、CSS 选择器或站点 API。

专用 Profile 不放在插件缓存中。Supervisor 只在第一条浏览器 `tools/call` 时获取 Profile 锁；第二个任务连接已有 Supervisor，并在原子操作边界转移任务租约，不会启动第二个 Chrome 或改用临时 Profile。只有外部 Chrome 进程和从旧版迁移的残留进程会触发 `profile_in_use`。

## 变更规则

- 新页面能力优先复用现有浏览器工具与已核对的开源实现；允许有来源和回归样本的国内招聘系统结构规则，优先服务多家企业共用的系统及组件变体。具体筛选见本地 `docs/domestic-ats-reuse-plan.md`。不直接调用或重放网站写 API。
- 上游补丁必须能由合成页面确定性复现，并保持错误不含字段值、页面内容、Cookie 或请求数据。
- 固定上游版本；升级前运行完整集成回归并检查工具 schema、默认行为和审批面。
- 资料 schema 变更需要兼容迁移、原子写入和旧 revision 测试。
- 浏览器权限变更需要同步 `.mcp.json`、文档和策略测试。
- 任何真实招聘网站验证先只读；普通填写或草稿保存需要明确的当前账号和范围授权。

旧版扩展、Native Host 与自研浏览器协议保存在 Git 标签 `archive/extension-0.10.0`，不在 0.11 主线继续维护。


## 真实组件回归

`tests/real-controls` 独立固定 Ant 4/5、Element Plus、React/Vue 依赖，编译产物与测试资料不进入发布包。先运行 `npm ci --prefix tests/real-controls` 和 `npm run test:controls:build`。

- `npm run test:controls`：真实组件值与可见结果对照。
- `npm run test:controls:contracts`：幂等、取消、已有值保护、路径恢复和假成功回归。
- `RC_REPEAT=5 npm run test:controls`：重复验收。
- `npm run test:controls:benchmark`：固定样本的执行器性能；定义与参数见测试目录 README。

产品执行器不得访问测试 oracle。浏览器 DOM 序列化函数必须保持闭包自包含；修改后需通过构建产物运行 MCP 测试，不能仅靠单元测试中的模块环境验证。

## 飞书优化回归（0.20）

运行 `npm run test:controls:build` 后，`npm run test:ud-contracts` 验证受控长文本、失焦拒绝和既有 UD 选择/日期反例；`npm run test:feishu:optimization` 验证 14 段长文本与异构步骤、自由名称、错误归属、多选、新增命中、部分失败和取消。夹具是原创 React 行为测试，不能代表原站 UD 实现或整页 Agent 速度。两组都进入 CI。

目录分页及超过 100 条日志的计数/分页由单元测试覆盖。全量发布仍运行 `npm run check`、`npm run test:controls`、`npm run test:controls:contracts` 和包内双客户端冒烟；原站存在未保存草稿时，不直接复用会刷新当前页面的清理脚本。

### 浏览器上下文诊断

`npm run debug:browser -- runtime <pageId>` 通过专用 supervisor socket 读取上下文缓存，不执行页面脚本、不读取简历值。优先使用该命令；不要附加到用户日常 Chrome，也不要为诊断开启进程 inspector。`main=false` 或 `utility=false` 时，0.20.1 会在下一次语义或输入操作前尝试同步原会话一次。无法恢复时保留现场。取消 beforeunload 表示取消导航，不代表页面刷新完成。

## Moka 与北森回归

更新源码后先 `npm run build`，更新 React 夹具后先 `npm run test:controls:build`。`npm run test:moka` 验证 SD 简历组件，`npm run test:beisen` 验证 Phoenix 的重复记录、日期、单选、城市与目录确认多选、学校词库和缺失候选、残留及关闭中弹层。夹具为原创行为模型；真实页面结果须另有整页执行和独立 DOM 回读证据。

自动准备器位于 `src/browser/planning/`，事实归一化位于 `src/profile-facts.ts`。规则以控件家族和实时栏目匹配，不缓存跨企业的实例绑定。`npm run test:form-prepare` 验证三种家族、企业栏目开关、可选简历资料、页面变化和 revision 变化，使用独立临时浏览器与资料目录。

Moka 还存在只读派生字段：教育选择联动最高学历、工作记录联动最近公司。自动准备器只在没有对应显式基本信息时声明这些已验证依赖；执行器要求来源步骤成功、目标仍为只读且新值与该来源一致，才更新该单一字段的检查基准。未知联动不放行。固定定位日历被页头遮挡时移动其所属触发器，仍须通过实际命中与稳定性检查。
