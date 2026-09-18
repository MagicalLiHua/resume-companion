# 更新记录

## 0.9.1 · Chrome 153 连接诊断与安全回退

- 确认 Chrome 153 权限代理的 9222 返回 404 属于预期行为；`auto_connect` 仍依赖可读的 `DevToolsActivePort`。
- 默认改为持久专用 Chrome Profile，避开 Codex/macOS 沙箱对默认 Profile 端点文件的限制。
- 区分远程调试未开启、等待 Allow、ActivePort 缺失/无权限/格式错误、权限代理不兼容和真实 transport 断开。
- 连接错误后关闭并丢弃旧客户端与会话，确保下一次调用真正重连。
- 诊断只公开安全分类，不记录 Cookie、请求头、页面内容、表单值或 WebSocket token。
- 新增 Chrome 150+/153 故障矩阵、重连和持久专用 Profile 集成回归。

## 0.9.0 · 单一 DevTools 路线

- 从公开源码、安装包和运行时中移除旧 Chrome 扩展桥及 WebSocket 回退驱动。
- 本机保留扩展桥源码归档；公开 Git 历史可通过 `v0.8.0` 查看。
- 根项目收敛为 MCP 构建、虚构表单和发布脚本，减少前端构建依赖。
- README 新增可复制给本地 AI Agent 的自动安装与验证提示词。
- 首次连接说明与 Chrome 官方行为对齐：用户启用远程调试，并为新调试会话点击 Allow。

## 0.8.0 · Chrome DevTools 主驱动

- 默认通过固定版本的官方 Chrome DevTools MCP 连接当前 Chrome，保留现有招聘网站登录状态。
- 浏览器扩展降为可选兼容回退，日常安装不再依赖扩展或本地 WebSocket 桥。
- MCP 核心、资料库、快照、安全策略、操作日志和驱动改为严格 TypeScript。
- 浏览器层只开放标签页、无障碍快照、填写、点击、按键和纵向滚动所需的内部工具。
- 新增当前值校验、操作去重、条件撤销、保存边界和 Chrome 授权状态。
- 发布包内置固定的 Chrome DevTools 运行时，不依赖全局 npx 或运行时下载。
- 新增无扩展的 MCP 到隔离 Chrome 集成测试；继续保留扩展回退回归。
- 明确不需要 macOS 的“修改 App”权限，首次连接只接受 Chrome 自己的 Allow 授权。

## 0.7.1 · MCP 启动保护

- 将插件内置 MCP 标记为必需服务，任务加载时等待它完成初始化。
- 将启动超时提高到 30 秒，避免慢机器在初始工具目录中遗漏工具。
- skill 在保存资料或填写前先调用 resume_status，并区分 MCP 、本地资料库与 Chrome 桥接状态。
- 工具完全缺席时执行只读诊断，不会启动一个无法注册到当前任务的独立服务进程。

## 0.7.0 · MCP 本地资料库重构

- 将多份简历、原始 Markdown 和历史修订迁移到 MCP 本地资料库设计。
- 新增 resume_profile_list、resume_profile_read 和 resume_profile_save。
- 资料更新使用 expected_revision，拒绝并发会话静默覆盖。
- 资料引用在 MCP 中解析，Chrome 扩展只接收本次操作所需的字面值。
- 扩展删除简历编辑、Markdown 导入、模型 API、侧边栏、悬浮球和投递记录界面，只保留桥接设置与状态。
- 内容脚本改为按需注入，不再常驻所有网页。
- 升级时保留旧 resume_state，不自动清除用户原数据。
- 删除旧业务后端契约和已退出产品路线的测试。
- 更新通用 MCP 安装、Codex skill、安全说明和虚构表单回归。

## 0.6.0 · 开发预览版

- 新增由 Codex 组合的基础页面观察和动作工具。
- 覆盖动态候选、级联、年月弹层、虚拟滚动和重复经历。
- 最终申请提交由用户操作。
