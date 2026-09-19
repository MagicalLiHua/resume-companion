# MCP 工具与权限

0.14.0 把资料与浏览器分成两个 MCP。Agent 直接调用官方 Chrome DevTools MCP，不再经过 Resume Companion 的浏览器代理协议。兼容层在官方 UID 对应的节点已经脱离文档或 Locator 动作期间被替换时做一次语义重定位，不新增或改名官方工具。

## Resume Companion 资料工具

| 工具 | 作用 |
| --- | --- |
| `resume_status` | 返回资料目录、存储版本、资料数量和服务版本 |
| `resume_profile_list` | 返回资料 ID、名称、revision、更新时间和源 Markdown 状态 |
| `resume_profile_read` | 读取目录、栏目、记录或 `source_refs`；后续读取用 `expected_revision` 固定任务版本 |
| `resume_profile_save` | 创建资料，或用 `expected_revision` 更新资料 |

第一次 `resume_profile_read` 只传 `profile_id`，返回 `profile_revision`。同一填表任务后续所有读取都传这个值。资料被其他任务更新时，服务器返回 `profile_changed`，阻止 Agent 拼接两个版本。

更新 `basic` 时只合并提供的字段。更新教育、经历、项目、证书、自定义答案或补充字段时，传入的数组会替换整个栏目；应先读取、保留已有记录与 ID，再保存。

## 官方浏览器工具

主要常规工具：

| 工具 | 用途 |
| --- | --- |
| `list_pages` / `select_page` | 枚举并选择专用 Chrome 中的页面 |
| `take_snapshot` | 返回可访问性树和页面 UID |
| `fill_form` | 一次填写多个文本框、原生下拉、复选框和单选框 |
| `fill` / `click` / `hover` | 处理动态控件所需的基础动作 |
| `wait_for` | 等待任一指定文本，并在结果中附带新快照 |
| `list_network_requests` | 用小分页和 `xhr`/`fetch` 类型筛选相关请求 |
| `list_console_messages` / `get_console_message` | 在怀疑网页脚本故障时读取相关消息 |
| `take_screenshot` | 在语义快照不足时获取 UID 或当前视口图像 |
| `evaluate_script` | 经审批后读取指定元素的少量公开状态 |

`fill_form(includeSnapshot=true)` 是普通页面的首选：一次快照、一次批量填写、直接复用附带的新快照。上游会按数组顺序处理元素；后项失败时前项可能已成功，所以恢复前必须重新观察，不能整批重放。

截图用于理解布局，操作仍使用 UID。0.14.0 不启用实验性 `click_at`。

当 SPA 在快照后或 Locator 动作期间替换节点时，运行时会核对旧句柄的 `isConnected`。失效后只按相同角色、可访问名称和最近的命名分组恢复；多个候选无法可靠区分时返回 `stale_uid_ambiguous`，当前页面找不到唯一候选时返回 `stale_uid_unresolved`。`fill` 会先核对目标值再决定是否重试；`click` 只有在 Locator 尚未进入真实动作时才重试。点击已开始则返回 `stale_action_result_unknown`，一次恢复仍失败则返回 `stale_action_retry_exhausted`。收到这些错误后必须重新观察当前值和页面结构。

## 审批矩阵

| 策略 | 工具 |
| --- | --- |
| 自动批准 | `list_pages`、`select_page`、`take_snapshot`、`wait_for`、请求列表、Console 列表/详情、截图、`fill_form`、`fill`、`click`、`hover` |
| 每次提示 | `evaluate_script`、`handle_dialog`、`get_network_request`、`navigate_page`、`new_page`、`close_page`、`press_key`、`type_text`、`drag` |
| 禁用 | `upload_file`、`lighthouse_audit` |
| 默认 | 其他未审查工具均为 `prompt` |

逐工具审批按工具名生效，不能判断某个具体按钮是不是最终提交。最终提交边界仍依赖 skill、页面证据和人工监督。0.14.0 不宣传参数级强制防误投递。

## 诊断约束

- Network 只用于解释异步搜索、校验或保存；不直接调用或重放网站写 API。
- 请求详情不传文件路径，不把正文写入诊断日志。
- `evaluate_script` 只做针对 UID 的只读查询，设置 `waitForStableDom:false`；不读取 Cookie、认证存储、密码或验证码。
- Console 只在错误与当前操作的时间、组件或请求能对应时使用。
- 局部截图优先于整页截图。
- Performance Trace、模拟、Lighthouse、内存工具和文件上传不进入日常填表。

详细行为由插件中的 `resume-autofill` skill 和其 references 维护。
