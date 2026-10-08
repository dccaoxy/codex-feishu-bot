# 飞书本地 Codex 机器人

飞书负责消息与卡片交互，本地 Node.js 服务通过 JSON-RPC 调用 `codex app-server`：默认使用 stdio，Work / Attach 使用同机共享 App Server 的 WebSocket 或 Unix socket。不依赖 Codex SDK，不需要公网服务器、域名或内网穿透。

## Phase 2 收口状态

PR #5已收敛main `9de0926`（包括已合并PR #14 Group Knowledge、PR #15 Owner Group Gateway，以及群历史、持久群任务、Owner Resource Gateway、FIFO）。共享Work入口与群/Knowledge独立执行环境并存，外部Work不注入Owner群工具，当前Owner授权语义以本文Issue #33修订节为准。

2026-09-25 Human接受既有长期稳定性证据及持续真实使用结果，免重复8小时soak和双端同步人工验收。已完成本组合check、236项全量测试、doctor/smoke及真实Work/审批协议回归，提交Ready供新head独立审核；旧PASS不代替新审核。未Merge、未进入Phase 3。本轮未重新部署或操作真实群，历史验收与本轮验证范围见PROJECT.md。

共享输入等待卡片或发送结果期间，支持的交互按请求ID有界暂存，确认同一回合后展示一次；对端已处理、解绑、断线或关闭会使暂存失效。每个观察最多32个交互ID，单条10KB、累计64KB，超限提示回原客户端处理，不自动批准/拒绝。文件diff按原回合及修改项匹配并有界缓存，缺失时仅展示原生请求提供的信息，不借此添加项目路径授权。该竞态修复经自动回归，尚未部署；真实协议复核通过但初始接口/时序波动保留，详见PROJECT.md最新返工记录。

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

可信绑定Owner可以搜索当前Codex实例可读取的会话并引用历史；无需额外read/work配置。列表按Codex更新时间排序，显示北京时间，“最后更新”不保证等于最后一条消息时间。历史是参考资料，不是新指令。进入外部Thread仍须连接它实际所在的同一共享App Server，不能用另一个实例的磁盘记录冒充实时状态。

无法保证访问另一设备、云端或所有新版会话存储格式；读取失败会明确报错，不会将“无法读取”解释成“没有历史”。历史会话不等于当前指令，工具结果只作为参考资料。

## Phase 2：Work / Attach

本阶段实现原 Thread 的继续工作，不提供 Full 管理。Work 允许 `/attach`、普通消息继续/追加、`/stop` 和 `/fork`；外部绑定期间 `/compact`、模型修改和管理操作不可用。`/detach` 后可继续使用原机器人会话。

### 配置与共享运行时

在本机 `config.local.json` 的 `codex` 中设置以下字段，保留其他配置：

```json
"appServerUrl": "ws://127.0.0.1:4500"
```

也可以省略/清空 `appServerUrl`，改用 `"appServerSocket": "/实际路径/app-server.sock"`。这是**目标 Thread 所在的同一个运行中 App Server** 的地址，不是另起一个能读取相同历史文件的服务器。地址从该实例的实际启动配置取得；机器人不会扫描、猜测或自动更换桌面实例。未配置共享地址时不能控制另一实例的Thread。

可为集成环境启动 `codex app-server --listen ws://127.0.0.1:4500`，然后让工作客户端与机器人均连接它。桌面端是否能使用这个地址取决于桌面端的实际运行方式；本项目不自动迁移桌面正在执行的会话。Unix socket 连接的是 Codex 的 WebSocket 控制接口。

旧 `allowExternalThreadRead`、`externalThreadPermission` 字段已退役，不再形成Owner的第二套权限策略。原生权限由所连接Codex及Thread决定。

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
| `codex.effort` | 新建 Thread 的默认强度，聊天级 `/effort` 优先；留空继承原生默认，续接既有 Thread 不覆盖其有效设置；填值需被所选模型支持 |
| `codex.sandbox` / `codex.approvalPolicy` | 已退役并忽略；不覆盖Thread有效设置 |
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

当前隔离运行时验证版本：Codex CLI `0.159.0`、飞书 SDK `1.74.0`、Node.js `24.21.0`。历史共享协议验收版本另见 PROJECT.md；隔离探针不代表重跑全部 Desktop 人工验收。使用本机协议的连字符枚举值（如 `workspace-write`），不将网页示例中的其他版本写法直接套用。

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

已注册 6 个文档工具，模型可直接调用：

- `feishu_doc_create`：用 Markdown/HTML 创建原生文档，并将绑定账号加入可编辑协作者。
- `feishu_doc_format_text`：按指定版本和原文精确匹配，对单块中的全部匹配文字设置加粗、斜体、下划线、删除线、文字色或背景色；保留其余文字、链接和样式。
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

目前仅允许已验证的 `codex-cli 0.159.0`。升级后先重新验证再更新版本门槛。运行 `GROUP_CODEX_BINARY=/实际/codex npm run group:check`：本地假模型捕获真实工具清单，并主动请求技能枚举、伪造技能文件读取、命令和文件读取。技能目录为空，伪造包不可读；问答请求被桥接拒绝。模型可用资料工具只有本群 `group_search/context/changes/message`。本轮探针覆盖首次创建、进程重启后的 resume 和22次对抗调用；Knowledge 探针覆盖15次。检查不使用凭据、不调用远端模型。

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

发送工具 `owner_group_send` 支持当前 Owner 的自然语言请求，例如“把这个文档发到新羽群里去”“把刚才整理的要点分享给学员群”，不要求固定句式。普通群成员仍无此权限。

