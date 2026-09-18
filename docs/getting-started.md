# 安装与使用

本版由 MCP 插件 0.6.0 和内置 Chrome DevTools 驱动组成。简历保存在 MCP 本地资料库中。

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
        "RESUME_COMPANION_DATA_DIR": "/可选的本地资料目录"
      }
    }
  }
}
~~~

省略数据目录时，macOS 使用 `~/Library/Application Support/Resume Companion`，Windows 使用用户 AppData，Linux 使用 XDG 数据目录或 `~/.local/share/resume-companion`。

## 第一次连接 Chrome

1. 使用日常 Chrome 打开 `chrome://inspect/#remote-debugging`，手动启用远程调试。
2. 打开招聘网站并正常登录。
3. 让 AI 开始填写，或调用 `resume_list_tabs`。
4. Chrome 显示本次远程调试授权提示时，点击 **Allow**。
5. AI 继续列出标签页、观察页面和填写表单。

默认 `auto_connect` 使用当前 Chrome 的现有 Profile，因此 Cookie 和登录状态都会保留。无需加载扩展，无需关闭 Chrome，也无需给 ChatGPT“修改当前 Mac 上的 App”的权限。远程调试开关和每次新连接的 Allow 由 Chrome 明确要求，工具不能静默开启或代替用户授权；参见 [Chrome 官方当前会话连接说明](https://developer.chrome.com/blog/chrome-devtools-mcp-debug-your-browser-session)。

如果用户拒绝 Chrome 的授权，资料管理仍然可用；`resume_status.browser.permission_state` 会提示需要授权。再次调用网页工具即可重新尝试连接。

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
| `RESUME_COMPANION_CHROME_PROFILE_MODE=auto_connect` | 默认；连接当前 Chrome，沿用登录态 |
| `RESUME_COMPANION_CHROME_PROFILE_MODE=dedicated` | 使用数据目录下的专用 Profile，适合隐私隔离 |
| `RESUME_COMPANION_CHROME_PROFILE_MODE=isolated` | 临时 Profile，仅用于自动化测试 |

## 常见问题

| 现象 | 处理方式 |
| --- | --- |
| `resume_status` 不在工具目录 | 检查插件是否启用，重载 MCP 配置或新开任务 |
| Chrome 没有显示 Allow | 打开 `chrome://inspect/#remote-debugging` 并确认远程调试已启用，再调用网页工具 |
| Chrome 显示 Allow | 这是本次浏览器调试授权；允许后继续 |
| macOS 提示 ChatGPT 修改 App | 拒绝即可；简历随行不需要这个权限 |
| 资料可用但网页连接失败 | 保持 Chrome 运行，确认版本为 144+，重新调用网页工具 |
| `profile_changed` | 另一会话已更新资料；重新读取并合并 |
| 页面引用过期 | 重新观察当前页面，不重放旧动作 |
| 保存结果为 `unknown` | 先观察页面卡片、步骤和错误提示，不直接重试 |
