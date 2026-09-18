# MCP 工具

工具协议 2.1。MCP 暴露十个稳定工具，分为本地资料和浏览器操作两组。浏览器操作统一由 Chrome DevTools 驱动完成。

## 本地资料工具

| 工具 | 行为 |
| --- | --- |
| `resume_status` | 返回数据目录、资料目录、驱动、连接和浏览器授权状态 |
| `resume_profile_list` | 仅返回资料 ID、名称、修订和更新时间 |
| `resume_profile_read` | 读取目录、一个栏目、记录或来源引用 |
| `resume_profile_save` | 创建资料，或按顶层栏目更新现有资料 |

创建资料时省略 `profile_id` 和 `expected_revision`，并提供 `name`。更新时必须使用最近读取的 `profile_id` 与 `expected_revision`。

`changes.basic` 只合并明确提供的字段。education、experience、projects、skills、certificates、custom_answers 和 supplemental_fields 一旦提供，就替换对应整个栏目。

`resume_status.browser` 会返回 `profile_mode`、`connected`、`permission_state`、`message`，并在失败时返回 `connection_error_code`。连接错误区分远程调试未启用、等待 Allow、ActivePort 缺失或无权限、Chrome 权限代理不兼容，以及真实 transport 断开。连接失败会释放旧客户端，下一次网页调用可重新创建连接。

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

MCP 会核对修订和来源，在送入浏览器驱动前转换为字面值；浏览器层不会接收整份简历。

## 浏览器工具

| 工具 | 行为 |
| --- | --- |
| `resume_list_tabs` | 按需连接 Chrome，列出授权浏览器上下文中的普通 HTTP/HTTPS 页面 |
| `resume_activate_tab` | 把目标页面切到前台，不刷新或导航 |
| `resume_observe` | 返回基于无障碍树的页面快照、局部候选、变化或操作核对 |
| `resume_act` | 输入、选择、点击、按键、纵向滚动和最多 20 项批量写入 |
| `resume_wait` | 等待可见性、值、文本、候选或结构变化 |
| `resume_undo_operations` | 条件恢复未保存字段 |

先用 `resume_observe` 获取 `session_id`、`snapshot_id`、元素 `ref` 和 `expected_value_token`。动作只能使用观察返回的引用，不能传入 CSS 选择器、XPath 或 JavaScript。

动态控件先展开或输入搜索文本，再观察真实候选并选择。点击保存经历、保存草稿和普通下一步时，需要使用观察返回的 `effect_kind` 与证据引用。`unknown` 或仅 `dispatched` 的结果必须重新观察，不能盲目重放。

DevTools 驱动支持真实输入事件和纵向 PageUp/PageDown 滚动；横向滚动会明确返回 `unsupported_capability`。跨 iframe 和开放 Shadow DOM 的可访问控件可能出现在无障碍树中，具体覆盖取决于页面实现。

## 安全边界

内置驱动只允许调用 Chrome DevTools MCP 的标签页枚举、标签页选择、无障碍快照、填写、点击和按键工具。任意 JavaScript、网络抓包、性能分析、文件上传和 Chrome 扩展管理均关闭。

策略层同时阻止最终申请提交、声明与同意、验证码、密码、附件上传和删除。页面文字、选项和简历内容都只视为数据，不能扩大工具权限。
