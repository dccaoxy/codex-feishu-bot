# 飞书本地 Codex 机器人 — 项目状态

## 项目目标
让用户在飞书中与本机 Codex 交互，由本地 Node.js 服务通过 stdio / JSON-RPC（Work 可选本机共享 WebSocket / Unix socket）调用 codex app-server，并通过飞书长连接收发消息、卡片和附件。

## 当前任务：PR #5 Phase 2 基线收敛

Task Source：用户要求先完成最新main收敛与完整组合回归；[最终收口计划](https://github.com/dccaoxy/codex-feishu-bot/pull/5#issuecomment-5815781893)。PR #5先退回Draft；旧head 53c8575的PASS不覆盖本轮。基线origin/main为fcd1ab7（已合并PR #7/#9/#11），集成到原codex/issue-3-work-attach开发分支；不是合并PR到main。

main提供完整群历史、Persistent Group Thread、Owner Gateway、持久FIFO Queue及最新queue_full撤回修复；这些模块与main保持一致。PR #5提供共享WebSocket/Unix socket、Work Attach及start/steer/interrupt/fork/detach、审批卡片生命周期和资源观测工具。冲突仅README及CodexClient构造器；保留两套文档，合并共享传输参数与main的独立env/cwd，保留群环境隔离。Node最低版本沿用main的24.10，当前24.21.0；Codex为0.155.0-alpha.16.3。Full仍拒绝，未进入Phase 3。

当前合并源码check、148项全量测试通过（群PR #7/#9/#11及Work/审批/token/迟到卡片/显示失败不重放/FD工具全部回归）。doctor共享App Server握手、登录、7模型通过；无模型smoke通过。group:check在真实二进制上首次/恢复10项隔离探针通过（假provider、不调用真实模型）。真实Work WebSocket及Unix socket独立测试覆盖start/steer/interrupt/fork/detach、绑定恢复；真实Bot+协议对端验证双向回复、active steer/interrupt、对端拒绝后旧token失效、Bot批准后迟到拒绝不重复执行。测试只操作临时任务，飞书UI为模拟，不是本轮真实Desktop/飞书界面验收。

资源短测首轮失败记录：旧shared-soak使用thread/read(includeTurns)遇到当前协议“list_turns is not supported yet”，已保留本地phase2-soak-failed.log和独立soak JSON，不算通过。脚本改为复用ThreadController.turns的thread/turns/list及仅MethodNotFound回退逻辑，轮询与清理均修正。修改后check/148项重跑通过。

修正后真实共享模型soak持续约5分01秒：6回合、3次无副作用printf、3次重连、清理错误0。FD 51→84峰值→51；loaded任务0→3→0；直接子进程1→1，pipe3→3；RSS 215920→221136 KiB，仍高约5MiB。独立只读压力测试240连接/2400次元数据读取通过，6批峰值均91、关闭后均51，增长0，新EMFILE为0。只能证明这次短测回收，不能宣称长期无泄漏或历史根因已解决。原始失败与成功日志、soak/资源JSON保留在忽略的data目录。

本轮尚未部署收敛分支，现有单群候选及真实配置不变；不重启机器人/Desktop/共享服务，不发真实飞书消息。真实正式审批卡片最终视觉、数小时/隔夜及sleep/wake验收仍是后续Gate；基线与协议短测不得冒充最终Phase 2收口。本轮按用户“先完成基线收敛和组合回归”范围交付，PR保持Draft，后续完整验收后再Draft→Ready，不Merge。

## Phase 2 步骤3–4进行中：组合候选已部署，等待正式审批验收

用户明确授权部署8cd4418并在正式双端审批卡片验收通过后开始至少8小时、每60秒资源观察。已部署精确源码8cd44185d94846e65839767b17555f1fb7854ad3到原data/issue6-candidate；部署前确认单聊无活动run、群无queued/running/sending。源文件从该提交提取；原配置字节未变，仍原单群、Owner Gateway资源与私人片段范围、FIFO及Shared Runtime Work权限。备份位于本机忽略目录 phase2-combined-backup-20260924224532（data下），保存旧源码/配置/群SQLite。

实际候选check/148项组合测试、doctor（登录、7模型；群1、Owner网关启用）、无模型smoke通过。仅机器人重启，launchd running，新启动日志确认Codex与飞书长连接ready；未重启Desktop/共享服务。没有改权限、没有Merge或进入Phase 3。

正式审批卡片真实验收尚待用户操作，不能以自动测试或连接ready替代。拟在已绑定共享任务用request_permissions申请一个专用测试文件的写权限，由用户在Desktop拒绝，检查飞书原审批卡片关闭/移除按钮且旧操作不再生效，不产生文件写入。通过后才设置正式观察起点并核验60秒采样任务；目前尚未开始本轮8小时验收计时，既有遥测不冒充本轮验收。需记录FD/pipe、子进程、loaded tasks、RSS与连接状态；观察不足、采样缺口或睡眠需如实记录。

## Phase 2 正式资源观察已启动（2026-09-24 22:56）

用户确认昨天审批测试已通过，明确不重复。本轮采用用户确认作为继续依据；没有重新执行部署后审批UI测试，不将历史截图冒充新版本视觉证据。

已启用独立launchd只读采样，StartInterval=60秒，首条样本有效。正式窗口从2026-09-24 22:56:47至最早2026-09-25 06:56:47（北京时间），部署源码8cd4418。初始FD31（pipe3）、直接子进程1、loaded tasks0、RSS226064KiB、连接1、status ok。记录FD、分类、RSS、子进程、loaded任务、连接及进程身份；不得把上限提高当作根因修复。数据/起点位于忽略目录data/shared-lab/telemetry，后台每30分钟复核异常及采样覆盖，安静观察无变化状态。

尚未完成8小时验收。休眠/停机/采样缺口、PID变化需单独记录，覆盖不足不能判连续稳定；结束后评估负载及空闲回收并写回PR。未改机器人/Shared Runtime权限，未重启它们，未Merge或进入Phase3。

## 已合并基线记录：Issue #10 Group Request Queue

Task Source：[Issue #10](https://github.com/dccaoxy/codex-feishu-bot/issues/10)，用户要求读取AGENTS并执行。核实PR #7、#9均已合并，从最新main `51db514`创建独立分支 `codex/issue-10-group-queue`；PR #5仍open、未合并，head `53c8575`。用户已明确允许完成自动测试后更新原单群候选、仅重启机器人，不重启Desktop、不Merge。

### 实现与关键决定

- 群本地SQLite新增group_requests，保存可信live event认领与FIFO序号，message_id唯一；与消息状态事务入队。历史补录不生成请求，重复投递不重复入队。
- 每群一个活动请求，全局两个；全局或同群忙时queued，不再静默busy丢弃。每条独立Turn沿用Persistent Group Thread，无语义合并/群steer，单聊不改。
- 默认每群10条等待队列、配置硬上限20。满额记录queue_full并一次提示，正常排队不刷屏；提示不确定不重发。排队正文从模型增量/检索结果中排除，轮到请求再提供。
- 重启仅恢复明确queued；running/sending变uncertain，同群后续全部暂停，需Owner本机核验结果并明确处置，不自动跳过。close保留queued且不消费，活动未决fail closed。
- queued撤回删除正文/取消该请求，不影响当前A；已执行消息撤回、退群/授权撤销/retention失效取消本群活动与排队并保持隐私清理。Owner网关同FIFO、出队和发送前授权复核，额外检测读取期间资源范围变化。

### 验证与交接

本分支check及113项自动测试通过；保留PR #5的隔离组合check与146项测试通过（含单聊原有行为）。真实Codex doctor登录/7模型、无模型smoke、首次/恢复10项工具隔离探针通过。新增队列测试覆盖FIFO/同任务、双worker/全局等待、queued/running撤回、退出/撤权、close及重启uncertain屏障、历史不执行、重复/满额提示、Owner共享队列及撤权，原PR #7/#9回归保留。

真实群A/B及修复后C复测已验证；不得将模拟模型调用或连接就绪视为真实验收。2026-09-24 21:14已按本次授权部署源码 `925b695` 到原单群候选。部署前确认无活动请求，备份源码/本地配置与群SQLite快照（忽略目录data/issue10-queue-backup-20260924211427）；配置字节不变、未涉及的源码哈希不变，保留PR #5。实际候选check/146项测试/doctor/smoke通过，机器人重启后Codex和飞书长连接ready。Desktop/共享App Server与服务配置未改。

已提交、推送并创建[PR #11](https://github.com/dccaoxy/codex-feishu-bot/pull/11)。真实A（重叠2条）/B（连续3条）及修复后C（撤回queued）复测均已核验。本次交付转Ready触发自动审核，等待PASS/NEEDS CHANGES，不自动Merge。

### 真实验收进展（2026-09-24）

场景A的“前一条尚未完成又发一条@”已验证：用户反馈均收到回复；群库三条live请求均done；同一个持久群任务的后两次Turn分别21:16:05–21:16:24、21:16:25–21:16:34，后一请求于21:16:08到达，在前一任务完成后才启动。不是steer或并发Turn。第一条独立请求21:15:39–21:15:45已完成。场景B也已验证：三条请求21:20:49、21:20:53、21:20:57到达，同一任务Turn分别21:20:50–21:21:15、21:21:16–21:21:25、21:21:26–21:21:33，严格FIFO、三条done。场景B用户亦确认三条均收到回复。场景C用户反馈已撤回；后台第7条done、第8条cancelled，撤回墓碑存在且消息及原文已删除，但群任务为invalidated且会话目录已清理，无法核对该请求是否曾启动或回复，故C不判PASS，PR仍Draft。源消息ID、任务ID及观察时间线只存本机忽略目录。

### 撤回验收后的回归修复

检查发现重复queued撤回存在确定缺陷：第一次取消排队请求，重复事件因状态已变cancelled误走任务失效清理。新增回归在修复前失败（当前任务被abort），改为已存在撤回墓碑即返回后通过；覆盖A运行中和完成后重复撤回、后续C保持同一任务。真实此次异常是否由重复事件或撤回过晚引起，现有记录不足以确认，不能据此宣称已查明真实根因。

本分支check/114项测试、保留PR #5的组合check/147项测试通过。2026-09-24 21:38将修复源码c495924部署到原单群候选；实际候选check/147项测试、doctor/无模型smoke通过，服务启动后双连接ready。本地配置字节与未涉及源码哈希不变；备份位于忽略目录data/issue10-queue-backup-20260924213814。仅重启机器人，未重启Desktop/共享App Server。此前场景C未判通过的记录保留，修复后复测结果见下。

### 撤回复测与本轮交付（2026-09-24 21:45）

用户再次在原群发送两条并撤回第二条。首次读取时第9条running、第10条cancelled，撤回墓碑存在、原文已删除，群任务仍running。随后第9条done、第10条保持cancelled；同一保留会话只有21:43:43.546–21:44:28.013（北京时间）一个task_started/task_complete，未出现第二条消息ID或“撤回测试成功”，没有额外Turn或中止；绑定idle，会话目录保留。确认撤回只取消等待请求、没有打断当前请求，C复测通过。此前已失效的旧群上下文按既有隐私清理机制重建，本次复测未再次失效；不宣称旧目录已恢复。

实现、自动测试、真实Codex/飞书A/B/C、提交推送及原单群候选部署均已完成。最新实现部署c495924，后续提交仅更新验收文档。PR #11转Ready触发自动审核；未Merge，未扩大授权。真实跨进程崩溃/满队列/多群并发及长期稳定性未另行实测，由自动测试覆盖相关边界，不能据此承诺长期无故障。本轮没有关闭Issue；等待审核及Human后续决定。

### PR #11 审核返工（2026-09-24）

Task Source：用户要求读取审核结果并返工；[NEEDS CHANGES 评论](https://github.com/dccaoxy/codex-feishu-bot/pull/11#issuecomment-5815412380)，审核head `33ffd59`。已先转回Draft，同一分支修复。

发现：queue_full从未执行且被模型读取过滤，但recall仅特判queued，导致撤回满额拒绝请求时中止当前A并取消等待B。新增正式回归（上限1、A运行/B等待/C满额）在修复前失败，A被abort；失败日志留本机忽略目录data/review-queue-full-before.log。

修复：queued与queue_full均为明确未派发状态，首次撤回仅删正文、取消记录并写墓碑；重复撤回继续去重。其他可能已进入上下文的状态仍保守隐私清理。回归覆盖首次/重复撤回、正文删除、A不abort、B保持queued、同一Thread下A/B各完成一次且FIFO、C无模型调用/无延迟拒绝提示/重复投递不执行、完成后任务不失效。

验证：check、115项分支测试和保留PR #5的隔离组合check/148项测试通过；真实Codex doctor握手/登录/7模型、无模型smoke通过。本分支诊断配置未填真实飞书凭据、群功能关闭，未将该结果宣称为真实飞书连通或模型验收。无远端CI结果，本次新增测试使用模拟模型和发送端。

本轮已修改、已本地验证，随后提交推送并重新转Ready复审；未部署此修复、未重启机器人或Desktop/共享App Server、未发真实消息、未Merge。当前候选仍为c495924，先前A/B/C真实验收只覆盖旧候选；此次满额撤回未真实群实测。等待新head审核，不沿用旧验收或旧head为新修复背书。

### 已审核版本部署（2026-09-24 22:06）

用户明确要求部署PR #11已审核PASS的 `f9fa203b991c6072d654ede91953c43c3808dbe0` 到原单群候选，不Merge。[PASS评论](https://github.com/dccaoxy/codex-feishu-bot/pull/11#issuecomment-5815580876)对应此源码head；本次后续提交仅记录部署，不冒称审核覆盖后续文档head。

部署前确认群无queued/running/sending；备份旧源码、配置和群SQLite到本机忽略目录 `data/issue10-queue-backup-20260924220546`。仅替换group-store及其queue测试为审核提交中的字节，其他运行源码哈希保持不变，保留PR #5。现有config.local.json字节不变：仍仅原授权单群，Owner Resource Gateway资源/私人任务片段范围保持原样，不写入真实标识到Git。

实际候选check、148项组合回归、doctor（App Server握手、登录、7模型）、无模型smoke通过。仅重启io.codex.feishu-bot，launchd状态running；从本次启动日志确认Codex已连接、飞书长连接已建立。doctor本身不验证飞书网络；飞书恢复依据新启动日志。未重启Desktop/共享App Server、未改launchd配置、未Merge。本次未调用真实模型、未向群发送验收消息，因此不将部署检查当作新的满额撤回真实验收。

源码部署版本f9fa203；运行验证与哈希清单见本地忽略的data/issue10-latest-deployment.json及备份目录validation.log。原先“未部署f9fa203”的段落为此前返工时点记录，现已由本次部署更新。下一步可在原群真实使用/验收；长期稳定性、多群/崩溃实测边界不变。

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
- Issue #2 的外部 Thread 只读访问已在当前 Mac 的本地配置中启用；仓库示例配置仍默认为关闭。该阶段已部署；2026-09-19 本轮按用户授权将本机机器人切到 Phase 2 共享 Work 联调，原 Read 配置已备份。

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
2. 完成下方 Desktop 人工验收，等待 PR #5 自动审核结论；不自动合并，也不进入 Full。
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
- 本次修改已随 PR #4 提交和推送，本机服务已部署。PR #4 已合并至 main（2c372bd）；Issue #2 状态以 GitHub 为准；实现与主要验收已完成，剩余单独实测项如上。

## 最近交接：Issue #3 Phase 2 — Work / Attach（2026-09-19）

- **Task Source**：用户本轮指令及 [Issue #3](https://github.com/dccaoxy/codex-feishu-bot/issues/3) 完整需求；只执行 Phase 2，不进入 Full。从已合并 PR #4 的 main 创建 `codex/issue-3-work-attach`。
- **已实现**：`externalThreadPermission: read/work` 与旧布尔开关兼容；Full 显式拒绝。ThreadController 统一实际 resume、状态复核、start/steer/interrupt/fork；新增 `/attach ID或编号`、`/detach`、`/thread`。绑定保存来源、原机器人会话、最近状态和活动回合，重启不自动重放外部输入。
- **控制边界**：外部绑定不迁移/拼接历史，不覆盖原会话 cwd、模型、指令、审批或沙盒；Work 不提供 compact、模型修改及管理权限。外部分支仍为 Work 来源。附件发送仍受机器人原工作目录约束。
- **共享运行时决定**：不同 stdio 实例不能可靠判断另一实例活动状态。Work 因此必须显式连接目标所在本机共享 WebSocket 或 Unix socket App Server；仅接受已加载、状态可靠且允许直接输入的目标。缺失能力、未知状态和不可恢复均拒绝写入；不假定桌面实例能自动接管。Unix 控制接口实际为 WebSocket，禁用扩展协商以兼容当前服务器。
- **并发与恢复**：按 Thread 串行处理本桥接操作，每次写前重新读取服务器状态；活动回合精确 steer/interrupt。真实双客户端验证竞争 turn/start 返回同一活动回合。连接丢失清空状态缓存；恢复保留绑定但取消自动重放不确定/排队的外部消息。卡片建立期间延迟处理完成事件，避免旧回合完成导致新回合观察提前关闭。
- **已测试**：check、47 项自动测试、doctor、smoke 通过（doctor 仅检查本地飞书配置填写，无飞书联网验证）。测试覆盖旧配置、Read/Work 隔离、状态未知、恢复失败、活动回合、并发、绑定持久化/恢复、分支和管理拒绝。
- **真实 Codex 已验证**：当前 Mac、Node 24.21.0、Codex 0.155.0-alpha.9.2；独立共享服务器双客户端通过 `work:check` 和 `work:check -- --unix` 验证原 ID resume、空闲 start、活动 steer、竞争同回合、fork、interrupt 与绑定恢复。实际调用测试模型，仅归档本次测试创建的会话，不修改用户既有会话。
- **未验证/未部署**：本轮未发送真实飞书消息，Work 的租户卡片交互和具体桌面运行时连接仍待实测；未安装/重启生产服务，未修改 config.local.json 或提升生产权限。原外部会话没有飞书动态工具时不会注入工具；审批仍依赖原策略及服务端路由。协议适配以上述实测版本为基准。
- **提交/PR 交接**：实现已提交并推送：`0855150`，分支 `codex/issue-3-work-attach`；已创建 [PR #5](https://github.com/dccaoxy/codex-feishu-bot/pull/5)，本次补充记录也提交至同一 PR。Issue #3 保持开放，Phase 3 未执行；PR 不自动合并。

## Desktop 共享运行时只读调查（2026-09-19）
- 用户询问 Desktop 能否与机器人共用 App Server。本轮仅调查，未重启 Desktop、未改配置或启用共享服务。
- 本机 ChatGPT Desktop 26.915.31945 的 App Server 进程使用默认 stdio，未发现 TCP 监听或具名 Unix 控制监听；默认 daemon version 检查报告控制 socket 不存在。
- 安装包 `app.asar` 中 `src-C3YaUE83.js` 的 URL 选择函数读取 `CODEX_APP_SERVER_WS_URL`（除非 FORCE_CLI=1），`main-DUHZj4_w.js` 的连接工厂实际选择 WebSocket transport。属于本地实现证据，尚非 Desktop 双客户端实测或公开稳定配置承诺。
- 同包包含 `CODEX_APP_SERVER_USE_LOCAL_DAEMON=1` 分支，连接默认 app-server-control/app-server-control.sock；受本地 host、无额外 config overrides、CLI 覆盖/打包环境和 daemon 版本检查等条件限制。不能仅设置此变量就断言成功。
- 官方 App Server 文档明确 WebSocket/Unix 传输及 CLI --remote；未据此推断 Desktop 已公开支持同样启动参数。来源：https://learn.chatgpt.com/docs/app-server 。
- 建议后续单独验证 Desktop 通过显式 WebSocket 地址连接自建共享实例；使用同版本 bundled Codex，并核验桌面工具、审批路由与原 Thread 双端事件。当前运行中 stdio 实例没有已确认的热添加监听方式，切换涉及 Desktop 重启，未执行。
- 本节为当时的调查记录，随后已提交至 PR #5；后续实际验收以最新交接为准。

## 当前交接：PR #5 Desktop / Shared / Feishu 联调（2026-09-19）

- **Task Source**：用户要求继续 PR #5、自动搭建联调环境，验证双向、steer/interrupt 与双端审批；后续明确要求读取 GitHub 最新 AGENTS.md 并完成 Draft → Ready 自动审核。已读取 origin/main `f9116b3` 的完整协议并同步本地文件。PR #5 已转回 Draft，完成本轮代码、文档与验证后转 Ready；不 Merge，不进入 Phase 3。
- **已配置/安装/部署**：本机独立 `io.codex.feishu-shared-lab` launchd 服务监听 `ws://127.0.0.1:4517`，使用 Desktop bundled Codex 和原 Codex home。既有飞书服务已切 Work、连接该服务器并重启。本地原配置备份在 `data/shared-lab/config.before-work.json`（600，Git 忽略）；Desktop 上有“启动共享 Codex 联调.command”和“恢复飞书原配置.command”。未改全局启动环境，未复制凭据。
- **Desktop 实际状态**：当前 Desktop 仍是原 stdio 实例。曾尝试启动共享入口，既有单实例进程未切换；没有以此宣称成功。启动脚本已增加实际进程检查，测试确认在 Desktop 未退出时明确拒绝。必须由用户完成活动任务后 ⌘Q，再双击共享启动快捷方式；不能自动杀掉正在承载本轮开发的 Desktop。
- **代码修正**：飞书已绑定空闲 Thread 时，其他客户端后续 turn/started 自动开始观察，短回合完成等待卡片创建完成后再结算；避免漏回传或遗留流式卡片。共享端不抢答未知桌面工具。另一端解决审批后清除 token；解绑/关闭共享观察端不主动拒绝另一端待处理审批。
- **自动测试**：check 与 51 项测试通过；当前共享配置的 doctor、smoke 通过。新增进程保护脚本和复用现有服务的联调脚本，不增加 Full 管理入口。
- **真实 Codex 通过**：`shared-client-check.mjs` 在实际共享服务器用真实 Bot 与另一协议客户端验证同一 Thread 双向结果、active steer 后仍同一 Turn、interrupt 返回 interrupted。审批同时投递两端：另一端拒绝后 Bot 旧批准失效；Bot 批准后另一端收到 resolved，迟到拒绝不会重跑（仅一个 printf 命令，exit 0）。真实模型已调用。另一端不是 Desktop UI，飞书 UI 为模拟。
- **真实飞书部分通过**：`feishu-work-check.mjs --send` 向绑定用户真实单聊创建、更新并结束两张流式结果卡片，API 全部成功。模型与 Bot 真实；输入来自本地脚本，不是用户飞书消息，未测试真实按钮回调，未伪装用户发消息，未建立第二条长连接。测试仅使用新建测试任务并归档。
- **Remaining / 人工断点**：README“人工最小验收”给出 4 步：退出并共享启动 Desktop；新建“共享联调”并飞书 attach 验证双向；活动追加/停止；双端分别处理无副作用 printf 审批。若原策略自动拒绝/不产生人工审批，记录为未验证，不能绕过策略。Desktop 专属工具配置及 UI 仍未验证。
- **Risks / 回退**：共享入口是本地安装包的实验实现，升级可能改变；没有 Desktop 端实测前不能声称全部功能兼容。回退脚本恢复机器人配置并保留共享服务器，避免中断 Desktop；退出共享 Desktop 后再 stop-server，普通应用图标恢复默认入口。服务重启不重放不确定操作；重启后原绑定须重新 attach 才恢复该连接的订阅。
- **交付状态**：本轮实现已提交推送 `b444165`，同步最新主线规则的提交为 `e46210b`；本交接补充亦提交至 PR #5。Issue #3 与 PR 描述同步记录实际验证和人工断点。Draft → Ready 转换以 PR 时间线为准，自动审核结果待写回，不能将“Ready”写成“PASS”。


## 最新交接：资源限制修复与自动审核返工（2026-09-20）

- **Task Source**：用户“你来实现吧”，继续 PR #5 / Issue #3 Phase 2，修复共享环境障碍并按自动审核协议交付；不进入 Phase 3、不 Merge、不自动重新启用 Work。
- **真实用户验收更新**：用户截图确认同一“共享联调”任务在 Desktop 与飞书双向输入/回复成功；飞书活动回合追加要求被接收，两个界面出现“追加要求成功”。数数仍到 1000，不能据此认定即时中断通过。真实 `/stop` 和双端审批按钮仍待人工验证。上述记录取代前节“Desktop 尚未实测”的当时状态。
- **故障与当前部署**：用户遇到 EMFILE（Too many open files），当时默认限制 256；尚未证明具体泄漏来源。已回退普通 stdio / Read，用户确认恢复，保持该配置。本轮仅重启无客户端连接的共享实验服务，为其实际设置 soft nofile=4096、launchd hard=8192；未修改全局限制。首次从 Documents 执行包装脚本被系统拒绝，改为 Application Support 安装位置后启动成功。Desktop 入口也设置进程级限制，但本轮未重启 Desktop 验证；机器人新代码尚未重启部署。
- **审核返工**：针对上一轮 NEEDS CHANGES 的 R1/R2/R3，修复共享审批显示失败自动拒绝、旧回合卡片延迟创建阻塞新回合、解绑后迟到卡片不结束。旧回合清理只影响自身回合及审批；共享请求无法处理时不抢答拒绝。新增回归覆盖这些失败路径。
- **验证**：check、55 项测试、doctor、smoke 通过；doctor/smoke 使用普通 stdio 配置，真实 Codex 握手通过，不代表飞书联网或模型验证。本轮资源压力检查实际连接共享服务 240 次、读取元数据 2400 次，6 批峰值均 72 个句柄，回落均 32，增长 0、新增 EMFILE 0；结果仅存本地忽略目录。未调用模型或发送真实飞书消息。本结果不能证明长时间 Desktop/工具负载没有泄漏。
- **交付与断点**：本节及实现提交至同一开发分支和 PR #5，提交号以 Git 历史为准；Issue #3 同步 Implementation / Validation / Remaining。完成 Draft → Ready 后等待自动审核，Ready 不等于 PASS。下一步为审核返工（若有）及经用户安排的共享 Desktop 长期观察、真实停止和审批验收；生产保持普通模式。

## 当前任务：PR #5 共享运行时遥测 / EMFILE 验收（2026-09-20）

- **Task Source**：用户“继续执行 PR #5”，及 PR 评论 `5746268281` 的 A–F 补充验收要求。上一 head `9df1c31` 已获得独立自动审核 PASS（评论 `5746182164`），仅覆盖代码；本轮已转 Draft，新 head 必须重新审核。不 Merge、不进入 Phase 3。
- **历史取证**：现存 shared server stderr 首次 EMFILE 为 `2026-09-19T18:24:26.840650Z`（北京时间 9月20日02:24:26），最后旧故障记录为23:25:10Z，总计1146条；Desktop日志含452条相关错误，bot service日志未检出EMFILE。17:00Z至首次故障前有29条transport channel closed、4条TLS握手错误和1条DNS解析错误；故障后也有pipe创建与session读取失败。读取pmset保留日志，未找到该02点窗口的Sleep/Wake记录，不能据此断言未发生睡眠。未改写这些历史日志。
- **因果边界**：共享App Server日志确认其技能扫描、会话读取、pipe建立均被资源耗尽阻断；Desktop报错与共享服务错误相符。缺乏故障时PID绑定的限制记录和FD快照，无法从现有证据确定具体历史PID、实际soft/hard、逐步增长还是事件突增、哪类资源占满。此前默认launchctl soft256（hard unlimited）及现场记录只提供上限线索；提高到4096/8192不是根因修复。网络错误是相邻事件，不是泄漏因果证明。
- **已实现**：独立60秒launchd只读采样；PID和启动时间匹配的wrapper-at-exec限制记录；FD数字句柄分类、RSS、直接子进程、监听端口已建立连接、协议loaded Thread数。未知值标null，进程更换丢弃混合样本。50%warning、70%snapshot、80%critical；阈值变化告警，高位快照每10分钟最多一次。快照去掉路径和端点，轮换JSONL上限约5MiB并保留一份旧日志。提供telemetry-start/stop及真实模型短时soak脚本。
- **已部署**：仅在无客户端连接时重启共享实验服务，确认新PID启动限制记录实际为4096/8192；遥测任务已安装，真实每分钟采样且停止/重新启用已验证。普通机器人仍stdio/Read；未重启Desktop，未修改生产权限、未发送真实飞书消息。此前机器人修复代码仍未重启部署。
- **已测试**：Node24.21.0 / Codex0.155.0-alpha.9.2；check、61项测试、doctor、smoke通过，含分类、缺失/旧PID限制拒用、阈值快照、去重和日志权限/轮换。实际loaded/list可用。遥测只观察，不自动暂停、批准、重放或重启任务；停止任务不会撤销已有修改。
- **人工验收断点**：8小时/隔夜共享Desktop+飞书工作负载、睡眠唤醒、新wrapper Desktop接入、真实飞书 `/stop`、双端审批和旧按钮失效、Desktop专属工具仍未验证。当前开发Desktop不能由自身强制退出；用户完成活动任务后再退出并使用共享入口。在恢复Work前先核对共享服务健康和空闲状态，任何失败可回退普通stdio/Read。
- **短时真实模型结果**：09:07:03–09:12:14（北京时间），约5分11秒，两个协议客户端、3个专用Thread、6个完成Turn、3次工具调用、3次重连；测试任务清理错误0。各检查点FD为66→64→73→84→50，30秒后仍50；峰值pipe21/子进程7，结束pipe3/子进程1、loadedThread0。RSS 187648→219584→220352→225392 KiB，结束225328 KiB，未回到启动值；仅显示该短测后段趋稳，不排除长期缓存增长/泄漏。首次准备测试发现空Thread未写入rollout时不能resume，脚本改为首回合后再resume；另一次未完成回合测试未计为通过。成功测试使用真实模型和本地命令工具，未使用真实Desktop/飞书UI。结果存在本地 `data/shared-lab/soak-with-cleanup.json`，仅此处汇总不含消息正文的统计。
- **连接回收复验**：随后240次连接/2400次元数据读取，6批峰值均90、回落均50，新增EMFILE0；监测启用后至本轮交接无新增EMFILE。短测与连接压力测试均未覆盖隔夜或真实双端UI。


## 最新交接：真实双端验收与审批卡片关闭（2026-09-20）

- **Task Source**：用户继续 PR #5 / Issue #3 Phase 2；最新 origin/main AGENTS.md 已读取。沿用开发分支，重新 Draft → Ready，不 Merge、不进入 Full。
- **实际部署状态（取代前文当时状态）**：用户共享启动 Desktop 后，已核验 Desktop 与 Bot 同连本机共享服务；Desktop wrapper soft4096，Shared soft4096/hard8192。Bot 已恢复 Work 并部署 accdecc，遥测继续运行。本轮卡片显示修改尚未重启部署。
- **真实 UI 验收通过**：同一任务双向消息、active steer 接收；真实飞书 `/stop` 后两端停在57，服务端状态 interrupted。steer 数到1000后才改变回答，不当作即时中断证据。
- **权限测试更正**：第一次 UI 标签变化未确认写入目标，后续两次 thread/settings/update 成功。实际策略变为 granular / workspace-write / reviewer=user，允许 request_permissions 与 MCP elicitation，禁止 sandbox approval；因此 require_escalated 自动拒绝是策略行为，不是飞书丢卡片。改用内置 request_permissions 的最小文件写权限。
- **真实双端权限验收通过**：同一申请在 Desktop 与飞书同时展示；用户飞书批准后 Desktop 继续，测试文件内容经本机读取严格核对为 APPROVAL_TEST；重复点击旧批准被拦截。第二个文件申请由 Desktop 拒绝，飞书显示对端已处理，旧批准失效；本机确认拒绝测试文件未生成。仅覆盖本次文件权限路径，不宣称全部审批类型通过。证据已逐项写入 PR 评论。
- **已修改**：记录交互卡片消息 ID；审批提交、对端解决、超时、解绑/关闭时尝试更新原消息，移除按钮并显示关闭状态。发送完成前被解决的迟到卡片补更新。token 同步失效，卡片更新失败只记录固定提示、不响应或重放 RPC。历史旧卡片未批量修改。更新接口为飞书 message.patch。
- **已测试**：check、63 项测试、doctor、smoke 通过；新增迟到卡片与更新失败不重复批准的回归测试。doctor/smoke 是真实 Codex 握手/注册验证，未调用模型；本轮另向已绑定单聊发送一张明确标记的展示测试卡片，真实 create + patch 成功，移除按钮；未调用模型，未代替用户处理任何真实审批。客户端最终视觉仍待用户确认。
- **资源观测与边界**：现存最早 Desktop EMFILE 为北京时间02:09:02（Shared stderr 首条仍02:24:26）；故障前30次内部 MCP extension host 创建，间隔中位约310秒，未找到对应释放记录，只是嫌疑线索。09:05–10:34遥测共91条；10:07到10:34，FD82→158、pipe21→75、子进程7→25、loaded任务3→12，RSS约372→551MiB（该窗口峰约608MiB）。同时存在实际任务/工具负载，不能仅凭增长判定泄漏，也不能宣称稳定。持续采样保留，8小时/隔夜、睡眠唤醒和闲置后回收未验收；不人为中断正在运行的任务来制造测试。
- **交接断点**：等待本轮新 head 自动审核；新卡片显示需部署后实际用户审批复验，长期监测需后续时间窗口。停止不撤销已有文件修改。Issue #3 保持开放。
