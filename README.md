# 飞书本地 Codex 机器人

飞书负责消息与卡片交互，本地 Node.js 服务通过 JSON-RPC 调用 `codex app-server`：默认使用 stdio，Work / Attach 使用同机共享 App Server 的 WebSocket 或 Unix socket。不依赖 Codex SDK，不需要公网服务器、域名或内网穿透。

## Phase 2 收口状态

PR #5已收敛main `9de0926`（包括已合并PR #14 Group Knowledge、PR #15 Owner Group Gateway，以及群历史、持久群任务、Owner Resource Gateway、FIFO）。共享Work入口与群/Knowledge独立执行环境并存，外部Work不注入Owner群工具，Full仍明确拒绝。

2026-09-25 Human接受既有长期稳定性证据及持续真实使用结果，免重复8小时soak和双端同步人工验收。已完成本组合check、236项全量测试、doctor/smoke及真实Work/审批协议回归，提交Ready供新head独立审核；旧PASS不代替新审核。未Merge、未进入Phase 3。本轮未重新部署或操作真实群，历史验收与本轮验证范围见PROJECT.md。

共享输入等待卡片或发送结果期间，支持的交互按请求ID有界暂存，确认同一回合后展示一次；对端已处理、解绑、断线或关闭会使暂存失效。每个观察最多32个交互ID，单条10KB、累计64KB，超限提示回原客户端处理，不自动批准/拒绝。文件审批还必须按原回合及修改项匹配完整路径与diff；详情缓存最多32项，单项10KB、累计64KB，缺失或超限时不开放飞书审批按钮，转原客户端处理。该竞态修复经自动回归，尚未部署；真实协议复核通过但初始接口/时序波动保留，详见PROJECT.md最新返工记录。

## 在另一台 Mac 上复刻

```sh
git clone https://github.com/dccaoxy/codex-feishu-bot.git
cd codex-feishu-bot
npm ci
cp config.example.json config.local.json
codex login
```

然后填写 `config.local.json` 中的飞书 App ID 和 Secret，按照下方步骤配置飞书事件、回调与权限。运行 `npm run doctor` 检查环境，首次调试可执行 `npm start`；验证成功后执行 `npm run service:install`，由 macOS 登录时自动启动并在异常退出后自动拉起。

配置、账号绑定、SQLite 数据库、日志、收发附件与 Codex 工作目录都只保存在本机，并被 Git 忽略。克隆仓库不会复制原机器的凭据、飞书身份、会话映射或 Codex 登录状态。建议每台同时在线的主机使用独立飞书应用；如果复用同一个 App ID，多条长连接可能分担事件，而本地会话状态不会自动同步。

## 开始使用

复制 `config.example.json` 为 **config.local.json** 后填写：

```json
"feishu": {
  "appId": "你的飞书 App ID",
  "appSecret": "你的飞书 App Secret",
  "ownerOpenId": ""
}
```

请在原文件中修改这两个值，保留其余配置。JSON 不支持注释或末尾多余的逗号。

1. 创建飞书 **企业自建应用**，添加机器人能力。在「凭证与基础信息」取得 App ID 和 Secret，填入 `config.local.json`。
2. 双击 **检查配置.command**。Codex 应显示已登录；若未登录，在终端运行 `codex login`。配置中的 `codex.binary` 可以填写完整可执行文件路径。
3. 双击 **启动机器人.command**，保持终端窗口打开。先让本地长连接运行，再保存飞书后台的长连接订阅配置。
4. 在飞书开放平台「事件与回调」中：
   - 事件配置：选择「使用长连接接收事件」，添加 **接收消息 v2.0**，事件名 `im.message.receive_v1`。
   - 回调配置：选择「使用长连接接收回调」，添加 **卡片回传交互**，回调名 `card.action.trigger`。不要选择旧版卡片回调。
5. 申请下表对应权限，创建并发布应用版本，将你自己加入应用可用范围。是否需要管理员审核取决于租户设置。
6. 在飞书中打开机器人的单聊，发送任意文字。机器人会回复配对码，把码发给本机 Codex 助手确认即可。也可以在本机运行 `node src/main.mjs --pair 配对码`。配对码 15 分钟有效，绑定自动生效，无需填写 Open ID 或重启。原有的“将终端显示的 `/pair 配对码` 发给机器人”方式也仍然有效。
7. 发送普通问题开始聊天，或发送 `/help`。

| 用途 | 权限 |
| --- | --- |
| 收单聊消息 | `im:message.p2p_msg:readonly`（读取用户发给机器人的单聊消息） |
| 回复消息 | `im:message:send_as_bot`（以应用身份发消息） |
| 流式卡片 | `cardkit:card:write`（创建与更新卡片） |
| 收取附件 | 按「获取消息中的资源文件」接口申请读取消息所需权限，例如 `im:message:readonly` |
| 上传并发送成果附件 | 按「上传文件」接口申请资源权限，通常为 `im:resource` |

飞书后台以当前接口权限页面为准。没有卡片权限时自动退回文字回复；附件权限缺失会提示失败。已启用机器人能力、配置事件与权限后，需要完成应用发布才能对目标用户生效。

**只填写凭证无法代替飞书后台的机器人能力、订阅和发布步骤。**

首次配对后单聊只接受绑定账号；群聊默认忽略，显式配置后按本文群聊独立策略处理。也可以提前在 `ownerOpenId` 填自己的 `ou_...`，跳过配对。更换绑定账号时停止程序，再修改 `ownerOpenId`；它优先于数据库中的配对记录。

## 命令和体验

| 操作 | 命令 |
| --- | --- |
| 新建会话 | `/new 网站改版` |
| 列出会话 / 按标题查找 | `/threads` / `/threads 网站` |
| 切换机器人会话 | `/use 1` 或 `/use 完整ID` |
| 进入外部会话（Work） | `/attach 1` 或 `/attach 完整ID` |
| 查看绑定及实时状态 | `/thread` |
| 解除绑定并返回原会话 | `/detach` |
| 查看最近历史 | `/read 1` |
| 引用另一个会话并提问 | `/reference 1 按照这个方案写开发计划` |
| 从机器人会话创建独立分支 | `/fork` 或 `/fork 1` |
| 模型列表 / 切换 | `/model` / `/model 模型ID` |
| 思考强度列表 / 设置 | `/effort` / `/effort low` |
| 当前状态 | `/status` |
| 停止任务 | `/stop` |
| 压缩上下文 | `/compact` |
| 审批备用命令 | `/approve 请求码` / `/deny 请求码` |
| 回答问题 | `/answer 请求码 问题ID 回答内容` |
| 返回工作目录内文件 | `/send outbox/report.pdf` |

编号对应当前单聊最近一次 `/threads` 的结果，服务重启后仍保留；再次列出会替换旧编号。没有列表或编号无效时，请重新 `/threads`。完整 ID 可长期使用。命令由机器人解析后调用协议，不支持任意透传桌面端或 CLI 的全部斜杠命令。

普通消息会延续当前会话；任务运行中再发普通消息，会通过 `turn/steer` 追加要求。切换会话、模型或创建分支前需等待当前任务完成，或 `/stop` 后等待结束。停止不会撤销已产生的文件修改。

每个任务在一张流式卡片上展示状态和回复；长任务在约 8 分钟时续接卡片。审批和澄清使用独立卡片，10 分钟后失效。长答案会保存为 Markdown 附件；卡片不可用时回退为文字。

