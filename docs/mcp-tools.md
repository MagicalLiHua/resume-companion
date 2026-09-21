# MCP 工具与权限

0.24.0 使用资料与浏览器两个 MCP。`resume_companion` 管理本地多版本简历；`resume_browser` 通过 Browser Supervisor 共享一个专用 Chrome，并在固定的 Chrome DevTools MCP 1.9.0 浏览器底座上增加表单语义缓存、局部/增量观察、动态定位、事务式动作和输出脱敏。官方 Network、Console、截图与脚本诊断工具继续保留。

## ApplyMCP 资料工具

| 工具 | 作用 |
| --- | --- |
| `resume_status` | 返回资料目录、存储版本、资料数量和服务版本 |
| `resume_profile_list` | 返回资料 ID、名称、revision、更新时间和源 Markdown 状态 |
| `resume_profile_read` | 读取目录、栏目、记录或 `source_refs`；后续读取用 `expected_revision` 固定任务版本 |
| `resume_profile_save` | 创建资料，或用 `expected_revision` 更新资料 |
| `resume_prepare` | 根据已验证模板需求并集与已有资料生成一次性缺项表；默认不返回已有答案 |
| `resume_prepare_apply` | 按问题 ID、资料 revision、目录版本和问卷 ID 原子合并用户明确补充的答案 |

第一次 `resume_profile_read` 只传 `profile_id`，返回 `profile_revision`。同一填表任务后续所有读取都传这个值。资料被其他任务更新时，服务器返回 `profile_changed`，阻止 Agent 拼接两个版本。

### 一次性资料补充

`resume_prepare({profile_id,expected_revision})` 默认按全部已验证模板的已映射需求生成 Markdown，包含适用企业和稳定记录 ID 的结构化条目。它不把所有字段宣称为每家公司必填，也不包含开发中模板、声明和企业亲属任职问卷。已有手机号、邮箱直接复用，不要求另行本地录入；身份证号等证件号码单列 `local_only`，当前工具尚无私密录入或 PDF/DOCX 提取能力。

`offset`/`limit`（默认且最多 100）控制分页；`next_offset` 非空时继续读取，携带同一 revision 和 `expected_questionnaire_id`，最后合并成一份交给用户。只读工具不修改资料。后续当前企业检查可选 `scope="selected_modules"` 与 `targets=[{template_id,modules}]`；首次准备不因当前网站缺少模块而删掉其他已适配网站的准备项。

`resume_prepare_apply` 接收相同范围、`profile_id`、`expected_revision`、`catalog_version`、`questionnaire_id` 和 `answers`。每条用 `question_id` 绑定记录，`action="set"` 携带 `value`；`none` 仅用于无记录栏目。`not_applicable`、`withheld`、`deferred` 保存在原资料的保留命名空间 `preparation.status.*`，不会变成网站答案。默认不再问这些条目；`include_marked=true` 可查看，`reopen` 可重新开放。已有事实不能用此工具覆盖，更新冲突整批拒绝，不部分写入。

有新经历时先用 `resume_profile_save` 添加用户明确提供的完整记录，再以新 revision 生成表；不会凭“有”自动创造空白记录。补充表的学历、月份、布尔值、城市列表和薪资对象遵守现有资料 schema；使用 `items[].format`，不要猜税前税后或已获/预计学位。身份证等 `local_only` 值通过 apply 明文提交会被拒绝，但这不代表在调用前已发送给模型的内容能被撤回。

## Resume Browser 表单工具

| 工具 | 用途 |
| --- | --- |
| `form_journey` | 51job 分页表单的前台协调器：逐页准备、填写、验证并进入普通下一步；声明、附件和最终提交停止，Next 可能保存当前页 |
| `form_prepare` | 从指定资料 revision 与当前企业实际栏目求交集并只读生成计划；返回 module_selection、profile_only_sections、prepared_plan_id、覆盖摘要和分页差异 |
| `form_support` | 不传 page_ids 时列出可信平台、企业模板及证据；传入页面 ID 时检查来源、结构家族、实际模块、字段与分页目录，返回匹配级别及是否允许自动填写 |
| `form_run` | 校验整页计划并连续执行；支持 status/cancel/resume，不保存、不提交 |
| `form_observe` | 建立本地页面状态，并按 `overview`、`focus`、`delta` 或显式 `full` 返回带预算的语义结果 |
| `form_fill_fields` | 普通字段批填；或 `steps` 在单个已观察记录内顺序执行文本、选择和日期，遇到失败停止并返回进度 |
| `form_select_option` | 选择单层下拉、候选、radio 或 checkbox，并回读结果 |
| `form_select_path` | 在一次调用内完成省市区、专业分类、树等多级路径 |
| `form_set_date` | 写入一个完整日期或月份，只有最终值回读一致才成功 |
| `form_activate` | 聚焦、打开、关闭、添加记录、保存普通记录或进入普通下一步；阻止明显人工边界 |

