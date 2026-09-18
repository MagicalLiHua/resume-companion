# 简历随行 · Resume Companion

**让你常用的 AI 使用本地简历资料，在你已登录的 Chrome 中连续完成复杂网申。**

[![CI](https://github.com/MagicalLiHua/resume-companion/actions/workflows/ci.yml/badge.svg)](https://github.com/MagicalLiHua/resume-companion/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

简历随行是一个本地 MCP 插件，附带一个精简的 Chrome 执行器。用户在 Codex、Claude Desktop 或其他支持 stdio MCP 的 AI 客户端中发送简历或补充信息；AI 保存明确事实、理解当前页面，并组合观察、输入、选择、点击、等待与核对等基础动作。

0.10.0 默认使用 **Chrome 扩展 + Native Messaging + 本地 Unix socket / Named Pipe**。它直接复用日常 Chrome Profile 的登录、Cookie 和已打开页面，不需要远程调试开关，也不需要新的 Chrome Profile。固定版本的官方 [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) 仍作为显式备用驱动和 CI 验收环境。

[安装与使用](docs/getting-started.md) · [MCP 工具](docs/mcp-tools.md) · [验证范围](docs/validation.md) · [参与开发](CONTRIBUTING.md)

## 架构

~~~text
简历 / Markdown / 用户补充
            ↓
Codex、Claude Desktop 或其他 MCP 客户端
            ↓ stdio
Resume Companion MCP
  ├─ 本地多版本资料库
  ├─ 安全策略、快照、回读、撤销
  └─ 认证的本地 socket
            ↕ Native Messaging
精简 Chrome 扩展
            ↓ 当前 Chrome Profile
招聘网站
~~~

模型负责理解不同网站的字段含义和规划步骤；MCP 与扩展只提供稳定、有限、可组合的工具。网站改名字段或改变顺序时，AI 可以重新观察和匹配，不需要为每个站点维护整套硬编码流程。

## 能做什么

| 能力 | 当前行为 |
| --- | --- |
| 多份本地资料 | 创建、列出、分栏目读取和更新多版本简历 |
| 复用日常 Chrome | 直接使用当前 Profile 的账号、会话和标签页 |
| 连续填写 | AI 组合观察、输入、选择、等待、保存经历和普通下一步 |
| 复杂控件 | 覆盖搜索下拉、级联、年月日、虚拟列表和重复经历 |
| 可靠停止 | 页面变化、用户手改、旧快照和未知保存结果会阻止盲目重放 |
| 条件撤销 | 只恢复仍等于工具写入值的未保存字段 |
| 本地优先 | 资料、修订历史和桥接描述符保留在用户本机 |

最终申请提交、声明与同意、验证码、密码、附件上传和删除由用户操作。

## 快速开始

需要 Node.js 24、Chrome 116+，以及支持本地 stdio MCP 的 AI 客户端。

~~~sh
git clone https://github.com/MagicalLiHua/resume-companion.git
cd resume-companion
npm ci
npm ci --prefix plugins/resume-companion
npm run build
node native-host/install.bundle.mjs
~~~

然后打开 `chrome://extensions`，开启“开发者模式”，选择“加载已解压的扩展程序”并加载仓库根目录下的 `dist/`。从 Release 压缩包安装时，则加载 `plugins/resume-companion/browser-assets/extension/`。

Codex 插件方式：

~~~sh
codex plugin marketplace add MagicalLiHua/resume-companion --ref main
codex plugin add resume-companion@resume-companion
~~~

也可以把 `plugins/resume-companion/server.mjs` 按客户端的官方方法注册为 stdio MCP。新开一个 AI 任务后，先发送简历：

> 把这份简历保存为“软件开发版”。只记录明确写出的事实，未知项留空。

打开招聘页面后：

> 用“软件开发版”连续完成当前网申。可以保存经历和进入普通下一步，最终提交交给我。

### 复制给 AI 自动配置

下面是一段可选的安装提示词。把它发给具有本地命令执行和 MCP 配置能力的 AI Agent：

~~~text
请帮我安装并配置 Resume Companion：https://github.com/MagicalLiHua/resume-companion

1. 识别当前系统、AI 客户端、Node.js 和 Chrome 版本；要求 Node.js 24 和 Chrome 116+。
2. 优先使用最新 GitHub Release 并校验 SHA-256；安装到稳定的用户目录。
3. 保留现有 MCP 配置。Codex 使用仓库的 plugin/marketplace；其他客户端注册发布包内 plugins/resume-companion/server.mjs 的绝对路径。
4. 运行 browser-assets/native-host/install.bundle.mjs，再将 browser-assets/extension 加载为 Chrome 未打包扩展。如果需要我在 Chrome 中确认安装，在最后一步提示我。
5. 验证 resume_status 可调用、工具数为 10、browser.kind 为 extension、connected 为 true；再用虚构资料测试本地资料的创建和读取。
6. 不开启 Chrome 远程调试，不修改 Chrome App，不使用真实个人信息做测试。
7. 如果客户端需要重启或新建任务才能加载 MCP，先完成其余步骤，最后汇报安装目录、修改的配置、验证结果和下一条可直接使用的指令。
~~~

## 十个 MCP 工具

| 工具 | 用途 |
| --- | --- |
| `resume_status` | 检查资料库、扩展桥接和备用驱动 |
| `resume_profile_list` | 列出本地资料元数据 |
| `resume_profile_read` | 读取目录、栏目、记录或来源 |
| `resume_profile_save` | 创建或按栏目更新资料 |
| `resume_list_tabs` | 列出当前 Chrome Profile 中的普通网页 |
| `resume_activate_tab` | 将目标页面切到前台 |
| `resume_observe` | 获取结构化页面快照、候选、变化和结果 |
| `resume_act` | 执行受限的输入、选择、点击、按键和滚动 |
| `resume_wait` | 等待有界页面条件 |
| `resume_undo_operations` | 条件撤销未保存字段 |

## 本地数据与边界

默认数据目录遵循操作系统用户数据位置，也可以设置 `RESUME_COMPANION_DATA_DIR`。每份资料保存为可读 JSON 并保留历史修订。P0 不提供应用级加密，安全性依赖本机账户和磁盘保护。

本地存储不代表离线推理：当前 AI 客户端会接触任务需要的简历字段和网页片段。扩展不保存简历、Cookie、页面正文或表单值；Native Host 不开放固定 TCP 端口，只连接当前 MCP 创建的私有 socket。完整说明见 [SECURITY.md](SECURITY.md)。

产品代码以严格 TypeScript 编写。仓库中的 `server.bundle.mjs`、Native Host bundle 和扩展 `.js` 是构建产物，已标记为 GitHub Linguist generated。
