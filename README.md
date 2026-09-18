# 简历随行 · Resume Companion

**让你常用的 AI 使用本地简历资料，连续完成复杂网申表单。**

[![CI](https://github.com/MagicalLiHua/resume-companion/actions/workflows/ci.yml/badge.svg)](https://github.com/MagicalLiHua/resume-companion/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

简历随行是一个本地 MCP 插件。用户在 Codex、Claude Desktop 或其他 MCP 客户端中发送简历或补充信息，AI 把明确事实保存到本地资料库；填写时，AI 读取所选资料、观察 Chrome 的无障碍树，并组合输入、选择、点击、等待和核对等基础动作。

0.8.0 默认通过官方 [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) 连接当前已经登录的 Chrome，所以日常使用不需要安装浏览器扩展，也不需要为招聘网站重新登录。原扩展保留为兼容回退。最终申请提交、声明、验证码、密码、附件上传和删除始终由用户操作。

[安装与使用](docs/getting-started.md) · [MCP 工具](docs/mcp-tools.md) · [验证范围](docs/validation.md) · [参与开发](CONTRIBUTING.md)

## 架构

~~~text
简历 / Markdown / 用户补充
            ↓
Codex、Claude Desktop 或其他 MCP 客户端
            ↓
Resume Companion MCP
  ├─ 本地多版本资料库
  ├─ 安全策略、快照、回读、撤销
  └─ Chrome DevTools 驱动
            ↓
当前已登录的 Chrome → 招聘网站

可选回退：Resume Companion MCP → Chrome 扩展执行桥
~~~

模型负责理解不同网站的字段含义和规划步骤，MCP 只提供稳定、有限、可组合的工具。网站改字段名称时无需发布整套站点脚本；AI 可以根据当前页面重新匹配。

## 能做什么

| 能力 | 当前行为 |
| --- | --- |
| 多份本地资料 | 创建、列出、分栏目读取和更新多版本简历资料 |
| 并发保护 | 更新必须携带最近修订号，拒绝静默覆盖 |
| 当前 Chrome | 首次网页调用连接现有 Chrome；保留登录态与 Cookie |
| 连续填写 | AI 组合观察、输入、选择、等待、保存经历和普通下一步 |
| 复杂控件 | 使用真实浏览器输入事件和无障碍树处理动态控件；遇到新结构可重新观察 |
| 可靠停止 | 页面变化、用户手改、旧快照和未知保存结果会阻止盲目继续 |
| 条件撤销 | 只恢复仍等于工具写入值的未保存字段 |
| 本地优先 | 资料文件、修订历史和操作日志留在用户本机 |

## 快速开始

需要 Node.js 24、Chrome 144+，以及支持本地 stdio MCP 的 AI 客户端。

~~~sh
git clone https://github.com/MagicalLiHua/resume-companion.git
cd resume-companion
npm ci --prefix plugins/resume-companion
npm run build --prefix plugins/resume-companion
~~~

Codex 插件方式：

~~~sh
codex plugin marketplace add MagicalLiHua/resume-companion --ref main
codex plugin add resume-companion@resume-companion
~~~

也可以直接把 `plugins/resume-companion/server.mjs` 注册为 stdio MCP。新开一个 AI 任务后，先发送简历：

> 把这份简历保存为“测试开发版”。只记录明确写出的事实，未知项留空。

打开招聘页面后：

> 用“测试开发版”连续完成当前网申。可以保存经历和进入普通下一步，最终提交交给我。

第一次使用网页工具时，Chrome 会询问是否允许调试当前浏览器。点击 **Allow** 后即可沿用现有登录状态。简历随行不会修改 Chrome 应用文件，不需要授予 ChatGPT“修改当前 Mac 上的 App”权限。

## 十个 MCP 工具

| 工具 | 用途 |
| --- | --- |
| resume_status | 检查资料库、浏览器驱动和权限状态 |
| resume_profile_list | 列出本地资料元数据 |
| resume_profile_read | 读取目录、栏目、记录或来源 |
| resume_profile_save | 创建或按栏目更新资料 |
| resume_list_tabs | 按需连接 Chrome 并列出网页 |
| resume_activate_tab | 将目标页面切到前台 |
| resume_observe | 获取结构化页面快照、候选、变化和结果 |
| resume_act | 执行受限的输入、选择、点击、按键和滚动 |
| resume_wait | 等待有界页面条件 |
| resume_undo_operations | 条件撤销未保存字段 |

## 本地数据与边界

默认数据目录遵循操作系统用户数据位置，也可以设置 `RESUME_COMPANION_DATA_DIR`。每份资料保存为可读 JSON，并保留历史修订。P0 不提供应用级加密，安全性依赖本机账户和磁盘保护。

本地存储不代表离线推理：当前 AI 客户端会接触任务需要的简历字段和网页片段。浏览器驱动只开放项目内部允许的少量 DevTools 工具，不开放任意脚本执行、网络抓包或文件上传。完整说明见 [SECURITY.md](SECURITY.md)。

0.8.0 已通过 TypeScript 检查、单元测试、扩展回退回归，以及不加载扩展的真实 MCP → Chrome DevTools 集成测试。真实招聘网站仍需逐站试用；详见 [验证范围](docs/validation.md)。