新任务第一次执行任意浏览器工具时，会在当前原子操作完成后自动取得共享浏览器租约。旧任务仍可阅读其历史和使用资料工具，但浏览器调用返回 `browser_lease_revoked`。`browser_takeover` 用于用户明确要求旧任务重新接管的情况；它会反向撤销当前任务的浏览器租约。

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
| `evaluate_script` | 正常填写模式禁用任意脚本；仅隔离的本地合成测试可启用 |
| `take_snapshot`、`fill_form`、`fill`、`click`、`wait_for` | 表单事务无法处理时的显式原始回退 |

原始 UID 恢复层继续覆盖意外的 SPA 节点替换，但旧 UID 不再是新表单协议的身份。日常动作按字段语义即时重新定位。

照片及附件在正常流程中由用户在专用浏览器上传；即使传入 `user_authorized: true`，正常模式也不执行自动上传。工具仅保留给隔离合成测试验证底座，测试仍要求明确的文件输入框和授权标记。必填附件在本页其他普通字段完成后统一提醒，用户处理后恢复同一个 journey。

## 审批矩阵

| 策略 | 工具 |
| --- | --- |
| 自动批准 | 页面列表和选择、七个表单工具、快照/等待、请求列表、Console 列表/详情、截图、原始常规输入工具 |
| 每次提示 | `browser_takeover`、`evaluate_script`、`handle_dialog`、`get_network_request`、导航、新建/关闭页面、按键、键盘输入、拖拽 |
| 代码层拒绝（正常模式） | `upload_file`、`evaluate_script`、拖拽和坐标动作；不依赖客户端自动审批设置 |
| 禁用 | `lighthouse_audit` |
| 默认 | 其他未审查工具均为 `prompt` |

`form_activate` 的 intent 不包含最终提交、声明、上传或不可逆删除，并对明显目标文本做代码级阻止。招聘网站可能使用含义模糊的按钮，所以 skill 与人工监督仍是必要边界。

## 诊断约束

- Network 只用于解释异步搜索、校验或保存；不直接调用或重放网站写 API。
- 请求详情不传文件路径，不把正文写入诊断日志。
- `evaluate_script.args` 仅接受最新快照中的元素 UID 字符串，每项会解析为 DOM 元素；不接受普通 JSON 字符串参数。普通常量可用 JSON 字面量写入函数体。
- 正常模式不执行 `evaluate_script`；观测缺口用 `form_observe` 或快照报告。不能通过声称“只读脚本”绕过代码限制。
- Console 只在错误与当前操作的时间、组件或请求能对应时使用。
- 局部截图优先于整页截图；不启用实验性坐标点击。
- Performance Trace、模拟、Lighthouse、内存工具和文件上传不进入日常填表。

详细行为由插件中的 `resume-autofill` skill 和其 references 维护。


## 0.17 复杂控件接口

- `form_select_option`：`value` 为单选；`values` 为多选 Select 的目标集合。`selection_mode` 默认 `add`，`replace` 删除已有选项时需要 `overwrite=true`。
- `form_select_option` 与 `form_select_path` 均支持 `overwrite`，默认保留不同的已有值。折叠多选无法确认完整状态时明确停止。
- `form_set_date`：`value` 接受 `YYYY-MM-DD` 或 `YYYY-MM`；`range={start,end}` 操作组合范围控件。

### 0.18 分拆年月组

观察返回 `kind="date_group"` 时，可以把该组的 `ref` 直接传给日期工具。两个年/月子控件用 `value="2024-06"`；四个年/月子控件用 `range={start:"2024-06",end:"2026-07"}`。组内存在明确且唯一的“至今”复选框时，可用 `range={start:"2024-06",current:true}`，无需再给 `end_field` 或 `current_field`。