主助手提出目标与正文后，独立的无工具语义核对器只根据当前Owner请求、同一Owner/私聊或授权群/任务最近4轮已完成对话及授权群目录，判断是否为明确发送、唯一目标、正文是否符合要求。群原文不会自动灌入核对器；助手答复、群名、拟发送内容均标为资料，不能自行授权。模型支持简称/指代，但语义判断不是确定性证明；目标重名、指代缺失、内容不明确才询问相应歧义。仅查询、否定发送、解释引用指令不得发送。

宿主先从授权目录和已验证来源的近期问答提取群名/简称、文档标题/精确ID及其来源位置，再交给独立核对器。候选解析不读取主助手拟发内容来补证据，也不产生发送许可；同一简称对应多个群或单一文档指代对应多个链接时明确澄清。文档标题、Markdown链接及URL中的文字不充当群名；同时提及来源群与目标群时仍由核对器区分语义，不把两个不同群的出现直接当作歧义。

解析结果同时约束实际发送：未解析到任何有效候选群时，在调用核对器前要求明确选择授权群，不能由模型提议补齐；唯一群不能被模型提议换成另一群；明确提及多个来源/目标群时，也不能换成候选之外的第三群。当前链接、标题或单一文档指代选定的文档集合不能被历史中的其他链接替代。只有明确引用近期摘要或复数资料时才保留多来源链接；普通上下文里出现过文档不等于本次选中了它，待发送正文里的“总结”等文字也不产生选取。宿主在语义核对、每次文档读取及实际发送队列边界复查这些约束和来源有效性，模型核对通过不能覆盖宿主拒绝。

程序继续验证当前Owner、可信事件上下文、授权群和任务；语义结果必须匹配拟发送的唯一目录引用。飞书docx链接按同一规则解析当前/近期对话与拟发送正文，完整 `document_id` 必须精确匹配，并经固定文档读取接口验证；前缀相似不能作为依据。查询参数、片段和正常尾部标点不改变文档ID；不将URL内部嵌套的链接视为独立依据。其他飞书资源链接暂不在此核实范围，要求提供可验证docx链接；不自动扩大权限。首版仍不做mention，含 `@` 或飞书mention标记的正文拒绝。

核对器复用版本固定的Group隔离运行时，使用独立临时目录、无环境/无工具临时任务，结束后清理；不复用Shared私人任务，不推进群FIFO/知识状态。每次发送会增加一次模型核对及相应延迟/用量；模型异常或输出无效时不发送，并报告核对暂不可用，不归咎于飞书权限。

近期指代资料按 Owner/聊天/任务保存在本机状态库，最多100个任务、每任务4轮、每次读取24KB；过长记录整体跳过，不截断链接。记录保留真实来源消息ID及内容摘要，撤回任一原始/补充输入后对应答复不再作为发送依据。重启可恢复本任务参考，工具升级只沿宿主实际验证的旧任务→新任务迁移；普通换任务和外部Attach不搬运其他任务参考。没有宿主记录的旧任务可从当前绑定的机器人任务恢复已完成回合，要求 Codex `clientId` 精确关联本地已接收的同一Owner消息。没有可验证身份、旧回合含多个用户输入或历史答复被截断时跳过；已有有效宿主记录不会被简化历史覆盖。历史不足仍需澄清，不能把恢复参考当成恢复旧发送授权。恢复等待、语义核对、文档核实及出站排队后均重新校验当前请求和引用来源；旧群选择同样绑定来源，撤回后失效。

当前请求每次最多发一条、最多4000字符/12000字节；发送前和飞书出站队列实际调用前重查 Owner、allowlist、停止/退出、任务状态及新私聊消息。后续私聊消息到达立即取消旧请求未发出的发送权；单聊仍沿用 steer。请求在私人 SQLite 中先持久化一次性记录和稳定UUID，再调用飞书，不经过可分段/重试的通用文字发送接口。超时、缺失回执或进程退出后状态未决时不自动重发，明确返回“发送结果未确认”。这会保守地牺牲部分故障下的送达率，不承诺网络层恰好一次。

除这一普通消息发送外，不提供跨群Control、编辑/删除/撤回、成员管理、@成员、群文档写入、allowlist修改。后台Knowledge、群Agent和非Owner私聊均不能调用。Group→Private的既有Owner Resource Gateway保持独立。工具升级沿用既有单聊近期历史迁移机制，旧任务保留；不是Attach群任务或迁移全部模型上下文。

验证：`npm run check`、`npm test`、`npm run doctor`、`npm run smoke`（含新工具注册）、`npm run group:check`及`npm run knowledge:check`。后两项含伪造Owner群目录/发送工具攻击。真实私聊读取→来源回查→明确发送一次→只分析零发送，须在候选部署授权后另行验收；离线测试不替代此过程。


## Owner 私聊与授权群执行入口（默认关闭）

`ownerAccess.enabled=true` 将真实 Owner 在现有授权群中、启动后明确 @ 机器人的新消息交给私聊 Bot 执行链路。Owner 每个群拥有独立于普通群助手和私聊的 Thread；普通成员继续走隔离 GroupModel，不能使用 Owner 审批卡。群成员、历史消息、引用和模型参数均不能声明 Owner 身份。群内执行结果会发送到该群，因此 Owner 应仅在希望公开结果的群提出请求。

Owner 路径复用私聊的命令、文件、文档、Shared Runtime Work/Attach、工具注册和人工审批；活动回合的新 Owner 消息沿用私聊 steer 语义，不是普通群助手的 FIFO。普通成员 FIFO 不变。已有 `/owner` 与 `/group-doc` 显式命令继续走原群入口，以保留受控数据库、私人摘要和文档查询能力。撤回待处理 Owner 消息取消入队，撤回当前输入或机器人离群尝试中断对应回合，不撤销已执行的操作。权限关闭或 Owner 变化后不接受新请求/审批；重启前的群输入因 live 时间校验不自动重放。

