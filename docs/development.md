# 开发指南

## 安装与回归

使用 Node 24，分别安装根项目与 MCP 依赖：

```sh
npm ci
npm ci --prefix plugins/resume-companion
npx playwright install chromium
npm run check
npm run build --prefix plugins/resume-companion
npm test --prefix plugins/resume-companion
npm run test:core --prefix plugins/resume-companion
npm run test:live --prefix plugins/resume-companion
```

Linux 初次安装浏览器可使用 `npx playwright install --with-deps chromium`。`RESUME_TEST_BROWSER` 可指定 Chrome for Testing 的可执行文件。测试使用合成资料、独立浏览器上下文和临时桥接端口。

## 目录

| 目录 | 内容 |
| --- | --- |
| `extension/src/content/automation` | 观察、元素引用、动作策略、等待、回读和条件撤销 |
| `extension/src/background` | 本地资料、跨标签页通信和 MCP 桥接 |
| `extension/src/domain` | 简历、版本、Markdown、补充字段及投递记录 |
| `extension/src/options` / `sidepanel` / `journal` | 设置、悬浮/侧栏和记录界面 |
| `plugins/resume-companion` | MCP 服务、自包含 bundle、共享协议和 skill |
| `tests/e2e` / `tests/unit` / `tests/fixtures` | 自动化回归与虚构页面 |
| `.agents/plugins/marketplace.json` | 仓库级 Codex 插件安装目录 |

旧业务后端和旧网页工作台不是本版本运行依赖，不放入当前发布树。用于读取旧简历备份的数据类型和迁移测试仍保留。

## 虚构表单实验室

```sh
npm run lab
```

打开 `http://127.0.0.1:4174/agent-lab.html`，可在本地体验虚构银行四步表单。数据保存在该浏览器的 localStorage；不会投递到任何招聘网站。

- `agent-lab.html`：基本资料、学校级联、教育弹窗、实习内联编辑、草稿与最终核对。
- `agent-controls.html`：日期、搜索下拉、虚拟滚动、单选和保存失败。
- `agent-native.html` / `agent-repeat.html`：原生字段与重复栏目。
- `agent-controlled.html`：真实 React 受控输入。独立启动前先运行 `node --input-type=module -e "import('./tests/setup.ts').then(m => m.default())"` 构建测试脚本，或先跑一次浏览器测试。

`layout=B` 变更标签/字段或栏目顺序；`run=任意测试标识` 隔离银行页面的数据。实验页面全部使用虚构资料。

## 扩展调试与打包

`npm run dev:extension` 监听源码并构建固定 `dist`。在 Chrome 只需加载一次该目录；后续点击扩展的重载按钮。不会自动刷新正在编辑的招聘网页。MCP 重新观察时会重新注入内容脚本；旧会话失效，需要新观察。

```sh
npm run package
```

发布包包含浏览器扩展、Codex 插件、安装文档、简历模板与第三方许可证。生成 `.zip.sha256` 供校验，不包含运行日志、个人资料或内部开发笔记。`server.bundle.mjs` 是可直接运行的构建产物；修改 MCP 后必须重新构建并一并提交。

共享协议在 `plugins/resume-companion/protocol.ts`，Zod 3/4 契约测试覆盖 MCP 和扩展两端。默认 core 八工具，legacy/all 用于迁移和排错，不作为连续任务的默认接口。
