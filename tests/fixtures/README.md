# 虚构招聘表单

这里的页面只用于本地开发和回归，不连接任何真实招聘网站，也不包含真实个人资料。

- `agent-lab.html`：覆盖跨步骤、条件显示、重复经历和自定义控件。
- `agent-controls.html`：集中覆盖下拉框、单选、多选、日期、文件等基础控件。
- `acceptance-lab.html`：面向真实 Agent 会话的完整四步网申验收页；配套 `acceptance-profile.md` 和 `acceptance-task.md`。

运行 `npm run lab` 后，可以在本地浏览器中打开这些页面调试 MCP 的观察、操作、等待和撤销工具。

综合验收页使用下面的地址。`fresh=1` 只在首次打开时清除该 run 的旧草稿，随即从地址栏移除，刷新不会再次清空：

~~~text
http://127.0.0.1:4174/acceptance-lab.html?run=manual-acceptance&fresh=1
~~~
