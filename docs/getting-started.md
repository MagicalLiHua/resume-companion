# 安装与使用

本版由 Chrome 扩展 0.7.0 和 MCP 插件 0.4.0 组成。简历保存在 MCP 本地资料库中，扩展只负责网页操作。

## 安装

需要 Chrome 116+、Node.js 24，以及支持本地 MCP 的 AI 客户端。

1. 构建或解压发布包，打开 chrome://extensions。
2. 开启开发者模式，加载 extension 目录；源码构建时加载 dist。
3. 点击扩展图标，打开“浏览器执行桥”，开启“本地桥接”。
4. 安装 Codex 插件：

~~~sh
codex plugin marketplace add MagicalLiHua/resume-companion --ref main
codex plugin add resume-companion@resume-companion
~~~

安装后新开一个 Codex 任务，让新工具和 skill 生效。不要同时运行两个 Resume Companion MCP 实例，它们会争用本地桥端口。

## 直接注册 MCP

不使用 Codex 插件时，可以在任意支持 stdio MCP 的客户端中配置：

~~~json
{
  "mcpServers": {
    "resume_companion": {
      "command": "node",
      "args": ["/绝对路径/plugins/resume-companion/server.bundle.mjs"],
      "env": {
        "RESUME_COMPANION_DATA_DIR": "/可选的本地资料目录"
      }
    }
  }
}
~~~

省略 RESUME_COMPANION_DATA_DIR 时，macOS 使用 ~/Library/Application Support/Resume Companion，Windows 使用用户 AppData，Linux 使用 XDG_DATA_HOME 或 ~/.local/share/resume-companion。

## 保存第一份资料

在 AI 客户端中上传简历、粘贴 Markdown 或直接提供信息，然后说：

> 把这份资料保存为“软件开发版”。只记录原文明确出现的事实，未知内容保持为空。

AI 应调用 resume_profile_save。资料工具不需要 Chrome 连接。后续补充信息时，AI 先读取当前修订，再更新明确涉及的栏目。

每个数组栏目采用整栏目替换。修改某条教育、工作或项目经历前，AI 应先读取该栏目并保留其他记录及记录 ID。修订冲突会返回 profile_changed，必须重新读取和合并。

## 填写网页

打开招聘页面后告诉 AI：

> 用“软件开发版”连续填写当前网申。可以保存单条经历、草稿并进入普通下一步；缺少事实时集中问我。最终提交交给我。

AI 会列出标签页、读取资料目录、观察网页并组合操作。最终提交、声明、验证码、密码、附件上传和删除记录需要手动完成。

## 更新与旧数据

0.7.0 不再读取旧版扩展中的简历、草稿、模型设置和投递记录，但升级不会主动删除 resume_state。确认 MCP 资料库已经包含所需资料后，可以自行保留备份或清理旧扩展数据。

更新扩展文件后，在 chrome://extensions 点击扩展卡片上的重新加载图标。MCP 和扩展必须使用相同协议版本。

## 常见问题

| 现象 | 检查方式 |
| --- | --- |
| 无法加载扩展 | 选择包含 manifest.json 的 extension 或 dist 目录 |
| AI 找不到工具 | 检查 Node 24、MCP 配置，并新开 AI 任务 |
| 资料工具可用但网页工具不可用 | MCP 正常；开启扩展桥接并保持 Chrome 运行 |
| 一直显示等待 MCP | 检查是否启动了 MCP，确认没有旧实例占用 43117 |
| 协议版本不一致 | 使用同一版本的 MCP 与扩展并重新加载扩展 |
| profile_changed | 另一会话已更新资料；重新读取后合并 |
| 页面引用过期 | 重新观察当前标签页，不重放旧动作 |
| 保存结果 unknown | 先观察页面卡片、步骤和错误提示，不直接重试保存 |