图片会作为图片输入发送到 Codex；其他附件保存在 `workspace/inbox`，由 Codex 使用本地工具处理。成果可以由模型调用 `feishu_send_file` 发回，或手工 `/send`。返回文件必须在工作目录内，不能通过符号链接访问目录外文件。

## 跨会话引用

支持直接说：**“查找之前讨论网站改版的任务，读取里面的设计要求，继续做首页。”**

机器人向 Codex 注册两个只读工具：

- `feishu_threads_search`：查找会话标题。
- `feishu_thread_read`：按页读取历史，每页最近 8 个回合，每条消息最多 5000 字；返回来源 ID、翻页游标和截断标记。

默认只能读取本机器人创建的会话。若希望读本机 Codex 的其他会话，在 `config.local.json` 修改：

```json
"allowExternalThreadRead": true
```

然后重启。这样绑定账号可以查找当前 Codex 实例能读取的本地历史（包括其他项目）；读取结果可能被发送至模型和飞书，因此仅在你希望开放这些历史时开启。

开启外部读取后，列表按 Codex 会话更新时间从新到旧返回，显示北京时间，并向模型提供 UTC 时间。这里的“最后更新”不保证等于最后一条聊天消息的时间；未开启外部读取时，本地登记列表不提供这一时间。

Read 模式下，外部会话仅作**读取与引用**。显式开启 Work 后可按下节进入同一共享 App Server 上的外部会话。跨会话搜索按标题进行，并非全部正文的语义检索。默认不搜索归档。机器人会话可以正常切换、恢复和分支。

无法保证访问另一设备、云端或所有新版会话存储格式；读取失败会明确报错，不会将“无法读取”解释成“没有历史”。历史会话不等于当前指令，工具结果只作为参考资料。

## Phase 2：Work / Attach

本阶段实现原 Thread 的继续工作，不提供 Full 管理。Work 允许 `/attach`、普通消息继续/追加、`/stop` 和 `/fork`；外部绑定期间 `/compact`、模型修改和管理操作不可用。`/detach` 后可继续使用原机器人会话。

### 配置与共享运行时

在本机 `config.local.json` 的 `codex` 中设置以下字段，保留其他配置：

```json
"externalThreadPermission": "work",
"appServerUrl": "ws://127.0.0.1:4500"
```

也可以省略/清空 `appServerUrl`，改用 `"appServerSocket": "/实际路径/app-server.sock"`。这是**目标 Thread 所在的同一个运行中 App Server** 的地址，不是另起一个能读取相同历史文件的服务器。地址从该实例的实际启动配置取得；机器人不会扫描、猜测或自动更换桌面实例。仅修改权限而不配置共享地址会明确报错。

可为集成环境启动 `codex app-server --listen ws://127.0.0.1:4500`，然后让工作客户端与机器人均连接它。桌面端是否能使用这个地址取决于桌面端的实际运行方式；本项目不自动迁移桌面正在执行的会话。Unix socket 连接的是 Codex 的 WebSocket 控制接口。

默认示例继续保留 `allowExternalThreadRead: false`，不扩大新安装权限。旧 true/false 配置仍有效；新字段 read/work 优先。回到旧的完全关闭状态时，移除新字段并设置旧字段为 false。`full` 会被配置校验拒绝，Phase 3 未实现。

### 操作行为

1. `/threads 关键词` 找到目标，`/attach 编号` 进入。目标须在共享服务器中已加载且明确可接收输入；`notLoaded`、状态未知、不可读取/恢复或缺少活动回合 ID 都明确失败。可先在原入口打开目标。
2. 空闲时普通消息发起该 Thread 的新回合；活动时使用带 `expectedTurnId` 的 steer。每次操作重新读取状态，并串行处理本机器人对同一目标的操作。共享服务器在竞争发生时将 turn/start 合并到活动回合，而不是创建第二个冲突回合；此行为已用双客户端验证。
3. `/stop` 只停止该 Thread 当时确认的活动回合，不撤销文件修改。`/fork` 创建并绑定独立分支；活动时从进行中回合之前分支，保留已完成历史，原回合继续。分支仍属于 Work 来源，不会借分支获得管理权限。
4. `/detach` 解除飞书侧绑定并返回之前的机器人会话，不发送 turn/interrupt。飞书侧尚未提交的审批入口会失效，但共享模式不替另一端拒绝审批；后续在原入口处理。绑定及最近已知状态保存在本机 SQLite，状态缓存不作为写操作依据。
5. 服务重启后保留绑定，清空状态缓存，不自动 resume 或重放状态不确定及排队的外部消息。用户用 `/thread` 重新查看状态，再明确发送新要求。

Attach 使用真实 `thread/resume`，不拼接历史创建替代 Thread，不覆盖原工作目录、模型、指令、沙盒或审批策略。外部会话继续使用原工具集合，不强行注入飞书动态工具；只有已有且本桥接能处理的工具会正常工作。审批仍取决于原会话策略及服务端路由，进入会话不会自动批准。

飞书附件仍放在机器人配置的工作目录；`/send` 仍只允许该目录内文件。Work 不扩大文件发送边界。`/thread` 展示外部任务的实际工作目录，两者可能不同。

### 验证

`npm run work:check` 启动独立的本机共享服务器，以两个客户端和专门测试 Thread 验证 resume/start/steer/interrupt/fork、竞争和绑定恢复。它会调用模型，结束后仅归档自己创建的测试 Thread，不向飞书发消息。`npm run work:check -- --unix` 验证 Unix socket 连接。常规 `check`、`test`、`doctor`、`smoke` 仍需通过。

## Desktop + 飞书联调（Phase 2，实验入口）

本机 Desktop 26.915.31945 的代码包含 `CODEX_APP_SERVER_WS_URL` 入口，但它不是已确认的公开稳定配置。已有 stdio Desktop 不会热切换；需要先完成活动任务，退出后按指定环境重新启动。不要同时让两个独立服务器操作同一个活动 Thread。

在已授权的 Mac 上运行 `node scripts/desktop-shared.mjs setup`：使用 Desktop bundled Codex 在 `ws://127.0.0.1:4517` 启动独立 launchd 服务，备份本地配置至被 Git 忽略的 `data/shared-lab/`，将既有机器人切到 Work 并重启。已有配置备份不会被覆盖；不复制 Codex 登录凭据或历史。该服务器使用现有 Codex home，因此可读取本机历史。此脚本安装服务、修改本地配置，只在明确授权部署联调时运行。

- `node scripts/desktop-shared.mjs status`：检查共享连接、登录及机器人地址。
- 完全退出 Desktop 后运行 `node scripts/desktop-shared.mjs launch-desktop`：仅给该次进程设置共享地址，不修改全局环境变量。Desktop 尚在运行时拒绝重复启动。
- `node scripts/desktop-shared.mjs rollback`：恢复备份的机器人配置并重启；保留共享服务器，以免中断尚在使用它的 Desktop。
- 退出共享 Desktop、完成 rollback 后，`node scripts/desktop-shared.mjs stop-server` 才停止共享服务。以后从普通应用图标启动 Desktop 恢复默认入口。

### 验证范围

`node scripts/shared-client-check.mjs` 使用真实共享 Codex 与真实 Bot 代码，另一端为协议客户端、飞书界面为模拟：验证同一 Thread 双向结果、活动回合 steer/interrupt、双端审批先到生效、旧批准失效及迟到拒绝不会重复执行。审批测试只批准明确指定的 `/usr/bin/printf SHARED_APPROVAL_PROBE`，不授予会话级权限。

