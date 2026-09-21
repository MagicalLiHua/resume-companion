# 0.18.0 选择控件增量验证

日期：2026-09-20。基于原 0.17.0 及未发布 SD 单选修复继续开发，未重写浏览器底座，也未新增 MCP 工具名称。

## 本轮交付

1. 观察能将标题明确、结构为年/月或年/月/年/月的 SD 选择器组合识别为 `date_group`，保留子字段引用。Agent 一次日期调用可完成整个组。
2. 数字年月候选在已确认的日期子字段中规范化；`6` 与 `06月` 可对应，但两个候选都命中时拒绝猜选。普通下拉的比较规则保持严格。
3. 日期组处理依赖启用、原生“至今”、已有内容、单条经历归属、整体回读和共用取消预算。
4. SD 多列地址菜单接入已有路径执行器。候选限定所属 Dropdown，等待下一列变化；最终必须读取完整路径。没有 selected 标记的 SD 列不接受仅叶子回显作为完成证据。
5. Agent 工作流先处理当前可独立批量填写的简单字段，再处理复杂控件；依赖触发与后续清空单独观察。既有批量逐项结果由回归确认。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| TypeScript 类型检查与构建 | 通过 |
| 单元测试 | 27/27 |
| 完整官方 MCP 浏览器集成 | 28/28 |
| 原 Ant 4/5、Element Plus 固定样本 | 56/56，错误成功 0 |
| 原行为契约 | 16/16 |
| 资料 MCP 核心自检 | 通过 |
| 插件/skill 结构校验与发布包冒烟 | 通过；两个客户端共享 Chrome 与租约交接检查通过 |

Ant/Element 原始结果：`results/current-1789872409655.json`。计数包含预期拒绝场景，不等于 56 次成功填写。

新增 SD 组与路径场景位于 `tests/fixtures/sd-controls-regressions.html?extended=1`，通过 `stage0-direct-devtools.test.ts` 调用构建后的 MCP。独立的 `sdFixture()` 仅供测试断言读取，产品执行器不访问它。目标值为合成数据，测试使用隔离临时 Chrome Profile。

新增测试确认：同一次调用完成四个年月选择，另一条经历不变；重复 operation ID 不重放，同值新操作不再选择；有值冲突保留；至今可切换并核对结束状态；月份歧义和回滚不误报成功；同名末级不会替代不同父级；多弹层候选不串用；缺失或禁用节点明确失败。

首次基线单元测试受沙箱禁止 Unix socket 影响，1 项 debug bridge 测试报 EPERM；在允许本地测试 socket 的环境中完整回归通过。上游发布包缺失 source map 的 Vite 警告仍存在，不影响本轮测试结果。

## 范围与后续验收

- 日期组要求可见标题与明确子控件结构；六段年月日、未知布局、自绘至今开关不在新增范围。
- SD 地址验证的是多列菜单与完整路径回显；标签页式地址、就地替换单列、SD 多选、SD 自有日历面板仍需代表性样本。
- 当前只读调试列页结果为空，没有使用真实招聘表单执行新能力。真实网站填写与保存尚待用户指定页面后监督验收。
- 一次日期调用减少了 Agent 对四个子字段的独立工具往返；未测量模型端到端总耗时，不声明提速百分比。
- 本轮实现为原创代码，开源及商业样本只作为行为与边界参考，没有复制商业发布代码。

## 本地交付

- 候选包：`artifacts/resume-companion-0.18.0.zip`。
- SHA-256：`e040b05528657c2763d0db5dd39d47234608811674efc7c25eed5a8982e6b18d`。
- 本地已安装：`0.18.0+codex.20260920025159`。安装缓存的 bundle、权限配置和 skill 与候选包一致；两个 MCP 的运行版本与工具目录检查通过。
- 安装前确认旧浏览器仅剩新标签页；旧 Supervisor 已停止。客户端控制 socket 未开放，因此在新任务中加载新版，无需重启 Codex。简历资料与专用 Profile 保留。

## 重现

```sh
npm run typecheck
npm run build
npm run test:devtools --prefix plugins/resume-companion -- -t 'CSS-module|split year/month|SD cascader'
npm test
npm run test:core
npm run test:devtools
npm run test:controls
npm run test:controls:contracts
```
