# 简历随行后端 0.4.0

简历工作台支持直接注册、网页登录、插件 API Key、简历版本管理、PDF 导入核对和插件同步。Python 3.12 + FastAPI + SQLite；React 网页编译后随服务提供，无外部 CDN。

默认采用用户自带模型 API：用户在“模型设置”选择 Anthropic Messages 或 OpenAI Chat Completions，填写提供商 HTTPS Base URL、模型名称和自己的 Key。服务器负责账号、资料、PDF 提取和 API 转发，不需要运行推理服务。服务器现在可访问外网；安装包仍支持离线构建。

## 用户流程与权限

管理员由本地命令初始化，初始随机密码仅写入私有文件。普通用户直接使用用户名和密码注册，不需要邀请码；只能创建普通账号。注册保留按 IP 限流。

用户手动维护简历，或上传文字 PDF。默认仅提取文字，勾选“使用我的模型整理简历”后才将文字发往所显示的提供商。模型输出经结构校验后仍需用户确认，才保存正式简历。随后在“连接插件”创建插件 API Key，供插件读取已确认资料。

模型提供商 Key 与插件 Key 分开管理。模型 Key 使用 AES-256-GCM 加密保存，绑定用户和目标配置；网页只显示是否已配置，插件不能读取或管理模型 Key。加密主密钥保存在私有 `providers.key` 文件，不能随安装包发布。插件 Key、会话和恢复码只存 SHA-256 摘要，密码使用 scrypt。

会话 Cookie 为 HttpOnly、SameSite=Strict，HTTPS 时启用 Secure；写请求需要 `X-CSRF-Token`。修改密码会撤销旧会话及插件 Key，停用账号立即生效。管理员可管理账号状态、额度和一次性恢复码，不能读取用户模型 Key。

## LLM 的实际作用

| 功能 | 当前行为 |
| --- | --- |
| PDF 文字提取 | 本地程序完成，不使用 LLM；扫描件暂不支持 OCR |
| PDF 内容整理 | 用户主动选择后，由其模型 API 将文字整理为简历草稿 |
| 编辑、保存、历史、插件同步 | 普通业务代码，不调用 LLM |
| 插件日常自动填写 | 使用已确认资料、本地匹配与控件操作，不按每个字段调用 LLM |
| 陌生字段来源识别、基于事实的回答草稿 | 后端接口已具备，尚未接入插件日常填写界面 |
| 简历润色 | 尚未实现，继续后置 |

参考商业插件的浏览器代码能证明它向远端请求字段识别、填写值、弹窗选择、简历润色等结果。其后端未取得，不能判断每个接口用了多少 LLM、规则、缓存或专用适配。本项目独立实现代码。

## 主要接口

| 接口 | 身份 | 用途 |
| --- | --- | --- |
| `/`、`/assets/*`、`/downloads/resume-companion-{version}.zip`、`GET /healthz` | 公开 | 网页、插件下载与进程存活 |
| `POST /v1/auth/register/login/recover` | 公开，限流 | 注册、登录、凭恢复码重置密码 |
| `GET /v1/me` | 会话或插件 Key | 当前账号；会话可取得 CSRF |
| `POST /v1/auth/logout/password` | 会话 + CSRF | 退出、修改密码 |
| `/v1/keys`、`/v1/keys/{id}` | 会话 | 列出、创建、撤销自己的插件 Key |
| `GET/PUT/DELETE /v1/model-settings` | 会话 | 读取非敏感配置、保存或删除模型 Key |
| `POST /v1/model-settings/test` | 会话 + CSRF | 测试已保存的配置，产生一条真实 API 请求 |
| `/v1/resumes`、`/v1/resumes/{id}` | 会话；插件仅可读 | 简历维护、修订号冲突检测与回收站 |
| `/v1/resumes/{id}/copy/default/history/restore/restore-version` | 会话 | 复制、默认、历史和恢复 |
| `/v1/imports`、`/v1/imports/{id}/file/confirm` | 会话 | 上传、任务、下载原文、确认草稿 |
| `/v1/admin/users` | 管理员会话 | 账号状态、额度与恢复码 |
| `GET /v1/usage` | 会话 | 每日模型操作用量，不等同于提供商账单 |
| `GET /v1/capabilities/readiness/source-catalog/openapi.json` | 会话或相应 Key | 协议、模型就绪、来源目录、文档 |
| `POST /v1/fields/resolve`、`POST /v1/answers/draft` | 会话或模型权限 Key | 字段辅助、待审核草稿 |

