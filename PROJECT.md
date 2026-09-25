## PR #14 审核返工：终态来源阻塞补算（2026-09-25）

- Task Source：https://github.com/dccaoxy/codex-feishu-bot/pull/14#issuecomment-5824986193 ，审核3431340为NEEDS CHANGES。本机新增两例测试在旧组合代码上均复现“终态请求导致当日无法生成”，失败证据保留data/rework-terminal-before.log；原145项通过不能覆盖该缺口。
- 已修改：snapshot仅排除queue_full/cancelled终态，仍等待queued；不删除Raw、不改终态、不放宽visible。过滤发生在模型输入及大小限制之前；coverage记录filtered、总数/纳入数/分状态排除数，随输入指纹校验，日报及主题revision读取可见。仅终态日以明确零输入覆盖推进，不冒充全消息完整摘要。
- 自动回归新增：两个终态与重启/次日补算、真正queued等待至完成、全终态日、撤回活动请求取消其他排队消息后重启；断言Raw保留、隐藏正文不进入Worker/派生知识、既有隐藏策略不变。语义细分类不扩展。
- 验证：check、150项全量测试、独立PR #5 d305eaf组合check/183项测试通过；真实安装Codex二进制的Group正反向/恢复探针（12次调用）及Knowledge隔离探针（10次越权调用）通过，使用假provider。隔离开发配置的doctor握手/登录检查及真实协议smoke通过；飞书凭据为空，因此不声称本轮真实飞书或模型验收通过。
- 当前状态：本轮修复已提交并推送同一PR，重新Ready触发复审；本轮修复尚未部署；在线仍为3431340。不得把上轮最小真实模型验收作为本修复真实验收；本轮不操作在线数据库、不重启服务，部署后需核对受影响群补算进度。不Merge，不启动Issue #13。

## PR #14 MVP 最终验证（2026-09-25）

- 修复真实模型工具调用返回 `code-mode host is disabled`：不再禁用内部工具分发宿主；code_mode、shell、文件、插件等能力仍禁用，注册工具名单保持受限。Group真实二进制探针增加合法group_search正向调用，首次/恢复均通过，原10次越权攻击及Knowledge 10次攻击仍拒绝。
- 修改后check、145项分支测试、178项PR #5组合测试重新通过。最小在线模型验收真实调用 `group_topics → group_topic_read → group_daily_digest → group_message`，读取实际生成的主题与日报，并用真实飞书API核对来源，内容一致、跨群读取拒绝。模型运行在隔离临时任务，在线库使用SQLite只读备份，无用户任务/FIFO写入。
- 本轮按最新MVP Gate转Ready；人工客户端@验收未重做，历史大日补算未全部完成，语义细分类不继续扩展。无Merge、无Issue #13开发、无Phase 3。

## PR #14 Human MVP 收口（2026-09-25，当前事实源）

- 权威验收调整：https://github.com/dccaoxy/codex-feishu-bot/pull/14#issuecomment-5824698226 。不再要求语义 Schema 精雕或相同21条消息的第二轮逐项人工验收；原真实两日/v2/来源隔离验收继续有效。Issue #13 仅为后续优先级，本任务未开始其开发。
- 实现代码 27cf19b 已部署到既有候选，与 PR #5 d305eaf 组合；只新增 `groups.knowledge.enabled=true`，原两群名单、Owner Gateway、Shared连接/权限、FIFO配置不变。备份和部署文件清单保存在本机 data/knowledge-mvp-deployment.json；没有重启 Desktop/Shared App Server，没有修改 PR #5 遥测。
- check、145项独立测试、178项组合测试通过；真实 Codex 协议 doctor/smoke、Group 与 Knowledge 权限隔离探针通过（探针使用假provider）。新加调度顺序测试覆盖历史成功/失败异步结束后才整理，避免一分钟同步竞争导致永久延后。
- 线上后台已从真实群2026-08-13消息生成Daily Digest和“AEG 新羽计划欢迎仪式”Topic v1。通过已部署 GroupAssistant.execute 读取日报、Topic、原始消息，来源正文与真实飞书 message.get 返回完全匹配；其他群无法读取同一Topic/来源。核对主题主要时间、地点、参加要求与原通知一致，未将计划冒充已举行。部署前Raw逐行比对无丢失。
- 最小验收证据仅本机 data/knowledge-mvp-online-result.json，不向公开仓库上传群内容/账号标识。此次未伪造用户事件、未占用持久用户群任务、未发送验收群消息。Human暂不方便做人工@；本轮按最新指令进行最小在线验证，不把它表述为人工客户端端到端验收。
- 保留局限：最早较大日期2026-02-27曾worker_failed，保留有界退避；独立21条复测03-16两次因knowledge_lost_fact被拒绝，未发布不完整派生内容，未关闭校验或手改JSON。此复测不再是Human Gate；不宣称全历史补算完成或一次生成可靠性已解决。精细语义质量及大日可靠性留待后续。
- 验收工具纠正：首次本机查询探针误用了会执行启动恢复的Store构造器，使当时后台running知识任务被标为interrupted；没有Raw丢失或用户FIFO在途请求。后续探针已改为只读SQLite在线备份，在临时副本运行工具，避免触碰在线调度；该诊断干扰与模型失败分别记录，不混为产品故障。
- 收口：完成最小真实模型工具链核验后转Ready触发独立Reviewer；不Merge，等待审核/Human Gate。

