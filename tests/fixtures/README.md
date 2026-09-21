# 虚构招聘表单

这里的页面只用于本地开发和回归，不连接任何真实招聘网站，也不包含真实个人资料。

- `agent-lab.html`：覆盖跨步骤、条件显示、重复经历和自定义控件。
- `agent-controls.html`：集中覆盖下拉框、单选、多选、日期、文件等基础控件。
- `acceptance-lab.html`：面向真实 Agent 会话的完整四步网申验收页；配套 `acceptance-profile.md` 和 `acceptance-task.md`。
- `complete-virtual-resume.md`：覆盖银行网申常见字段的完整虚构简历，可用于资料库导入和跨站点表单回归。
- 另有基于本次真实页面脱敏结构生成的 Moka、飞书、智联离线样本，使用 `npm run lab:ats`；私有结构数据与生成页位于 Git 忽略目录，范围和验证见 [ATS 离线样本说明](../ats-offline/README.md)。

运行 `npm run lab` 后，可以在本地浏览器中打开这些页面调试 MCP 的观察、操作、等待和撤销工具。

综合验收页使用下面的地址。`fresh=1` 只在首次打开时清除该 run 的旧草稿，随即从地址栏移除，刷新不会再次清空：

~~~text
http://127.0.0.1:4174/acceptance-lab.html?run=manual-acceptance&fresh=1
~~~

`complete-virtual-profile.json` 是历史 1.0 虚拟简历中三套已适配表单所需事实的结构化测试摘录，供 0.24 自动准备接口使用；它保留原始 Markdown。未知税务口径、总体语言水平、最高学历和最近公司不会从相关但不同的事实中补造。并非所有银行问卷事实都有自动字段映射；完整来源仍需按目标页面逐项核对。

`comprehensive-virtual-profile.json` / `comprehensive-virtual-resume.md` 为 2026-09-21 用户明确授权补造的 2027 校招测试版本，旧基线保留在 `complete-virtual-resume-v1.md`，历史整页契约继续引用它。当前测试入口统一为 `complete-virtual-resume.md`，`comprehensive-virtual-resume.md` 为相同内容副本；JSON 的 `source_markdown` 也保存完整正文。运行 `node scripts/sync-virtual-resume.mjs` 可将新增结构化事实和补充字段同步到这三个位置。补充 228 项规范字段、完整日期、科研、家庭和企业问卷；使用固定记录 ID。它是测试人物设定，不能用来推断真实用户事实；证件号码为格式校验合成数据，不代表真实身份，不能用于实名验证。旧版资料已通过保存和固定 revision 读取回归；当前 228 项版本只进入隔离开发资料库；原站分模块验收见开发报告。主教育夹具仅含浙江工业大学本科和浙江大学硕士，真实校名用于词库匹配，人物与就读经历完全虚构；高中只在企业明确要求时使用独立夹具。企业亲属历史答案仅用于验证拒绝自动填写，任何模板均由用户自行处理；声明和同意不作为自动填写的回答。

`test-blank-photo.jpg` 是代码生成的 110×150 浅灰空白 JPEG（1,085 字节），只用于用户明确授权的中粮和江苏农商银行虚拟简历照片上传，不是候选人证件照。