斜线合并项在 OpenAPI 中是单独路由，以 `contracts/api/openapi.json` 为准。个人模型模式下不会回退到服务器共享 Key；旧的离线签发令牌没有网页账号，因此不能使用个人模型。插件 Key 可按范围访问模型接口，但不能管理模型设置。

保存模型配置需要 `expected_revision`。同一地址和协议下留空 Key 可保留旧值；更换地址或协议必须提供新 Key。只允许公网 HTTPS，拒绝重定向、私网目标及解析到私网的域名，并固定实际连接 IP、验证原始域名 TLS，避免自定义提供商访问服务器内网。

## PDF 与存储

数据库目录权限 700，数据库与 PDF 权限 600。每用户最多 30 份活动简历，每份保留最近 20 次历史。保存带预期修订号，冲突返回 409；删除进入回收站。

PDF 正文为 `application/pdf`，`X-File-Name` 为 URI 编码文件名；最大 10 MiB、1–30 页。默认不调用模型；主动调用需发送 `X-Model-Revision` 为当前模型设置修订号。任务在上传时固定这份配置，后续更改设置不会静默改变已上传任务的目的地。导入记录显示提供商与模型名称，不保存 Key。

同时最多 2 个任务，每用户 1 个，当日最多保留 10 个未删除导入。PDF 提取在受资源限制的独立进程执行。模型只尝试一次，输出需经过简历结构校验；失败时保留提取原文，供手动整理。模型超时 150 秒，总请求上限 165 秒。没有文字的扫描件会明确报错。

原始 PDF、提取文字与草稿在 24 小时后清理，正式简历独立保存。重启后中断任务标记失败，用户可重新上传。

## 开发、部署和备份

开发使用 Python 3.12、`uv sync --frozen`、Node 24 和 `npm ci`。部署与初始化见 [OFFLINE.md](OFFLINE.md)，当前访问见 [当前交付与启动](../docs/当前交付与启动.md)。

```sh
npm run typecheck
npm test
npm run web:build
npm run build
backend/.venv/bin/pytest backend/tests
npm run test:e2e
npm run test:web
```

网页测试使用临时数据库、合成凭证和模拟提供商；真实 DeepSeek 测试通过私有临时文件挂载测试 Key，只发送合成资料。普通日志不记录简历正文、密码或上游响应。

```sh
python -m app.backup create --config .runtime/config.json --output /private-backups/resume-backup.tar.gz
python -m app.backup restore --archive /private-backups/resume-backup.tar.gz --destination /private-restore/new-copy --sha256 已验证的64位摘要
```

备份包括 SQLite 一致快照、尚未删除的导入 PDF、认证配置和 `providers.key`，权限 600，必须私有保存。丢失主密钥将无法解密已保存的模型 Key。恢复校验整包与逐文件摘要、数据库完整性和外键，只写入新目录，不覆盖运行中的数据。迁移位置时检查网页路径与服务入口。

Ollama 和服务器级 OpenAI/vLLM 适配器保留为可选部署。默认 Compose 不启动模型；显式本地模型部署使用 `compose.local-model.yaml` 和 `--profile local-model`，并设置相应 `model_provider`。切换框架与模型效果需要另行验证，本次没有部署或调优 vLLM。
