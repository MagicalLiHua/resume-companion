# 简历随行 · Resume Companion

**把本地简历资料交给你常用的 AI，由 AI 在一个持久的专用 Chrome 中连续完成复杂网申。**

[![CI](https://github.com/MagicalLiHua/resume-companion/actions/workflows/ci.yml/badge.svg)](https://github.com/MagicalLiHua/resume-companion/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

简历随行 0.16.1 是一个面向个人使用、有人监督的开发预览版。它不为每家招聘网站维护脚本，也不自建模型后端。插件提供两个 MCP 服务：一个管理本地多版本简历，另一个在固定版本的官方 [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) 浏览器底座上提供局部观察、语义重定位和事务式表单动作。Codex 或其他 AI Agent 读取需要的资料，用少量结构化结果连续完成填写、普通草稿保存和普通下一步。最终投递始终交给用户。

[安装与使用](docs/getting-started.md) · [工具与权限](docs/mcp-tools.md) · [验证范围](docs/validation.md) · [参与开发](CONTRIBUTING.md)

## 架构

~~~text
简历 / Markdown / 用户补充
            ↓
Codex 或其他支持 stdio MCP 的 AI Agent
       ↙                         ↘
Resume Companion MCP          Resume Browser MCP
四个本地资料工具               局部观察、事务动作、Network、Console、截图
       ↓                         ↓
本地版本化 JSON               Resume Companion 专用持久 Chrome Profile
                                 ↓
                              招聘网站
~~~

资料服务与浏览器服务彼此独立。只整理简历不会启动 Chrome；浏览器租约转移到其他任务时，本地资料仍可正常读写。

## 为什么使用专用 Chrome

Chrome 150+ 默认 Profile 的权限式远程调试与 Agent 沙箱组合并不稳定。0.16.1 不依赖默认 Profile、9222、`DevToolsActivePort`、浏览器扩展或 Native Host。第一次网页任务会打开一个独立 Chrome 窗口，用户在里面登录招聘网站一次；后续任务复用该 Profile 的 Cookie、历史和站点数据。

真实招聘 SPA 可能持续替换视觉上相同的 DOM 节点。0.16.1 不把快照 UID 当作长期身份：浏览器服务只让文字与控件角色均匹配的候选参与排序，在一个工具调用内完成定位、输入、等待、回读和局部结果返回。对级联和日期控件，中间步骤保留在浏览器进程内；歧义、部分副作用或结果不确定时停止并返回当前弹层状态。它不使用站点选择器，也不按候选顺序猜选。

专用 Chrome 由一个本机 Browser Supervisor 持有，多个 Codex 任务连接到同一个浏览器、Profile、标签页和页面状态。同一时间只有一个任务拥有操作租约：新任务第一次调用浏览器工具时会在上一项原子操作结束后自动接管；旧任务保持打开，但后续浏览器调用会收到 `browser_lease_revoked`。如果确实要回到旧任务，可在那里明确调用 `browser_takeover`。只加载插件、初始化 MCP 或读取工具目录不会争抢租约。

同一任务后续调用会复用已经运行的专用 Chrome，不会重复开窗口。用户退出该 Chrome 后，下一次页面工具调用会用同一个 Profile 重新启动浏览器并保留站点数据。Supervisor 独立于单个任务存活，任务结束不会关闭用户正在看的浏览器。Profile 默认位于系统用户数据目录，不放在版本化插件缓存里，升级插件不会清除登录状态。

## 能做什么

| 能力 | 行为 |
| --- | --- |
| 多版本本地资料 | 保存、列出、分栏目读取和按 revision 更新多份简历 |
| 连续复杂填表 | AI 使用局部/增量观察、逻辑字段引用和事务动作完成多步骤表单 |
| 通用控件执行 | 批量字段、异步选项、级联、树、日期、弹窗、重复记录和 iframe 在浏览器端定位并验证 |
| 保护已有答案 | 相同值跳过；已有草稿、用户手填和来源不明的值默认保留 |
| 局部诊断 | 卡住时按需使用 Network、Console、局部截图或获批的只读脚本 |
| 部分成功恢复 | 批量中途失败后重新观察，只补缺失字段，不整批重放 |
| 持久登录 | 专用 Chrome Profile 跨任务保存网站登录状态 |

登录、密码、验证码、附件上传、声明与同意、最终申请提交、支付和不可逆删除由用户完成。

## 快速开始

需要 Node.js 24、Google Chrome，以及支持本地 stdio MCP 的 Codex。源码安装：

~~~sh
git clone https://github.com/MagicalLiHua/resume-companion.git
cd resume-companion
npm ci
npm ci --prefix plugins/resume-companion
npm run build
codex plugin marketplace add MagicalLiHua/resume-companion --ref main
codex plugin add resume-companion@resume-companion
~~~

新开一个任务后先保存资料：

> 把这份简历保存为“软件开发版”。只记录明确写出的事实，未知项留空。

再打开招聘网站并发送：

> 用“软件开发版”连续完成当前网申。可以保存普通草稿和进入普通下一步，最终提交交给我。

首次调用浏览器工具会打开专用 Chrome。请在那个窗口完成登录，再让 Agent 继续。无需安装浏览器扩展、开启远程调试或授予修改 Chrome 应用程序的权限。

### 复制给 AI 自动配置

下面是一段可复制给具备本地命令执行和 MCP 配置能力的 AI Agent 的安装提示词：

~~~text
请帮我安装并验证 Resume Companion：https://github.com/MagicalLiHua/resume-companion

1. 识别当前系统、AI 客户端、Node.js 和 Chrome；要求 Node.js 24。
2. 优先使用最新 GitHub Release 并校验 SHA-256；保留现有 MCP 配置和本地资料。
3. Codex 优先按仓库的 marketplace/plugin 安装；其他客户端只配置资料 MCP 时，要明确说明浏览器工具审批策略可能需要手动迁移。
4. 验证 resume_companion 只暴露四个资料工具；验证 resume_browser 包含 form_observe、五个事务式表单工具和固定的 chrome-devtools-mcp 1.9.0 诊断工具，upload_file 和 lighthouse_audit 已禁用。
5. 用虚构资料测试创建、目录读取、携带 expected_revision 的章节读取和 revision 冲突。
6. 启动一次专用 Chrome 测试 list_pages 和 form_observe；不要接管默认 Chrome，不开启远程调试，不填写真实信息，不执行保存或最终提交。
7. 在 Codex 中升级后运行包内 `scripts/reload-codex-mcp.mjs`：有 App Server 控制端点时热重载 MCP；桌面版未开放控制端点时停止旧 Browser Supervisor，并让用户新建任务加载新版本。两种情况都不要求重启整个 Codex。最后报告安装目录、Profile 目录、修改的配置、验证结果和下一条可直接使用的指令。
~~~

## 两组工具

Resume Companion 自身只有四个工具：

| 工具 | 用途 |
| --- | --- |
| `resume_status` | 检查本地资料服务和数据目录 |
| `resume_profile_list` | 列出资料元数据和 revision |
| `resume_profile_read` | 按目录、栏目、记录或来源读取；支持 `expected_revision` |
| `resume_profile_save` | 创建或按 revision 更新资料 |

日常浏览器能力使用 `form_observe`、`form_fill_fields`、`form_select_option`、`form_select_path`、`form_set_date` 和 `form_activate`。每个可能写入页面的事务都会返回下一代 generation；原始快照也会在返回 Agent 前遮蔽手机号、证件号、邮箱、银行卡号和出生日期。官方工具名继续用于页面列表以及 Network、Console、截图和定点脚本诊断；原始快照和 UID 输入保留为显式回退。导航、按键、请求详情和脚本执行默认逐次提示；`upload_file` 与 `lighthouse_audit` 被禁用。详见 [工具与权限](docs/mcp-tools.md)。

## 本地数据、模型和边界

简历资料、修订历史和专用 Chrome Profile 默认保存在本机。简历 JSON 权限设为仅当前用户可读写；专用 Chrome 自己保存 Cookie、历史和缓存。插件不会额外持久化页面快照、Network 正文、Cookie、请求头或临时表单值。

本地保存不等于本地推理。Agent 为完成任务而读取的简历字段、页面快照、截图和诊断结果会进入当前模型上下文；使用云端模型时，这些信息由对应服务处理。

0.16.1 的 `form_activate` 会阻止明显的最终提交、声明、上传和不可逆边界；skill、客户端审批和人工监督仍然共同参与判断。遇到结果不明、页面跳转异常或按钮含义不清时，Agent 应停止并交给用户检查。完整说明见 [SECURITY.md](SECURITY.md)。

## 开发与旧路线

新增产品代码使用严格 TypeScript。发布中的 `server.bundle.mjs`、`chrome-launcher.bundle.mjs` 与 `browser-supervisor.bundle.mjs` 是由源码生成的产物，并标记为 GitHub Linguist generated。旧版扩展与 Native Messaging 实现已从主线删除，可从 Git 标签 `archive/extension-0.10.0` 恢复。