## MVP 部署验收中的调度修复（2026-09-25）

- 真实启用发现同步定时器与 Knowledge 定时器同时触发，知识快照总在 syncing 状态被延后。改为每轮历史同步完成后调用知识调度；单群同步失败仍由快照覆盖校验阻止发布，不阻塞其他已完整群。
- 新增异步同步顺序回归；check、独立 145 项、PR #5 组合 178 项通过。候选 doctor、真实协议 smoke、Group 隔离探针通过。真实飞书长连接已建立；完整链路仍在验收，PR 保持 Draft。

## PR #14 MVP 验收调整（2026-09-25）

- Task Source：Human 最新指令将验收调整为 MVP：Raw Messages 完整、来源可追溯、跨群与 Worker 权限隔离、无明显编造、不影响群聊/FIFO；精细语义分类为后续质量优化，不作为本轮阻断条件。
- 已保留完成的轻量改进：聊天陈述归入 reported_facts，独立 verified_facts 为空；旧知识只读兼容投影，不改写旧版本；增加计划字段和来源覆盖约束。此举不代表精细语义分类已人工验收。
- check、独立分支 144 项测试、保留 PR #5 d305eaf 共享连接配置的组合 177 项测试通过；真实 Codex 二进制的 Knowledge 隔离探针通过（假 provider）。
- 下一步：备份后部署组合候选，仅开启现有授权群 Knowledge；验证真实生成、群内 @ 查询及来源回查后才转 Ready。当前尚未部署该变更；不 Merge。

# 飞书本地 Codex 机器人 — 项目状态

## 项目目标
让用户在飞书中与本机 Codex 交互，由本地 Node.js 服务通过 stdio / JSON-RPC 调用 codex app-server，并通过飞书长连接收发消息、卡片和附件。

## 当前任务：Issue #12 Group Knowledge（独立开发线）

