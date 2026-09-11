# Codex 批量网申能力

更新：2026-09-11。版本：浏览器扩展 0.5.0，Codex 插件 0.2.0。

## 目标与结论

Resume Companion 把浏览器 DOM 作为 Codex 的结构化工具，而不是让模型反复截图、识别文字和点击坐标。0.5.0 已跑通三个同时打开的本地网申标签页：枚举、批量扫描、生成建议、填写、回读和撤销均不切换活动标签页，页面提交计数始终为 0。

架构中没有业务后端。Codex 负责理解字段和组织计划，本机 MCP 服务负责协议转发，Chrome 扩展负责 DOM 扫描和可逆写入。复杂控件和真实招聘网站仍需逐站适配。

## 运行组成

- `extension/src/background/codex-bridge.ts`：扩展主动连接 `ws://127.0.0.1:43117`。
- `extension/src/background/codex-tools.ts`：标签页枚举、会话管理、资料建议、批量执行和过期保护。
- `extension/src/content/engine.ts`：页面内扫描、写入、事件派发、回读和条件撤销。
- `plugins/resume-companion/server.bundle.mjs`：自包含 Codex MCP 服务，安装后不依赖项目 `node_modules`。
- `plugins/resume-companion/skills/resume-autofill/SKILL.md`：要求先展示完整预览并取得明确确认。

扩展设置中的“Codex 本地桥接”默认关闭。桥接启用后可同时保存最多 50 个扫描会话，会话两小时过期；单次批量操作最多处理 20 个标签页。

## 工具

| 工具 | 作用 |
| --- | --- |
| `resume_status` | 检查扩展、批量能力、当前页、简历版本和活动会话数 |
| `resume_list_tabs` | 列出普通 HTTP/HTTPS 标签页的标题、网址和临时 ID |
| `resume_scan_tabs` | 批量扫描用户选中的最多 20 个标签页 |
| `resume_fill_batch` | 顺序执行已经明确确认的多页填写计划 |
| `resume_verify_batch` | 批量回读本轮写入值 |
| `resume_undo_batch` | 批量条件撤销，保留用户后续手改内容 |
| `resume_scan_current_form` | 兼容旧流程，扫描当前活动页 |
| `resume_fill_plan` | 兼容旧流程，填写一个会话 |
| `resume_verify_fill` | 兼容旧流程，回读一个会话 |
| `resume_undo_fill` | 兼容旧流程，撤销一个会话 |

没有提交、下一步、文件上传、验证码、密码、短信验证或接受声明的工具。

## 推荐流程

1. 调用 `resume_status`，确认桥接已开启并选择简历版本。
2. 调用 `resume_list_tabs`。范围不明确时先让用户选定标签页，不扫描无关页面。
3. 用选定 ID 调用 `resume_scan_tabs`，汇总每页建议、受限项、未知项和已有值。
4. 向用户展示将写入的精确值。重复值可以合并展示，但必须说明适用页面。
5. 用户明确确认预览后，调用 `resume_fill_batch`。已有值只有在用户明确同意替换对应字段时才设置 `overwrite: true`。
6. 调用 `resume_verify_batch` 并逐页报告结果。需要恢复时调用 `resume_undo_batch`。

标签页关闭或导航、表单节点或标签变化、网页值变化、简历版本更新都会阻止旧计划继续执行。批量结果逐页隔离，一页失败不会被报告为整体成功。

## 本机开发与验证

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run test:e2e

cd plugins/resume-companion
npm run build
npm test
npm run test:live
```

`npm run test:live` 启动本地合成表单和真实 Chrome for Testing 扩展，验证旧单页接口及三个标签页的完整批量闭环。测试使用合成资料，并断言没有页面提交。

## 安全边界

- MCP WebSocket 只监听回环地址，并校验固定扩展 Origin；但这不能强隔离已经运行在同一电脑上的恶意进程。只在可信设备和需要使用时开启桥接。
- 扩展读取选中标签页的表单 DOM，不向 MCP 返回密码、验证码、银行卡、身份验证或声明字段的值。
- 用户预览后手工修改的字段不会被填写计划覆盖；填写后继续手改的字段不会被撤销覆盖。
- 撤销只能操作当前 DOM，无法保证回滚招聘网站已经自动保存到服务器的数据。
- 登录、验证码、文件上传、复杂地区级联、跨域 iframe、Shadow DOM 和网站异常流程仍需人工处理或后续适配器支持。
