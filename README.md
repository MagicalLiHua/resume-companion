# 简历随行 · Resume Companion

**让你常用的 AI 管理本地简历，并连续完成复杂网申表单。**

[![CI](https://github.com/MagicalLiHua/resume-companion/actions/workflows/ci.yml/badge.svg)](https://github.com/MagicalLiHua/resume-companion/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

简历随行由一个本地 MCP 服务和一个精简的 Chrome 扩展组成。用户在 Codex、Claude Desktop 或其他支持 MCP 的 AI 客户端中发送简历或补充信息；AI 提取明确事实并调用 MCP 保存。填写时，AI 读取所选资料、观察网页并组合基础动作。Chrome 扩展只执行网页操作，不保存简历，也不内置模型 API。

当前 0.7.1 是开发预览版，重点是 MCP 与 Codex 使用体验。最终申请提交、声明、验证码、密码和附件上传始终交给用户。

[安装与使用](docs/getting-started.md) · [MCP 工具](docs/mcp-tools.md) · [验证范围](docs/validation.md) · [参与开发](CONTRIBUTING.md)

## 架构

~~~text
简历 / Markdown / 用户补充
            ↓
Codex、Claude Desktop 或其他 MCP 客户端
            ↓
Resume Companion MCP 本地资料库
            ↓ 解析资料引用
Chrome 扩展执行桥
            ↓
招聘网站表单
~~~

资料工具不依赖 Chrome。更换 AI 客户端后，只要连接同一 MCP 数据目录，就能继续使用相同资料。

## 能做什么

| 能力 | 当前行为 |
| --- | --- |
| 多份本地资料 | 在 MCP 数据目录中创建、列出、分栏目读取和更新 |
| 并发保护 | 更新必须携带最近读取到的修订号，拒绝静默覆盖 |
| 可读存储 | 每份资料为 JSON，保留历史修订；可选择保存原始 Markdown |
| 连续填写 | AI 组合观察、输入、选择、等待、保存经历与普通下一步 |
| 复杂控件 | 覆盖已验证的搜索下拉、级联、年月弹层、虚拟列表和 React 受控输入 |
| 可靠停止 | 页面变化、用户手改、旧快照和未知保存结果会阻止盲目继续 |
| 条件撤销 | 只恢复仍等于工具写入值的未保存字段 |
| 浏览器隔离 | 扩展存储只保留桥接开关，不写入简历正文或模型密钥 |

## 快速开始

需要 Chrome 116+、Node.js 24，以及支持本地 MCP 的 AI 客户端。

从源码构建：

~~~sh
git clone https://github.com/MagicalLiHua/resume-companion.git
cd resume-companion
npm ci
npm ci --prefix plugins/resume-companion
npm run build
npm run build --prefix plugins/resume-companion
~~~

在 chrome://extensions 开启开发者模式，加载生成的 dist 目录。打开扩展设置并开启“本地桥接”。

Codex 插件方式：

~~~sh
codex plugin marketplace add MagicalLiHua/resume-companion --ref main
codex plugin add resume-companion@resume-companion
~~~

也可以直接注册 plugins/resume-companion/server.bundle.mjs。详细配置和通用 MCP 示例见 [安装与使用](docs/getting-started.md)。

在 AI 客户端中发送简历后，可以说：

> 把这份简历保存为“测试开发版”。只记录明确写出的事实，未知项留空。

打开招聘页面后：

> 用“测试开发版”连续完成当前网申。保存经历和普通下一步，最终提交交给我。

## 十个 MCP 工具

| 工具 | 用途 |
| --- | --- |
| resume_status | 检查资料库和浏览器桥接 |
| resume_profile_list | 列出本地资料元数据 |
| resume_profile_read | 读取目录、栏目、记录或来源 |
| resume_profile_save | 创建或按栏目更新资料 |
| resume_list_tabs | 列出可处理标签页 |
| resume_activate_tab | 激活目标页面并检查可见状态 |
| resume_observe | 观察页面、候选、变化和操作结果 |
| resume_act | 执行有限网页动作 |
| resume_wait | 等待有界页面条件 |
| resume_undo_operations | 条件撤销未保存字段 |

## 本地数据

默认数据目录遵循操作系统用户数据位置。可以在 MCP 配置中设置 RESUME_COMPANION_DATA_DIR。MCP 使用原子写入、历史修订和仅当前用户可读写的文件权限；P0 不提供应用级加密，安全性依赖本机账户与磁盘保护。

启用桥接后，AI 客户端会接触任务所需的简历字段和网页片段。本地存储不等于离线推理。完整说明见 [SECURITY.md](SECURITY.md)。

## 验证与限制

0.7.1 本地通过 19 项单元测试、21 项浏览器回归、MCP 契约测试和真实 MCP→隔离 Chrome 集成测试。虚构银行多步骤流程会保存多段经历并断言最终提交次数为 0。

目前仅支持主文档；iframe、Shadow DOM 和要求可信用户事件的控件可能需要人工处理。真实网站仍需逐站试用。详见 [验证范围](docs/validation.md)。