UD 的双输入起止年月也作为 `date_group` 返回，传显式 `range.start` 和 `range.end` 即可。该教育年月组不宣称支持“至今”。UD/Formily 重复记录会返回如“教育经历 / 第1条”的 `scope`；优先使用观察得到的字段 `ref` 或准确作用域，避免同名字段歧义。UD 单选由 `form_select_option` 处理；0.20 支持可识别的 UD 树复选多选，使用 `values` 并验证完整集合，其他未知变体仍需验收。

工具内部逐项选择、等待联动并复核整组；日期精度不足、选项歧义或已有值冲突会明确返回。该能力限定于已识别的 SD 年/月结构，不代表所有年月或日历实现都已支持。

SD 多列菜单也可通过 `form_select_path` 操作，要求最后回显完整路径。仅回显叶子、标签页换层、含义不明的中间层不在本轮验证范围。
- 分开的开始/结束控件可用 `range={start,end}` 加 `end_field`；至今用 `range={start,current:true}`、`end_field` 和 `current_field`。这些控件必须在同一作用域与文档内。
- 当前验证的组件样本是 Ant 4.24.16、Ant 5.14.0 和 Element Plus 2.14.6。日期时间、周/季度/仅年份、未知日期格式与折叠多选不在本批自动完成承诺内。

`verified_ui` 表示目标 UI 值已验证；`preserved` 即使 `ok=true` 也有 `verification.matched=false`，不能算目标完成。`partial`、`blocked` 和具体 `phase` 描述停止位置。普通保存返回 `action_dispatched`、`persistence=unknown`，并不宣称服务器已保存。

操作 ID 绑定参数、页面与文档。重复 ID 携带不同参数或跨导航返回 `operation_id_conflict`；过期结果返回 `operation_expired`，不会静默重放。继续部分完成的动作时先观察当前状态，再使用新 ID。

取消或超时不会回滚已经产生的 UI 变化。当前控件执行器停止派发后续动作、清理局部观察器，并等待已派发的命令收尾后释放互斥锁；进入最终提交、上传和声明仍由用户处理。

## 0.20：先盘点，再执行记录计划

`form_observe` 返回 `coverage`。大页面沿 `coverage.next_cursor` 续读，直到 `complete=true`；游标保存原目录，不代表后续页面变化。写入、导航或检测到结构变化后游标失效，应局部重新观察。全页准备只收集轻量字段及作用域，不需要全量 DOM 或所有候选。

`form_fill_fields` 必须只提供 `fields` 或 `steps` 之一。`steps` 要求一个已观察的 `scope`，支持 1–16 个顺序步骤，每个 fill 步骤最多 30 个字段；执行有 60 秒预算和取消信号，已派发命令收尾后停止。使用稳定 `operation_id` 处理 transport 重试。示例：

```json
{
  "page_id": 6,
  "scope": "教育经历 / 第1条",
  "operation_id": "education-record-1",
  "expected_generation": 3,
  "steps": [
    {"action":"fill","fields":[{"field":"学校名称","value":"示例大学"}]},
    {"action":"select","field":"学历","value":"本科"},
    {"action":"date","field":"起止时间","range":{"start":"2020-09","end":"2024-06"}}
  ]
}
```

工具内部串行执行并更新 generation；末尾再核对之前填写的字段。已有值冲突、候选失败或记录身份改变时返回 partial，列出 `blocked_step`、每步结果、最终 `verification` 和 `remaining_steps`。`next_step` 只是第一个尚未执行的步骤，不表示可跳过失败步骤。先修正失败与最终回读不匹配的项，再以新 ID 继续剩余计划。同 ID 重试返回旧结果，不重放整批。新增、保存、上传和最终提交不允许放入 steps。

`form_activate(intent="add_record")` 仅在目标范围确实新增一条可识别记录时返回 completed，并附 `added_records` 的作用域和字段摘要。未识别记录容器的网站可能返回 action_result_unknown，需核对后续状态，不盲目重试。普通保存仍返回 action_dispatched/persistence=unknown。