Task Source：[Issue #12](https://github.com/dccaoxy/codex-feishu-bot/issues/12)完整正文（读取时无评论），以及用户要求“PR #5继续独立长期观察，两条开发线不要互相覆盖”。从最新main fcd1ab7建立独立worktree和分支codex/issue-12-group-knowledge。未将PR #5未合并能力带入main分支；原PR #5分支仍00ade11，工作区无改动，运行候选仍8cd4418，部署源码哈希逐项核对未变。未更改生产配置/服务/数据库或PR #5采样安排。

### Implementation

- 在群SQLite新增每日摘要、摘要版本、主题当前状态、主题版本、调度状态及主题重建身份表。原始消息不被派生知识覆盖；正式摘要和主题版本事务提交，成功日期幂等，重启恢复未完成任务。
- 显式groups.knowledge配置默认关闭；时区自然日及每日时间、顺序离线补算、全局一分钟最多一次后台模型调用、每周期日期上限、持久错误与三次失败停止重试。历史完整且同步已覆盖该日末尾才允许完整摘要；有限retention截断日标skipped，超量整日失败不伪装完整。
- 独立临时Knowledge Worker复用GroupModel隔离启动底层，但没有动态工具、执行环境、私人线程、Owner Gateway或文件/shell/审批能力。每个job独立临时home与ephemeral thread，结束/中止清理；崩溃目录下次启用清理。不写用户Persistent Group Thread，不向飞书主动发送日报。
- 严格schema、消息/主题/资源来源范围、输出上限、旧事实变化与未决冲突保留校验，提交前重新核对输入指纹。事实/观点/决定/行动/问题分别存储，责任人及截止未知用null。无实质日不生成Topic。
- 撤回后保守隐藏并清除本群派生正文、标dirty/invalid，保留版本号/来源审计元数据并顺序重建；没有唯一来源匹配时不强行复用主题身份。退群/撤权清理派生库并终止Worker；有限保留期后主题明示来源原文不可用。迟到更早历史重新排入补算。
- group_topics/topic_read/daily_digest只读当前群、按需获取；已有持久任务以group_search + group_message(topic:ID)兼容读取，不重建用户任务。实时@中止后台、照常进入FIFO；未@消息静默入库。

### Validation

- Node24.21.0、Codex0.155.0-alpha.16.3；check及142项全量测试通过，含新增27项知识测试。覆盖分类/无实质内容、DST、幂等、补算与限流、partial/failed/缺失覆盖、同主题版本与新主题、伪造来源/ID/JSON、冲突、撤回重算/迟到历史、退群、retention、超量、重启、失败封闭、实时抢占与只读范围。
- 在本机真实二进制上，原群首次/恢复共10项隔离探针通过；Knowledge独立模式10项恶意工具探针通过（假provider、未调用真实模型）。shell、文件、Owner线程/数据库、权限申请、跨群检索、GitHub调用不可用；技能权限为空。
- 真实模型合成数据两日期验证通过：同一Topic、2个revision、来源回查保留；首日1条fact/decision/action/open question；用户群任务表0条。没有真实群内容、没有飞书连接或消息发送。该结果不冒充真实群验收。
- 独立空凭据配置doctor登录/7模型、无模型smoke和只读knowledge:status通过。飞书未联网验证，Owner配置与群功能均关闭。
- 在忽略的独立临时组合目录，以PR #5代码00ade11为基底叠加本Issue源码，check及175项组合测试通过，包含单聊/Work/审批和PR #7/#9/#11回归。未覆盖/部署PR #5源码。PR #5遥测23:27:34仍同PID、status ok、FD30、子进程1、loaded1、连接1；不以点状值宣称长期观察完成。

### 359b024 真实历史隔离验收（2026-09-24）

用户授权在不影响PR #5的隔离方式验证原授权测试群，且明确保持Draft。以359b024原源码运行独立Knowledge Worker及独立SQLite，生产群库仅read-only事务选取原测试群两日Raw与实际history_sync证明；未启动第二条飞书长连接，未连接Shared App Server、Owner Gateway或用户持久群任务。未替换生产候选、配置、遥测或launchd。

- 最终选取2026-03-15（8条）及03-16（13条），实际同步状态complete、initial_complete=1，last_reconciled_at覆盖两个日末。输出2份正式Digest、3个Topic；其中2个既有Topic沿用相同ID更新为v2，另1个为第二日新主题。13个唯一source_message_ids全部匹配快照原文，用户群任务0条。原文及派生内容仅保存在独立worktree忽略目录，不上传GitHub。
- 如实保留失败：最初02-27/28日期组首日worker_failed，未写正式产物；随后03-15首次knowledge_digest_lineage校验拒绝，按持久退避规则第二次成功。未修改359b024源码、未关闭校验、未手工修补模型JSON。成功不能掩盖首次失败，模型一次生成可靠性仍是风险。
- check通过；最终核对PR #5候选47个部署文件哈希均未变化；Shared PID67006维持，23:54:41采样status ok、FD28、pipe3、子进程1、loaded1、RSS226672KiB、连接1。仅点状健康证据，不替代PR #5独立8小时观察。本次模型进程与生产服务隔离，但共享主机CPU/内存负载。
- 本地人工核对页：data/knowledge-acceptance-359b024-march/人工核对.html，包含完整Daily Digest、Topic当前状态及逐日版本、可点击source_message_ids与两日21条原始消息；账号标识在展示中隐藏。snapshot.json/results.json/verification.json和执行日志为本机证据；最初失败保留在data/knowledge-acceptance-359b024。快照不接收后续撤回，正式使用前应重新核验来源有效性。
- 待人工核对至少一项fact、文档归档行动项、两Topic更新及来源；特别核对机器人自述与实际完成的区别。未实测在线群@读取Topic、来源回复、实时@抢占或普通消息并行。此次仅完成真实历史生成与程序化来源核对，不能称Issue #12全部真实验收PASS。PR #14保持Draft，不Merge、不转Ready；生产knowledge仍关闭。

### Remaining / 交接

已实现、已本机测试、已真实模型合成验证；尚未部署、尚未真实群验收，未Merge。核心实现提交c550954，已推送并创建[Draft PR #14](https://github.com/dccaoxy/codex-feishu-bot/pull/14)，Issue #12已回写阶段交付报告。后续修正以该PR最新head为准。本Issue要求“自动测试 + 真实群验收完成后 Ready”，因此保持Draft，不提前触发最终审核。后续须安排独立或PR #5观察结束后的授权测试环境，再核对真实两日期知识、人工内容/来源、群内Topic查询与实时@并行。当前生产仍运行原组合候选，knowledge未启用；不自行重启或替换它。

已知限制：模型语义仍需人工核验；大量输入/超过50主题/单主题过大将停止该群补算，需要明确诊断处置；不做分块归并或向量检索。撤回采用整群派生重建以避免间接污染，成本较高，重建期间知识不可读但原始消息及正常群请求保留。所有运行日志/配置/数据库仅本机忽略目录，不提交凭据、群ID或消息正文。

## 已合并基线：Issue #10 Group Request Queue

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
