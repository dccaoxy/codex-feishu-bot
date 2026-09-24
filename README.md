# 飞书本地 Codex 机器人

飞书负责消息与卡片交互，本地 Node.js 服务直接通过 stdio / JSON-RPC 调用 `codex app-server`。不依赖 Codex SDK，不需要公网服务器、域名或内网穿透。

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

外部会话仅作**读取与引用**，第一版不接管、续写或分支外部桌面任务。跨会话搜索按标题进行，并非全部正文的语义检索。默认不搜索归档。机器人会话可以正常切换、恢复和分支。

无法保证访问另一设备、云端或所有新版会话存储格式；读取失败会明确报错，不会将“无法读取”解释成“没有历史”。历史会话不等于当前指令，工具结果只作为参考资料。

## 本地配置

| 字段 | 说明 |
| --- | --- |
| `codex.binary` | `codex` 或绝对路径；本机通常为 `/Applications/ChatGPT.app/Contents/Resources/codex` |
| `codex.cwd` | 默认 `./workspace`，附件、执行工作目录及文件返回边界 |
| `codex.model` | 留空使用 Codex 默认模型；也可通过飞书 `/model` 设置 |
| `codex.effort` | 留空使用默认强度；填值需被所选模型支持 |
| `codex.sandbox` | `workspace-write` 或 `read-only` |
| `codex.approvalPolicy` | `on-request` 或 `untrusted`，审批交给用户 |
| `codex.allowExternalThreadRead` | 默认 false，是否允许读取其他本地会话 |
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

当前开发验证版本：Codex CLI `0.155.0-alpha.2.6`、飞书 SDK `1.74.0`、Node.js `24.21.0`。使用本机协议的连字符枚举值（如 `workspace-write`），不将网页示例中的其他版本写法直接套用。

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

旧工具会被 Codex 持久化在旧会话中。当前版本首次继续旧会话时会创建带新工具的会话，带入近期历史并保留旧会话 ID，可继续分页查询更早历史；不会声称完整模型上下文已原样迁移。新会话及其分支正常延续。

普通审批使用允许/拒绝卡片；标准及兼容 JSON Schema 的扩展表单支持命名选项、多选和对象。数组、对象使用 `/answer 请求码 字段名 JSON` 回答，所有必填项完成后点击提交，服务端校验通过才回复批准。默认值不自动提交。含密码/密钥、未知 schema 扩展或原生身份验证的请求会明确提示。网页授权有“打开授权页面”和“已完成网页授权”按钮，点击后仍由授权服务判断登录是否成功，不等于凭空取得权限。

验证命令：`npm test`、`npm run smoke`、`node scripts/live-check.mjs --docs`（使用一次模型调用、模拟文档工具返回）、`node scripts/docs-check.mjs`（真实创建一份测试文档并验证读写，会保留测试文档）。

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
