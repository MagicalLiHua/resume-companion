# MCP 基础工具

协议 1.0；默认工具集 `core`。源代码契约位于 `plugins/resume-companion/protocol.ts`，完整策略在同目录的 `skills/resume-autofill/SKILL.md`。

## 八个工具

| 工具 | 主要输入 | 输出与用途 |
| --- | --- | --- |
| `resume_status` | 无 | 连接状态、能力和正式简历版本目录 |
| `resume_list_tabs` | 可选 `url_contains` | 可操作网页的标签页 ID |
| `resume_activate_tab` | `tab_id` | 激活页面，核对实际可见状态 |
| `resume_read_profile` | `version_id`，可选栏目/记录/来源引用 | 分页读取所需正式事实，空值表示未知 |
| `resume_observe` | `tab_id` 或 `session_id` 二选一 | 页面与局部观察、变化、操作核对 |
| `resume_act` | 会话、快照、操作 ID 和动作 | 有边界的 DOM 操作与逐项回执 |
| `resume_wait` | 会话、快照、条件及超时 | 等待可见性、候选就绪、结构或值变化 |
| `resume_undo_operations` | 会话、目标操作 ID 列表、新操作 ID | 有条件恢复未保存的字段操作 |

## 观察与填写

1. 检查桥接，选择目标标签页和正式简历版本。
2. 用 `observe(tab_id)` 获取页面快照；按需要读取资料栏目。
3. 根据返回的元素引用与当前值，调用 `act`。动态控件先展开或搜索，再用 `detail` 检查真实候选。
4. 检查回执和页面验证提示；保存记录后核对新增卡片的关键值。
5. 进入普通下一步后重新观察。完成所有已授权栏目后，汇总未完成项并停在最终提交前。

写入示例，所有占位值必须替换为工具实际返回的值，不能猜测元素引用：

```json
{
  "session_id": "<观察返回的 session_id>",
  "snapshot_id": "<观察返回的 snapshot_id>",
  "operation_id": "<本次新操作的唯一 ID>",
  "action": {
    "kind": "set_value",
    "ref": "<字段 ref>",
    "expected_value_token": "<字段当前值 token>",
    "value": {
      "source": {
        "version_id": "<已选择的正式版本 ID>",
        "profile_revision": 1,
        "source_ref": "basic/full_name"
      }
    }
  }
}
```

`profile_revision` 使用读取资料返回的真实修订号。用户明确提供的补充事实或授权虚构测试可以使用 `value.literal`。缺失事实不由工具补造。

## 关键约束

- `overview` 给出已渲染元素摘要；`detail` 查看作用域/控件关系与候选；`changes` 使用先前快照；`verify` 必须提供 `operation_ids`。
- 观察有字节与条数上限，使用 `next_cursor` 分页。虚拟列表只暴露已渲染候选，滚动后重新观察。
- `set_values` 最多 20 个独立字段。依赖另一操作的动态控件不能提前排成一串猜测动作。
- `select_option` 的 `option_ref` 与 `option_value` 二选一；搜索输入不等于完成选中。
- 点击必须带观察返回的 `effect_kind`；保存和前进还要带页面证据引用。调用者将未知按钮标成“保存”不会放宽策略。
- 键盘动作仅提供 Escape、方向键、Home、End；不提供可能隐式提交表单的 Enter 或任意脚本执行。
- 同操作 ID、同参数返回原回执；不同参数复用 ID 会拒绝。
- 取消会中止后续 core 动作，已经派发的网站保存不能撤回。
- `applied`、字段有效性、网页保存回显是不同概念。`unknown` / `dispatched` 先观察结果，不直接重放保存。
- `ui_acknowledged` 只说明网页已回显相应记录，不承诺网站后台事务状态。
- 撤销会保护用户后续手改，不能回滚已经保存的网站记录。

最终申请提交、声明确认、上传、验证码、密码和删除记录不提供自动执行能力。主文档外的 iframe/Shadow DOM 或可信事件要求可能需要人工处理。

## 兼容模式

`RESUME_COMPANION_TOOLSET` 在 MCP 启动时指定：`core` 八工具、`legacy` 十四工具、`all` 十九工具。后两种为原有单轮预览/批量接口和迁移排错保留。旧执行器不具备 core 的逐动作取消及完整连续保存语义，新任务使用 core。

本地桥接使用固定 `127.0.0.1:43117` 和扩展来源检查。修改 MCP 的端口变量不会自动修改扩展的连接地址和 CSP；这些变量主要用于测试，不是普通用户的即改即用设置。
