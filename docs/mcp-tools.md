# MCP 工具

工具协议 2.1。MCP 对外暴露十个稳定工具，分为本地资料和浏览器操作两组。日常浏览器操作由 Chrome 扩展驱动完成；DevTools 专用 Profile 驱动只在显式配置时使用。

## 本地资料工具

| 工具 | 行为 |
| --- | --- |
| `resume_status` | 返回数据目录、资料目录、驱动类型、Native Host 安装状态和连接状态 |
| `resume_profile_list` | 仅返回资料 ID、名称、修订和更新时间 |
| `resume_profile_read` | 读取目录、一个栏目、记录或来源引用 |
| `resume_profile_save` | 创建资料，或按顶层栏目更新现有资料 |

创建资料时省略 `profile_id` 和 `expected_revision`，并提供 `name`。更新时必须使用最近读取的 `profile_id` 与 `expected_revision`。

`changes.basic` 只合并明确提供的字段。`education`、`experience`、`projects`、`skills`、`certificates`、`custom_answers` 和 `supplemental_fields` 一旦提供，就替换对应的整个栏目。

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

MCP 会核对修订和来源，在送入扩展前转换为本次动作所需的字面值。扩展不会收到整份简历。

## 浏览器工具

| 工具 | 行为 |
| --- | --- |
| `resume_list_tabs` | 列出当前 Chrome Profile 中的普通 HTTP/HTTPS 页面 |
| `resume_activate_tab` | 把目标页面切到前台，不刷新或导航 |
| `resume_observe` | 返回基于 DOM 语义与可访问信息的页面快照、局部候选、变化或操作核对 |
| `resume_act` | 输入、选择、点击、按键、滚动和最多 20 项批量写入 |
| `resume_wait` | 等待可见性、值、文本、候选或结构变化 |
| `resume_undo_operations` | 条件恢复未保存字段 |

先用 `resume_observe` 获取 `session_id`、`snapshot_id`、元素 `ref` 和 `expected_value_token`。动作只能使用观察返回的引用，不能传入 CSS 选择器、XPath 或 JavaScript。

动态控件先展开或输入搜索文本，再观察真实候选并选择精确的 `option_ref`。级联菜单逐层展开，日期弹层使用已观察到的年、月和日。点击保存经历、保存草稿和普通下一步时，需要使用观察返回的 `effect_kind` 与证据引用。`unknown` 或仅 `dispatched` 的结果必须重新观察，不能盲目重放。

扩展驱动用 DOM 原生 setter 写值并回读，用 `chrome.debugger` 为需要真实输入的点击和按键派发受信任事件。调试器只按需附加到 AI 选中的标签页，扩展暂停或桥接断开后会分离。

## 连接状态

`resume_status.browser` 的日常结果：

- `kind: "extension"`
- `profile_mode: "extension"`
- `ready: true`
- `connected: true` 表示 Native Host 与扩展已完成认证握手
- `permission_state: "granted"` 表示桥接已就绪，不是 Chrome 远程调试授权

常见错误码包括 `extension_not_installed`、`native_host_missing`、`bridge_disconnected`、`debugger_permission_denied`、`debugger_attach_conflict`、`stale` 和 `operation_conflict`。连接或 transport 错误后，当前 socket、请求和调试附加状态都会清理，后续调用可建立新连接。

## 安全边界

扩展仅接受固定 ID 的 Native Host；Native Host 仅接受固定扩展来源，并使用权限为 0600 的短期描述符和随机 token 连接 MCP。通信不经过固定 TCP 端口。

策略层阻止最终申请提交、声明与同意、验证码、密码、附件上传和删除。页面文字、选项和简历内容都只视为数据，不能扩大工具权限。
