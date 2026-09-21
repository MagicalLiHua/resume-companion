# 安装与使用

ApplyMCP 0.24.0 是开发预览版，由本地资料 MCP、TypeScript ApplyMCP Browser、Browser Supervisor、固定的 Chrome DevTools MCP 1.9.0 浏览器底座和 `resume-autofill` skill 组成。它不需要浏览器扩展、Native Host 或远程调试开关。2026-09-21 收敛更新包含模板支持检查、统一人工接管和精简执行报告；较早的 0.24 安装包没有这些接口，需核对完整构建版本。

## 环境

- Node.js 24
- Google Chrome stable
- 支持本地 stdio MCP 的 Agent 客户端；细粒度工具审批能力因客户端而异

资料和浏览器 Profile 使用操作系统用户数据目录。为了兼容原 Resume Companion 安装，默认路径名称保持不变：

| 系统 | 简历资料 | 专用 Chrome Profile |
| --- | --- | --- |
| macOS | `~/Library/Application Support/Resume Companion` | `~/Library/Application Support/Resume Companion/chrome-profile` |
| Windows | `%APPDATA%\Resume Companion` | `%LOCALAPPDATA%\Resume Companion\chrome-profile` |
| Linux | `${XDG_DATA_HOME:-~/.local/share}/resume-companion` | `${XDG_STATE_HOME:-~/.local/state}/resume-companion/chrome-profile` |

可以用 `RESUME_COMPANION_DATA_DIR` 修改资料目录，用 `RESUME_COMPANION_CHROME_DATA_DIR` 修改 Chrome Profile 目录。

## 从源码安装

### Codex

~~~sh
git clone https://github.com/MagicalLiHua/resume-companion.git
cd resume-companion
npm ci
npm ci --prefix plugins/resume-companion
npm run build
codex plugin marketplace add MagicalLiHua/resume-companion --ref main
codex plugin add applymcp@applymcp
~~~

发布包已包含构建产物与固定的 Chrome DevTools MCP 运行时，无需执行 `npm ci` 或重新构建。按包内 README 将插件目录加入 Codex 即可。

### 其他 Agent

Claude Code、Cursor、Kimi Code CLI、Hermes Agent 和 WorkBuddy 使用仓库中的原生清单或连接器。Trae、OpenCode、Gemini CLI 及通用 stdio MCP 客户端使用配置生成器。不要手写相对路径或覆盖客户端已有配置；完整命令、文件位置与验收步骤见 [Agent 客户端接入](agent-clients.md)。

~~~sh
npm run test:clients
npm run config:agent -- opencode
~~~

所有客户端一次接入两个 MCP：

- `resume_companion` 是必需服务，启动失败会影响资料管理。
- `resume_browser` 是可选服务；所有任务通过 Browser Supervisor 复用同一个专用 Chrome。

新安装或升级插件后，运行插件包内的 `scripts/reload-codex-mcp.mjs`。如果当前 App Server 开放控制端点，它会刷新已加载任务的 MCP；Codex 桌面版未开放该端点时，提示新建任务加载新版本。脚本默认保留旧 Browser Supervisor；新客户端遇到旧版本返回 `browser_upgrade_pending`。确认未保存页面可以关闭后，使用 `node scripts/reload-codex-mcp.mjs --restart-browser` 显式重启专用服务。无需重启 Codex。

## 第一次使用

先发送简历或 Markdown：

> 把这些信息保存为“校招版”。只保存明确事实，未知项保持空白。

确认 `resume_status` 和 `resume_profile_list` 可用。打开招聘网站后发送：

> 用“校招版”完成当前网申，可以保存普通草稿和进入普通下一步，最终提交交给我。

第一次调用 `list_pages` 时，ApplyMCP Browser 会打开 ApplyMCP 专用 Chrome。请在这个窗口登录招聘网站、完成验证码或设备验证，然后回到 Agent 继续。此后登录状态会随 Profile 保存。

