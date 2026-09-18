# 安装与使用

本版由 MCP 插件 0.6.1 和内置 Chrome DevTools 驱动组成。简历保存在 MCP 本地资料库中。

## 安装

需要 Node.js 24、Chrome 144+，以及支持本地 stdio MCP 的 AI 客户端。

### Codex 插件

~~~sh
codex plugin marketplace add MagicalLiHua/resume-companion --ref main
codex plugin add resume-companion@resume-companion
~~~

安装后新开一个 Codex 任务，让 MCP 工具和 skill 生效。Resume Companion 是必需 MCP；Codex 创建或恢复任务时会等待它完成初始化。

### 直接注册 MCP

~~~json
{
  "mcpServers": {
    "resume_companion": {
      "command": "node",
      "args": ["/绝对路径/plugins/resume-companion/server.mjs"],
      "env": {
        "RESUME_COMPANION_DATA_DIR": "/可选的本地资料目录",
        "RESUME_COMPANION_CHROME_PROFILE_MODE": "dedicated"
      }
    }
  }
}
~~~

省略数据目录时，macOS 使用 `~/Library/Application Support/Resume Companion`，Windows 使用用户 AppData，Linux 使用 XDG 数据目录或 `~/.local/share/resume-companion`。

## 第一次连接 Chrome

1. 让 AI 调用 `resume_list_tabs`，Resume Companion 会启动专用 Chrome。
2. 在这个 Chrome 窗口打开招聘网站并正常登录。
3. 让 AI 再次列出标签页、观察页面和填写表单。

默认 `dedicated` 把 Profile 保存在 Resume Companion 数据目录。招聘网站只需在这个 Profile 登录一次，后续启动会继续使用它的会话。无需加载扩展、开启远程调试或给 ChatGPT“修改当前 Mac 上的 App”的权限。

资料管理不依赖 Chrome。浏览器启动或连接失败时，`resume_status.browser.connection_error_code` 会返回具体原因；连接类错误会清理旧客户端，下一次网页调用会建立新连接。

## 保存第一份资料

在 AI 客户端中上传简历、粘贴 Markdown 或直接提供信息，然后说：

> 把这份资料保存为“软件开发版”。只记录原文明确出现的事实，未知内容保持为空。

资料工具不需要 Chrome。更新资料时，AI 会先读取当前修订；数组栏目采用整栏目替换，因此修改一条经历时会保留同栏目的其他记录及记录 ID。修订冲突会返回 `profile_changed`，AI 必须重新读取和合并。

## 填写网页

打开招聘页面后告诉 AI：

> 用“软件开发版”连续填写当前网申。可以保存单条经历、草稿并进入普通下一步；缺少事实时集中问我。最终提交交给我。

AI 会选择标签页、按需读取资料、观察页面，并通过基础动作完成多个步骤。最终提交、声明、验证码、密码、附件上传和删除记录由用户完成。

## 可选运行模式

| 配置 | 用途 |
| --- | --- |
| `RESUME_COMPANION_CHROME_PROFILE_MODE=dedicated` | 默认；使用数据目录下的持久专用 Profile |
| `RESUME_COMPANION_CHROME_PROFILE_MODE=auto_connect` | 可选；连接日常 Chrome，要求客户端能读取 `DevToolsActivePort` |
| `RESUME_COMPANION_CHROME_PROFILE_MODE=isolated` | 临时 Profile，仅用于自动化测试 |

高级配置还支持 `RESUME_COMPANION_DEVTOOLS_BROWSER_URL` 或 `RESUME_COMPANION_DEVTOOLS_WS_ENDPOINT`。Chrome 150+ 默认 Profile 的 9222 权限代理不会提供 `/json/version`，因此不能把它当作普通 browser URL。若 `auto_connect` 返回 `devtools_active_port_permission_denied`，说明 AI 客户端的 macOS 沙箱无法读取端点文件；请改回 `dedicated`，继续重开远程调试不会解决这个权限问题。

## 常见问题

| 现象 | 处理方式 |
| --- | --- |
| `resume_status` 不在工具目录 | 检查插件是否启用，重载 MCP 配置或新开任务 |
| 专用 Chrome 没有出现 | 查看 `resume_status.browser.connection_error_code`，再重试一次网页工具 |
| `devtools_active_port_permission_denied` | 当前客户端无权读取日常 Chrome 的端点文件；使用默认 `dedicated` |
| `permission_proxy_unsupported` | 9222 是权限代理，不能作为 browser URL；使用 `auto_connect` 或 `dedicated` |
| `browser_approval_required` | `auto_connect` 已找到端点，等待用户在 Chrome 点击 Allow |
| `remote_debugging_disabled` | 仅在 `auto_connect` 模式下开启 `chrome://inspect/#remote-debugging` |
| macOS 提示 ChatGPT 修改 App | 拒绝即可；简历随行不需要这个权限 |
| 资料可用但网页 transport 断开 | 再调用一次网页工具；旧连接会先被清理并重新创建 |
| `profile_changed` | 另一会话已更新资料；重新读取并合并 |
| 页面引用过期 | 重新观察当前页面，不重放旧动作 |
| 保存结果为 `unknown` | 先观察页面卡片、步骤和错误提示，不直接重试 |
