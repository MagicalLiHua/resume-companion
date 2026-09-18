# 安装与使用

当前版本由 MCP 插件 0.7.0、Chrome 扩展执行器 0.1.0 和 Native Host 组成。简历保存在 MCP 本地资料库，扩展不保存简历。

## 安装

需要 Node.js 24、Chrome 116+，以及支持本地 stdio MCP 的 AI 客户端。

### 1. 构建或解压发布包

从源码构建：

~~~sh
npm ci
npm ci --prefix plugins/resume-companion
npm run build
~~~

发布包已经包含构建完成的 MCP、扩展、Native Host 和 DevTools 备用运行时，无需再编译。

### 2. 安装 Native Host

源码目录：

~~~sh
node native-host/install.bundle.mjs
~~~

发布包：

~~~sh
node plugins/resume-companion/browser-assets/native-host/install.bundle.mjs
~~~

安装器只在当前操作系统账户下注册 `com.resume_companion.bridge`，并把启动器放入 Resume Companion 数据目录。它不修改 Chrome 应用本体。

### 3. 加载 Chrome 扩展

1. 打开 `chrome://extensions`。
2. 开启“开发者模式”。
3. 选择“加载已解压的扩展程序”。
4. 源码构建选择根目录下的 `dist/`；发布包选择 `plugins/resume-companion/browser-assets/extension/`。

扩展 ID 固定为 `feifaflnkjdihpbbhnihidjjkeapamnh`，与 Native Host 允许的来源一致。扩展开启后会定期尝试连接 MCP；点击扩展图标可以立即重连或暂停浏览器能力。

### 4. 配置 MCP

Codex 插件：

~~~sh
codex plugin marketplace add MagicalLiHua/resume-companion --ref main
codex plugin add resume-companion@resume-companion
~~~

安装后新开一个 Codex 任务，让 MCP 工具和 skill 进入工具目录。

其他客户端可直接注册：

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

## 连接验证

1. 调用 `resume_status`。正常结果中 `browser.kind` 为 `extension`、`ready` 为 `true`。
2. 第一次调用 `resume_list_tabs`。MCP 会启动私有 socket，扩展最多等待一个重连周期后自动连接。
3. 再调用 `resume_status`，`connected` 应为 `true`、`permission_state` 应为 `granted`。

如果想立即连接，点击扩展图标后选择“重新连接”。无需打开 `chrome://inspect/#remote-debugging`，无需在招聘网站重新登录。

## 保存第一份资料

在 AI 客户端中上传简历、粘贴 Markdown 或直接提供信息，然后说：

> 把这份资料保存为“软件开发版”。只记录原文明确出现的事实，未知内容保持为空。

更新资料时，AI 会先读取当前修订。数组栏目采用整栏目替换，因此修改一条经历时会保留同栏目的其他记录及记录 ID。修订冲突会返回 `profile_changed`，AI 必须重新读取和合并。

## 填写网页

打开招聘页面后告诉 AI：

> 用“软件开发版”连续填写当前网申。可以保存单条经历、草稿并进入普通下一步；缺少事实时集中问我。最终提交交给我。

AI 会选择标签页、按需读取资料、观察页面，并通过基础动作完成多个步骤。最终提交、声明、验证码、密码、附件上传和删除记录由用户完成。

## 显式备用模式

仅当扩展无法使用或需要 CI 隔离浏览器时，设置 `RESUME_COMPANION_BROWSER_DRIVER=devtools`。

| 配置 | 用途 |
| --- | --- |
| `RESUME_COMPANION_CHROME_PROFILE_MODE=dedicated` | 持久专用 Profile；需要在该 Profile 登录一次 |
| `RESUME_COMPANION_CHROME_PROFILE_MODE=isolated` | 临时 Profile，用于自动化测试 |
| `RESUME_COMPANION_CHROME_PROFILE_MODE=auto_connect` | 实验性连接日常 Chrome，受 Chrome 150+ 权限代理和客户端沙箱限制 |

高级配置还支持 `RESUME_COMPANION_DEVTOOLS_BROWSER_URL` 或 `RESUME_COMPANION_DEVTOOLS_WS_ENDPOINT`。Chrome 150+ 默认 Profile 的 9222 权限代理不提供 `/json/version`，因此不能当作普通 browser URL。

## 常见问题

| 现象 | 处理方式 |
| --- | --- |
| `resume_status` 不在工具目录 | 检查插件是否启用，重载 MCP 配置或新开任务 |
| `extension_not_installed` | 重新构建或使用完整发布包，然后加载扩展目录 |
| `native_host_missing` | 运行 `resume_status.browser.setup.native_host_installer` 指向的安装器 |
| `bridge_disconnected` | 保持 MCP 运行并等待自动重连，或点击扩展图标立即重连 |
| 扩展显示“连接已暂停” | 点击“重新连接” |
| `debugger_attach_conflict` | 其他开发者工具正在占用目标标签页；关闭该调试会话后重试 |
| `profile_changed` | 另一会话已更新资料；重新读取并合并 |
| 页面引用过期 | 重新观察当前页面，不重放旧动作 |
| 保存结果为 `unknown` | 先观察页面卡片、步骤和错误提示，不直接重试 |
