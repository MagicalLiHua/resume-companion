# Agent 客户端接入

ApplyMCP 只维护一份资料服务、一份浏览器服务和一份 `resume-autofill` Skill。客户端适配层只负责注册两个本地 stdio MCP、加载同一份 Skill，并给出该客户端能够表达的权限设置。

## 支持矩阵

| 客户端 | 接入方式 | 仓库中的入口 | 当前验证 |
| --- | --- | --- | --- |
| Codex / ChatGPT Work | Codex plugin marketplace | `.agents/plugins/marketplace.json`、`.codex-plugin/plugin.json` | 清单、双 MCP、包内启动 |
| Claude Code | Claude Code plugin marketplace | `.claude-plugin/marketplace.json`、插件内 `.claude-plugin/plugin.json` | 清单、路径变量、双 MCP |
| Cursor | Cursor Plugin | `.cursor-plugin/marketplace.json`、插件内 `.cursor-plugin/plugin.json` | 清单、路径变量、双 MCP；公开市场待审核 |
| Kimi Code CLI | Kimi plugin | `kimi.plugin.json` | 清单、Skill、双 MCP |
| Hermes Agent | Agent Plugins v1；旧版配置回退 | 插件内 `plugin.json`、`mcp.json`、配置生成器 | schema、Skill、双 MCP；本机 0.19.0 不含新适配器 |
| WorkBuddy | 两个本地 connector | `clients/workbuddy/` | 连接器结构、单服务限制、发布包内容 |
| Trae IDE / CLI | 原生 MCP 配置 | 配置生成器 | JSON / TOML 结构与绝对入口 |
| OpenCode | `opencode.json` 的 `mcp` | 配置生成器 | OpenCode 本地 MCP 结构与绝对入口 |
| Gemini CLI | `settings.json` 的 `mcpServers` | 配置生成器 | 标准双 MCP 结构与绝对入口 |
| 其他 stdio MCP Agent | 标准 `mcpServers` | 配置生成器 | 通用 JSON 与双 MCP 启动入口 |

“当前验证”是仓库和发布包的静态兼容测试及 MCP 冒烟，不表示每个第三方客户端版本都完成了人工界面验收。客户端升级后，先运行 `npm run test:clients` 检查清单，再做该客户端的工具发现测试。

## 原生插件安装

### Codex

~~~sh
codex plugin marketplace add MagicalLiHua/resume-companion --ref main
codex plugin add applymcp@applymcp
~~~

Codex 的 marketplace 与插件 ID 都是 `applymcp`，并读取带逐工具审批策略的 `.mcp.json`。仓库路径和两个 MCP 服务名继续使用兼容标识。

### Claude Code

在 Claude Code 中运行：

~~~text
/plugin marketplace add MagicalLiHua/resume-companion
/plugin install applymcp@applymcp
~~~

插件通过 `${CLAUDE_PLUGIN_ROOT}` 定位发布包内的两个服务；安装后运行 `/mcp`，确认两个服务已连接，再新建会话或运行 `/reload-plugins`。

### Cursor

仓库已经包含 Cursor Plugin 和多插件仓库清单。公开市场上架前，可以将发布包中的 `plugins/resume-companion` 目录复制到 `~/.cursor/plugins/local/applymcp`，重载 Cursor 窗口，然后在 Customize 中确认 Skill 与两个 MCP。团队版也可以从仓库导入 `.cursor-plugin/marketplace.json`。

### Kimi Code CLI

在 Kimi Code 中运行：

~~~text
/plugins install https://github.com/MagicalLiHua/resume-companion
/reload
~~~

根目录 `kimi.plugin.json` 注册同一份 Skill 和两个 MCP。用 `/plugins info applymcp` 与 `/mcp` 检查状态。

### Hermes Agent

支持 Agent Plugins v1 的新版 Hermes 可以把发布包中的 `plugins/resume-companion` 作为可移植插件目录加载；该目录包含规范要求的根级 `plugin.json`、`mcp.json` 和 `skills/`。

旧版 Hermes 使用配置回退：

~~~sh
npm run config:agent -- hermes-agent
cp -R plugins/resume-companion/skills/resume-autofill ~/.hermes/skills/
~~~

将第一条命令输出的 `mcp_servers` 合并到 `~/.hermes/config.yaml` 后重启 Hermes。安装 Agent 必须保留已有 YAML 节点；不要整文件覆盖。本机可用的 Hermes 0.19.0 尚无当前文档中的 Agent Plugins v1 适配器，因此这里只完成旧版配置验证和新版 schema 检查，待升级客户端后补原生插件运行验收。

## WorkBuddy

WorkBuddy 的 connector 规范要求一个连接器只能配置一个 MCP Server，因此发布包生成两个可安装目录：

- `clients/workbuddy/applymcp-profile`
- `clients/workbuddy/applymcp-browser`

两者必须一起安装。Profile 连接器携带共享 Skill；Browser 连接器携带专用 Chrome 启动器、Supervisor 和固定浏览器运行时。它们仍使用同一数据目录和同一专用 Chrome，不会产生两套简历资料或浏览器 Profile。

## 配置生成器

Trae、OpenCode、Gemini CLI 或只有 MCP 设置页的客户端，可以让安装 Agent 运行：

~~~sh
npm run config:agent -- trae
npm run config:agent -- trae-cli
npm run config:agent -- opencode
npm run config:agent -- gemini-cli
npm run config:agent -- generic
~~~

也支持 `claude-code`、`cursor`、`kimi-code`、`hermes-agent` 和 `workbuddy`，用于原生插件不可用时排查。生成器只向 stdout 输出当前安装目录对应的配置，不修改用户配置文件。安装 Agent 应使用结构化解析合并相应节点，保留用户已有 MCP、权限和环境变量。

Trae IDE 使用 `trae` 的标准 JSON；Trae CLI 使用 `trae-cli` 输出的 TOML。OpenCode 输出 `mcp` 下的 `type: "local"` 与 argv 数组，不应直接套用其他客户端的 `mcpServers` 格式。

## 统一验收

每个客户端安装后都执行同一组检查：

1. 能发现 `resume_companion` 与 `resume_browser`，且启动路径指向同一个 ApplyMCP 安装版本。
2. `resume_status` 返回版本，使用虚构资料完成新建、读取、revision 冲突检查和删除。
3. `list_pages` 打开或复用 ApplyMCP 专用 Chrome，`form_support` 和 `form_observe` 可调用。
4. Skill 能被发现，并保留附件、声明、亲属任职和最终提交的人工边界。
5. 未读取或覆盖该客户端已有的其他 MCP 配置；运行日志中没有用户资料、Cookie、请求头或密钥。

配置格式依据各产品的官方文档：[Claude Code plugins](https://code.claude.com/docs/en/plugins)、[Cursor plugins](https://cursor.com/docs/plugins)、[Kimi Code plugins](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/plugins)、[Hermes portable plugins](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/plugins/index.md)、[WorkBuddy connectors](https://open.workbuddy.cn/docs/connector)、[OpenCode MCP](https://opencode.ai/docs/mcp-servers/) 和 [Gemini CLI MCP](https://geminicli.com/docs/tools/mcp-server/)。
