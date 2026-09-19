# 飞书本地 Codex 机器人 — 项目状态

## 项目目标
让用户在飞书中与本机 Codex 交互，由本地 Node.js 服务通过 stdio / JSON-RPC（Work 可选本机共享 WebSocket / Unix socket）调用 codex app-server，并通过飞书长连接收发消息、卡片和附件。

## 当前状态
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
- 本节仅保存本地调查记录，尚未提交/推送；Phase 2 PR 的已验证范围不扩大为 Desktop 实测通过。

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
