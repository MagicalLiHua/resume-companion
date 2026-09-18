# 开发指南

## 安装与回归

使用 Node 24：

~~~sh
npm ci
npm ci --prefix plugins/resume-companion
npx playwright install chromium
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run build --prefix plugins/resume-companion
npm run test:core --prefix plugins/resume-companion
npm run test:live --prefix plugins/resume-companion
~~~

测试只使用合成资料、临时数据目录、隔离 Chrome 配置和本地回环端口。

## 目录

| 目录 | 内容 |
| --- | --- |
| extension/src/content/automation | DOM 观察、策略、动作、等待、验证和撤销 |
| extension/src/background | 标签页协调、本地桥接与操作会话 |
| extension/src/options | 极简桥接状态页 |
| plugins/resume-companion | MCP 服务、资料库、共享协议和 skill |
| tests/unit | 协议、资料库、桥接与标签页单元测试 |
| tests/e2e | 核心动作和扩展外壳浏览器测试 |
| tests/fixtures | 虚构多步骤招聘表单 |

## 虚构表单

~~~sh
npm run lab
~~~

打开 http://127.0.0.1:4174/agent-lab.html。实验页覆盖多步骤、两条教育经历、实习经历、动态学校、保存回显和最终提交边界。agent-controls.html 覆盖搜索、虚拟候选、年月、单选和失败保存。

## 扩展调试与打包

npm run dev:extension 持续构建 dist。Chrome 只需加载一次该目录；修改后点击扩展卡片的重新加载图标。内容脚本只在 MCP 首次观察某个标签页时注入。

~~~sh
npm run package
~~~

发布包包含精简扩展、自包含 MCP、skill、公开文档与第三方许可。修改 server.mjs、profile-store.mjs 或 protocol.ts 后必须重新构建 server.bundle.mjs。
