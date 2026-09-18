# 安装与使用

本版由 Chrome 扩展 0.6.0 和 Codex MCP 插件 0.3.0 组成。优先使用 Codex 连续填写；不需要部署业务后端。

## 环境与安装

需要 Chrome 116+、Node.js 24，以及能运行本地 MCP 的 Codex。先运行 `node --version`，确认桌面应用也能找到 Node。

1. 从 [v0.6.0 Release](https://github.com/MagicalLiHua/resume-companion/releases/tag/v0.6.0) 下载 `resume-companion-0.6.0.zip`，解压到不会随意移动的目录。
2. 打开 `chrome://extensions`，开启开发者模式，加载包里的 `extension` 目录。不要选择 ZIP 或它的上一级目录。
3. 打开“我的简历”，维护一份正式简历。可以新建、复制、重命名版本，补充简历原文没有的字段。保存后才能被 MCP 作为正式资料读取。
4. 在“备份与恢复”中开启“Codex 本地桥接”。
5. 使用仓库插件安装命令：

```sh
codex plugin marketplace add MagicalLiHua/resume-companion --ref v0.6.0
codex plugin add resume-companion@resume-companion
```

安装后新开 Codex 任务。插件带有 MCP 服务和 `resume-autofill` skill；Node 24 必须可从运行 Codex 的环境中找到。[官方插件说明](https://developers.openai.com/zh-Hans/plugins/build/plugins)介绍了仓库市场机制；这里使用自定义市场，不是官方目录上架。

## 直接注册 MCP

如果 Codex 不支持 `plugin` 命令，在已解压的发布目录中打开终端。以下为 macOS / Linux / Git Bash 命令：

```sh
codex mcp add resume_companion --env RESUME_COMPANION_TOOLSET=core -- node "$PWD/plugins/resume-companion/server.bundle.mjs"
```

Windows PowerShell：

```powershell
codex mcp add resume_companion --env RESUME_COMPANION_TOOLSET=core -- node "$((Get-Location).Path)/plugins/resume-companion/server.bundle.mjs"
```

这种方式只注册 MCP，不自动安装 skill。首次任务让 Codex 读取包内的 `plugins/resume-companion/skills/resume-autofill/SKILL.md`，或按你的 Codex skill 管理方式安装该目录。使用绝对路径注册后不要移动目录。与仓库插件方式二选一，避免重复启动服务。

## 准备资料

- 多份简历可以分别维护，各自保存补充字段和固定回答。指定本次填写的版本名称，避免混用。
- 使用“从 AI 导入”中的模板和提示词，将简历整理为 Markdown，再解析、核对差异并保存。扩展不会自行把 PDF 发送给模型。
- 未提供的信息保持未知；只有年月的时间不会自动补成某一天。正式填写前补齐你希望提供的事实。
- JSON 是完整备份；Markdown 适合阅读和编辑，不包含所有版本、投递记录及补充数据。

## 交给 Codex 的任务

在 Chrome 中保留目标网申页面，告诉 Codex：

> 用“软件开发版”简历填写当前页面。可以保存单条经历、保存草稿并进入普通下一步；缺少事实时先问我。完成后汇总未填项，停在最终提交前。

Codex 应先检查连接、目标标签页和正式版本，再按观察组合工具。有多个候选页面时需要明确目标。不要将虚构资料保存到真实招聘账户；本地实验页适合第一次体验。

填写后核对页面数据、学校完整路径、日期、每段经历归属和未完成项。最终提交、附件上传、验证码及声明由你操作。

## 常见问题

| 现象 | 检查方式 |
| --- | --- |
| “未能加载扩展程序 / 无法加载清单” | 选择含有 `manifest.json` 的 `extension` 或源码构建后的 `dist` 目录 |
| Codex 找不到工具 | 安装后新开任务；检查插件是否启用，以及 Node 24 能否启动 |
| 桥接未连接 | 确认扩展已启用、“Codex 本地桥接”已打开，MCP 服务已启动 |
| 端口占用 / 连到另一浏览器 | 同一时间只保留一套 MCP 桥接实例；关闭旧的任务或停用重复安装，重新连接 |
| 协议版本不一致 | 使用配套扩展和 MCP，重载扩展并新开任务 |
| 页面旧引用失效 | 重新观察当前页面，不重放旧的写入请求 |
| 保存超时或结果未知 | 先检查已保存卡片、页面步骤和错误提示，不重复点击保存 |
| 无悬浮球 | 检查网站访问权限、页面识别情况及悬浮入口开关；也可用工具栏侧边栏 |
| 浏览器后台仍是旧版 | 点击扩展卡片开关旁的圆形“重新加载”，重新打开扩展设置页 |

## 更新与卸载

更新前导出完整备份。保留 Chrome 原加载目录，在该目录替换发布文件，再重载扩展，避免卸载造成资料丢失。MCP 和 Chrome 扩展应成套更新，更新后重新观察页面。

仓库安装命令固定在 `v0.6.0`，不会自动切到未来版本。需要更新时按对应 Release 说明修改市场引用并重新安装插件，新开任务。不要同时保留个人开发版和仓库版运行。

卸载会删除该扩展的本地存储；先备份。发布包不包含你的简历、模型 Key 或网页会话。