Owner创建Thread继承运行时默认权限，恢复/续接/分支不覆盖已有Thread权限和审批人。`inheritRuntimeDefaults`、`projectRoots`不再参与授权；已有工具版本变化不会自动创建替代Thread，需要新增工具时由Owner明确 `/new`。

能力对齐不等于复制 Desktop 的所有工具：宿主 UI、浏览器、插件连接器等仍取决于目标 Thread 的工具宿主注册。Bot 不代理未知 Desktop 动态工具、不做任意 RPC 透传、不增加外部 Thread 管理权限。仅有 Desktop 客户端实现的工具需要该客户端在线处理，不声称离线可用。飞书平台权限另行生效。尚未新增多维表格写入工具。

普通群助手/Knowledge 使用独立进程与隔离配置；可用 `codex.isolatedBinary` 指定独立二进制，默认使用 `codex.binary`。必须通过版本固定的 `group:check` 和 `knowledge:check` 才能升级隔离运行时。本轮验证版本为 0.159.0；仍精确匹配，不接受任意更新版本，禁止为恢复功能直接移除版本检查。Owner 发送语义核对复用同一版本门槛。

Owner 群命令的回复和嵌套飞书调用在实际发送及重试前复核原消息身份、撤回和当前授权；错误通知也受同一限制。`/reference` 保留原群消息 ID，读取期间撤回不启动回合，启动后撤回取消该回合。取消后的卡片只允许关闭 streaming，不补发旧正文。


## Owner 查询群发言人姓名

Owner 的 `owner_group_search/message/context/changes` 在读取本地原文后，通过飞书当前群成员名单按 `open_id` 精确匹配，返回 `senderName`。稳定的 `s_` 发言人引用保留，供分页和按人检索；普通成员与 Knowledge 工具不增加姓名目录或权限。修改了工具描述，沿用既有 Owner 工具升级机制。

姓名是当前群显示名，不是发言时姓名，也不是实名核验。`senderNameStatus` 区分 matched、not_found、ambiguous、not_user、partial、unavailable、omitted（预算不足时暂省姓名）；无法匹配返回 null，同名不合并，不能据此认定学员零发言。显示名和原文一样是不可信资料。名单仅在单次调用内处理，不持久化姓名或向模型输出原始 open_id/完整成员目录；最多20页、10000成员，权限限制或分页不完整会明确标记。权限不足时保留可读原文及匿名引用，不暴露接口错误详情。

查询前、排队实际调用前、返回后均检查当前 Owner/群授权/原请求有效性；等待名单期间被撤回或过期的原文不再返回。加入姓名后按实际 UTF-8 序列化大小检查 result ≤22,000 字节、完整网关响应 ≤24,000 字节。大页必要时替换为紧凑来源记录（truncated、nextOffset=0），继续不足则省略姓名并标记 omitted；保留全部消息 ID、顺序和游标，不跳过未返回消息。按 messageId 可恢复原文和姓名。不可压缩的异常结果明确报错，不返回成功游标。仅读取成员，不修改群成员或发送消息。此功能不包含名单关联统计或多维表格创建。

## Owner 飞书办公工具扩展

Task Source：Human 要求为本人私聊及已有授权群里的本人账号补齐可用工具；普通成员仍使用原受限工具。此扩展不修改授权群、Owner 身份、Shared Runtime 审批策略或 Knowledge 权限，不授予企业管理员身份。

- `feishu_office_find`：分页检索固定的 219 项官方接口目录，覆盖云文档块、多维表格、电子表格、云盘、知识库、日历、任务、联系人只读查询、会议和搜索。
- `feishu_office_schema`：按返回的 nextOffset 取完参数定义后调用 `feishu_office_call`；仅允许固定 SDK 方法，拒绝自定义 URL、请求头、Token、路径注入和身份切换。不一次向模型塞入全部接口定义。
- `feishu_office_sheet_read/write`：电子表格 v2 单元格范围读写，最多 5000 格/100KB，写入矩阵须与明确范围完全一致。不具备版本锁；写入前回读目标，失败先核对，不自动重试。
- `feishu_office_permissions`：分页列出已获批的应用/用户身份权限，不申请权限、不登录用户账号。
- `feishu_doc_format_text`：局部文字样式，要求读取时版本；色号采用官方定义（文字 1 粉红、2 橙、3 黄、4 绿、5 蓝、6 紫、7 灰），不是任意 RGB。

目录中 212 项支持 tenant 应用身份；7 项仅支持 user，未配置本机 Owner OAuth 时会明确拒绝。飞书后台批准 user scope **不等于**机器人已获取用户 OAuth。支持 tenant 也仍需应用 scope、资料协作者权限和相应产品可用性。创建资源后需检查链接、内容和访问权，不承诺自动对所有群成员开放。

普通成员/Knowledge 不注册这些工具。可信绑定 Owner 的当前请求可直接执行 Office 读写，无需重复确认卡片，也不要求 Trusted Document 或机器人创建记录。删除、分享、邀请等仍须当前 Owner 明确要求目标和动作；历史、文档和模型声明不能产生新授权。排队出站与返回前继续检查原回合、Owner 身份、撤回/撤权状态；已有文档块编辑要求具体 revision，写请求不自动重试。已到达飞书的写入无法回滚，超大结果仍只返回明确标记的有限预览。

用户 OAuth 仅提供下文的本机 Owner 可选绑定；不提供通用二进制素材上传、企业管理/人员写操作、群控制扩权或任意 API 代理。保留既有文件发送工具。工具目录数量不是权限开通数量，也不是每项接口真实验收数量。

权限实查（2026-09-28，只读）：知识库列表与日历默认分页读取成功；云盘列表缺 tenant `drive:drive` / `drive:drive:readonly` / `space:document:retrieve` 中任一权限；任务清单缺 tenant `task:tasklist:read` / `task:tasklist:write` 中任一权限。需要应用管理员在飞书开放平台按所需操作启用应用身份权限并使版本生效；已有 user 权限不能替代。写操作及具体目标资料权限仍须上线后验收。

