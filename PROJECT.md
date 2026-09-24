# 飞书本地 Codex 机器人 — 项目状态

## 项目目标
让用户在飞书中与本机 Codex 交互，由本地 Node.js 服务通过 stdio / JSON-RPC 调用 codex app-server，并通过飞书长连接收发消息、卡片和附件。

## 当前任务：Issue #10 Group Request Queue

Task Source：[Issue #10](https://github.com/dccaoxy/codex-feishu-bot/issues/10)，用户要求读取AGENTS并执行。核实PR #7、#9均已合并，从最新main `51db514`创建独立分支 `codex/issue-10-group-queue`；PR #5仍open、未合并，head `53c8575`。用户已明确允许完成自动测试后更新原单群候选、仅重启机器人，不重启Desktop、不Merge。

### 实现与关键决定

- 群本地SQLite新增group_requests，保存可信live event认领与FIFO序号，message_id唯一；与消息状态事务入队。历史补录不生成请求，重复投递不重复入队。
- 每群一个活动请求，全局两个；全局或同群忙时queued，不再静默busy丢弃。每条独立Turn沿用Persistent Group Thread，无语义合并/群steer，单聊不改。
- 默认每群10条等待队列、配置硬上限20。满额记录queue_full并一次提示，正常排队不刷屏；提示不确定不重发。排队正文从模型增量/检索结果中排除，轮到请求再提供。
- 重启仅恢复明确queued；running/sending变uncertain，同群后续全部暂停，需Owner本机核验结果并明确处置，不自动跳过。close保留queued且不消费，活动未决fail closed。
- queued撤回删除正文/取消该请求，不影响当前A；已执行消息撤回、退群/授权撤销/retention失效取消本群活动与排队并保持隐私清理。Owner网关同FIFO、出队和发送前授权复核，额外检测读取期间资源范围变化。

### 验证与交接

本分支check及113项自动测试通过；保留PR #5的隔离组合check与146项测试通过（含单聊原有行为）。真实Codex doctor登录/7模型、无模型smoke、首次/恢复10项工具隔离探针通过。新增队列测试覆盖FIFO/同任务、双worker/全局等待、queued/running撤回、退出/撤权、close及重启uncertain屏障、历史不执行、重复/满额提示、Owner共享队列及撤权，原PR #7/#9回归保留。

真实群A/B/C三场景尚未验证，不得将模拟模型调用或连接就绪视为真实验收。2026-09-24 21:14已按本次授权部署源码 `925b695` 到原单群候选。部署前确认无活动请求，备份源码/本地配置与群SQLite快照（忽略目录data/issue10-queue-backup-20260924211427）；配置字节不变、未涉及的源码哈希不变，保留PR #5。实际候选check/146项测试/doctor/smoke通过，机器人重启后Codex和飞书长连接ready。Desktop/共享App Server与服务配置未改。

已提交、推送并创建[Draft PR #11](https://github.com/dccaoxy/codex-feishu-bot/pull/11)。真实A（重叠2条）/B（连续3条）/C（撤回queued）等待用户在原群发送测试消息；之后核对后台同一Thread顺序Turn与逐条回复。保持Draft，真实验收完成后才转Ready，不自动Merge。

## 已合并历史：Issue #8 Owner Resource Gateway（审核返工完成，提交复审）

Task Source：[Issue #8](https://github.com/dccaoxy/codex-feishu-bot/issues/8)，用户要求执行。独立分支 `codex/issue-8-owner-gateway`，从 main `bf2e01d` 开始；已核实 PR #7 合并，PR #5 仍未合并、head `53c8575`。不将 PR #5 能力假定为主线能力。

### 实现与决定

- 默认关闭的 Owner Gateway，以可信 live event sender 与当前绑定 Owner 精确匹配、群 allowlist、当前明确 `/owner` 指令作为入口；调用前、读取后和发送前重新检查授权与取消。普通成员在模型调用前拒绝。群工具仍仅包含本群查询，模型/历史资料不能调用网关。
- 首版明确命令 Search / 分页 Read / Reference / SQLite Read + Compute；不实现自然语言自动选择私人资源。这样不需要更换已有群 Thread 的工具清单，也不把 Owner 工具长期暴露给普通成员。结果脱敏后作为有限参考进入当前 Persistent Group Thread；后续同群成员可讨论已披露结果，不能以此申请新资源。
- 私人任务仅 thread/list、thread/turns/list、无 turns 的 thread/read；不执行 attach/resume/work/steer/stop、审批或其他控制。分页接口失败不回退完整历史读取，不复制全库。
- 实现前确认用户已有新羽 SQLite 快照，仅调查表名与结构类型、没有读取行或发送群内。首版只实现 SQLite 驱动：本地资源 ID / 表 / 列 allowlist、只读连接、authorizer、无任意 SQL/shell/path 参数、拒绝 symlink，默认2秒取消期限/100行/结果字符上限。Node 最低24.10（authorizer）。确定性 filter/group/sum/avg/min/max/count、difference/ratio/growth；0分母返回 null。
- 原始错误和本地配置不输出到群；已知凭据与常见秘密/路径脱敏。任意文本秘密无法由模式规则完全识别，真实资源应只登记必要表列。已授权引用成为本群上下文，不自动跟随私人源撤回；原群撤回/退群/retention 清理保持原有机制。
- 飞书文档/多维表格实时读取、其他驱动、Digest/Topic Memory 未实现；原群文档明确命令流程保持。

### 验证与状态

- 本分支 check、84项自动测试通过；含 Owner/伪造身份/群隔离、只读分页/工具输出剔除、无整历史回退、只读文件校验、未登记表列/SQL/路径拒绝、symlink、超量/超时/取消、聚合与派生计算核对。
- 已运行真实 Codex doctor（已登录、7模型）、smoke（无模型调用），以及本机真实二进制隔离探针：初建/重启恢复10项对抗调用通过。未将这些检查当作真实模型或飞书验收。
- 将现有 PR #5 + PR #7 候选源码复制至本分支忽略的 `data/issue8-combination`，仅叠加网关改动；117项组合测试及 check 通过。没有修改运行中的候选服务。
- 已修改、已本地测试；真实私人 Thread 搜索、限定读取与下一轮讨论已验证；数据库真实群两轮验收见下方。首轮未部署；本轮统计数据测试部署与核验详见下方。未安装新服务、未重启 Desktop/共享 App Server、未 Merge。提交和 Draft PR 见本分支交付记录。

### 未完成与交接断点

用户已授权使用“新羽学员信息”中的数据库。核对该任务当前输出，选择最新分组名单快照（不是早期旧版数据库）；只登记 students.squad_no，允许 count/group 等统计，姓名、ITCODE、导师等字段未开放。真实只读网关计算与独立 SQL 结果一致：58人、14队，第7与11队各5人、其他队各4人；查询前后源文件 SHA-256 一致。资源路径/结果证据仅存本机忽略目录，不提交 Git。

2026-09-24 已沿用既有单群测试部署授权，将网关加载到原 `data/issue6-candidate`，保留 PR #5 功能；privateThreads=false，只开放上述统计资源。替换前备份，检查与117项组合测试通过后仅重启机器人，日志确认 Codex 连接与飞书长连接恢复。未改 Desktop/Shared App Server、未改 launchd 配置、未写源数据库。回滚副本在 Issue #8 worktree 的 `data/issue8-live-backup-20260924185243`（含本地配置，勿提交）；核验记录 `data/issue8-xinyu-verification.json`。未主动发群消息。

用户提供的 2026-09-24 19:17 飞书截图确认：Owner 在原测试群 @ 发起 `/owner query xinyu_students` 后，机器人正确返回58人、14队及分组人数；再次 @ 追问，正确回答第7、11队人数最多，各5人。数据库查询→群回复→下一轮延续讨论的真实界面验收通过，与独立只读核验一致。此证据为用户截图，不声称本轮额外核验了底层 thread ID。数据库阶段私人 Thread 读取关闭；后续限定片段授权及加载见下文。数据库测试加载不代表私人读取验收或完整 Issue 完成。

用户随后明确同意使用“新羽学员信息”的数据库完成总结进行私人读取验收。新增本地 threadScopes（任务ID→消息item ID）限制，搜索只返回指定任务、读取只返回批准片段，其他任务RPC前拒绝。单测85项通过；真实共享 App Server 标题搜索匹配，分页读取仅返回批准的1条总结并隐藏本地路径，未执行源任务控制或模型Turn。该预检不是群Owner实时事件验收。

仅原测试群加载此范围配置，保留数据库小队统计配置；候选check/118项组合测试通过。只重启机器人；用户已完成真实 @ 搜索、读取总结与下一轮追问。私人Thread/消息ID与本机配置仅存忽略目录，不进入Git。

2026-09-24 真实私人任务验收：截图与本地群库记录交叉核对，19:52:54 搜索完成，19:53:08 读取完成；19:53:18 提前追问标记 busy 未执行，19:53:42 重发后完成，19:53:53 正确回答58人、14队及更新需重新导入。当前绑定 idle、pending_cursor=null。非Owner/伪造身份拒绝由自动测试覆盖；真实多页资料翻页未另行实测，游标行为由自动测试覆盖。

Issue #8 本轮首版验收完成，用户要求提交 PR。更新 PR #9 描述并从 Draft 转 Ready 触发自动审核，等待 PASS / NEEDS CHANGES；不自动Merge、不自动进入下一阶段。最新源码测试85项、组合118项通过。忙时请求不排队且无提示是既有已确认限制，未在本Issue扩展队列；自然语言路由与其他数据库驱动仍不支持。

### PR #9 审核返工（2026-09-24）

需求来源：用户要求读取审核结果并返工；[NEEDS CHANGES](https://github.com/dccaoxy/codex-feishu-bot/pull/9#issuecomment-5813789902) 针对 `1351826`。PR 已转回 Draft 后在原分支修复，代码提交 `e791d5f`（refs #8）。

此前85项单测、118项组合测试及真实群正常流程验收仍是历史事实，但未覆盖此次发现的排队撤权竞态、截断后PEM泄漏和原生SQLite无法及时终止，不能据此声称这些异常边界通过。

- 发送前的检查移入真实 Feishu.call 排队回调，紧邻 transport，同时保留入队前检查。Owner变更、群allowlist撤销、群内另一条消息撤回、退群、close 均重新检查并丢弃待发送结果，不能标记 done；错误提示也受同样发送检查。
- 私人消息全文先脱敏再按1500/12000字符裁剪；缺失END的PRIVATE KEY块保守隐藏到文本结尾。测试生成2048位RSA私钥、跨1500边界已知密钥、不完整PEM和总预算耗尽；检查网关返回、GroupAssistant模型输入与实际发送内容均不含密钥片段。
- SQLite改为固定脚本独立子进程，空继承环境、无shell/任意程序入口；默认2秒取消或Abort触发SIGKILL，等待close后再返回。不会提前拒绝但留扫描在后台。保留只读、authorizer和表列限制。两秒不是严格墙钟保证：还需事件循环调度、OS终止与回收时间。
- 本轮check与93项单测通过；保留PR #5功能的隔离组合check与126项测试通过。新增8项回归使用真实Feishu.call队列（仅transport/mock model模拟）；SQLite使用真实原生聚合，默认期限测试2000万行，执行开始通知后触发期限，2006ms返回且PID已消失、独占数据库锁可取得；主动取消测试400万行，执行开始50ms后取消，1ms完成回收。计时不含生成测试库。并未将启动阶段1ms超时作为原生扫描终止证据。
- 真实Codex doctor握手、登录、7模型与无模型smoke通过；本轮没有真实模型或飞书调用，没有远程CI运行证据。新修复未部署至现有单群测试服务；运行服务仍为此前限定总结/小队统计的旧候选。未重启机器人、Desktop或共享App Server，未Merge。
- 下一步：将本次修复推送并转Ready触发复审；等待PASS/NEEDS CHANGES。复审后再安排单群候选更新与真实环境回归，不扩大资源或群授权。

## 已合并历史：Issue #6 / PR #7（2026-09-24）

Task Source：[Issue #6 最新架构评论](https://github.com/dccaoxy/codex-feishu-bot/issues/6#issuecomment-5810293841)，用户要求继续 PR #7。分支 `codex/issue-6-group-assistant`。旧 head `53a6917` 的自动审核 PASS 仅覆盖旧 ephemeral 架构，不覆盖本轮。

### 当前实现

- **Persistent Group Thread 取代每次 @ 的 ephemeral Thread**：每群独立稳定 HOME 与工作目录，持久化 thread ID、恢复状态和 context cursor；后续 @ 启动相同任务的 Turn，进程重启通过 thread/resume 恢复。创建结果不确定时停止，不静默创建替代任务。首个 @ 才建立模型任务；此前完整资料存放在群库，不为消息搬运启动模型。
- **完整历史与自动补录**：首次启用逐页读取到 API 无下一页；原始 content 与消息 ID 保留。每页事务同时提交数据、page token、固定时间边界与目标锚点。启动及每 60 秒进行 reconciliation，只在上次完成同步的 message ID 锚点重合时停止；实时入库不能充当连续历史证据。维护同步状态、最早/最新消息标识、last_reconciled_at 和最近 live event 时间。
- **普通消息零 Turn**；历史 @ 只记录，重启前延迟事件不执行。实时消息与历史页竞态时，原子领取当前 @，重复事件不重复执行。忙时 @ 仍不排队。
- **上下文有界**：确认本机协议后未使用实验性原始注入或 UNSTABLE history 覆盖。每次 @ 提供有限增量及明确 hasMore/cursor，group_changes、group_message 分段、group_search/group_context 可回查完整本群历史；cursor 仅表示已成功提供的预览范围，不冒充全文已吸收。默认 retentionDays=null；有限保留需显式配置。原始记录不因模型上下文限制删除。
- **资源引用**：记录 Feishu/Lark docx/docs/base/wiki/sheets 类型、ID和链接，结合原消息记录分享者、时间和来源；不自动下载全文、不把链接当权限。附件仍只保存引用，未识别内容。
- **隔离保留**：固定已验证 Codex 版本、无执行环境、禁用个人插件/MCP/记忆、群工具按 chat 封闭。撤回/退群/有限保留清理会使已吸收内容的任务失效并清理该群模型目录；后续合法请求重建，是隐私清理所需的正常固定 ID 例外。Owner 私人资源 Gateway、Daily Digest 等后续阶段未实现。

### 本轮验证与部署

- 已修改，`npm run check`、本分支 **53 项**测试通过，包含历史分页断点重启、实时交叠、旧 @ 不重放、1000 条普通消息零 Turn 后检索早期事实、长文本分段、资源引用、双群绑定持久化与隔离、撤回清理。已有单聊测试保留。
- 真实 Codex doctor/smoke 通过；真实协议隔离探针在首次任务与重启 resume 后各执行 5 类对抗调用，共 **10 项**通过。独立真实模型两轮合成口令测试跨 GroupModel/SQLite 关闭重开后 ID 相同且记住口令。该测试不冒充真实用户群 @。
- 保留 PR #5 的本机候选包 **86 项**组合测试及 check 通过。单聊共享连接 doctor 通过。只对用户已授权的一个测试群启用；未重启 Desktop 或 Shared App Server。
- **真实历史同步**：2026-09-24 16:26（北京时间）首次同步到 902 条，historical_sync=complete。此 complete 表示 API 可读取范围搬运完成，不代表所有消息已进入模型上下文。
- **真实离线补录**：16:38 停止唯一飞书长连接，独立 REST 发送两条明确标注的验收消息，再启动服务；群库由 902 增至 904，两个 message ID 各一条且 state=recorded，历史同步 complete，无新模型任务或回复。不是断网/整机重启实测；旧 @ 不执行由自动测试覆盖。
- **测试部署位置**：原 checkout 的忽略目录 `data/issue6-candidate`，共用原单聊数据库，群库为独立 `data/groups`。本轮候选源码/配置备份在 `data/issue6-persistent-backup-20260924162415`，另有 SQLite 一致性备份；原 launchd 备份仍在 `data/issue6-backup`。回滚只处理 `io.codex.feishu-bot`，不回灌旧单聊数据库覆盖新历史，不动共享服务。

### 回复展示修正（用户当前要求）

用户明确不需要每条回复后的大段来源编号与诊断。已删除桥接层自动追加的来源/计数/同步状态尾注，并更新新建与恢复任务的回复指令：普通对话只给答案，明确询问来源时再提供相关来源，资料不足影响结论时简短说明。底层消息和引用不删除。历史已发消息不回写。53 项分支测试和 86 项候选组合测试、check 与 doctor 验证；候选包仅更新群回复代码并重启机器人，Desktop/Shared App Server 不变。新展示尚待用户下一条消息确认。

### 审核返工：持久目录清理

Task Source：PR #7 审核评论 5811433295，用户要求返工。旧版活动文档/slash job 只有 abort，没有进入模型 finally，导致持久目录可能残留；此前关于无条件清理的描述过强。

修复：失效时标记当前 job 并取消；所有 job 共用 finally，在 respond（含模型 RPC close）结束后清理真实群目录，再释放 job。无活动 job 仍立即清理。补充历史同步后与模型启动前的取消检查，避免取消后重置失效状态。不会撤销取消前已提交的外部写入。

新增8项隔离目录回归：文档转换在途时退群/撤回/保留到期，slash分发前撤回，模拟模型RPC延迟关闭时退群/撤回，以及空闲清理和停止群数据库重开。断言实际目录删除、清理顺序、零后续创建/回复、失效状态及重启拒绝恢复。61项分支测试、94项含PR #5组合测试、check、doctor、smoke通过。仅原授权候选机器人已更新并重启，Desktop/Shared App Server未重启；真实飞书撤回/退群事件未执行，不冒充实际群事件验收。

### 交接断点与尚未完成

- 17:14 用户截图证实连续两次真实 @ 正确记住并回答上一轮测试代号。后台核对：唯一群绑定 idle、cursor=33、同一持久化 session 含两次完成记录；群 done 由1增至3。真实连续对话验收通过。
- PR #7 于回复修正后转 Ready，head `578b02b` 审核为 NEEDS CHANGES。本轮已退回 Draft 修复下述问题；修复提交后重新转 Ready 审核，旧 PASS 不覆盖新 head。不 Merge，Issue 保持打开。
- 群文档写入/另一真实成员权限/真实撤回与退群事件、极限 Context Window 与长期稳定性仍未完整实测。分页 token 失效保留 failed，不自动抹掉断点；需人工核对后恢复。消息编辑不持续追踪，未实现资源版本快照。历史 API 未提供的或已撤回内容不承诺恢复。
- 后续 Agent 先核对候选运行目录、群任务状态与用户验收结果，再决定是否需要重启；不要反复打断真实 @。

## 旧基础群版本验收（已被新架构取代）

2026-09-24 15:19 用户截图与数据库证实未 @ 库存消息被静默记录，随后 @ 回复正确数量及来源。旧版 44 项独立/77 项组合测试通过，head `53a6917` 自动审核 PASS。该证据只证明旧 ephemeral 基础链路。此前一个重启中断请求 failed 且未重放，保留原记录。Markdown 表格仍以文本显示，未声称原生表格渲染。

## 既有主线状态（历史记录）
根据 README：
- 已支持飞书单聊、流式卡片、审批/澄清、附件、会话切换、跨会话只读引用、模型/思考强度切换和 launchd 自动启动。
- 本地配置、账号绑定、SQLite、日志、附件和 Codex 工作目录不进入 Git。
- 真实凭据使用 config.local.json，本仓库只保留 config.example.json。
- 默认不支持群聊、多用户、实时语音、定时任务和桌面界面同步。
- 当前仓库已经公开。

## 已完成
- README 已覆盖安装、飞书权限、运行、诊断、恢复和边界。
- 已建立 AGENTS.md 与 PROJECT.md 作为长期 Agent 接续入口。
- Issue #2 的外部 Thread 只读访问已在当前 Mac 的本地配置中启用；仓库示例配置仍默认为关闭。机器人已重启，代码仍禁止切换或分支外部 Thread。

## 关键决定
- 飞书只是交互界面，Codex 仍在本机执行。
- 不通过 Git 同步凭据、登录状态或本地会话数据库。
- 每台同时在线主机优先使用独立飞书应用。
- 跨会话外部读取默认关闭，必须显式开启。

## 未解决问题
- 不同机器之间的长期 Context 仍需依赖共享项目仓库或独立 Memory 系统，而不是本机器人数据库。
- 真实租户权限、卡片客户端渲染和升级后协议兼容仍需持续验证。
- 当前第一版不解决跨设备接管本地正在执行的任务。
- Issue #2 的飞书客户端 `/threads`、修复后的 `/read 1` 和 `/reference 1` 已由用户回传结果验证；用户已回传自然语言查询得到的 15 项列表；自主读取工具仍待单独验证。

## 下一步
1. 自然语言自主读取工具仍待单独实测；用户已确认更新时间展示成功，命令方式的搜索、读取、引用和自然语言列表已验证。
2. 按 Issue #3 的阶段顺序，先设计 Work/Attach 的并发与控制边界，再考虑 Full 权限；不得把外部会话只读开关当作控制授权。
3. 每次功能扩展同步更新 README 与本文件，记录真实环境的验证时间和边界。

## 最近交接：Issue #2（2026-09-19，当前 Mac）
- **代码已修改**：修正 `/use` 及 `/threads` 列表中对外部会话的误导性提示；列表明确区分机器人会话与只读的外部会话。将每个单聊最近一次 `/threads` 的编号保存在本地数据库，重启后仍可解析；缺失或越界编号会提示重新列出，不再传给 Codex 当作会话 ID。读取与控制边界的原有实现未改动。
- **本机已配置和部署**：`config.local.json` 的 `codex.allowExternalThreadRead` 已设为 `true`，文件权限 600，仍被 Git 忽略；launchd 服务重启后为 running。其他机器克隆仓库时仍使用默认 `false`。
- **测试已通过**：`npm run check`、`npm test`（30 项，含重启后编号恢复）、`npm run doctor`、`npm run smoke`。
- **真实 Codex 已验证**：通过当前 Mac 的 app-server 在 15 个候选会话中找到一个非机器人会话，并只读获取最近 8 个回合。编号修复部署后，另用真实 app-server 对已恢复的单聊执行 `/read 1` 命令路径，确认它解析到列表首项并返回历史；两次验证均未调用模型或修改目标会话，也未向飞书发送测试消息。
- **真实飞书部分验证**：用户回传的 `/threads` 列表包含 4 个外部会话。旧版重启后编号丢失已修复，原列表顺序经实时搜索核对后恢复。用户随后回传 `/read 1` 的 JSON 结果，来源 ID 与列表首项一致，包含 1 个 completed 回合及用户/助手消息，确认编号解析、外部读取和飞书返回成功。长消息按现有 5000 字限制截断并标记；这不是完整导出。用户进一步回传 `/reference 1` 的总结，来源会话正确，包含完成情况与下一步，并明确说明仅根据历史记录、未重新核验或执行操作，确认跨会话引用和模型回答已在飞书端成功。自然语言列表查询已由用户回传结果确认；自主调用读取工具仍未单独实测。未将实际会话内容写入仓库。
- **提交/推送**：本次修复随 `codex/external-thread-read-issue-2` 分支提交并推送至 PR #4；具体提交见该分支 Git 历史。本地敏感配置未提交。

## 交接
新会话读取顺序：AGENTS.md → README.md → PROJECT.md → 相关源码与测试。

## 更新时间字段修复（2026-09-19）
- 用户自然语言查询返回 15 项会话，但模型报告时间未提供。根因是桥接层遗漏了 Codex 原始 `updatedAt` 字段。
- 已补充原始秒级时间戳、UTC ISO 时间和北京时间；外部列表按 `updated_at` 排序，命令列表显示“最后更新”。此字段不冒充精确的最后消息时间。
- 真实 app-server 验证 15 项均有时间且按更新时间降序；check、30 项测试、doctor、smoke 通过。用户随后确认飞书端时间展示成功。
- 本次修改已随 PR #4 提交和推送，本机服务已部署。PR #4 尚未合并，Issue #2 尚未关闭；实现与主要验收已完成，剩余单独实测项如上。
