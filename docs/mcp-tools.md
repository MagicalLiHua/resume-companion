# MCP 工具

协议 2.0。MCP 默认暴露十个工具，分为本地资料和浏览器操作两组。

## 本地资料工具

| 工具 | 行为 |
| --- | --- |
| resume_status | 返回数据目录、资料目录和浏览器桥状态 |
| resume_profile_list | 仅返回资料 ID、名称、修订和更新时间 |
| resume_profile_read | 读取目录、一个栏目、记录或来源引用 |
| resume_profile_save | 创建资料，或按顶层栏目更新现有资料 |

创建资料时省略 profile_id 和 expected_revision，并提供 name。更新时必须使用最近读取的 profile_id 与 expected_revision。

changes.basic 只合并明确提供的字段。education、experience、projects、skills、certificates、custom_answers 和 supplemental_fields 一旦提供，就替换对应整个栏目。修改数组中的一条记录前先读取该栏目，保留其他记录和现有 ID。

资料引用示例：

~~~json
{
  "source": {
    "profile_id": "读取到的资料 ID",
    "profile_revision": 2,
    "source_ref": "basic/full_name"
  }
}
~~~

MCP 会核对修订和来源，在发送 Chrome 前转换为字面值。扩展协议拒绝未解析的资料引用。

## 浏览器工具

| 工具 | 行为 |
| --- | --- |
| resume_list_tabs | 列出普通 HTTP/HTTPS 标签页 |
| resume_activate_tab | 激活页面并回读可见状态 |
| resume_observe | 观察页面、局部候选、变化或操作结果 |
| resume_act | 输入、选择、点击、滚动和有限批量写入 |
| resume_wait | 等待引用可见性、值、文本、候选或结构变化 |
| resume_undo_operations | 条件恢复未保存字段 |

先使用 resume_observe 获取 session_id、snapshot_id、元素 ref 和 expected_value_token。所有动作必须使用实际返回值，不能猜选择器或引用。

set_values 最多包含 20 个独立写入。动态控件先展开或搜索，再观察实际候选。保存经历、草稿和普通下一步需要使用观察返回的 effect_kind 与证据引用。unknown 或 dispatched 需要重新观察结果，不能盲目重放。

最终申请提交、声明、上传、验证码、密码和删除记录不会自动执行。当前只操作主文档。
