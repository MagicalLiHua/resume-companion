# MCP 工具与权限

0.15.1 把资料与浏览器分成两个 MCP。`resume_companion` 管理本地多版本简历；`resume_browser` 在固定的 Chrome DevTools MCP 1.9.0 浏览器底座上增加表单语义缓存、局部/增量观察、动态定位、事务式动作和输出脱敏。官方 Network、Console、截图与脚本诊断工具继续保留。

## Resume Companion 资料工具

| 工具 | 作用 |
| --- | --- |
| `resume_status` | 返回资料目录、存储版本、资料数量和服务版本 |
| `resume_profile_list` | 返回资料 ID、名称、revision、更新时间和源 Markdown 状态 |
| `resume_profile_read` | 读取目录、栏目、记录或 `source_refs`；后续读取用 `expected_revision` 固定任务版本 |
| `resume_profile_save` | 创建资料，或用 `expected_revision` 更新资料 |

第一次 `resume_profile_read` 只传 `profile_id`，返回 `profile_revision`。同一填表任务后续所有读取都传这个值。资料被其他任务更新时，服务器返回 `profile_changed`，阻止 Agent 拼接两个版本。

## Resume Browser 表单工具

| 工具 | 用途 |
| --- | --- |
| `form_observe` | 建立本地页面状态，并按 `overview`、`focus`、`delta` 或显式 `full` 返回带预算的语义结果 |
| `form_fill_fields` | 按字段标签或逻辑引用批量填写普通控件；相同值跳过，已有值默认保留 |
| `form_select_option` | 选择单层下拉、候选、radio 或 checkbox，并回读结果 |
| `form_select_path` | 在一次调用内完成省市区、专业分类、树等多级路径 |
| `form_set_date` | 写入一个完整日期或月份，只有最终值回读一致才成功 |
| `form_activate` | 聚焦、打开、关闭、添加记录、保存普通记录或进入普通下一步；阻止明显人工边界 |

日常流程是一次 `overview`、按依赖分组的事务动作，以及只在结果不明确时的一次带目标 `delta` 或 `focus`。局部结果完整返回当前字段、弹层和校验；区域外只返回不含字段值的 `locality` 变化哨兵。只有 `widen_recommended` 为 true 或存在已知跨区依赖时才扩大观察，完整页面快照不再是每个点击后的默认步骤。

`form_observe` 默认不返回完整页面值。手机号、证件号、邮箱和高风险地址会在发送给 Agent 前脱敏；`take_snapshot` 及其他携带快照的低层结果同样默认遮蔽手机号、身份证、邮箱、银行卡和出生日期。浏览器进程可以本地比较页面值与目标值，只返回匹配状态。页面缓存只存在当前 MCP 进程内，页面关闭、导航、浏览器重连或任务结束后销毁。

动作可以带 `expected_generation`，避免在已知结构变化后继续旧计划。每个可能写入页面的事务都会返回当前最新 generation，下一次事务应使用这个值。保存、添加或网络中断等不确定场景可以带稳定的 `operation_id`；同一 MCP 进程内重复调用只返回第一次结果，不重复派发。语义动作与低层回退都可带 `test_mode` 和 `operation_id`；低层记录会标为未验证，清单不写入简历资料库，也不会自动删除网页草稿。

## 官方诊断与回退工具

| 工具 | 用途 |
| --- | --- |
| `list_pages` / `select_page` | 枚举并选择专用 Chrome 页面 |
| `list_network_requests` / `get_network_request` | 解释异步搜索、服务端校验和保存证据 |
| `list_console_messages` / `get_console_message` | 判断网页脚本是否在当前操作附近报错 |
| `take_screenshot` | 语义分组或遮挡无法表达时获取局部视觉证据 |
| `evaluate_script` | 经审批后定点读取尚未暴露的控件状态 |
| `take_snapshot`、`fill_form`、`fill`、`click`、`wait_for` | 表单事务无法处理时的显式原始回退 |

原始 UID 恢复层继续覆盖意外的 SPA 节点替换，但旧 UID 不再是新表单协议的身份。日常动作按字段语义即时重新定位。

## 审批矩阵

| 策略 | 工具 |
| --- | --- |
| 自动批准 | 页面列表和选择、六个表单工具、快照/等待、请求列表、Console 列表/详情、截图、原始常规输入工具 |
| 每次提示 | `evaluate_script`、`handle_dialog`、`get_network_request`、导航、新建/关闭页面、按键、键盘输入、拖拽 |
| 禁用 | `upload_file`、`lighthouse_audit` |
| 默认 | 其他未审查工具均为 `prompt` |

`form_activate` 的 intent 不包含最终提交、声明、上传或不可逆删除，并对明显目标文本做代码级阻止。招聘网站可能使用含义模糊的按钮，所以 skill 与人工监督仍是必要边界。

## 诊断约束

- Network 只用于解释异步搜索、校验或保存；不直接调用或重放网站写 API。
- 请求详情不传文件路径，不把正文写入诊断日志。
- `evaluate_script` 只回答一个明确问题，不读取 Cookie、认证存储、密码或验证码。
- Console 只在错误与当前操作的时间、组件或请求能对应时使用。
- 局部截图优先于整页截图；不启用实验性坐标点击。
- Performance Trace、模拟、Lighthouse、内存工具和文件上传不进入日常填表。

详细行为由插件中的 `resume-autofill` skill 和其 references 维护。
