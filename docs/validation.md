# 验证与兼容范围

版本：项目 0.10.0 / MCP 插件 0.7.0 / 扩展 0.1.0 / 工具协议 2.1 / 桥接协议 1.0。定位：开发预览版。

## 已验证

2026-09-18，本地 macOS + Google Chrome 153 环境完成：

- 根项目、MCP、扩展、Native Host 和页面引擎的严格 TypeScript 检查及生产构建。
- 资料原子写入、记录 ID、来源解析、修订冲突、并发更新和索引重建。
- MCP 契约：十工具目录、资料引用仅在 MCP 解析、取消信号和结构化错误。
- Native Messaging 长度帧、固定扩展来源、0600 描述符、随机 token、Unix socket 中继、断线清理和重连。
- 页面引擎 18 项浏览器回归：两种复杂布局、批量写入、搜索下拉、级联、年月日、虚拟列表、多条经历、用户手改保护、条件撤销和最终提交阻止。
- 当前 Chrome Profile 实测：`resume_status.connected === true`，`resume_list_tabs` 可列出现有多窗口标签页，`resume_activate_tab` 与 overview `resume_observe` 可读取交通银行人才招聘简历页。此验收未保存或提交表单。
- 日常驱动不开启 Chrome 远程调试，不读取 `DevToolsActivePort`，不创建新 Profile。
- DevTools 备用驱动的真实集成：MCP 启动固定 Chrome DevTools MCP 运行时，在隔离与持久专用 Profile 中打开合成页面；隔离模式覆盖资料填写、回读验证和撤销。
- Chrome 150+/153 DevTools 故障矩阵：9222 的 `/json/version` 返回 404、`DevToolsActivePort` 缺失、EACCES/EPERM、Allow 等待与真实 transport 断开均返回不同错误码。这些回归保留给显式 DevTools 备用模式。
- 发布包自检：自包含 MCP、扩展、Native Host、备用运行时、skill 与公开文档，不包含用户资料、密钥、浏览器 Profile 或内部调试文档。

所有自动化测试使用合成资料。测试运行后会关闭隔离 Chrome 并删除临时 Profile。

## 当前承诺与限制

- Chrome 扩展是日常默认驱动，直接复用当前 Profile。安装 Native Host 和加载扩展各需完成一次。
- 扩展当前只自动化顶层 frame；跨域 iframe 和封闭 Shadow DOM 尚未覆盖。
- 用 canvas 完全自绘且不提供可访问语义的控件需要用户处理。
- 横向滚动当前交给用户；纵向滚动可通过受限动作完成。
- 页面回显不等于招聘网站后台事务成功；未知保存结果必须重新观察。
- 上传、验证码、密码、声明、删除和最终申请提交由用户处理。
- Windows 的 Native Messaging 注册与 Named Pipe 已实现，但尚未在真实 Windows + Edge/Chrome 环境完成复测。
- 真实招聘网站仍需持续逐站试用；交通银行的只读验收与合成复杂控件回归不代表已覆盖所有边缘情况。

问题报告请使用合成资料和匿名控件结构，不要上传真实简历、账号、Cookie 或网页会话。
