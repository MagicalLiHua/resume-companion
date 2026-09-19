# 安装与使用

当前版本为 0.12.0 开发预览版，由本地资料 MCP、固定版本的官方 Chrome DevTools MCP、TypeScript 启动器和带控件配方的 `resume-autofill` skill 组成。它不需要浏览器扩展、Native Host 或远程调试开关。

## 环境

- Node.js 24
- Google Chrome stable
- 支持本地 stdio MCP 和逐工具审批的 Codex

资料和浏览器 Profile 使用操作系统用户数据目录。默认位置：

| 系统 | 简历资料 | 专用 Chrome Profile |
| --- | --- | --- |
| macOS | `~/Library/Application Support/Resume Companion` | `~/Library/Application Support/Resume Companion/chrome-profile` |
| Windows | `%APPDATA%\Resume Companion` | `%LOCALAPPDATA%\Resume Companion\chrome-profile` |
| Linux | `${XDG_DATA_HOME:-~/.local/share}/resume-companion` | `${XDG_STATE_HOME:-~/.local/state}/resume-companion/chrome-profile` |

可以用 `RESUME_COMPANION_DATA_DIR` 修改资料目录，用 `RESUME_COMPANION_CHROME_DATA_DIR` 修改 Chrome Profile 目录。

## 从源码安装

~~~sh
git clone https://github.com/MagicalLiHua/resume-companion.git
cd resume-companion
npm ci
npm ci --prefix plugins/resume-companion
npm run build
codex plugin marketplace add MagicalLiHua/resume-companion --ref main
codex plugin add resume-companion@resume-companion
~~~

发布包已包含构建产物与固定的 Chrome DevTools MCP 运行时，无需执行 `npm ci` 或重新构建。按包内 README 将插件目录加入 Codex 即可。

插件一次注册两个 MCP：

- `resume_companion` 是必需服务，启动失败会影响资料管理。
- `chrome_devtools` 是可选服务，被另一个任务占用时不会阻止资料服务启动。

新安装或升级插件后，新建一个 Codex 任务让工具目录重新加载。

## 第一次使用

先发送简历或 Markdown：

> 把这些信息保存为“校招版”。只保存明确事实，未知项保持空白。

确认 `resume_status` 和 `resume_profile_list` 可用。打开招聘网站后发送：

> 用“校招版”完成当前网申，可以保存普通草稿和进入普通下一步，最终提交交给我。

第一次调用 `list_pages` 时，Chrome DevTools MCP 会打开 Resume Companion 专用 Chrome。请在这个窗口登录招聘网站、完成验证码或设备验证，然后回到 Agent 继续。此后登录状态会随 Profile 保存。

## 工具审批

Chrome 服务默认 `prompt`。插件只为审查过的常规工具设置自动批准：页面列表和选择、快照、文本等待、请求列表、Console 列表和详情、截图、`fill_form`、`fill`、`click` 与 `hover`。

`evaluate_script`、请求详情、导航、新建/关闭页面、按键、键盘输入、拖拽和对话框处理保持逐次提示。上传和 Lighthouse 被禁用。客户端若不支持 `.mcp.json` 的审批字段，需要手动复制 [工具与权限](mcp-tools.md) 中的策略；在完成前不要把浏览器服务设置成全局无条件自动批准。

## 常见问题

| 现象 | 处理 |
| --- | --- |
| `resume_status` 不存在 | 检查插件是否安装并启用；新建任务重新加载 MCP 配置 |
| `profile_in_use` | 关闭另一个正在使用 Resume Companion 专用 Chrome 的任务，然后在当前任务直接重试；无需重启任务 |
| Chrome 打开但网站未登录 | 在专用 Chrome 中手工登录一次；不要切换到默认 Chrome |
| Chrome 被用户关闭 | 再调用一个页面工具，MCP 会重新启动并复用同一 Profile |
| 资料读取返回 `profile_changed` | 重新读取资料目录，固定新的 revision，再规划剩余字段 |
| 页面填写中途失败 | 重新快照，核对已成功字段，只补缺失项 |
| 网页显示结果不明 | 不重放保存或下一步；由 Agent 按证据诊断，仍不明确时交给用户 |

## 数据备份与清理

备份简历资料时复制资料目录中的 `profiles`、`history`、`backups` 和 `index.json`。专用 Chrome Profile 含网站登录数据，是否备份由用户自行决定，分享前应按浏览器敏感数据处理。

卸载插件不会自动删除这两个目录。需要清理时先关闭所有占用 Resume Companion Chrome 的任务，再手工删除对应目录。