`node scripts/feishu-work-check.mjs --send` 会实际调用模型，并向已绑定用户最近的单聊发送两张测试结果卡片。输入来自本地脚本，未模拟用户飞书身份，不能替代入站消息或按钮回调测试；不会建立第二条飞书长连接。两种脚本仅归档自己创建的测试 Thread。

已订阅客户端会同时收到审批；服务器接受先处理的决定并通知两端解决。机器人因此撤销已解决请求的本地 token，旧卡片点击显示失效，并尝试更新原消息移除按钮、显示关闭状态。更新失败不会恢复 token；已发送但尚未返回消息 ID 的卡片在返回后补更新。解绑/关闭共享观察端只释放其待办，不主动拒绝另一端审批。保留绑定时的 10 分钟审批超时仍按原规则拒绝。机器人不抢答不认识的桌面动态工具。

### 人工最小验收

1. 完成活动任务后退出 Desktop（⌘Q），用共享启动脚本打开。新建一个测试任务，命名为“共享联调”，发“只回复 DESKTOP_READY”，等完成。
2. 飞书发送 `/threads 共享联调`，核对标题后 `/attach 对应编号`，再发“只回复 FEISHU_READY”；确认 Desktop 原任务出现同一回答。再从 Desktop 发“只回复 DESKTOP_AGAIN”，确认飞书收到。
3. 在 Desktop 要求逐行输出 1 到 100000、不使用工具；运行时在飞书追加“每行后增加点号”，随后 `/stop`。确认 Desktop 停止，`/thread` 仍指向同一 Thread；不是新开第二个任务。
4. 先确认测试任务的实际审批策略。当前 Desktop 的“请求批准”可能使用 granular：允许 `request_permissions`，但禁止 `require_escalated`。此时在专用测试任务申请一个工作区外测试文件的最小写权限（如桌面 `codex-approval-test.txt`），明确批准前不写入、拒绝后不换方式执行。两端出现相同申请后，在飞书批准，确认 Desktop 继续及内容正确；再点旧按钮应失效。使用另一个测试文件重复申请，在 Desktop 拒绝，确认文件不存在、飞书旧批准失效。不要使用真实重要文件，也不要通过改宽权限绕过拒绝。旧版允许 sandbox approval 时可另用无副作用 printf 验证，但不能把这种协议测试替代当前 Desktop 的权限申请测试。

本机已由用户完成双向、停止及上述文件权限审批核心流程。2026-09-25 Human接受现有持续使用及长期稳定性证据，本轮免重复人工验收；以上步骤保留供新安装或未来兼容性变化时使用。Desktop专属工具全集、专门睡眠唤醒和所有负载无泄漏并非本次证据所证明，详见PROJECT.md。

## 本地配置

| 字段 | 说明 |
| --- | --- |
| `codex.binary` | `codex` 或绝对路径；本机通常为 `/Applications/ChatGPT.app/Contents/Resources/codex` |
| `codex.cwd` | 默认 `./workspace`，附件、执行工作目录及文件返回边界 |
| `codex.model` | 留空使用 Codex 默认模型；也可通过飞书 `/model` 设置 |
| `codex.effort` | 留空使用默认强度；填值需被所选模型支持 |
| `codex.sandbox` | `workspace-write` 或 `read-only` |
| `codex.approvalPolicy` | `on-request` 或 `untrusted`，审批交给用户 |
| `codex.allowExternalThreadRead` | 兼容旧配置：默认 false；true 相当于 read |
| `codex.externalThreadPermission` | 可选 read / work；设置后优先于旧字段。full 在 Phase 2 中拒绝 |
| `codex.appServerUrl` | 可选本机 `ws://127.0.0.1:端口`（也支持 `[::1]`），连接已运行的共享服务器 |
| `codex.appServerSocket` | 可选已运行共享服务器的 Unix socket 绝对路径；与 appServerUrl 二选一 |
| `storageDir` | 默认 `./data`，保存账号绑定、消息收件箱和会话映射 |
| `streamIntervalMs` | 默认 1000，最小 500；飞书出站请求另外串行限速 |
| `maxAttachmentMB` | 默认 20，范围 1–30 MB；限制收到的每个附件 |

相对路径都以配置文件所在目录为基准。`config.local.json` 权限为 600，且已被 Git 忽略；日志不会输出飞书 Secret 或完整 SDK 请求体。不要把真实凭证填入 `config.example.json`。

本地服务沿用 Codex 的登录与配置，不需要把 OpenAI 凭证放到机器人配置中。本地运行不等于离线推理，模型请求仍通过网络。使用情况取决于 Codex 登录账号和模型。

`workspace-write` 限制写入，并不意味着系统所有读访问都被禁止；Codex 仍可能加载用户级配置、Skills 和 MCP。默认工作目录单独放在 `workspace`，请保持配置和状态目录在它外面。

## 运行与诊断

要求 Node.js 24.10+，可用的 Codex CLI / App Server。换机器后：

```sh
npm ci
cp config.example.json config.local.json
# 编辑配置；先运行 codex login 登录
npm run doctor
npm start
```

当前组合开发验证版本：Codex CLI `0.155.0-alpha.16.3`、飞书 SDK `1.74.0`、Node.js `24.21.0`。使用本机协议的连字符枚举值（如 `workspace-write`），不将网页示例中的其他版本写法直接套用。

```sh
npm run check       # 语法检查
npm test            # 离线自动测试，不访问模型和飞书
npm run doctor      # 真实 Codex 握手 / 登录状态 / 模型列表，不调用模型
npm run smoke       # 真实临时会话和动态工具注册，不调用模型
node scripts/live-check.mjs  # 一次短模型调用；验证工具、历史、分支和恢复，随后归档测试会话
```

推荐双击 `安装自动启动.command`，或运行 `npm run service:install`，将机器人注册为当前用户的 macOS `launchd` 服务。服务会在登录后启动；进程退出、崩溃或被中断后由系统自动拉起。飞书长连接的临时网络中断仍由 SDK 自动重连。电脑关机时机器人不可用，重新开机并登录后会恢复；此设置不会阻止系统休眠。

服务管理命令：

```sh
npm run service:status     # 查看运行状态、PID 和日志位置
npm run service:restart    # 手动重启
npm run service:uninstall  # 停止并移除自动启动，保留配置和数据
```

也可以双击 `查看机器人状态.command` 或 `停用自动启动.command`。服务日志位于 `data/service.log` 和 `data/service.error.log`，受本地数据目录保护。安装服务后不需要再保持终端窗口打开，也不要同时运行 `启动机器人.command`；进程锁会阻止重复实例。

飞书连接由 SDK 自动重连。安装 `launchd` 服务后，机器人异常退出会被系统自动拉起；Codex 子进程异常退出时，机器人也会主动退出，让系统替换整个进程。重启后可继续持久化会话，**不会自动重跑中断的执行**，避免重复修改或重复发送。消息接收先落盘再确认；相同 `message_id` 不会重复执行。上次处于“处理中”的消息标记为状态不确定，提示检查后手动重发；尚未开始的排队消息会继续处理。

