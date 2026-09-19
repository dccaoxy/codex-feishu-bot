# 飞书本地 Codex 机器人

飞书负责消息与卡片交互，本地 Node.js 服务通过 JSON-RPC 调用 `codex app-server`：默认使用 stdio，Work / Attach 使用同机共享 App Server 的 WebSocket 或 Unix socket。不依赖 Codex SDK，不需要公网服务器、域名或内网穿透。

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

首次配对后只接受绑定账号的单聊；群聊、其他用户和其他机器人消息均被忽略。也可以提前在 `ownerOpenId` 填自己的 `ou_...`，跳过配对。更换绑定账号时停止程序，再修改 `ownerOpenId`；它优先于数据库中的配对记录。

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

已订阅客户端会同时收到审批；服务器接受先处理的决定并通知两端解决。机器人因此撤销已解决请求的本地 token，旧卡片点击显示失效；卡片视觉上可能仍保留按钮。解绑/关闭共享观察端只释放其待办，不主动拒绝另一端审批。保留绑定时的 10 分钟审批超时仍按原规则拒绝。机器人不抢答不认识的桌面动态工具。

### 人工最小验收

1. 完成活动任务后退出 Desktop（⌘Q），用共享启动脚本打开。新建一个测试任务，命名为“共享联调”，发“只回复 DESKTOP_READY”，等完成。
2. 飞书发送 `/threads 共享联调`，核对标题后 `/attach 对应编号`，再发“只回复 FEISHU_READY”；确认 Desktop 原任务出现同一回答。再从 Desktop 发“只回复 DESKTOP_AGAIN”，确认飞书收到。
3. 在 Desktop 要求逐行输出 1 到 100000、不使用工具；运行时在飞书追加“每行后增加点号”，随后 `/stop`。确认 Desktop 停止，`/thread` 仍指向同一 Thread；不是新开第二个任务。
4. 审批测试在该测试任务内要求：“仅执行 /usr/bin/printf SHARED_APPROVAL_PROBE，使用 require_escalated 显式请求一次审批，不修改文件、不重试”。若原策略允许人工审批，应在两端出现同一请求。第一次在 Desktop 拒绝，再点飞书旧卡片应失效；第二次重新发起，在飞书批准，Desktop 应解除等待且只执行一次。若未出现人工审批或被自动审核拦截，记录原策略/错误，不能作为通过，也不要为了测试绕过原策略。

上述步骤尚须用户实际完成。Desktop 专属工具、其审批 UI 和运行时覆盖配置均需在共享模式复核；共享连接握手本身不保证它们完整可用。

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

要求 Node.js 24+，可用的 Codex CLI / App Server。换机器后：

```sh
npm ci
cp config.example.json config.local.json
# 编辑配置；先运行 codex login 登录
npm run doctor
npm start
```

当前开发验证版本：Codex CLI `0.155.0-alpha.9.2`、飞书 SDK `1.74.0`、Node.js `24.21.0`。使用本机协议的连字符枚举值（如 `workspace-write`），不将网页示例中的其他版本写法直接套用。

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