接口目录来源：官方 [lark-openapi-mcp](https://github.com/larksuite/lark-openapi-mcp)，固定 npm `@larksuiteoapi/lark-mcp@0.5.1`，MIT 许可见 `third_party/lark-mcp-LICENSE`。运行时沿用已固定的 Node SDK 1.74.0，无新增生产依赖。仅提取 JSON Schema，移除 `useUAT`，没有启动额外 MCP 服务。

重建目录时在独立临时目录安装 `@larksuiteoapi/lark-mcp@0.5.1`、`zod@3.25.76`、`zod-to-json-schema@3.24.6`，然后执行 `node scripts/build-office-catalog.cjs /绝对路径/临时目录 src/office-catalog.json`。勿在运行候选的依赖目录安装。回归覆盖目录完整性、固定 SDK 路径、输出预算、分页、版本保护、Owner/回合失效、真实队列撤权及普通群/Knowledge 隔离。

删除原文档中的段落/表格使用 `docx.v1.documentBlockChildren.batchDelete`，与删除整个云盘文件不同。先读取具体版本及父块的 children 顺序，核对待删块ID；传入非负整数 start_index、严格更大的 end_index（左闭右开）及具体 document_revision_id。删除后回读确认；版本冲突或结果不确定先重新核对，不自动重试，不以另建文档代替修改原文档。应用编辑scope已具备也不保证每份目标文档的协作者权限。

### Issue #33：Owner指令转发（2026-10-05修订）

Bot转发可信Owner的当前指令，并回传结果和Codex原生交互。新Thread继承运行时权限默认值；绑定Thread恢复、续接和分支不发送sandbox、approvalPolicy或approvalsReviewer覆盖，不因工具版本变化换Thread。Owner可读取当前Codex实例可访问的历史；外部续接仍核对同一共享连接、实际Thread和活动turn。

原生读/写/网络权限、命令、文件变更审批都等待Owner明确答复；Bot不自动批准，也不按projectRoots额外批准或拒绝。权限卡展示原始请求，许可按原生turn范围返回，不新增会话级持久许可。卡片绑定Owner、chat、Thread、turn，撤回、steer、对端处理、断线或身份变化使旧交互失效；回复结果不确定不重放。超出飞书展示能力的交互明确提示原客户端处理，不伪造支持。

Office不再要求重复确认或Trusted Document资格；参数/schema、revision、幂等及当前请求生命周期保留。user/tenant正确路由及OAuth/scope/ACL不变；Group/Knowledge工具集和身份隔离不扩大。Bot后台必要的状态持久化维持原实现。

旧 `codex.sandbox`、`codex.approvalPolicy`、`allowExternalThreadRead`、`externalThreadPermission` 和 `ownerAccess.projectRoots`、`inheritRuntimeDefaults` 配置不再作为Owner授权事实源；配置示例已移除。不会修改原生Codex配置或系统权限。

原独立执行器、detached/硬链接和APFS实验保留在测试夹具与研究脚本中，未接入产品；其已知缺口仍为历史事实，但不再是已撤销方案的当前验收项。`scripts/owner-relay-check.mjs` 使用真实隔离App Server和本地合成provider验证默认及Thread自有权限的续接，不调用真实模型或飞书；最新测试、独立审查和未实测范围见PROJECT.md。

## 本机一次性 Owner OAuth（默认关闭）

此工具只绑定既有 Owner，不提供 `/feishu-login`、多用户登录或自动扩大权限。授权页搭配飞书官方 OAuth v2 Token 接口，PKCE S256 + 随机 state；localhost callback 默认 `http://localhost:18923/oauth/feishu/callback`，仅监听本机，10分钟超时。用户须在运行机器的浏览器完成授权，手机只用于登录确认；回调不能在另一设备打开。

先在现有应用安全设置登记该完整重定向URL，确认 `offline_access` 和所需 **user** scopes 已生效、Owner 在应用可用范围内；若存在刷新开关需启用并按后台要求发布。`owner-oauth.policy.example.json` 是最小文档/任务读取方案，只申请6个scope、固定13个支持user的Office接口，不代表全部Office权限。需要其他接口时由本机操作者明确调整名单与scope并重新授权，不由模型或错误自动扩权。

```sh
node scripts/owner-oauth.mjs authorize --config /绝对路径/config.local.json --policy owner-oauth.policy.example.json
node scripts/owner-oauth.mjs status --config /绝对路径/config.local.json
node scripts/owner-oauth.mjs refresh-check --config /绝对路径/config.local.json
```

授权工具读取现有配置和只读SQLite中的Owner，以官方用户信息接口核对同应用 `open_id`，不按姓名猜测或更换Owner。凭据加密保存到 `storageDir/owner-oauth/credentials.enc`，目录0700/文件0600，AES-256-GCM密钥存macOS钥匙串；沿用Git忽略的data目录，禁止放在模型工作目录、共享盘或提交任何真实凭据。密钥不进入命令参数/环境，回调和Token错误不输出原文。macOS首次访问钥匙串可能要求本人批准；不能仅因Git忽略就视作加密。拥有同一macOS账号完整本机执行能力的Owner仍属于信任边界，不能防御该账号被入侵。

授权保存**不自动修改生产配置或重启服务**。部署经过审核的实现后，在本地配置加入 `ownerOAuth: {"enabled": true, "apis": [...]}`，名单取本次本地授权策略中需要的接口。Owner Docx/Wiki读取（包括专用文档工具）统一要求Owner用户身份；关闭OAuth或缺少API授权时拒绝，不回退tenant。其他既有API保持原有路由。模型不能传身份/token/任意URL，配置不包含凭据。Group/Knowledge不注册或获得这些能力。

运行时在调用前按有效期自动刷新，串行并加跨进程锁；仅轮换凭据，不重放办公写操作。refresh token单次使用，先写入pending标记再交换并原子保存新值；网络结果不确定、进程崩溃、锁残留、scope缩减或撤销则停止用户身份调用并要求本机检查/重新授权，不猜测重试旧token。空闲期间不维持独立刷新服务，超过refresh有效期需再次授权；官方规定授权满365天也需重新授权。`refresh-check`仅在需要时刷新，不强制消耗仍有效的refresh token。

请求许可绑定应用/Owner/状态目录、授权generation、接口名单和原请求。撤回/撤权/换Owner/重新授权后旧请求失效，检查覆盖钥匙串/刷新等待后、SDK队列出站前及结果返回。可信 Owner 当前明确请求的 Office 写入免重复卡片，同样适用于已正确路由的用户身份；不借用 tenant 创建记录，不扩大 OAuth scope 或自动更换身份。

官方说明：[授权码](https://open.feishu.cn/document/authentication-management/access-token/obtain-oauth-code)、[v2 Token](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/authentication-management/access-token/get-user-access-token)、[刷新](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/authentication-management/access-token/refresh-user-access-token)。2026-09-30真实授权回调到达后，v3交换返回20049（PKCE失败）。遵循授权码页的兼容提示，明确采用v2 JSON交换及配套刷新；保留S256，不重放失败授权码，不自动尝试其他端点。


## Owner Office 统一只读身份（Issue #29）

此功能只用于已绑定 Owner 的私聊及既有授权 Owner 群执行通道，不向普通成员、Group Assistant 或 Knowledge Worker提供凭据或新增工具权限。未启用 `ownerOAuth` 时，既有 tenant 路由保持；启用后，五类资源读取统一要求固定只读白名单、本地 `ownerOAuth.apis`、加密 grant 的 `allowedApis` 和实际用户 scope 同时满足。缺任何一项直接拒绝，**不回退 tenant**。其他既有 Office 身份策略、写入审批、Trusted Document 内容编辑与群发送规则不扩大。

- `feishu_doc_read`、`feishu_office_sheet_read` 和 `feishu_office_call` 的已列明读取 API 共用身份、scope和撤回守卫。`feishu_doc_read` 的 Owner 结果在 `data.document / data.blocks`，带 `identity=owner-user`、`hasMore / nextCursor`。
- 宿主从当前 `run.sourceIds` 对应的可信 inbox 文本生成读取 permit，绑定当前 Owner、消息原文、来源集合及精确 API/资源参数。模型参数、旧会话、文档正文和引用消息不生成授权；请求进入 OAuth lease 前、等待后、HTTP 出站及交付前复核。steer 改变来源集合即使旧 permit 失效，新读取只使用最新输入，不能继续借用上一条读取目标。
- 目标解析采用保守的完整命令解析，不按正文中出现过某个 ID 就放行。可用例子：`请读取 https://example.feishu.cn/docx/文档ID`、`读取 document_id 文档ID`、`读取 https://example.feishu.cn/sheets/表格ID 范围 tab!A1:C20`、`搜索「明确关键词」`、`列出知识库`；多个目标用逗号或空格分隔。子资源需明确 `table_id / view_id / record_id / block_id / sheet_id / form_id`，不让模型猜测。未可靠解析的自然语言、引用/代码块、历史指代及混杂解释均要求补充明确目标，不猜测授权，也不使用固定确认码来放行。
- 多目标按“根资源 → 它自己的范围/子资源”逐项分组；每次出现新URL或根ID开始新授权项。例：`读取 spreadsheet_token sheetA range tabA!A1:A1, spreadsheet_token sheetB range tabB!B2:B2` 仅授权这两组，不能交叉组合。Bitable必须把 `app_token / table_id / view_id（或record_id/form_id）` 写在同一组；同一根的多项读取要重复根ID。游离子资源、错误类型、同组重复字段或无法可靠分组均拒绝并要求澄清。读取必须匹配一项完整组合；不得省略约束扩大到整个文档/表。固定根元数据接口仍可核对同一根的元数据，但不因此获得更宽内容范围。
- Wiki批读仅允许已授权节点API真实返回的对象类型/token派生后续读取；不从文档正文或搜索命中链接扩大授权。逐链接许可仍限同一批读会话；群集合许可可在同一次Owner请求的后续工具中复用该节点的精确映射，但必须继承原来源消息、群和子范围检查。资源根授权仅允许本资源读取，不允许替换群/文档、扩大Sheet范围或替换搜索关键词。
- `feishu_office_read_resources` 每次最多5个飞书链接，必须属于本次明确目标或下述宿主冻结集合。Wiki 先用节点 API 返回的 `obj_type / obj_token` 决定后续读取，节点可读不等于正文可读。Docx返回一页块；Sheets、Bitable、Drive只返回元数据，`metadataOnly=true`，后续内容通过固定 API 指定范围/表/页读取。不下载附件、不做后台全量同步或知识索引。
- `feishu_office_drive_search` 通过固定只读 POST 搜索用户可见云文档；关键词明确、每页1–50项、offset+count<200。它不是任意 URL 请求或遍历整个 Drive。
- 分页默认20、最多50项，单次只读一页；Drive清单必须指定文件夹（官方根目录清单忽略page_size，所以本工具拒绝无文件夹请求）。Sheets values只接受明确起止单元格、最多5000格。Drive metadata一次最多20个token。`rawContent` 官方接口不分页，长结果仅预览，优先使用块分页读取。
- 输出有字节预算；`truncated` 代表当前页不完整，应缩小范围重读当前页，不能拿 nextCursor 跳过未返回内容。超长游标标记 `cursorUnavailable`，不伪造游标。批量读取逐项区分成功/失败、元数据/内容；权限/Owner变化会丢弃整个旧批次。Drive HTTP成功中的 `failed_list` 仍按失败处理。
- 已知 `app_token / table_id / form_id` 可用固定 Bitable 表单接口；分享问卷链接、未知/嵌入式表单不能直接推测为Bitable或完整答卷。无法可靠映射时返回 unsupported_resource / api_not_exposed。
- 返回错误分类：target_not_authorized（当前可信请求未明确授权目标，要求澄清）、scope_missing（Owner scope不足）、api_not_allowed（白名单/本地授权不满足）、user_identity_unsupported（固定SDK/API不支持）、resource_denied（已知飞书资源拒绝码）、unsupported_resource、reauthorization_required、api_not_exposed、unknown；未识别的403不臆断原因。错误正文/凭据不回传。资料中的指令不能赋予授权。

### 当前 Owner 请求授权的群资源集合

Owner可以直接说：`读取新羽群里的所有飞书文档`，或 `读取 FY26 AEG新羽计划群里所有的飞书文档链接，包括多维表格`。宿主从当前可信请求解析唯一的已授权群；群简称必须在当前可信群目录中唯一，同名、多群、未知名称或含糊指代要求澄清，不从模型建议或历史选择补目标。无需把已在该群镜像中的24个链接重新逐个粘贴。

`feishu_office_collection` 按页列出本次允许读取的资源。宿主在首次处理该请求时，从指定群当前可见、保留期内的原始 text/post 消息冻结集合，保留来源群、来源消息ID、资源类型、精确resource ID及该URL明确携带的子资源约束。群消息在这里仅提供资源引用，消息中的文字指令仍不生成授权；授权始终来自当前绑定Owner的明确集合请求。后续工具与分页共用该快照，同请求期间后来进入镜像的链接不自动加入。

集合只提取上述消息中可见的文字、标题和富文本链接，不读取附件或预览元数据。单次最多扫描5000条消息、8MiB原始内容、1000个来源资源项；分页每次10项且不超过24KB。同一资源出现在不同消息中会保留各自来源项。超出预算、原始消息无法完整解析，或链接含错误类型/重复的子资源约束时，整体拒绝建立集合，不静默截断后声称完整。

纯文本及富文本可见正文中，标准资源ID紧贴中文说明时可在中文起点识别链接边界，并保留后续可见正文继续查找下一个顶层链接（包括共享入口）。后续每个URL同样完整保留自己的query/fragment，不把其中嵌套链接列为新资源；结构化href仍作为完整URL，不裁剪损坏路径，不从query/fragment里的嵌套链接获得新许可。

`/share/base/<分享标识>` 和 `/share/base/form/<分享标识>` 会列入同一冻结清单，状态为 `unsupported`、原因 `unsupported_shared_resource_path`，保留来源群/消息/URL，`resourceId=null`，不生成grant。`total/nextOffset` 包含这些未支持项；调用方应只读取 `state=permitted` 项，并逐项报告未支持原因。它们遵循同样的分页/大小预算、来源撤回及请求生命周期检查。分享标识不能当作app_token、table_id或form_id使用。

已核对固定SDK 1.74.0与现有只读API策略：[获取表单元数据](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/bitable-v1/app-table-form/get)需要app_token、table_id和form_id，当前白名单没有将公开分享标识反解为这组标识的接口。因此本版明确报告共享入口不支持，不猜测ID、不访问网页或增加OAuth/API权限；并不声称所有飞书产品都不存在转换能力。

多语言富文本必须逐个校验所有语言分支及其行、节点和可见字段；任一分支损坏，整批拒绝，不保留其他合法分支或更早消息形成的部分集合。顶层 `content` 与语言分支混用也整体拒绝；单一顶层结构和多个合法语言分支分别支持。

允许的类型为Docx、Wiki、Sheet、Bitable和Drive文件/文件夹引用。集合不能引入其他群、模型猜测、Web搜索、文档正文二级链接或文件夹遍历发现的新资源。集合中有Drive文件夹链接也只允许该文件夹元数据，不授予其子文件清单、全库搜索或Wiki空间枚举权限。Wiki的真实节点API映射是原资源的规范对象解析，不是沿正文链接继续发现。

每次OAuth凭据获取、排队、出站、响应及结果交付仍执行Owner、API白名单、scope和生命周期检查。原Owner请求撤回/steer改变来源、Owner变更或群撤权使旧集合失效；原始消息撤回、移除、内容变化或超过保留期使对应来源许可失效。已经开始的调用不能改用另一个重复链接来源来绕过撤回；未使用该来源的其他资源可继续按各自有效来源读取。user失败不回退tenant，不增加Office写权限。

集合许可不放松单资源和多资源的完整授权组合。Base URL里的table/view、Sheet URL里的sheet/range、Docx块约束分别属于自己的根，不能跨资源拼接，也不能省略已有子范围来读取更广正文。URL没有表/范围时仅允许原有根元数据和有界目录接口；**不表示整张多维表或Sheet单元格已经读取**，具体内容仍需明确子范围，不能由模型猜测。逐项报告正文、元数据、权限失败和待明确范围，不把“列出所有链接”宣称为“读完所有正文”。本地镜像也不保证包含建群以来全部消息。

### 固定 API 与只读 scope 核实

2026-10-01核实官方 Markdown 文档及固定 SDK `@larksuiteoapi/node-sdk@1.74.0` /原219项目录（lark-mcp0.5.1）。下表各 SDK API均声明支持 `user_access_token`；两个专用适配使用SDK `request` 的固定路径和请求级 `withUserAccessToken`，模型不能选择身份/URL/请求选项。列出的scope是**只读可选项（满足其中一个）**，不是必须全部申请。没有把支持tenant推断成支持user，也未把官方读写scope加入新策略。

| 固定 API / 专用工具 | 已核实只读 scope（任一） | 官方文档 |
| --- | --- | --- |
| `docx.v1.document.get` | `docx:document:readonly` | [接口说明](https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/get) |
| `docx.v1.document.rawContent` | `docx:document:readonly` | [接口说明](https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/raw_content) |
| `docx.v1.documentBlock.list` | `docx:document:readonly` | [接口说明](https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/list) |
| `docx.v1.documentBlock.get` | `docx:document:readonly` | [接口说明](https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document-block/get) |
| `wiki.v2.space.get` | `wiki:space:read` / `wiki:wiki:readonly` | [接口说明](https://open.feishu.cn/document/server-docs/docs/wiki-v2/space/get) |
| `wiki.v2.space.list` | `wiki:space:retrieve` / `wiki:wiki:readonly` | [接口说明](https://open.feishu.cn/document/server-docs/docs/wiki-v2/space/list) |
| `wiki.v2.space.getNode` | `wiki:node:read` / `wiki:wiki:readonly` | [接口说明](https://open.feishu.cn/document/server-docs/docs/wiki-v2/space-node/get_node) |
| `wiki.v2.spaceNode.list` | `wiki:node:retrieve` / `wiki:wiki:readonly` | [接口说明](https://open.feishu.cn/document/server-docs/docs/wiki-v2/space-node/list) |
| `drive.v1.file.list` | `space:document:retrieve` / `drive:drive:readonly` | [接口说明](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/drive-v1/file/list) |
| `drive.v1.meta.batchQuery` | `drive:drive.metadata:readonly` | [接口说明](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/drive-v1/meta/batch_query) |
| `sheets.v3.spreadsheet.get` | `sheets:spreadsheet:readonly` | [接口说明](https://open.feishu.cn/document/server-docs/docs/sheets-v3/spreadsheet/get) |
| `sheets.v3.spreadsheetSheet.get` | `sheets:spreadsheet:read` / `sheets:spreadsheet:readonly` | [接口说明](https://open.feishu.cn/document/server-docs/docs/sheets-v3/spreadsheet-sheet/get) |
| `sheets.v3.spreadsheetSheet.query` | `sheets:spreadsheet:read` / `sheets:spreadsheet:readonly` | [接口说明](https://open.feishu.cn/document/server-docs/docs/sheets-v3/spreadsheet-sheet/query) |
| `bitable.v1.app.get` | `base:app:read` / `bitable:app:readonly` | [接口说明](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app/get) |
| `bitable.v1.appTable.list` | `base:table:read` / `bitable:app:readonly` | [接口说明](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table/list) |
| `bitable.v1.appTableField.list` | `base:field:read` / `bitable:app:readonly` | [接口说明](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-field/list) |
| `bitable.v1.appTableView.list` | `base:view:read` / `bitable:app:readonly` | [接口说明](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-view/list) |
| `bitable.v1.appTableView.get` | `base:view:read` / `bitable:app:readonly` | [接口说明](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-view/get) |
| `bitable.v1.appTableRecord.list` | `bitable:app:readonly` | [接口说明](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/list) |
| `bitable.v1.appTableRecord.get` | `bitable:app:readonly` | [接口说明](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/get) |
| `bitable.v1.appTableForm.get` | `base:form:read` / `bitable:app:readonly` | [接口说明](https://open.feishu.cn/document/server-docs/docs/bitable-v1/form/get) |
| `bitable.v1.appTableFormField.list` | `base:form:read` / `bitable:app:readonly` | [接口说明](https://open.feishu.cn/document/server-docs/docs/bitable-v1/form/list) |
| `feishu_office_sheet_read` | `sheets:spreadsheet:readonly` | [接口说明](https://open.feishu.cn/document/server-docs/docs/sheets-v3/data-operation/reading-a-single-range) |
| `feishu_office_drive_search` | `search:docs:read` / `drive:drive:readonly` | [接口说明](https://open.feishu.cn/document/server-docs/docs/drive-v1/search/document-search) |
| `docx.v1.documentBlockChildren.get` | `docx:document:readonly` | [接口说明](https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document-block/get-2) |

完整白名单及证据地址位于 `src/owner-office-read-policy.json`，不是可由模型修改的配置。Drive元数据、云文档搜索虽用POST，官方定义为只读；仅这两个固定路径按读取处理，不把其他POST判成只读。

### 后续 Human 授权与候选验收

`owner-office-read.policy.example.json` 是本轮全部25个只读入口的示例，合计11个scope（含offline_access），**不是生产配置**。它选择Docx只读、四个Wiki细粒度读取、Drive文件夹清单/元数据/搜索三个scope，以及Sheets/Bitable各自只读scope。Sheets元数据和values文档未列 `sheets:spreadsheet:read`，所以全场景示例采用 `sheets:spreadsheet:readonly`；Bitable记录list/get未列更细粒度scope，所以全场景示例采用 `bitable:app:readonly`，不额外请求base元数据scope。仅需要部分API时可按上表进一步缩小范围。

部署/授权仍须单独Human批准。需要新增scope时，由操作者在飞书后台开通对应**用户身份**只读权限并按平台要求发布，再请当前Owner通过已有localhost流程重新授权；不能仅修改config而复用没有scope的旧token。已有已授权能力如需保留，应在本地审核后合并旧policy与新增**只读**项，避免直接用示例覆盖原策略。不要自动追加写scope、打印token或复制生产数据库到开发目录。

后续真实验收只读检查以前403的Docx、Wiki实际资源、明确范围Sheet、Bitable表/记录和可用Drive元数据；逐项核对身份/内容/部分失败，未知客户端资源不作成功结论。本轮开发不执行重新授权、真实Office请求、部署或Merge。刷新沿用已有串行/跨进程锁、失效标志与generation；重新授权、撤回、换Owner、撤权以及钥匙串等待期间授权文件变化都会使旧请求停止。

### Issue #37：Docx/Wiki 用户身份读取与只读诊断

本候选整合 PR #30 的只读路由和群镜像集合，保留 main 的 #33 原生 Thread 权限转发及办公写入行为。群集合仍由宿主从当前Owner请求与可信镜像建立，不需要逐条重新授权或粘贴链接；原请求、群范围、来源消息、撤回、steer、换Owner和回合结束检查保留。集合清单保留原始链接及群/消息来源，正文结果返回解析后的资源ID与来源；不追踪正文二级链接。

专用 `feishu_doc_read` 现在也接受标准Wiki链接，只在官方节点API实际返回Docx时读取。`feishu_office_call` 的Wiki解析结果可以在同一可信请求内继续用于Docx正文调用，下一条steer不能继承映射。OAuth未启用、scope不足、凭据不可用时不会改用应用身份。既有Sheet/Bitable能力保留，本期不增加Bitable或共享base/form支持。

`feishu_office_diagnose_document` 对当前请求或本次群集合中的一个标准Docx/Wiki链接做只读A/B：A使用当前生产SDK blocks路径，B直接请求固定官方 `GET /open-apis/docx/v1/documents/{id}/blocks`，相同精确ID及分页参数；Wiki先解析node→obj。两臂均验证相同目标、API白名单、现有scope和Owner凭据，不提供模型可选身份、URL端点或token。它只返回诊断，不返回或记录正文。它不模拟旧部署；历史tenant403/user成功仅有合成回归，真实旧部署对照需后续明确授权。A/B仅比较blocks端点，不覆盖专用/批读工具的metadata前置调用；both_succeeded只代表本次两次块请求成功，不证明完整文档或全部生产读取步骤已完成。

每次API调用最多等待15秒（含凭据、队列、网络），只读请求不自动重试；网络层可取消并限制1MiB响应。超时返回 `timeout`，不冒充403或本次成功。批读每次最多5资源，每资源一次有界块分页，返回 `page_pending`、`output_truncated`、`metadata_only`、`complete` 或 `incomplete`，并保留续页标记；完成当前页不代表其他资源或历史全部读完。

诊断字段为API、身份类别、scope判定、阶段、是否开始HTTP请求、实际HTTP状态及数字错误码。SDK底层HTTP观测与直连响应提供状态；未取得状态时为null，不推测200/403。已知错误码可分类为资源拒绝，未知403仍为unknown；缺scope、API能力、本地目标校验、凭据不可用与超时分别报告。不会根据“浏览器能打开”承诺OpenAPI成功，也不会自动扩大OAuth权限或建议无证据的飞书侧操作。官方接口依据：[Docx blocks](https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/list)、[Wiki节点解析](https://open.feishu.cn/document/server-docs/docs/wiki-v2/space-node/get_node)。

本轮没有真实飞书文档读取、配置/scopes变更、服务重启、部署或合并。已安装Codex与Group/Knowledge固定版本不符时原生隔离探针会拒绝运行；离线身份隔离回归不能代替该探针或候选部署后的真实验收。交付PR按当前任务指令保持Draft。

### Issue #37 审核返工：明确编辑请求的准备读取

当前可信Owner的单行请求如“请将 https://example.feishu.cn/docx/doc 的标题改为新标题”或“请帮我修改 https://example.feishu.cn/docx/doc 的内容”，可读取同一目标的元数据、正文、块及子块，以取得编辑前内容和revision；专用文档工具与Office Call一致。也支持以“编辑/更新/重命名/追加”开头并紧跟明确Docx/Wiki根链接或document_id/token的请求。“请帮我”按完整前缀优先匹配。

编辑前读取只接受可完整识别的简单单目标命令；额外读取禁令、条件、显式子范围或混合多句替换内容均拒绝，不忽略后缀。若替换内容与约束无法可靠区分，需要先明确读取范围。

这只授予准备读取，不批准写API；写入仍走既有执行、版本与生命周期约束。编辑目标仅取命令开头的单个明确根，替换文字中的其他URL不会获得许可；Wiki只接受官方解析得到的Docx。引用、否定、条件式、未知目标及无法可靠识别的语句不产生许可；带query/fragment或显式子范围的编辑目标不自动扩成整篇文档读取。原消息撤回/变化、steer、换Owner和回合失效仍会中止读取与交付。

### Issue #37：已有 scope 与隔离探针

[rawContent 官方接口](https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/raw_content)的本地只读策略接受已有 `docx:document:readonly` 或 `docx:document`，任一满足即可；这只是该读取接口的授权匹配，不新增 OAuth 申请、不授予写 API，也不将 scope 名称按前缀泛化。缺少两者仍在出站前拒绝。

Group/Knowledge 探针根据调用 ID 关联响应，再按 namespace/工具名检查预期；首次和恢复检查共用断言，新增攻击调用不会改变 skills 的预期位置。合成协议回归不替代匹配固定 Codex 版本的原生隔离验证。

Docx 元数据、blocks 列表、单块及子块读取同样接受上述两种已有 scope（任一即可），与 rawContent 一致。接口权限依据：[元数据](https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/get.md)、[blocks](https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/list.md)、[单块](https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document-block/get.md)、[子块](https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document-block/get-2.md)。匹配只针对固定读取 API，不推导其他 scope 或新增写入能力。

Wiki getNode 读取依据[官方权限表](https://open.feishu.cn/document/server-docs/docs/wiki-v2/space-node/get_node.md)，接受已有 `wiki:node:read`、`wiki:wiki:readonly` 或 `wiki:wiki` 任一授权。此等价匹配仅用于固定节点读取 API，不新增 OAuth 申请或 Wiki 写 API；解析出的 Docx 仍独立检查其读取 scope。