SQLite 保存在 `data/state.sqlite`。请保留 `data` 以保留绑定和会话映射；Codex 对话历史由 Codex 自己保存。附件和消息不会自动清理，长期使用需按需维护磁盘空间。

## 第一版边界

- 未填写飞书凭证前，无法验证真实租户权限、卡片客户端渲染和按钮回调；需配置后做一次端到端验收。
- 不提供群聊、多用户、实时语音、自动语音转写、定时任务和桌面界面同步。
- 新会话使用实验性的动态工具注册接口，以支持自然语言跨会话引用和文件返回；升级 Codex 后先运行 smoke / live-check。
- MCP 标准表单支持布尔、文本、数字和枚举字段，通过卡片或 `/answer` 填写，再明确提交；网页授权显示地址，用户完成后确认。密码字段、不兼容的表单及原生身份验证仍需在本机处理，不会自动批准。支持授权交互不会自动安装飞书云文档工具或增加飞书应用权限。
- 文件处理具体格式和搜索等能力取决于本地 Codex 工具配置。SDK 未提供或账号不可用的能力不会被机器人凭空补齐。

## 参考文档

- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- [飞书长连接接收事件](https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case)
- [飞书长连接接收回调](https://open.feishu.cn/document/event-subscription-guide/callback-subscription/step-1-choose-a-subscription-mode/configure-callback-request-address)
- [飞书流式卡片](https://open.feishu.cn/document/cardkit-v1/streaming-updates-openapi-overview)
- [接收消息](https://open.feishu.cn/document/server-docs/im-v1/message/events/receive)
- [发送消息](https://open.feishu.cn/document/server-docs/im-v1/message/create)
- [获取消息资源文件](https://open.feishu.cn/document/server-docs/im-v1/message/get-2)
- [上传文件](https://open.feishu.cn/document/server-docs/im-v1/file/create)


## 飞书云文档与授权交互

已注册 5 个文档工具，模型可直接调用：

- `feishu_doc_create`：用 Markdown/HTML 创建原生文档，并将绑定账号加入可编辑协作者。
- `feishu_doc_read`：分页读取原生块、块 ID 与文档版本。
- `feishu_doc_append`：追加内容，也可指定父块；不覆盖原文。
- `feishu_doc_update_text`：按版本更新指定文本块；替换文本会清除该块原有行内格式。
- `feishu_doc_permissions`：检查应用是否有阅读、编辑、分享权限。

支持标题、粗体、斜体、链接、列表、引用、代码及原生表格。单次最多 100000 字节、1000 个转换块；长文分段追加。暂不支持图片素材上传、知识库链接解析、任意用户分享或全篇覆盖。已有文档需要对应用开放协作者权限，不能只给人开放。新建文档不会公开到互联网。

应用需开通官方接口对应的文档创建/编辑/读取和协作者管理权限。可先用 `feishu_doc_permissions` 检查应用对目标文档的权限。参考 [创建文档](https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/create) 和 [增加协作者权限](https://open.feishu.cn/document/server-docs/docs/permission/permission-member/create)。

旧工具会被 Codex 持久化在旧会话中。当前版本首次继续机器人创建的旧会话时会创建带新工具的会话，带入近期历史并保留旧会话 ID，可继续分页查询更早历史；不会声称完整模型上下文已原样迁移。新会话及其分支正常延续。

普通审批使用允许/拒绝卡片；标准及兼容 JSON Schema 的扩展表单支持命名选项、多选和对象。数组、对象使用 `/answer 请求码 字段名 JSON` 回答，所有必填项完成后点击提交，服务端校验通过才回复批准。默认值不自动提交。含密码/密钥、未知 schema 扩展或原生身份验证的请求会明确提示。网页授权有“打开授权页面”和“已完成网页授权”按钮，点击后仍由授权服务判断登录是否成功，不等于凭空取得权限。

验证命令：`npm test`、`npm run smoke`、`node scripts/live-check.mjs --docs`（使用一次模型调用、模拟文档工具返回）、`node scripts/docs-check.mjs`（真实创建一份测试文档并验证读写，会保留测试文档）。

### 共享联调的资源限制与排查

共享服务和共享 Desktop 启动入口为各自进程设置文件句柄软上限 4096；launchd 服务硬上限为 8192，不修改系统全局限制。包装脚本会核验软上限，失败则停止启动。服务包装脚本安装在用户 Application Support 目录，避免后台服务从 Documents 执行脚本受系统访问限制。

已有联调环境可执行 `node scripts/desktop-shared.mjs repair-limits`。仅在没有共享客户端连接时重启共享服务；不会切换机器人权限或重启 Desktop。请先完成任务并退出共享客户端。然后可执行 `node scripts/resource-check.mjs`：只做连接与历史元数据读取，结果保存在被 Git 忽略的 `data/shared-lab/resource-check.json`，不调用模型、不发送飞书消息。它只能验证该负载的资源回收，不能替代长期 Desktop 使用测试。

共享客户端无法显示审批卡片或支持表单时，只释放本地交互，让原客户端继续处理；不会自动向共享服务发送拒绝。用户明确拒绝和已显示审批的超时策略保持不变。解绑只结束飞书观察，不中断原任务，也不会撤销任务已经修改的文件。

### FD 遥测与长期验收

`node scripts/desktop-shared.mjs telemetry-start` 安装独立的、每 60 秒运行一次的本机只读采样任务；`telemetry-stop` 卸载采样任务并保留历史，不停止共享服务。它不改变机器人权限。旧安装先在共享客户端退出后执行 `repair-limits`，产生与 PID、进程启动时间绑定的限制记录；缺失或不匹配时显示 unknown，不用猜测的 4096 计算阈值。

本地 `data/shared-lab/telemetry/latest.json` 是最新状态；`samples.jsonl` 保存时间、PID、FD 总数及 socket/pipe/regular/other 分类、启动时 soft/hard 限制、RSS KiB、直接子进程数、该监听端口已建立连接数和协议 loaded Thread 数。分类仅计数字 FD，不计 cwd、txt 等映射。进程变化或读取失败标记 unavailable/partial；连接数无法区分无匹配和诊断失败时为 null。loaded Thread 请求最多 3 秒，失败为 null；不 resume、不调用模型，也不响应共享审批。采样自身的短连接在 FD/连接统计之后创建。

达到实际启动软上限 50% 时记录 warning；70% 保存详细 snapshot；80% critical 明确告警。告警写入 `alerts.jsonl` 和本机遥测错误日志，**不自动发飞书消息或桌面通知**。详细快照仅保留 FD 编号/类型，不保留文件名、地址、消息正文或命令参数；阈值变化时保存，持续高位最多每 10 分钟一次。JSONL 每份约 5 MiB 轮换并保留上一份。遥测可独立关闭，不会中断工作；采样不修改系统全局限制。

`node scripts/shared-soak.mjs` 是约数分钟的真实模型短测：两个协议客户端、3 个专用任务、6 个回合、无副作用 printf 工具调用和3次连接重建；只清理测试创建的任务，结果写入独立本地 soak JSON。它不发送飞书消息、不修改生产配置，**不等于真实 Desktop + 飞书联调或隔夜稳定性通过**。既有483条样本连续覆盖8小时4分15.751秒，FD在25–51之间且RSS回落；Human已接受该证据，不要求本轮重复。该观察主要为低负载，不保证未来所有负载无泄漏；升级或出现新异常时再针对变化复核，不对重要任务制造断线或睡眠故障。
## 群聊观察助手（Issue #6，默认关闭）

群功能独立于单聊和 PR #5 的共享 Thread。仅本机配置 `groups.enabled=true` 且在 `allowedChatIds` 中的群启用；不要把真实群 ID 或配置提交到 Git。未 @ 的消息只入库，不调用模型、不回复。只有事件 mentions 中精确匹配机器人 Open ID 的用户 @ 才响应；纯文本“@机器人”和机器人之间的 @ 不触发。

### 飞书前置配置

由群管理员在群设置的机器人入口添加本应用机器人，确保应用已发布且成员在可用范围内。订阅 `im.message.receive_v1`，并申请 **`im:message.group_msg`**（读取群内用户发送的全部消息，敏感权限，可能需要管理员批准）。只有 `im:message.group_at_msg` / `im:message.group_at_msg:readonly` 时只能收到 @，不能声称已经记录普通群聊。若还需要记录其他机器人消息，另申请 `im:message.group_msg.include_bot:read`；默认不要求。应用自己的消息不依赖事件回流记录。

保留已有 `im:message:send_as_bot` 回复权限；群首版用文字回复，不依赖 CardKit。订阅 `im.message.recalled_v1` 和 `im.chat.member.bot.deleted_v1` 以清除撤回消息和处理退出群。应用更新权限/订阅后须发布生效。API 能读取群信息或历史，不代表长连接已获得未 @ 消息订阅，必须做真实验收。

官方依据（2026-09-24 核对）：[接收消息事件与权限](https://open.feishu.cn/document/server-docs/im-v1/message/events/receive)、[增加文档协作者](https://open.feishu.cn/document/server-docs/docs/permission/permission-member/create)。群文档授权使用 `member_type=openchat`、`type=chat`、`perm=view`，应用必须已在该群且有添加协作者权限。沿用既有 docx 创建、编辑、内容转换权限。

### 使用与权限

- 普通成员：@ 后查询本群消息，按时间、发送者 Open ID、关键词检索，生成总结、行动项和 Markdown 表格。每次最多50条，前后上下文最多各10条；来源结果及模型上下文有长度上限。回复默认只显示答案，不自动附消息编号、时间清单或同步诊断。用户明确要求来源时再提供相关来源；资料不足影响结论时简短说明。首次启用自动分页同步完整可读历史；启动、每分钟和 @ 前自动补齐离线窗口。
- Owner：上述能力，加明确的文档写入命令。首版不从模糊自然语言推断写入授权；先生成正文，再由 Owner @ 发送下述命令。普通成员不能写文档。
- 所有人（包括 Owner）在群中均无私人 Thread、Attach、审批、本机文件、GitHub、跨群访问权限。个人单聊权限不传递到群内。

Owner @ 后可使用：

```text
/group-doc create 群讨论整理
这里粘贴确认后的 Markdown 正文或表格

/group-doc append 文档ID
追加 Markdown 正文

/group-doc update 文档ID 块ID 读取时版本号
替换文本
```

创建的新文档写入成功并分享给本群后，才登记为本群资源。更新仅限 `groups.documentIds` 明确授权的 docx ID 或本群成功创建的文档；飞书平台权限仍会校验。不能用群消息中的链接自动授予资源权限。部分创建失败可能留下空文档，超时不盲重试，Owner 应检查实际文档；撤回/停止不会回滚已完成的文件写入。模板配置保持空文档清单。

### 模型隔离与运行限制

每群使用独立、持久化的 Codex HOME 与 `ephemeral:false`、`environments: []` Group Thread。首次工作 @ 时创建任务并立即保存 ID；后续 @ 和进程重启都 resume 原 ID，恢复失败不偷偷新建替代任务。普通消息只写 GroupMessageStore，不为创建空 Thread 启动无意义模型 Turn。显式关闭 shell、apps、plugins、记忆、浏览器、委派及技能发现，不加载私人配置或历史。仅引用同机 `auth.json` 登录状态，不复制凭据。不能将 read-only 沙箱或提示词当作隔离边界。群模型不连接 Desktop 的共享 App Server。

目前仅允许已验证的 `codex-cli 0.155.0-alpha.16.3`。升级后先重新验证再更新版本门槛。运行 `GROUP_CODEX_BINARY=/实际/codex npm run group:check`：本地假模型捕获真实工具清单，并主动请求技能枚举、伪造技能文件读取、命令和文件读取。该版本残留 `skills.list/read` 接口，但两类技能目录为空，伪造包不可读；问答请求被桥接拒绝。模型可用资料工具只有本群 `group_search/context/changes/message`。探针同时覆盖首次创建和进程重启后的 resume；两次共10个对抗调用。检查不使用凭据、不调用远端模型。

每群最多一个活动请求，全局最多两个；实时有效 @ 先持久化，按本机成功认领顺序 FIFO 调度，同群逐条独立 Turn，全局满额时等待。不会语义合并或使用群 turn/steer，单聊 steer 不变。单次180秒、最多12次动态工具调用；回复截断并说明检索范围。失败后不自动重新调用模型、写文档或重发未知结果。切换群功能不授予任何 Full 权限。

### 本地数据、撤回和保留

`storageDir/groups/groups.sqlite` 独立保存消息、最小身份信息和引用关系，0600文件/0700目录，必须保持在忽略的运行目录。默认 `retentionDays:null`，保留完整原始历史直到撤回/退群或管理员明确清理。现有配置中的数值不会隐式改写；若明确设置1–365天，则按该保留期清理，覆盖范围不能当作完整历史。附件仅存引用和有限元数据，不下载、OCR或转写。保存 API 返回的原始 content 与可解析文本；模型每次仅获得有界片段，长消息可用 group_message 按4000字符分页读取。卡片若只返回占位内容，原始记录也只能保存平台实际返回的内容，不声称获得隐藏正文。

按 message_id 去重，不按 event_id。撤回尚未执行的 queued 消息只取消该请求并删除正文，不中断当前请求；排队正文不会提供给当前模型或群检索工具。撤回已执行/普通历史消息沿用整群上下文失效清理；退出群事件清空群消息及本地生成文档授权，持久化停止标记，重新入群不会自行恢复。恢复需管理员明确处理本地停止标记并重新授权。撤回ID和停止标记保留为最小去重元数据。长期 Thread 可能已含撤回/过期消息，因此撤回、过期清理或退出群时使群 Thread 失效、取消在途响应，并在活动工作结束（模型 RPC 关闭）后由所有任务共用的结束路径清除其本机隔离 HOME；无活动任务时立即清理，文档/非模型命令也不能跳过清理；下一次经授权工作会从剩余群库建立新一代任务。该隐私清理是固定 ID 的明确例外，普通重启不换 ID。已经发出的回复、已创建的云文档、用户备份及飞书服务端历史不由此撤销。

首版没有可靠编辑事件同步，保存的是首次收到的消息快照，不承诺反映后续编辑；没有收到撤回事件时也无法自动感知撤回。停用 allowlist 后不再接收/使用该群，既有消息按保留期清理。清理不等于删除用户自行备份或云端文档。

### 验收

先运行 `npm run check`、`npm test`、`npm run doctor`、`npm run smoke`、`npm run group:check`。`npm run group:status` 只显示计数和状态，不打印群ID或消息正文。

### 群请求排队与恢复（Issue #10）

- `groups.queueLimit` 默认10，允许1–20，为每群**等待中**上限，不含正在执行的1条。满额请求记录为 `queue_full`，回复原消息“当前待处理请求较多，请稍后再试”，不执行模型；通知发送不确定时不自动重发。正常入队不额外提示。
- `group_requests` 保存自增认领顺序、消息ID、可信实时事件身份/mention和状态；正文复用现有消息库。历史同步只补资料，永不创建待执行请求；旧版本缺少可信认领记录的queued也不恢复。
- 状态：queued → running → sending → done。执行前明确拒绝为failed；撤回/退群为cancelled；模型或发送结果无法确认为uncertain。Owner指令与普通请求共用FIFO，出队重新检查当前Owner/资源授权，发送前仍检查；读取期间授权范围变化也丢弃结果。
- 服务close不启动下一条，queued保留；重启将running/sending标记uncertain，不自动重跑。**同群只要有uncertain就暂停所有后续queued**；其他群照常。明确未开始且无未决前序的queued恢复执行，沿用原Persistent Group Thread。
- uncertain需Owner在本机核对该请求的模型Turn与飞书发送事实，明确决定完成或放弃后再处理本地状态；本版不提供自动解除、自动重试或群内解锁命令。不要删除标记或重发旧请求来绕过未决前序。`npm run group:status`可查看不含正文/身份的请求状态计数。
- 已执行消息撤回、退群、retention失效会取消当前及排队请求并沿用隐私清理；仅queued消息撤回不使当前任务失效。撤销群allowlist最迟下次500ms调度检查时取消、清理，出队/工具/发送也即时复核；新授权不会自动清除退群停止标记。
- 重启恢复依据本地认领记录而非历史@扫描；普通成员与Owner使用同一调度，不扩张私人资源权限。取消不会撤销已发回复或已完成文件/云文档修改。

真实群验收至少：普通库存消息保持静默并入库；精确 @ 生成库存表和来源；按关键词/日期找回前文；普通成员请求私人任务/写文档被拒；重复事件不重复回复；重启后历史仍可查询。切勿给同一飞书应用同时启动两个独立长连接来做测试，事件可能分流。与未合并 PR #5 联调时应使用保留 PR #5 功能的隔离测试包，不直接用本分支覆盖共享运行服务。

### 完整历史、断线补录与工作上下文（本轮更新）

- `history_sync` 持久化 syncing/complete/partial/failed、分页 token、固定查询上界、已确认连续区间的消息 ID 锚点、最近完成时间和最近 live 事件接收时间。最后两项分别代表 API 扫描完成和进程收到事件，不能冒充飞书服务 SLA。
- 首次按创建时间倒序分页至 API 末页，每页数据与 checkpoint 同一事务提交。失败保留 checkpoint；下次定时/启动/@ 前继续。页面 token 失效会 fail closed，需管理员核验后重置该扫描，不能报 complete。
- 后续扫描从新的固定上界向前补录，直到与上次完整扫描锚点 message_id 重合；若锚点被删除，则一直扫描到末页。普通 live 入库记录不能充当连续区间证明。消息 ID 去重，实时与历史路径可并存。
- 补录路径永不分发交互。启动前产生但延迟投递的 @ 也只记录；历史抢先入库的新 live @ 可以原子认领一次。失败/结果不明/已处理任务不自动重放。
- 本机 `0.155.0-alpha.16.3` schema 有 `thread/injectItems`（原始 Responses items），但未取得稳定语义和幂等保证；本版不使用该实验接口。`thread/resume.history` 明确标记 UNSTABLE / DO NOT USE，也不使用。不靠普通消息创建 Turn 来伪造同步。
- `group_threads` 持久化 Thread ID、resume/running/idle/failed 状态、成功提供的增量预览 cursor 与 pending_cursor。@ 时提供最多15条有界增量、数据库覆盖范围及是否还有余下资料；成功 Turn 后才推进 cursor。该游标只表示已提供预览的位置，**不是所有原文已经被模型吸收的证明**。剩余内容和早期资料始终可按时间/关键词/发送者、序号或消息 ID 回查。失败保留原 cursor，资料再次提供不会重放旧任务。
- 大量原文不会一次塞入 Context Window。由 Codex 自身工作上下文管理处理长对话；不增加主动 Compaction Turn、不删除原始群库。未实测极限 Context Window 下的产品体验。
- 每群独立持久化 HOME 位于 `storageDir/groups/threads/<群ID哈希>/`，不挂接个人 Shared App Server。同群连续工作自然延续，其他群与私人任务没有共享历史、工具或权限。
- docx/docs/wiki/base/sheets 链接只记录类型、资源标识及链接；来源消息保留分享者和时间。不会自动下载、全文镜像或授予阅读/写入权限；当前资源内容与历史分享事实分开。本轮不新增资源读取 Gateway、Daily Digest、Topic Memory 或私人权限。

## Owner Resource Gateway（Issue #8，候选功能）

默认关闭。仅当前绑定 Owner 在已授权群内的**实时 @ 指令**可以读取私人资料；正文、昵称、转发和历史内容不授予权限。首版采用明确命令，不由模型自动选择私人资源。结果作为有限参考进入该群既有 Persistent Group Thread，群成员后续可讨论；不会绑定或修改被读取的私人 Thread。

在本机 `config.local.json` 配置 `ownerGateway.enabled=true`，需要私人任务时另设 `privateThreads=true`。数据库必须逐项登记，例如（全部为占位值，不要提交真实配置）：

```json
{"ownerGateway":{"enabled":false,"privateThreads":false,"resources":[{
  "id":"inventory","type":"sqlite","displayName":"授权库存",
  "path":"/ABSOLUTE/LOCAL/PATH/inventory.sqlite3",
  "permissions":["read","compute"],"tables":{"sales":["brand","amount","prior"]}
}]}}
```

Owner 在授权群 @ 机器人后发送：

- `/owner search 任务标题关键词`：返回最多30个标题与任务ID，不附内容预览。
- `/owner read 任务ID` 或 `/owner read 任务ID 游标`：最多8回合，每条1500字符，总计12000字符，附分页游标和截断状态。下一行可写本次对比/总结要求。
- `/owner resources`：显示可读资源、表列和权限，不显示路径。
- `/owner query inventory`，下一行是结构化查询，例如：

```json
{"table":"sales","groupBy":["brand"],"metrics":[{"op":"sum","column":"amount"},{"op":"sum","column":"prior"}],"derive":[{"op":"growth","left":0,"right":1}],"limit":50}
```

也支持 `columns:["brand","amount"]` 投影与 `where:[{"column":"brand","op":"=","value":"Example"}]` 筛选。筛选只支持 =、!=、>、>=、<、<=。metrics 支持 count/sum/avg/min/max；结果字段 metric_0 等按输入顺序编号。derive 的 left/right 引用同一行指标序号，支持 difference（左减右）、ratio（左除右）、growth（左减右再除右）；分母0返回 null，不能据此编造增长率。分组最多3列、指标8个、派生计算4个。

仅 SQLite 驱动；表与列双重允许列表、只读连接、SQLite authorizer 拒绝写入/附加数据库/未授权函数、符号链接路径拒绝。无任意 SQL、文件路径或 shell 接口。默认50行、最高100行、查询默认2秒取消期限、行结果16000字符、最终网关结果24000字符；超量或超时明确失败，不自动扩大查询。查询在固定独立子进程运行，不继承机器人环境变量；到期或取消发送 SIGKILL，并等待进程 close、连接释放后返回失败。两秒是触发取消的期限，不是严格墙钟上限，还包含事件循环调度与操作系统回收时间。Thread RPC 每步6秒，失败不回退整份历史读取。

默认去除已知凭据、常见令牌/连接串/本机路径和秘密字段，原始错误不进入群。文本脱敏不是任意秘密的万能检测器；只应授权确有群内披露需要的资料，数据库只登记必要列。私人引用保存在当前群模型上下文中，直到既有清理/保留机制使其失效；撤回原私人任务内容不会自动撤回已授权的群引用。飞书文档/多维表格实时读取、其他数据库驱动和自然语言自动路由尚未实现。已有 `/group-doc` 明确写入流程保持独立。

私人任务可进一步用本地 `ownerGateway.threadScopes` 限定为 `{ "任务ID": ["消息item ID"] }`。设置后搜索只返回列出的任务，读取只提供列出的用户/助手消息，其他任务在RPC前拒绝。空对象禁止所有私人读取；省略或 null 保持 Owner 明确请求的通用只读模式。仅批准一段总结时应使用该范围配置，不能用提示词替代范围校验。


## 群长期知识（Issue #12，默认关闭）

群知识链路为 Raw Messages → Daily Digest → Topic Memory。原始消息仍是事实底座；摘要和主题是模型派生资料。此功能从 main 独立开发，不依赖未合并的 PR #5 Work 能力；开发目录、配置、数据库、服务和 PR #5 的长期观测分别维护。

显式配置 `groups.knowledge`（示例已在 config.example.json）：

```json
{"enabled":false,"timezone":"Asia/Shanghai","dailyAt":"02:00","maxDaysPerCycle":2,"maxMessages":500,"maxInputChars":80000}
```

启用后仅整理既有授权群。每天当地时间02:00后处理前一完整自然日；离线不运行，上线从最早可见日期顺序补算。历史必须 initial_complete、state=complete 且同步时间覆盖该日末尾。partial/failed 或缺少时间证明会等待，不冒充完整。跨夏令时按当地自然日边界处理；开始生成后变更时区需要人工重建，避免混用日历。

知识补算对仍在排队的请求继续等待；队列满被拒绝或已取消的请求保持隐藏，其Raw记录保留，但不进入知识模型。日报coverage明确标记filtered，并给出可用消息数、总数和各终态排除数量；主题版本读取也返回对应日报coverage。仅含排除记录的日期可发布零输入no_material_content记录并推进，但不声称整日完整覆盖；不改变取消/队列满状态，也不解除原有检索隐藏规则。

后台最多一个 Worker，每分钟至多一次模型调用，每周期最多前进配置的天数（1–5）；实时@优先，立即中止后台模型并延后恢复，不占用户持久群任务或FIFO槽位。普通未@消息继续静默入库。后台只处理本群必要消息和本群已有主题，不连接Owner Gateway、不读取私人任务/数据库、没有shell/文件/审批/GitHub/文档写入工具，也不主动发日报。

每个摘要保留聊天中报告的事实（并非独立核验事实）、计划、决定、观点、行动（未知责任人/期限为null）、未决问题、资源引用、主题候选和来源ID。无实质内容日可为no_material_content。主题有稳定ID、可变标题、当前状态、版本和版本记录；旧事实更新须保留来源并记录变化，未决冲突不能静默消失。摘要和主题事务提交，非法JSON/schema、伪造来源、跨群ID、非法资源链接或过量输出都不写正式知识。重要内容仍需人工核对，不以schema通过证明模型语义绝对正确。

只读工具group_topics、group_topic_read、group_daily_digest按需读取当前群知识；原始消息用group_message等工具回查。既有持久群任务没有新工具注册时，兼容group_search返回derivedTopics，再用group_message的`topic:主题ID`读取，不清空或重建用户任务。结果标记派生性质和来源可用性，不把全部Topic塞进每次用户上下文。

撤回会立即隐藏受影响知识。第一版保守地将该群全部派生知识标dirty/invalid、清除派生正文，再顺序重算；版本号和来源审计元数据保留。仅来源匹配无歧义时复用重建主题ID。退群/撤权清除本群知识与Raw，并中止/清理临时Worker目录。有限retention后主题保留，但标记原文部分不可回查；已截断的历史日期明确skipped，不生成“完整摘要”。迟到历史会重新排入较早日期，必要时使旧知识失效。

第一版资源上限：每日至多配置数量的消息（最大1000）、输入最多配置字符数（最大120000，含主题），最多50个现有主题、单主题输出18000字符、总输出128000字符。超限整日fail closed，不截断后冒充完整；最多3次失败后blocked，后续日期暂停，Owner需本机诊断/调整范围后明确重试。覆盖不足等待不消耗模型重试次数。未实现大日分块归并、向量检索或自动主题拆并。

验证与诊断：

- `npm run knowledge:check`：真实本机Codex二进制、假provider隔离探针，无真实模型/飞书消息。
- `node scripts/knowledge-model-check.mjs --run-model`：调用真实模型处理两天合成数据，验证同主题版本和来源；不接飞书/生产库。
- `npm run knowledge:status`：只读聚合任务状态，不启动Worker或恢复任务。
- `npm run check`、`npm test`、`npm run group:check`、`npm run doctor`、`npm run smoke`：现有回归与环境检查。

真实群验收须在明确授权群核对摘要、主题、来源回查与实时@并行。Human 于2026-09-25授权当前候选启用 Knowledge，验收目标调整为 MVP：原始消息完整、来源可追溯、跨群及Worker权限隔离、无明显编造、不影响实时群聊/FIFO。细致的事实/决定/计划/行动语义分类是后续质量优化，不是本轮阻断条件。完整链路通过后才转Ready；不会自动Merge。

## Owner 私聊群网关（Issue #13）

启用现有 `groups.enabled` 后，**绑定 Owner 的机器人私聊任务**可以通过 `owner_groups` 查看当前 `groups.allowedChatIds` 中、有本地历史状态且未停止/退出的群。目录名称由飞书群信息 API 获取，缓存一分钟；目录接口失败时该群暂不列出，不通过全局搜索发现其他群。群功能关闭时不注册网关。PR #5 的外部 Work 任务不在本次新工具注册范围内。

- `owner_group_search/message/context/changes/status`：按需读取本地镜像；单页最多50条、上下文前后各10条、长消息每段4000字符。发送者使用返回的 `s_...` 引用筛选，不暴露绑定 Owner 的配置身份。`status` 使用本地确定性计数，不把全部正文送模型。
- 同名群返回候选及稳定 `g_...` 引用，让 Owner 明确选择。最近明确选择的群按 Owner、私聊、任务隔离保存；模型自行选择一个群不会更新用户选择。新私聊请求在接收时先清除旧指代，只有紧接着的受支持“这个群”发送可沿用上次明确选择；含冒号、换行、引用或多候选的查询仍可读取，但不能建立发送指代，后续发送须明确群名。服务重启清除旧选择。每次调用仍检查当前授权，不把引用或历史记忆当权限。
- `owner_group_daily_digest/topics/topic_read`：读取已生成的本群知识与来源；Knowledge 关闭或尚无产物时 Raw 查询仍独立可用。超过单次24000字符的派生结果拒绝整份输出，提示缩小范围/回查原文。
- 原始正文和元数据保留不变；模型预览的资源ID、附件字段和限制说明分别限长，超过2048字符的URL整体省略并标记，不输出可能失真的截断链接。单条预览仍过大时返回消息ID、短正文及原文分页提示，保证可见记录有可恢复表示；预览数组限制22000 UTF-8字节，为网关包装留出空间。
- 增量读取每次最多扫描指定页大小的记录；隐藏终态可推进返回游标，queued则停在其前等待后续完成。空页但hasMore=true时继续使用返回游标；若游标未变则等待queued处理完成，不应忙轮询。retention之外的记录不计hasMore，不改变群任务游标。
- 查询只读取当前本地镜像，不发起 reconciliation、不启动 Group Turn、不推进群 cursor、不占 FIFO、不写入群消息库。返回同步时间、状态、retention和覆盖局限；API镜像完整不等于实时订阅正常，更不保证平台已删除/不可访问的历史。
- 原文、群名、派生知识与资源链接均是不可信资料；链接不自动授权外部文档访问。原始消息ID保留用于来源核对，普通回复不要求附大段编号。

### Owner 明确发送一条普通消息

发送工具 `owner_group_send` 只接受当前可信 Owner 私聊原文中的窄格式发送意图，例如：

```text
去机器人们群里告诉大家，下午三点开始测试。
把下面这段原文发到机器人们群：下午三点开始测试。
把刚才的总结发到这个群里
把刚才总结的三个行动项整理一下，发到这个群里
```

“这个群”须是当前私聊任务里，网关从 Owner 原始消息确认过的唯一群；否则请明确群名或目录引用。同名群也用目录引用选择。原文转发必须逐字一致；总结发送允许模型整理当前讨论。其他复杂措辞、富文本消息、附件中的指令、历史引用不授予发送权；无法解析时要求明确重述，不猜测。首版不做任何 mention：含 `@` 或飞书 mention 标记的发送正文会拒绝。

当前请求每次最多发一条、最多4000字符/12000字节；发送前和飞书出站队列实际调用前重查 Owner、allowlist、停止/退出、任务状态及新私聊消息。后续私聊消息到达立即取消旧请求未发出的发送权；单聊仍沿用 steer。请求在私人 SQLite 中先持久化一次性记录和稳定UUID，再调用飞书，不经过可分段/重试的通用文字发送接口。超时、缺失回执或进程退出后状态未决时不自动重发，明确返回“发送结果未确认”。这会保守地牺牲部分故障下的送达率，不承诺网络层恰好一次。

除这一普通消息发送外，不提供跨群Control、编辑/删除/撤回、成员管理、@成员、群文档写入、allowlist修改。后台Knowledge、群Agent和非Owner私聊均不能调用。Group→Private的既有Owner Resource Gateway保持独立。工具升级沿用既有单聊近期历史迁移机制，旧任务保留；不是Attach群任务或迁移全部模型上下文。

验证：`npm run check`、`npm test`、`npm run doctor`、`npm run smoke`（含新工具注册）、`npm run group:check`及`npm run knowledge:check`。后两项含伪造Owner群目录/发送工具攻击。真实私聊读取→来源回查→明确发送一次→只分析零发送，须在候选部署授权后另行验收；离线测试不替代此过程。


## Owner 私聊与授权群执行入口（默认关闭）

`ownerAccess.enabled=true` 将真实 Owner 在现有授权群中、启动后明确 @ 机器人的新消息交给私聊 Bot 执行链路。Owner 每个群拥有独立于普通群助手和私聊的 Thread；普通成员继续走隔离 GroupModel，不能使用 Owner 审批卡。群成员、历史消息、引用和模型参数均不能声明 Owner 身份。群内执行结果会发送到该群，因此 Owner 应仅在希望公开结果的群提出请求。

Owner 路径复用私聊的命令、文件、文档、Shared Runtime Work/Attach、工具注册和人工审批；活动回合的新 Owner 消息沿用私聊 steer 语义，不是普通群助手的 FIFO。普通成员 FIFO 不变。已有 `/owner` 与 `/group-doc` 显式命令继续走原群入口，以保留受控数据库、私人摘要和文档查询能力。撤回待处理 Owner 消息取消入队，撤回当前输入或机器人离群尝试中断对应回合，不撤销已执行的操作。权限关闭或 Owner 变化后不接受新请求/审批；重启前的群输入因 live 时间校验不自动重放。

`ownerAccess.inheritRuntimeDefaults=true` 让新建/升级的 Owner 任务不覆盖共享服务器的 sandbox/approval 默认值；否则沿用 `codex.sandbox` 和 `codex.approvalPolicy`。不自动授权审批。已有外部 Desktop Thread 仍通过 `/attach` 继续，不覆盖其工作目录、模型、审批或工具配置。

能力对齐不等于复制 Desktop 的所有工具：宿主 UI、浏览器、插件连接器等仍取决于目标 Thread 的工具宿主注册。Bot 不代理未知 Desktop 动态工具、不做任意 RPC 透传、不增加外部 Thread 管理权限。仅有 Desktop 客户端实现的工具需要该客户端在线处理，不声称离线可用。飞书平台权限另行生效。尚未新增多维表格写入工具。

普通群助手/Knowledge 使用独立进程与隔离配置；可用 `codex.isolatedBinary` 指定独立二进制，默认使用 `codex.binary`。必须通过版本固定的 `group:check` 和 `knowledge:check` 才能升级隔离运行时。本轮验证版本为 0.158.0-alpha.2，禁止为恢复功能直接移除版本检查。

Owner 群命令的回复和嵌套飞书调用在实际发送及重试前复核原消息身份、撤回和当前授权；错误通知也受同一限制。`/reference` 保留原群消息 ID，读取期间撤回不启动回合，启动后撤回取消该回合。取消后的卡片只允许关闭 streaming，不补发旧正文。


## Owner 查询群发言人姓名

Owner 的 `owner_group_search/message/context/changes` 在读取本地原文后，通过飞书当前群成员名单按 `open_id` 精确匹配，返回 `senderName`。稳定的 `s_` 发言人引用保留，供分页和按人检索；普通成员与 Knowledge 工具不增加姓名目录或权限。修改了工具描述，沿用既有 Owner 工具升级机制。

姓名是当前群显示名，不是发言时姓名，也不是实名核验。`senderNameStatus` 区分 matched、not_found、ambiguous、not_user、partial、unavailable、omitted（预算不足时暂省姓名）；无法匹配返回 null，同名不合并，不能据此认定学员零发言。显示名和原文一样是不可信资料。名单仅在单次调用内处理，不持久化姓名或向模型输出原始 open_id/完整成员目录；最多20页、10000成员，权限限制或分页不完整会明确标记。权限不足时保留可读原文及匿名引用，不暴露接口错误详情。

查询前、排队实际调用前、返回后均检查当前 Owner/群授权/原请求有效性；等待名单期间被撤回或过期的原文不再返回。加入姓名后按实际 UTF-8 序列化大小检查 result ≤22,000 字节、完整网关响应 ≤24,000 字节。大页必要时替换为紧凑来源记录（truncated、nextOffset=0），继续不足则省略姓名并标记 omitted；保留全部消息 ID、顺序和游标，不跳过未返回消息。按 messageId 可恢复原文和姓名。不可压缩的异常结果明确报错，不返回成功游标。仅读取成员，不修改群成员或发送消息。此功能不包含名单关联统计或多维表格创建。