测试时 `include_test_ledger=true` 默认只返回 `test_run`：run ID、操作总数、分类计数和工具内累计动作耗时。详细操作用 `ledger_cursor`/`ledger_limit`（最多 25 条）单独获取；明细最多留 5,000 条，累计计数不截断，超过时显式给出 retained_from/cursor_gap。含明细的请求会占用其显式响应预算，日常全页盘点不请求明细。低层回退可附 `semantic_target` 和 `semantic_scope`，但仍标记 unverified。插件耗时不含模型响应，也不包含观察和所有客户端编排，不能当作完整任务耗时。

## 0.21：整页运行

先完成 `form_observe` 目录分页并保留 `navigation_id`、`observation_id` 与 `records[].binding`，再构造 `schema_version=1` 计划。`facts` 为去重值表 `{key:{value,source}}`；`records` 声明已有绑定或新增栏目，每条记录的 `steps` 使用语义标签、事实引用、动作和依赖。动作支持 fill/select/path/date，默认不覆盖。保护字段只能属于已绑定的已有记录。新记录至少有一个动作；已有记录可只有保留/缺资料说明。

`form_run(action="start", request_id, plan, defer_execution=true)` 在写入前返回运行及恢复凭据，然后 `resume(run_id)` 执行。也可省略 deferral 直接执行，但首次响应丢失时不能假定已拿到恢复凭据。同请求 ID 的相同计划只返回同一运行；不同内容拒绝。恢复凭据不要写进报告。

执行窗口 90 秒、单记录 30 秒、整页默认且最多 180 秒，窗口间隔计入预算。`paused_window` 后显式 resume；返回后没有后台写入。连接断开、取消、租约接管阻止后继派发并等待在途命令排空。status/cancel 不争用浏览器操作锁。跨连接恢复同时要求凭据和显式 browser_takeover；supervisor 重启后内存运行失效。

`revision={facts,retry_steps}` 仅修订未验证事实及明确失败的剩余项，不允许重试未知派发或改写已验证目标。计划最多 100 条记录、500 个动作、1 MiB；同时一个活动运行，最多 8 个运行保留 30 分钟。

`form_run` 和 `form_journey` 默认返回 `detail="summary"`：完整集合计数、结果分类、审计计数及最多 20 条异常，不再把全部成功步骤重复送入上下文。`collection_counts` 始终统计全量；异常可能从不同检查描述同一字段，不能相加当作独立字段数。报告不含事实明文。`completed` 只表示所计划目标 UI 核验通过且无已知必填/错误阻碍；仍需核对未计划字段和人工边界。`persistence=not_verified`，不等于已保存。

需要明细时调用 `action="status", detail="results"|"protected_fields"|"unresolved"|"manual_tasks"|"unplanned_fields"|"required_missing"|"invalid_fields"|"added_records"|"unassigned_created_records"|"uncertain_adds"|"pages"|"workflow_steps"`，携带 `offset`、`limit`（默认 20，最多 50）和摘要的 `expected_report_id`。按 `next_offset` 继续，返回 `report_changed` 时先读新摘要，禁止混合不同状态的分页。分页流程的步骤结果只代表当前问题页，范围由 `detail_scope` 标明；人工任务汇总已处理页面。`detail="full"` 仅供兼容和诊断，不作为日常填写循环。

`outcomes.protected_unchanged` 是完成最终回读后确认未变的保护字段数；`preserved` 是拒绝覆盖已有值的步骤数，不等于填写了不同的目标值。恢复执行会重新核验，旧错误和旧审计不冒充本次结果。

For a known optional singleton section whose Add button reveals ordinary fields, use record `mode="reveal"`. The section must contain no editable fields before activation; the executor verifies newly revealed fields and binds their scope. Repeated cards use `mode="new"`. Do not use reveal for uploads, declarations, or submission. Plans for synthetic testing set `test_mode=true`.

联动创建记录：如清除“没有实习经历”后网站自动生成第一条记录，将实习步骤的 depends_on 指向该开关步骤。执行器只接管该前置动作当场观察到且仍未变化的唯一记录，不按页面空白/序号猜测复用；多条候选则阻塞。`unassigned_created_records` 列出未被计划接管的联动记录。


## 0.22：可靠复用与 Moka SD

