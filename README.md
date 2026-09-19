# 简历随行 · Resume Companion

让你常用的 AI 读取本地简历资料，并在一个长期保留登录状态的 Chrome 窗口里完成复杂网申。

[![CI](https://github.com/MagicalLiHua/resume-companion/actions/workflows/ci.yml/badge.svg)](https://github.com/MagicalLiHua/resume-companion/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

简历随行由两个本地 MCP 组成：一个保存多版本简历，另一个负责浏览器观察、填写和排错。它不要求招聘网站安装脚本，也不接管你平时使用的 Chrome。最终投递、法律声明、验证码和文件上传仍由你处理。

当前版本是 0.16.1 开发预览版。它已经能完成包含级联选择、日期、弹窗和重复经历的长表单，但遇到含义不清或结果无法确认的控件时会停下来交给用户。

[安装与使用](docs/getting-started.md) · [工具与权限](docs/mcp-tools.md) · [验证范围](docs/validation.md) · [参与开发](CONTRIBUTING.md)

## 复制这段话，让 AI 帮你安装

如果你的 AI Agent 可以运行本地命令并配置 MCP，直接把下面这段话发给它：

~~~text
请帮我安装并验证 Resume Companion：
https://github.com/MagicalLiHua/resume-companion

请先阅读仓库 README 和最新 Release。检查当前系统是否有 Node.js 24 和 Google Chrome；不要覆盖我已有的 MCP 配置、简历资料或 Chrome 数据。

在 Codex 中优先按仓库提供的 marketplace/plugin 方式安装；其他支持 stdio MCP 的客户端按文档配置。优先下载最新 Release，并核对发布页提供的 SHA-256。安装后请完成以下检查：

1. resume_companion 可以启动，并且只提供 resume_status、resume_profile_list、resume_profile_read、resume_profile_save 四个资料工具。
2. resume_browser 可以启动，list_pages 与 form_observe 可用；不要连接默认 Chrome，不要开启远程调试。
3. 用虚构内容创建一份测试资料，验证读取、expected_revision 更新和 revision 冲突；测试完成后删除这份虚构资料。
4. 启动一次专用 Chrome，但不要填写真实网站、保存草稿或提交申请。
5. 如果这是升级安装，运行插件目录里的 scripts/reload-codex-mcp.mjs。有桌面控制端点时热重载；没有时停止旧 Browser Supervisor，并提示我新建一个任务加载新版本。不要重启整个 Codex。

最后告诉我：安装的版本和目录、专用 Chrome Profile 的目录、修改过哪些配置、各项检查是否通过，以及一条可以直接开始使用的指令。
~~~

这段提示词不会授权 Agent 填写或提交真实申请。安装完成后，你可以再单独交给它简历和具体网申任务。

## 它能做什么

| 能力 | 实际行为 |
| --- | --- |
| 多版本简历 | 在本机保存多份资料，按栏目读取，并用 revision 防止旧任务覆盖新内容 |
| 连续填表 | 一次观察当前区域，然后连续填写普通输入框、选项、级联、日期和重复记录 |
| 保留已有内容 | 相同值跳过；网站草稿、用户手填和来源不明的值默认不覆盖 |
| 处理动态页面 | 不长期依赖快照 UID；动作前重新定位，动作后核对当前字段值 |
| 针对性排错 | 卡住时按需查看 Network、Console、局部截图或少量页面属性 |
| 跨任务接管 | 新任务第一次使用浏览器时自动接管；旧任务继续存在，但不能再操作浏览器 |
| 持久登录 | 专用 Chrome Profile 保留 Cookie、历史和网站登录状态 |

登录密码、验证码、附件上传、声明与同意、最终提交、支付和不可逆删除不在自动执行范围内。

## 快速开始

需要 Node.js 24、Google Chrome，以及支持本地 stdio MCP 的 Codex。直接从源码安装：

~~~sh
git clone https://github.com/MagicalLiHua/resume-companion.git
cd resume-companion
npm ci
npm ci --prefix plugins/resume-companion
npm run build
codex plugin marketplace add MagicalLiHua/resume-companion --ref main
codex plugin add resume-companion@resume-companion
~~~

新建一个 Codex 任务，把简历文件或 Markdown 发给它：

> 把这份简历保存为“软件开发版”。只记录明确写出的事实，未知项留空。

打开招聘网站后再发送：

> 用“软件开发版”连续完成当前网申。可以保存普通草稿和进入普通下一步，最终提交交给我。

第一次使用浏览器工具时会出现一个单独的 Chrome 窗口。请在这个窗口登录招聘网站并完成验证码；以后再开任务或重启浏览器都会复用同一份登录数据。无需安装浏览器扩展，也无需开启远程调试。

升级插件后运行插件目录中的 `scripts/reload-codex-mcp.mjs`。当前 Codex 桌面版如果没有开放热重载端点，脚本会关闭旧 Browser Supervisor；新建一个任务即可加载新版，不必重启 Codex。

## 为什么使用专用 Chrome

Chrome 150 之后，默认 Profile 的权限式远程调试与 Agent 沙箱组合并不稳定。简历随行因此使用自己的持久 Profile，不读取默认 Chrome 的 `DevToolsActivePort`，也不依赖 9222 端口、浏览器扩展或 Native Host。

专用 Chrome 由一个本机 Browser Supervisor 管理。所有 Codex 任务共享同一个浏览器、Profile、标签页和页面状态，但同一时间只有一个任务拥有操作租约：

- 新任务第一次调用浏览器工具时，会等上一项原子操作结束，然后自动接管。
- 旧任务仍可查看聊天记录和使用简历资料工具；再次调用浏览器会收到 `browser_lease_revoked`。
- 确实需要回到旧任务时，可以在那里明确调用 `browser_takeover`。
- 关闭专用 Chrome 后，下一次浏览器调用会用原 Profile 重新打开它。

插件升级不会删除 Profile。只加载插件、查看工具列表或整理简历，也不会启动 Chrome 或抢占浏览器租约。

## 浏览器如何填写动态表单

招聘网站常在视觉没有变化时替换 DOM 节点，因此一个刚取得的元素 UID 也可能马上失效。简历随行在一个工具调用内完成语义定位、操作、等待和回读，并只把当前字段、弹层、校验提示和变化摘要返回给 Agent。

普通填写优先使用六个表单工具：

- `form_observe`
- `form_fill_fields`
- `form_select_option`
- `form_select_path`
- `form_set_date`
- `form_activate`

它们支持局部观察、generation 冲突、部分成功和结果不确定等状态。页面仍然难以判断时，Agent 可以按具体问题使用 Network、Console、截图或定点脚本。原始快照和 UID 操作保留作回退手段，不是日常主流程。

## 组成与数据流

~~~text
简历文件 / Markdown / 用户补充
                ↓
       Codex 或其他 AI Agent
          ↙             ↘
资料 MCP                     浏览器 MCP
版本化保存与按需读取          局部观察、填写、验证、诊断
          ↓                 ↓
本地 JSON                   专用 Chrome Profile
                                ↓
                             招聘网站
~~~

`resume_companion` 只提供四个资料工具：`resume_status`、`resume_profile_list`、`resume_profile_read` 和 `resume_profile_save`。`resume_browser` 提供上面的表单工具，并保留固定版本 Chrome DevTools MCP 1.9.0 中适合排错的能力。`upload_file` 与 `lighthouse_audit` 已禁用；导航、脚本执行、请求详情和键盘回退默认需要逐次批准。完整列表见 [工具与权限](docs/mcp-tools.md)。

## 本地保存与隐私

简历资料、修订历史和专用 Chrome Profile 默认保存在本机。插件不会额外保存页面快照、Network 正文、Cookie、请求头或临时表单值。返回给 Agent 的原始快照会遮蔽手机号、证件号、邮箱、银行卡号和出生日期。

“保存在本机”只描述存储位置。Agent 在任务中读取的简历字段、页面内容、截图和诊断结果会进入当前模型上下文；使用云端模型时，这些内容仍会由相应服务处理。

`form_activate` 会阻止明显的最终提交、声明、上传和不可逆操作。网页含义不清、跳转异常或结果无法确认时，Agent 应停止并请用户检查。安全边界见 [SECURITY.md](SECURITY.md)。

## 开发状态

产品源码使用严格 TypeScript。仓库中的 `server.bundle.mjs`、`chrome-launcher.bundle.mjs` 和 `browser-supervisor.bundle.mjs` 是构建产物，并已标记为 GitHub Linguist generated。

本地测试覆盖资料 revision、两个任务争抢浏览器、Supervisor 并发冷启动、动态 DOM 重建、局部观察、隐私遮罩和复杂控件实验页。真实招聘网站仍会出现实验页没有覆盖的行为；发现问题时请附上脱敏后的工具错误、控件类型和复现步骤，不要提交 Cookie、请求头或个人资料。

早期浏览器扩展与 Native Messaging 实现已经从主线删除，需要查阅时可使用 Git 标签 `archive/extension-0.10.0`。项目采用 [MIT License](LICENSE)。