支持检查新流程中，Agent 先用 `form_support` 检查已打开的简历页，只填写通过可信来源和结构检查的页面。结果会区分有直接证据的 `verified_template` 与复用平台规则的 `compatible_platform`，并列出页面实际模块、可填写/跳过模块、阻断/提示差异、人工处理和保存证据。结构相似但来源未登记的 `platform_candidate` 只报告，不逐字段试填。单页亲属问题留到其他普通内容填完后统一提醒。

## 工具审批

浏览器服务默认 `prompt`。插件为页面列表和选择、六个表单工具、快照、文本等待、请求列表、Console 列表和详情、截图及原始常规输入设置自动批准。

请求详情、导航、新建/关闭页面、按键、键盘输入和对话框处理保持逐次提示。正常模式在代码层禁用任意脚本、自动上传和拖拽；Lighthouse 不注册。客户端若不支持 `.mcp.json` 的审批字段，需要手动复制 [工具与权限](mcp-tools.md) 中的策略；在完成前不要把浏览器服务设置成全局无条件自动批准。

## 常见问题

| 现象 | 处理 |
| --- | --- |
| `resume_status` 不存在 | 检查插件是否安装并启用；运行 `scripts/reload-codex-mcp.mjs`，然后按输出热重载或新建任务 |
| `browser_lease_revoked` | 更新的任务已经接管浏览器；继续使用新任务，或在旧任务明确调用 `browser_takeover` |
| 首次从 0.15.x 升级出现 `profile_in_use` | 运行更新脚本以退出旧版浏览器进程，再在新任务重试；这是迁移到 Supervisor 的一次性情况 |
| Chrome 打开但网站未登录 | 在专用 Chrome 中手工登录一次；不要切换到默认 Chrome |
| Chrome 被用户关闭 | 再调用一个页面工具，MCP 会重新启动并复用同一 Profile |
| 资料读取返回 `profile_changed` | 重新读取资料目录，固定新的 revision，再规划剩余字段 |
| 页面填写中途失败 | 根据事务结果核对成功字段；用 `focus` 或 `delta` 观察，只补缺失项 |
| 网页显示结果不明 | 不重放保存或下一步；由 Agent 按证据诊断，仍不明确时交给用户 |

## 数据备份与清理

备份简历资料时复制资料目录中的 `profiles`、`history`、`backups` 和 `index.json`。专用 Chrome Profile 含网站登录数据，是否备份由用户自行决定，分享前应按浏览器敏感数据处理。

卸载插件不会自动删除这两个目录。需要清理时先关闭所有占用 ApplyMCP Chrome 的任务，再手工删除对应目录。

## 整页自动准备（0.24）

首次使用先把明确的简历事实保存到资料库；以后选择同一资料 ID 和 revision 即可复用。让 Agent 调用 `form_prepare`，服务在本地读取当前公司实际开放的栏目并与资料求交集；`module_selection` 会说明每个页面模块读取哪些资料、资料是已有/明确没有/未知、是否进入计划及步骤数。再用 `form_run` 连续执行。可选栏目缺资料会保留页面现状，只有明确“没有”才处理否定开关。同一招聘系统的不同公司可以有不同模块，未开放的资料会列在 `profile_only_sections`，不会生成浏览器操作。

自定义问题、词库无等价候选和未知控件仍可能需要处理。新版本不承诺保存或最终投递；准备后的 UI 填写与首次资料整理应分别计时。

## 一次性资料补充表

让当前 Agent 解析用户提供的 PDF/Word，按技能中的“解析结果入库”规则保存明确事实后，使用 resume_prepare 生成面向已验证模板的缺项清单，再用 resume_prepare_apply 合并用户明确提供的答案。已有手机号和邮箱不再问；身份证号等证件号码留待本地私密入口。PDF/Word 的解析由当前 Agent 提供；插件指导它把明确事实存入资料库，不提供文件解析器。完整私密录入能力尚未实现。按实际安装工具列表确认这两个新工具，较早的 0.24 构建仅有四个资料工具。