发现 socket 和启动锁使用按系统用户隔离的稳定目录，不受客户端 TMPDIR 差异影响。兼容探测旧服务端点；版本不一致时默认返回 `browser_upgrade_pending` 并保留未保存页面。更新脚本同样默认保留浏览器；明确授权后使用 `--restart-browser`，或在获准的单次启动环境设置 `RESUME_COMPANION_ALLOW_BROWSER_RESTART=1`。

- `form_activate(intent="close")` 在已关闭时幂等；仅关闭目标拥有的浮层，回读确认值没有变化。失败结果同时在顶层和 `error` 中返回最新 generation。
- `reveal` 可绑定展开后的直接字段或唯一新增卡片；未知新增不重复点击。
- Moka SD 的初始空卡片有明确记录绑定，优先复用后再新增。锁定姓名、手机、邮箱的标签分别读取。
- 已观察的 Moka 出生控件使用年月精度，显示年龄后缀不参与值比较；不能向月精度控件写入完整日期后宣称成功。拆分年月支持选年联动补月、移除占位符，按已提交的显示值保留日期组和子字段标签；不把搜索输入当已提交日期。
- 学校/专业搜索可使用 `form_select_option(query, allow_custom=true)`。整页 select 步骤对应 `query_from_value:true, allow_custom:true`，且只接受单个字符串事实。无精确候选时，只有已识别的控件内“添加学校/专业全称”入口会触发自定义输入；默认关闭该能力，搜索文本不算提交成功。
- 整页多选 `selection_mode="add"` 的最终核验目标为原有集合与新事实的并集，不把保留下来的选项误报为失败。

完整计划模板在插件 `skills/resume-autofill/references/whole-form-plan.md`，无需运行时翻阅验收脚本。以上是实现和已覆盖结构的约定，原站验收状态以验证范围为准。

## 北森 Phoenix 控件（0.23）

按 `input_mode` 规划：学校自动完成为 `choice`，必须搜索并点击词库中的准确候选；无候选且无自定义入口时返回缺项。城市/行业以数组传给 `form_select_option`，职业目录以标量传入，工具内部核对待选集合、点击局部确定并读取提交结果。日期按已观察的日/月精度填写；重复记录绑定栏目和卡片，不依赖重复 HTML ID。旧弹层的退场动画结束前不把动作视为关闭完成。

## 0.24 自动准备

完整流程为 `form_support({page_ids:[...]})` → 对允许填写的页面 `form_prepare({page_id,profile_id,expected_revision})` → `form_run({action:"start",request_id,prepared_plan_id})` → 立即 `form_run({action:"resume",run_id})`。start 默认延迟执行；与直接传入 plan 互斥。无需再把全页 facts 搬进模型上下文。

支持检查是当前工作区新增、尚未发布的接口。`supported_partial` 仅表示已知普通字段可填写；保存证据另列在企业模板的 `persistence`。`verified_template` 表示当前企业样本有直接证据，`compatible_platform` 表示可信平台来源和结构家族一致，可按实时扫描结果复用规则；后者不继承企业专用字段或保存证据。来源未登记的 `platform_candidate`、开发中模板、未知必填字段/模块、必填控件不兼容或分页目录变化均不产生可执行准备 ID。未知可选字段/模块成为提示项并跳过，已知普通字段仍可计划。已记录但尚无事实映射的控件列在 `known_unmapped_fields`；这不等于自动计划会填写它们。缺少可选模块不会判失败，亲属等人工项不阻塞单页普通填写。51job 仍按精确企业模板检查。检查在准备、恢复、语义动作及低层写入前执行；`test_mode` 无法绕过。合成回归仅在进程启用隔离测试、无头临时服务且页面为本地夹具时豁免平台目录。

差异通过 `form_prepare({action:"inspect",prepared_plan_id,offset})` 续读。`module_selection` 是页面模块与本地资料的交集：返回资料来源域、provided / none / unknown、决策及计划记录/步骤数；资料存在但页面没有相应模块时列在 `profile_only_sections` 和 `no_page_section`。资料库 schema 1.2 兼容旧资料；空数组不代表没有，不新增空记录。自定义问题可以 policy.bindings 绑定到已保存的 source_ref。只读准备不改写资料，不自行解析源 Markdown。

