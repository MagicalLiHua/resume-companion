# 简历随行 · Resume Companion

**把本地简历资料交给你常用的 AI，由 AI 在一个持久的专用 Chrome 中连续完成复杂网申。**

[![CI](https://github.com/MagicalLiHua/resume-companion/actions/workflows/ci.yml/badge.svg)](https://github.com/MagicalLiHua/resume-companion/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

简历随行 0.14.0 是一个面向个人使用、有人监督的开发预览版。它不为每家招聘网站维护脚本，也不自建模型后端。插件提供两个 MCP 服务：一个管理本地多版本简历，另一个运行固定版本的官方 [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp)，并为真实 SPA 的短命 DOM 节点增加窄范围语义恢复。Codex 或其他 AI Agent 读取需要的资料、理解当前页面，并按通用控件配方组合官方浏览器工具完成填写、普通草稿保存和普通下一步。最终投递始终交给用户。

[安装与使用](docs/getting-started.md) · [工具与权限](docs/mcp-tools.md) · [下一阶段计划](docs/resume-browser-mcp-plan.md) · [验证范围](docs/validation.md) · [参与开发](CONTRIBUTING.md)

## 架构

~~~text
简历 / Markdown / 用户补充
            ↓
Codex 或其他支持 stdio MCP 的 AI Agent
       ↙                         ↘
Resume Companion MCP          官方 Chrome DevTools MCP 1.9.0
四个本地资料工具               页面快照、批量填写、Network、Console、截图
       ↓                         ↓
本地版本化 JSON               Resume Companion 专用持久 Chrome Profile
                                 ↓
                              招聘网站
~~~

资料服务与浏览器服务彼此独立。只整理简历不会启动 Chrome；浏览器被其他任务占用时，本地资料仍可正常读写。

## 为什么使用专用 Chrome

Chrome 150+ 默认 Profile 的权限式远程调试与 Agent 沙箱组合并不稳定。0.14.0 不依赖默认 Profile、9222、`DevToolsActivePort`、浏览器扩展或 Native Host。第一次网页任务会打开一个独立 Chrome 窗口，用户在里面登录招聘网站一次；后续任务复用该 Profile 的 Cookie、历史和站点数据。

真实招聘 SPA 可能在快照后乃至动作执行期间替换视觉上相同的 DOM 节点。0.14.0 用控件的角色、可访问名称和所在分组即时重定位，并对绝对赋值核对结果后最多重试一次。点击只有在确认尚未进入真实派发时才自动恢复；派发已经开始则停止并要求重新观察，避免重复添加记录、保存或跳转。候选无法唯一确认时同样停止。它不使用站点选择器，也不按候选顺序猜选。

同一时间只允许一个任务实际操作这个专用 Profile，但仅加载插件、初始化 MCP 或读取工具目录不会占用它。实例锁在第一次浏览器工具调用时取得；另一个任务会收到可重试的 `profile_in_use`，占用者退出后可在原任务直接重试。Profile 默认位于系统用户数据目录，不放在版本化插件缓存里，升级插件不会清除登录状态。

同一任务后续调用会复用已经运行的专用 Chrome，不会重复开窗口。用户退出该 Chrome 后，下一次页面工具调用会用同一个 Profile 重新启动浏览器并保留站点数据。锁保护的是当前控制任务，不是某个已经退出的 Chrome 进程；控制任务结束会释放锁，异常遗留的锁会根据进程状态和 Chrome 的 Profile 占用标记恢复，避免永久占用。

## 能做什么

| 能力 | 行为 |
| --- | --- |
| 多版本本地资料 | 保存、列出、分栏目读取和按 revision 更新多份简历 |
| 连续复杂填表 | AI 使用页面快照、UID、批量填写、等待和回读完成多步骤表单 |
| 通用控件配方 | 为异步下拉、级联、树、日期范围、弹窗、虚拟列表、重复记录、iframe 等提供可恢复的动作顺序 |
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
4. 验证 resume_companion 只暴露四个资料工具；验证 chrome_devtools 来自包内固定的 chrome-devtools-mcp 1.9.0，upload_file 和 lighthouse_audit 已禁用，默认工具审批为 prompt。
5. 用虚构资料测试创建、目录读取、携带 expected_revision 的章节读取和 revision 冲突。
6. 启动一次专用 Chrome 测试 list_pages 和 take_snapshot；不要接管默认 Chrome，不开启远程调试，不填写真实信息，不执行保存或最终提交。
7. 如果客户端需要重启或新建任务才能加载 MCP，先完成其余步骤，最后报告安装目录、Profile 目录、修改的配置、验证结果和下一条可直接使用的指令。
~~~

## 两组工具

Resume Companion 自身只有四个工具：

| 工具 | 用途 |
| --- | --- |
| `resume_status` | 检查本地资料服务和数据目录 |
| `resume_profile_list` | 列出资料元数据和 revision |
| `resume_profile_read` | 按目录、栏目、记录或来源读取；支持 `expected_revision` |
| `resume_profile_save` | 创建或按 revision 更新资料 |

浏览器能力直接使用官方工具名，例如 `list_pages`、`select_page`、`take_snapshot`、`fill_form`、`click`、`wait_for`、Network、Console、截图和 `evaluate_script`。常规观察与填写可自动批准；导航、按键、请求详情和脚本执行默认逐次提示；`upload_file` 与 `lighthouse_audit` 被禁用。详见 [工具与权限](docs/mcp-tools.md)。

## 本地数据、模型和边界

简历资料、修订历史和专用 Chrome Profile 默认保存在本机。简历 JSON 权限设为仅当前用户可读写；专用 Chrome 自己保存 Cookie、历史和缓存。插件不会额外持久化页面快照、Network 正文、Cookie、请求头或临时表单值。

本地保存不等于本地推理。Agent 为完成任务而读取的简历字段、页面快照、截图和诊断结果会进入当前模型上下文；使用云端模型时，这些信息由对应服务处理。

0.14.0 的边界主要由 skill、客户端工具审批和人工监督共同实现，不宣称代码级绝对防误投递。遇到结果不明、页面跳转异常或最终提交含义不清时，Agent 应停止并交给用户检查。完整说明见 [SECURITY.md](SECURITY.md)。

## 开发与旧路线

新增产品代码使用严格 TypeScript。发布中的 `server.bundle.mjs` 与 `chrome-launcher.bundle.mjs` 是由源码生成的产物，并标记为 GitHub Linguist generated。旧版扩展与 Native Messaging 实现已从主线删除，可从 Git 标签 `archive/extension-0.10.0` 恢复。
