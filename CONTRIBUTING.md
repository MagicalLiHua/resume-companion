# 参与贡献

感谢你改进简历随行。本项目处理简历和网申表单，所有问题、示例和测试都必须使用合成数据，不要提交真实简历、API Key、Cookie、网页会话或招聘网站抓取内容。

## 本地开发

需要 Node.js 24。克隆仓库后运行：

```sh
npm ci
npx playwright install chromium
npm run check
```

Codex 插件单独安装依赖并验证：

```sh
cd plugins/resume-companion
npm ci
npm run build
npm test
```

需要做 Chrome 扩展联调时，再运行 `npm run test:live`。该测试只操作项目自带的合成表单，不会提交申请。

## 提交改动

- 保持改动聚焦，并为行为变化补充相应测试。
- 保留“预览后确认”的交互，不增加自动提交、下一步、上传、验证码、密码或接受声明能力。
- 不将用户资料或模型密钥发送到项目自建后端。
- 提交前运行根目录的 `npm run check`，修改 Codex 插件时同时运行插件的构建和自测。

安全问题请按 [SECURITY.md](SECURITY.md) 私下报告，不要公开包含敏感信息的复现材料。