准备结果仅在当前任务进程内短期保存，10 分钟过期；租约或连接丢失时失效。执行前验证导航及页面值/结构，记录边界检查 profile revision。两个 MCP 须使用同一资料目录。

新记录使用 `deferred_steps` 标明尚待展开核验的候选步骤。自动生成计划在实际卡片没有该字段时返回 `not_exposed/page_field_absent`，不输入也不重试；不计入 `verified_ui`。手工计划的缺失目标仍报错。新增记录若没有任何实际验证成功的字段，保持未完成状态。


### 51job 分页填写（开发适配）

`form_journey({action:"start",request_id,page_id,profile_id,expected_revision})` 只读建立检查点；随后 `form_journey({action:"resume",journey_id})` 连续处理当前页和已确认的普通下一步。`paused_window` 沿用同一 ID；`needs_input` 查看 issue；`manual_boundary` 留给用户；`ready_for_review` 尚未提交。`status` / `cancel` 不等待正在执行的浏览器操作。

同 URL 的服务器翻页通过当前步骤和新文档验证。企业、简历地址、步骤目录或资料 revision 改变即停止；Next 结果不明时不重放。检查点只存当前进程，30 分钟失效，服务重启后从当前页面重新开始。跨连接恢复需要 resume_token 和已授权的 browser_takeover。完整使用与补充字段规则见插件的 `references/automatic-preparation.md`。


## 人工问题统一处理（当前源码）

企业亲属任职问题及其附属字段始终由用户填写，不使用资料中的历史“否”。单页简历即使该题必填，也先填完其余所有可填栏目，最后统一报告；分页网站仅在该页必填项阻止 Next 时暂停。普通家庭成员记录仍可填写。

`form_prepare` 返回 `manual_tasks`、`manual_task_count` 和 `manual_handling=fill_ordinary_then_report`；存在人工任务不代表其他普通字段必须等待。`form_observe` 的字段标注 `manual_reason`；运行摘要报告人工任务数量，`detail="manual_tasks"` 读取待办（完整诊断视图仍保留 `page_audit.manual_tasks`），不把 `partial` 宣称整份完成。

原生单选题按整组识别回答状态，用户选了“否”后不会因“是”未选而重复提醒。附件只选中文件仍为 `verification_required`；当前支持的上传完成标记或 51job 已加载照片预览可解除该门槛，仅是页面证据，不证明服务端持久化。

整页声明/附件由用户处理及点击该页 Next 后，`form_journey.resume` 可接上紧邻的下一页。只接受同企业、同简历地址、同步骤表及同资料 revision，且旧页没有需要在原地核验的普通字段；不跳过其他页面，不重放用户的 Next，记录为 `user_advanced_unverified`。最后一页仍由用户复核与提交。

### 后台与提醒

新流程中 `new_page.background` 默认 `true`，`select_page.bringToFront` 默认 `false`。主动前置窗口必须携带 `attention_reason=user_request|manual_action|error|completed`；除用户明确要求查看外，还必须提供稳定的 `attention_event_id`。同任务、页面和事件只前置一次；调用失败不消耗该事件。日常逐字段执行不应请求前置。用户接管时先取消运行；取消结果为 `cancelling` 时仍需等待当前动作退出，不把请求取消当作所有动作已经停止。

无头 MCP 测试验证参数与去重，不能替代 macOS/Windows 的实际窗口焦点验收。底座的 `emulateFocusedPage` 会影响 `visibilityState`，不能拿它证明窗口没有抢焦点。

自动规划、显式计划及 UID 输入均执行同一人工策略。UID 工具使用实际 DOM 的语义，不信任 `semantic_target` 提示。原始 Next/save 点击必须改用 `form_activate`；按键不能用 Enter 绕过页面边界。

`form_journey` 在人工暂停后可继续；先核对原有普通字段，再重新建立本页绑定。普通字段被用户同时修改时返回 `ordinary_fields_changed_during_manual_pause`，不覆盖它。附件上传结果未知或同页声明未处理时继续等待；不重放不确定的下一步。

`RESUME_COMPANION_TEST_DIAGNOSTICS=1` 仅用于开发夹具，还必须同时启用无头和临时 Supervisor，且页面为本地 HTTP、data 或 about:blank；对真实招聘域名仍禁用任意脚本。不得将此设置写进用户安装配置。
