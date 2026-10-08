# 当前返工：Issue #37 Wiki getNode 等价 scope（2026-10-08）

- **Task Source / Implementation**：最新P2要求补齐已有wiki:wiki。已实时读取官方get_node.md权限表，固定getNode策略接受wiki:node:read、wiki:wiki:readonly、wiki:wiki任一；保留精确匹配及持续租约检查，不新增OAuth申请或写API。
- **Validation**：新增真实OwnerOAuth类配合合成记录，覆盖三种Wiki scope的专用工具/Office Call、两种Docx scope与三种Wiki scope组合的群镜像集合、授权撤销零出站及写API拒绝。专项209/209通过；无飞书凭据临时副本doctor及无模型smoke退出0；全量1470/1470（零失败/取消/跳过）、check/diff通过；独立审核以PR准确head回执为准。
- **Remaining / 交接**：沿用原分支及Draft PR #38，不Merge、不部署、不读真实飞书、不调用模型、不改真实scope或生产配置。真实403与候选验收未验证；原生Group/Knowledge固定版本不匹配边界保持。提交推送与审核结论见准确head远端回执。

# 当前返工：Issue #37 Docx 全读取路径 scope（2026-10-08）

- **Task Source / Implementation**：最新P1指出上轮只修rawContent遗漏元数据/blocks。已实时读取四个官方Markdown权限表，元数据、blocks列表、单块、子块均明确接受docx:document或docx:document:readonly任一；逐接口补齐固定策略与文档链接，不修改OAuth申请、生产配置或写权限。
- **Validation**：本轮专项201/201通过，真实OwnerOAuth租约配合合成记录覆盖各接口两种scope与无关scope拒绝、专用文档工具、镜像Docx/Wiki集合、A/B两臂及缺scope零出站；集合保留跨群拒绝与撤销授权检查。无飞书凭据临时副本doctor与无模型smoke退出0；check/diff及全量1462/1462通过（零失败/取消/跳过）；独立审查以PR准确head回执为准。
- **Remaining / 交接**：同一分支及Draft PR #38，未真实读取飞书、调用模型、新增scope、改生产配置、Merge或部署。真实403与候选部署验收仍未验证。原生Group/Knowledge版本不匹配边界保持，不将离线回归称为真实原生隔离通过。提交推送与独立审查以远端准确head回执为准。

# 当前返工：Issue #37 scope 等价授权与隔离探针（2026-10-08）

- **Task Source / Implementation**：用户最新两项P2。rawContent固定策略新增官方支持的已有docx:document替代scope，复用租约的任一匹配与持续校验；不修改OAuth申请、配置或写API。Group/Knowledge初始及恢复探针改为call_id关联、namespace/name分派，共用断言，拒绝缺失/重复/未知响应。
- **Validation**：本轮读取与探针专项96/96通过；覆盖两种已有scope、无关scope零出站、租约中途撤销、写API拒绝、skills空列表和非空列表、顺序变化、Group/Knowledge隔离。本机无凭据临时副本doctor与无模型smoke退出0；Group/Knowledge原生探针均因Codex0.162.0-alpha.2与固定0.159.0不符退出1，未放宽锁定。本轮全量1446/1446通过，零失败/取消/跳过，check/diff通过；独立审查以PR准确head回执为准，旧head PASS不适用于新head。
- **Remaining / 交接**：继续原分支及Draft PR #38；提交推送及Issue报告以远端回执为准。未真实读取飞书、调用模型、改scope/生产配置、Merge或部署。原生Group/Knowledge仍须匹配固定版本；合成断言测试不冒充真实探针。其他原有边界保持。

# 当前返工：Issue #37 编辑前读取与礼貌前缀（2026-10-08）

- **Task Source**：用户对PR #38的两项P2：明确编辑请求被只读命令语法拒绝；“请帮我读取”只剥离“请”后解析失败。继续原分支及Draft PR，不Merge、不部署；不将88af293的旧PASS套用到新head。
- **Implementation**：完整礼貌前缀优先匹配。宿主从当前可信单行编辑命令开头提取一个明确Docx/Wiki根目标，允许同目标元数据/正文/块/子块准备读取及revision获取；Wiki只派生官方返回的Docx。同一目标内块读取不扩大到其他文档；替换内容里的链接不成为授权，固定准备读取名单不含写API。未知、否定、条件、引用及带query/fragment或明确子范围而无法可靠解析的编辑请求保持拒绝，不靠模型猜测。现有来源快照、Owner、steer、撤回、turn及OAuth检查保留；不改变Office写入流程。
- **作者Validation**：check/diff通过；permit+Owner集成557/557，全量 **1422/1422**，零失败/取消/跳过。最终permit专项补充断言通过，覆盖同文档块读取、其他目标0出站、替换URL不扩权、Wiki解析、准备许可拒绝写API及排队/响应期间撤回、steer、换Owner。仅本地合成飞书/OAuth接口。
- **本轮独立复审返工**：独立Reviewer对cca9d2b给出NEEDS CHANGES（专项557/557、check/diff通过）：编辑后缀中的读取禁令或“的 block_id b”被忽略。现完整匹配简单编辑语法；额外约束、未知后缀和无法区分的多句替换内容拒绝，不再默认扩大为整篇许可。新增6个解析反例与两读取入口各3个零OAuth/零出站断言，全量1434/1434通过（零失败/取消/跳过），之后收紧多句替换匹配的最终专项569/569通过。旧head审查不代表新head通过；新head复审证据见PR准确SHA回执。
- **环境验证**：无飞书凭据/无Shared地址的临时副本doctor和无模型smoke退出0（Codex0.162.0-alpha.2，握手、登录状态与7模型元数据可用）。Group/Knowledge原生探针各退出1：固定要求0.159.0，与安装版本不符；未更改锁定版本，不把离线回归当作原生隔离通过。
- **交接与Remaining**：本轮不读取真实飞书、改scopes、改生产配置、发送消息、部署或Merge；真实403及候选验收仍未验证。实现与文档在本分支保存；提交推送后更新Draft PR #38和Issue报告，新head独立复审证据以PR的准确SHA回执为准。其他上一轮边界保持。

# 当前交接：Issue #37 Docx/Wiki Owner 用户读取（2026-10-08）

- **Task Source**：Issue #37 与用户技术答复：在指定开发分支整合未合并PR #30，保留main已完成的#33权限转发；创建/更新Draft PR并保持Draft，不Merge、不部署。基线main为 f407453a5efb3653e88e7ce592fc5ad3e059c63b，整合PR #30 head 553ae4b4f2595b6eb03737a47ca9ca9191003f94；历史审核以当时head为准。
- **Implementation**：复用PR #30可信群镜像冻结集合、只读API/scopes与Owner身份路由，解决Bot/Office/测试/状态文档冲突。保留#33原生Thread权限、历史访问与Office写入行为。Docx/Wiki即使OAuth关闭也不回退tenant；专用文档工具支持Wiki→Docx，同一可信请求内的Office Call也保留官方解析映射，steer后失效。源URL、群/消息与精确对象ID可追踪；不授予跨群/正文二级链接权限。
- **诊断及可靠性**：新增只读诊断工具，以相同ID及参数对比当前SDK blocks路径A与固定官方GET直连B，均受同一Owner目标/API/scope/lifecycle约束。只返回脱敏API、身份、scope、阶段、HTTP状态、数字错误码及出站证据，不输出正文或token；未知403保持unknown。每API含队列/凭据最多15秒、网络可取消、响应1MiB上限，不自动重试。批读最多5项/每项一页，区分分页待续、输出截断、元数据、完成和未完成；不把超时当403。
- **作者Validation（提交前）**：语法检查与diff检查通过；新增诊断专项22/22通过，Owner+诊断专项509/509通过，此前读取/集合/Owner离线专项186/186通过。整合首轮全量1358/1359，旧无来源OAuth测试已改为可信请求且验证无tenant回退；下一轮1380/1381暴露非本期Drive路由被过度收紧，已恢复该既有行为并通过专项。随后全量1386/1386通过；独立审核返工后最终全量 **1391/1391** 通过，零失败/取消/跳过，Office专项18/18通过。
- **独立审核返工**：fresh checkout审核2396cc23a3988f619eae4fb4f931014576bd75d3给出NEEDS CHANGES，独立check/diff及153专项通过但发现两项未覆盖问题：租约守卫递归捕获历史守卫使批读校验指数增长；读取专用text来源守卫误拦既有post写入/find/schema。现将每个租约仅绑定本次permit，由session扁平检查历史租约；宿主仅在实际Reader入口创建读取守卫，写入与目录入口保留原有Office guard。新增5-Wiki/15调用复杂度、post写入/目录、实际SDK取消与A成功/B拒绝分类回归。修复后诊断+集合集成119/119通过，24-Docx合成集合测试约3.1秒（旧审核约114秒；非真实网络性能承诺）。代码返工提交为9121f5543e262e4beec62af64098eaafb670e089；独立复审及最后文档收口head的结论以PR #38对应准确head回执为准，不能沿用旧审核。
- **真实本机协议**：无飞书凭据、无Shared地址的临时源码/配置副本，已安装Codex 0.162.0-alpha.2的doctor与无模型ephemeral smoke均退出0；握手、登录状态和7模型元数据可用，不读取真实飞书文档、不调用真实模型。Group/Knowledge原生探针均因仓库固定0.159.0与安装版本不匹配退出1，未更改版本锁；离线隔离回归不能替代原生探针。
- **Remaining / Risks**：实际生产403根因及候选部署后已知成功Docx、历史403 Docx、Wiki和群集合均未真实验收；未扩OAuth scopes、改生产配置、写飞书、发消息或部署。A是本候选当前SDK路径，不冒充历史部署结果；tenant403/user成功仅为合成分类回归。新工具需Owner明确创建新会话才注入，遵循#33不自动换Thread。多维表/共享入口不新增支持。独立审核首轮发现问题已返工；PR #38已创建并保持Draft，审核与远端CI分别记录，不将本地通过称为远端CI通过。
- **交接断点**：实现与文档已在本分支提交推送，Draft PR：https://github.com/dccaoxy/codex-feishu-bot/pull/38 。最后文档收口的提交号见Git，独立复审准确head及Issue报告见PR/Issue回执。下一步为Human安排匹配版本的原生隔离验证及候选部署后的真实飞书验收；本任务不进行这些生产动作，不以本地测试或代码审核代替真实验收。

# 当前返工：Issue #33 新建 Thread 思考强度默认值（2026-10-05）

- **Task Source**：新版 Owner Relay 需求及本轮 P2，继续原 Draft PR #34。仅修复新建会话忽略 `codex.effort` 的回归。
- **Implementation**：新建 Thread 通过原生 `config.model_reasoning_effort` 应用聊天级选择或配置默认；两者未设置则省略。既有 Thread 的 resume/turn/fork 不增加配置回退，不修改权限策略或全局配置。README 已说明默认值作用范围。
- **Validation**：核心回归34/34通过，覆盖配置high、聊天选择优先、未配置及既有Thread不覆盖；语法与diff空白检查通过。真实隔离Codex0.160.0探针验证新建high及同ID恢复后high保留，原生权限继承仍通过；仅本地合成provider，未调用真实模型或飞书。本轮全量825/825通过、0失败/跳过；保留历史实验但不把其通过作为产品执行边界验收。
- **交接**：未部署、未替换运行时、未扩大权限；提交推送后针对准确head做fresh独立审核，结论及SHA回写PR/Issue。此前0602b5c的独立审核对新版relay给出PASS，但独立全量821/822（历史未接产品的取消实验kill EPERM）；该结果保留，不冒充本轮验证。

# 当前交接：Issue #33 Owner Relay（2026-10-05 修订需求）

- **权威需求**：`owner-relay-requirements-20261005`，来自用户当前明确指令及修订Issue正文。它替代下方所有冲突的“Full Authority/projectRoots/独立执行器/事务副本”方案要求；那些实验和旧审核保持历史原貌，不声明已修复或旧head获PASS。本轮只继续原分支与Draft PR #34，不Merge、不部署、不替换线上运行时、不改变OAuth或OS权限。
- **实现**：Owner创建Thread继承App Server默认权限；恢复/续接/分支不发送sandbox、approvalPolicy或approvalsReviewer覆盖。既有工具版本不同不再自动新建替代Thread，保持同一Thread及当前输入；需要新工具集由Owner明确新建会话。read/work及外部历史旧开关不再形成Owner第二套权限，外部转发仍确认同一共享连接、可输入状态和活动turn。配置示例移除已退役字段，旧配置加载时忽略它们，不写原生配置。
- **原生交互**：撤销读/网络自动授予和写权限一律拒绝，命令/文件/读写网络权限请求均转交Owner；权限payload按原请求返回，原生权限许可为turn范围，不自动新增持久许可。移除projectRoots分类/路径审批快照Gate，保留原生diff展示及有界缓存。卡片绑定任务创建时Owner、chat、Thread及turn；身份变更、撤回、steer、对端解决或连接失效不能复用旧卡片。明确响应前消费令牌，传输不确定不重放。普通文件交付不再另加项目目录边界，相对路径按当前Thread cwd解析；仍检查普通文件、当前任务和OS访问结果。
- **保留的边界**：飞书事件身份、Owner绑定、Group/Knowledge隔离、原生有效权限、user/tenant正确路由、OAuth/scope/ACL及OS权限均保留。Owner Office不重复弹确认；schema、revision、幂等和请求生命周期保留。无法在飞书表达的原生交互说明真实限制并提示原客户端；未把所有Thread或全局配置设为full-access/never。
- **测试与实际环境**：见本节后续Validation记录。新增真实隔离 `scripts/owner-relay-check.mjs`：App Server 0.160.0，临时无凭据home，本地合成provider；验证默认read-only及显式workspace-write两个原生Thread在同ID恢复时保留sandbox、approvalPolicy和审批人，无真实模型/飞书调用。最初探测发现0.160不再接受旧untrusted配置、无rollout空Thread不能resume；最终探针用on-request及合成完成turn验证，不隐瞒原始失败、不更改产品原生配置。
- **最终提交前Validation**：Node24.21.0，语法检查、diff空白检查通过；全量822/822通过、0跳过（仍包含2个旧执行器缺口复现实验，它们不属于当前产品执行路径）；原生Owner relay探针通过。测试期间发现并修正了新文件交付测试在macOS /var规范化路径上的夹具差异。上述结果属于当前代码，提交后准确head由fresh Reviewer复核。
- **评审返工**：早期独立审核指出工具版本触发换Thread、read/work重复门以及Owner先变化后收到旧run审批三个问题，均已修正并补回归。提交后另做准确head的fresh独立审核，结论与SHA回写原PR/Issue，不能把早期静态复核当最终PASS。
- **未实测/已知限制**：未进行真实飞书UI/真实模型/生产双客户端验收；未运行生产doctor或访问秘密配置。Group/Knowledge真实隔离探针在启动前因固定0.159.0与本机0.160.0不符而退出1，未弱化版本锁；全量Node回归中的身份和工具隔离模拟不冒充该原生验收。外部Thread管理命令仍只有客户端已实现的接口，未知状态不猜测重试。旧执行器和卷实验不参与本次产品执行路径。

# 当前技术断点：Issue #33 原位执行与事务工作区（2026-10-05）

- **Task Source**：Human 提供部署源码及非秘密实例元数据位置，要求继续处理两个已知执行边界缺口，不得再以工具清单缺失代替修复。已只读核对指定部署目录 `src/bot.mjs` 的条件工具组合、`src/repository.mjs` 的固定远端路由及 shared-lab 的非秘密环境记录。没有读取秘密配置、凭据、进程环境或业务会话；未连接或操作正在运行的共享服务。静态注册与实际每个thread启用项仍作区分，但清单未知不再作为当前开发阻塞理由。
- **独立审查**：独立Reviewer只读检查当前已提交原型后给出 **NEEDS CHANGES**：PGID终止不能涵盖detached后代；静态项目路径授权不能阻止既有硬链接修改外部inode。启动前扫描/进程树轮询不能补成无竞争执行边界，两项KNOWN GAP不是安全验收。原型仍只在测试夹具中，不接Bot。
- **已验证的替代原语**：新增可显式运行的 `scripts/owner-volume-check.mjs`，只使用本轮创建的128MiB稀疏APFS映像及专用临时文件。实际验证设备号分离、跨卷硬链接返回EXDEV、复制后写入不修改宿主inode；关闭原型后detached子进程仍能写副本，但直接写宿主测试文件和映像控制文件均被拒绝；宿主内容保持不变。成功普通卸载后以新路径只读重挂，读回副本内容且写入返回EROFS。已清理本轮映像与挂载点；无强制卸载、无真实模型/飞书、无生产权限或服务变更。
- **实验返工**：独立Reviewer发现attach成功但响应丢失时的清理风险，以及映像写尝试缺断言。已在attach之前记录可能挂载状态，卸载未确认则保留目录、不递归清理；增加子进程两项写拒绝结果的明确断言。该修正不等于整个Issue获得PASS。
- **方案与影响**：可继续实现“每请求专用文件系统副本 + 宿主只读 + 唯一写回broker”：失效请求没有写回许可，正常完成需先取得不可再修改的提交视图，再逐操作复核宿主版本、全部源目标和项目内外审批。宿主写回仍需避免原位truncate硬链接inode、处理symlink/rename及unknown；本轮没有实现或验证写回broker。此方案防止副本后代直接改变宿主，**不声称已经终止后代或解决全部网络/IPC副作用**。
- **需要确定的语义**：独立运行时的架构选择已确定，但事务工作区不是原位Shell的透明替换：命令工作目录指向副本，宿主项目在受控写回前看不到修改，直接使用宿主绝对路径写入需交由单次宿主文件工具，watcher/Git worktree绝对路径/IPC可能不同。若仍要求所有任意macOS命令原位语义，现有实验不能满足，需继续采用更强文件系统/进程监管组件；不能静默缩减需求。[Apple Endpoint Security](https://developer.apple.com/documentation/endpointsecurity/client)及本机SDK要求Apple entitlement、TCC及相应权限，并且没有逐write的AUTH事件，因此也不是可直接替换的已完成方案。本轮未申请或改变这些权限。
- **验证/交付状态**：原生卷实验及返工后复验通过，语法与diff检查通过；本轮无生产模块变更，未重复上一head的823项全量测试。实验与交接沿用同一分支/PR提交推送；最终以PR head为准。两项P1、生产接线、全量隔离和真实验收仍未完成；PR保持Draft，不Merge、不部署。

# 当前交接：Issue #33 独立 Owner 运行时实验（2026-10-05，未接入）

- **Task Source / 已决定**：Human 已选择独立 Owner 专用受控运行时；不再等待 Desktop 共用与独立运行时二选一。沿用 PR #34 / 指定分支；不替换现有运行时、不部署、不转 Ready、不 Merge。
- **实际新增**：`test/fixtures/owner-runtime-prototype.mjs` 是仅供测试的 macOS Seatbelt 执行器原型，没有生产入口。受控文件 worker 在实际执行前复核文件身份，使用具体路径权限，创建/修改/删除/双端 rename 的许可绑定 Owner、原请求、thread、turn、内容及目标快照并在启动前消费；过期、变化、拒绝和 unknown 不恢复许可。Shell 实验使用项目路径沙盒。**这不是已完成的安全执行器，不能导入 Bot。**
- **原生验证**：新增21项测试中，19项验证具体文件操作和普通子进程的局部预期；另2项明确命名为 `KNOWN GAP`，通过表示成功复现缺口，绝不是安全验收通过。真实临时目录复现：(1) Node detached 子进程在受监管 Shell 退出、运行时 close 后仍能写项目文件，按进程组终止不足以保证撤回生命周期；尝试限制 setpgid/setsid 系统调用仍未阻止该 posix_spawn 路径；(2) 项目内预先存在的硬链接能让 Shell 改变项目外同一文件内容。所有目标均为本轮专用临时文件，未接触业务文件。不能把项目路径 Seatbelt 或轮询终止包装成全部工具执行边界。
- **真实 Codex 协议实验**：`scripts/owner-runtime-check.mjs` 使用独立无凭据 home、真实 Codex 0.160.0 和本地合成 provider。4个未注册原生/权限/MCP工具调用被拒绝，1个宿主动态工具实际执行项目内写入、项目外单次批准及拒绝后阻断。探针复用现有 Group 配置仅为构造“只有测试动态工具”的隔离模型端，不是将 Group 配置作为 Owner 的最终能力范围。没有真实模型、飞书、人工卡片点击或生产共享实例调用。
- **后续实现边界**：保留独立运行时方案，继续实现宿主操作代理；普通 Shell 需要能涵盖全部后代的生命周期监管及文件别名策略。MCP、浏览器、电脑控制、本机代理等不能继承未经审查的直连入口；每个可写本机的适配器必须纳入同一边界。当前 checkout 没有 `config.local.json`，也没有指定作为兼容基准的实际 Owner 运行时实例/插件清单；仓库注册工具及官方接口已可查，不能据此推断实际部署额外启用了哪些工具。这份非秘密兼容性清单是继续完成“现有运行时全部能力”适配所需的私有技术输入，不是权限或部署批准。
- **本轮 Validation / 交付**：Node24.21.0；语法检查通过，全量823/823通过、0跳过（包含上述2个缺口复现，不等于安全验收通过）；独立21项原生测试和真实Codex合成协议探针通过；diff空白检查通过。本轮文件将提交/推送至同一分支并回写原Draft PR及Issue，精确提交以Git/PR head为准。未运行真实模型、飞书或生产doctor，未部署。
- **Remaining**：两项P1仍未关闭；Bot 主路径未接新执行器，Shell/项目内写入仍保留原行为。需完成上述监管与全部适配器、Bot真实可信上下文/审批接线、Owner Work/Shared 专用实例接线和独立审查。未取得Reviewer PASS，未做候选部署/真实飞书验收。禁止以实验的通过数量宣称Issue完成。

# 历史方案调查：Issue #33（2026-10-05，独立运行时已由 Human 选定）

- **Task Source**：Human 保持需求不变，要求自行查阅官方源码/文档，先说明其他组件的改造方案与影响，再提出需要决定的问题。本轮不再要求 Human 提供公开资料；仅研究和隔离验证，未修改生产权限、服务或运行时代码。
- **纠正前述判断的范围**：审批 RPC 本身不能原子约束写入，并不意味着 Codex 没有执行层边界。已查阅官方 `openai/codex` 固定源码 `7f892275e31002f0422477c6219189284560e689`；这是本轮取得的官方 main，不是本机0.160.0的源码对应版本，也未编译或替换本机程序。
- **可复用组件**：[macOS Seatbelt](https://github.com/openai/codex/blob/7f892275e31002f0422477c6219189284560e689/codex-rs/sandboxing/src/seatbelt.rs)生成实际文件写策略、处理受保护子路径并拒绝可变 symlink 写根；[apply_patch 运行时](https://github.com/openai/codex/blob/7f892275e31002f0422477c6219189284560e689/codex-rs/core/src/tools/runtimes/apply_patch.rs)向文件执行器传递沙盒上下文；[LocalFileSystem](https://github.com/openai/codex/blob/7f892275e31002f0422477c6219189284560e689/codex-rs/exec-server/src/local_file_system.rs)按该上下文选择 sandboxed/unsandboxed 实现；[SandboxedFileSystem](https://github.com/openai/codex/blob/7f892275e31002f0422477c6219189284560e689/codex-rs/exec-server/src/sandboxed_file_system.rs)通过沙盒 helper 执行文件操作。应复用此类 OS 边界，而不是解析 Shell 文本或只在卡片端多做一次路径检查。
- **必须改造的部分**：[ToolOrchestrator](https://github.com/openai/codex/blob/7f892275e31002f0422477c6219189284560e689/codex-rs/core/src/tools/orchestrator.rs)存在按条件选择无沙盒执行/升级重试的路径；单次命令批准不等于单次文件写入授权。Owner 模式不能把外部写许可变成普通命令的不受限执行。需增加受控操作执行器：将写操作类型、内容摘要、全部源/目标、Owner/原消息/turn 绑定为一次性许可；在执行器而非 Bot 内复核并消费许可，使用精确 OS 权限和防链接跟随的文件操作实现，未知结果不重放。普通 Shell/文件工具保持仅项目目录可写；拒绝后不能通过不受控执行路径绕开。projectRoots 配置及其替换/父目录移动入口须由运行时保护。
- **全部工具覆盖**：[官方权限说明](https://learn.chatgpt.com/docs/permissions)明确：命令沙盒不自动涵盖 MCP、浏览器、Computer Use 或批准后的升级执行。这些本机写入路径必须由受控进程/适配器共同执行相同策略，不能把仅 Shell/patch 的验证宣称为“所有工具”。外部 API、OAuth/ACL/TCC 不变；Group/Knowledge 不注入 Owner 能力。普通网络调用不应被当作启动另一个不受控本机执行器的通道。
- **候选方案与影响**：推荐维护独立 Owner 专用 Codex App Server/exec-server 构建，固定经过验证的上游版本；Bot 保留飞书与 Office 实现，所有 Owner 本机写入统一经该受控运行时。Owner Work/Shared 需连接该实例，不能自动借用现有任意桌面实例的权限。需维护 Rust 构建、协议能力协商及各写入型工具适配器，承担上游升级回归。另一方案是改造 Desktop 与 Bot 共用的现有运行时，需确认桌面所需协议与工具适配，回归范围更大。两者都属于待实现的工程方案，不是已证实全量可用的功能；选择后先做单次批准与竞态集成原型，再推进全部工具覆盖。没有建议删减 Issue 的权限边界或通过关闭工具宣称完成。
- **本轮 Validation**：在真实 macOS 临时目录运行7个原生 Seatbelt 场景：项目内创建/追加/删除成功、项目外读取成功；项目外写入/删除、symlink 在命令中由项目内重定向到项目外后的写入、跨出项目的移动、受保护配置文件覆盖均被拒绝。复核项目外原文件内容及受保护文件未变，外部新目标未产生；仅本轮测试目录被创建/清理。此探针为手工构造的 OS 策略，未通过 Codex 模型或 Bot 发起，**不是 App Server 单次批准、并发路径竞态或全部工具验收**。本轮文档 diff 检查通过；运行代码未变，未重复全量测试。此前802项属于上一实现的测试结果，不计入本轮新验证。
- **需要 Human 决定的技术范围**：采用独立 Owner 受控运行时（推荐），还是必须继续与现有 Desktop 共用同一运行时？该决定确定需要改造和验证的客户端、工具适配器及长期维护范围；不是部署或权限批准。技术选择明确前不替换任何现有服务。两项P1仍未关闭，PR #34保持Draft、Issue #33保持开放，未取得独立Reviewer PASS、未部署或Merge。

# 当前交接：Issue #33 fresh retry / PR #34（2026-10-04，部分完成，仍阻塞）

- **Task Source**：本轮用户完整 Issue #33、两项 P1 与 fresh-attempt 指令；已实时读取 GitHub Issue 正文/评论、PR #34 状态。指定分支 `codex-flow/issue-33-730a1c5e`，起点 `572a0c67b0134abeaf64a3dbb1cfcbfa307f86aa`，开始时工作区干净、远端 head 一致、PR 为 Draft。此次授权允许本地测试、Commit/Push 与更新原 Draft PR，取代下面旧 lane 的工具限制；仍不 Merge、不部署、不转 Ready。
- **Implementation**：已知格式的纯只读/网络权限请求在当前可信 Owner 消息和匹配 turn 下免确认，核对授权群与 Shared 绑定；请求 ID 在 RPC 响应前消费，未知响应不重放。无可信飞书原请求的桌面观察不取得自动授权；写权限和未知格式仍拒绝自动授予。保留 seed 的 Owner Office 免确认及一次性出站校验。将旧 Office 人工确认测试改为真实队列等待期间的撤回/撤权/Owner/turn/steer/原消息/期限失效测试；更新 Shared 文件审批夹具，使其具有可信来源与真实临时路径。默认 npm test 纳入此前遗漏的 offline 测试，并新增真实临时目录/symlink/move 两端/根替换分类回归。
- **协议取证与未解决 P1**：本机 `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex --version` 为 `codex-cli 0.160.0`。实际执行 `app-server generate-json-schema`；`PermissionsRequestApprovalResponse.PermissionGrantScope` 仅 turn/session，文件审批响应仅 decision，命令请求的 additionalPermissions 是权限范围，不是具体写操作清单。[官方 App Server 协议](https://learn.chatgpt.com/docs/app-server)与此一致。Bot 的 JSON-RPC 审批不能替外部执行器原子绑定系统调用路径。没有关闭 Shell/项目内写入免确认与项目外单次写入能力缺口，也没有消除批准后 symlink 替换或跨工具绕过；**两项 P1 仍未解决，不是 Full Authority 完成候选**。此次没有用放开 sandbox、命令字符串解析或额外快照假装修复。
- **Validation**：Node `v24.21.0`；`npm ci --ignore-scripts --no-audit --no-fund` 成功。初始全量 753 项中 722 通过、31 失败，主要为 seed 尚未同步的旧确认卡片及工具版本预期；不是将其作为通过证据。最终 `npm run check` 退出0、`npm test` **802/802通过**（0失败/跳过，含全部 offline 与新增真实文件系统分类），`git diff --check` 通过。独立运行 Owner 专项290/290、Shared专项45/45通过；先前 Owner+offline专项303/303通过（发生在新增只读/网络专项之前，不与802累加）。
- **真实环境边界**：用临时独立 Codex home、无飞书凭据的忽略配置执行 doctor/smoke，随后删除该临时配置。smoke 退出0，真实 initialize/ephemeral thread/dynamic tools 注册通过，未调用模型或飞书。doctor 退出1：握手成功、8个模型元数据、隔离环境未登录；不是 doctor PASS。Group/Knowledge 两个探针各退出1：版本锁要求0.159.0，实际0.160.0，在发起探针前停止；未改版本锁以制造通过，实际隔离协议验收未完成。
- **Remaining / 下一步**：需要覆盖全部本机写工具的受控执行层，绑定单次操作全部源/目标、执行时防路径替换、保护 projectRoots 配置并阻止拒绝后换工具；完成后才能放开项目内写和 Shell。新版 filesystem entries 仍未适配，未知格式拒绝。Work/Gateway 原策略保留。独立 Reviewer PASS、匹配版本的隔离探针及六步真实验收未取得；按本轮指令不部署。Issue 保持开放，PR 保持 Draft；不将测试绿灯当作两个 P1 已关闭。
- **交付**：修改保存在本分支；本轮提交与 PR/Issue 回写完成后，以 Git/PR 最新 head 为准。停止任务不撤销 seed 或本轮已有修改。

# 当前阻塞：Issue #33 实际写入执行边界（2026-10-04，未完成）

- 最新反馈仍为两项 P1：Owner Full Authority 未实现；projectRoots 未约束所有实际写入。本轮复核 `src/codex.mjs`、`src/thread-controller.mjs` 和 Bot 调用点：本仓库通过子进程或 Shared RPC 使用外部 App Server，`respond` 只发送审批结果，不控制执行文件操作的系统调用。现有接口没有在本仓库得到验证的单次操作/全部目标绑定机制，无法在批准之后由 Bot 原子复核并执行；Shell 也不必经过 fileChange 审批。
- 本轮处理：未继续增加审批快照代码或放宽 sandbox；它们不能消除上述执行边界缺口。按用户要求重新运行三项允许基线及两项 offline 测试，**96/96 通过**，退出码0；无源代码修改，仅更新本阻塞记录。既有修改全部保留，未撤销；测试通过不代表两项 P1 已关闭。
- 恢复开发所需：在实际 App Server/工具执行层提供并验证覆盖 Shell、文件工具及其他本机写入的强制边界；操作级授权须绑定 Owner/原请求/turn、具体操作与全部路径，执行时防止路径替换，拒绝后不能通过另一工具继续写入。需要相应运行时实现或可验证接口契约，以及允许执行该运行时集成测试的验证阶段。本 lane 禁止服务、Shell/Git 子进程与真实 API，不能在此验证该能力；不应重复把相同候选送审并期待 P1 消失。
- 当前交付状态：Issue 阻塞且未完成，不能发布为 Full Authority 候选。未提交、推送、改 HEAD、部署或真实验收；最终调度器验证及独立审核未由本轮执行。以下保留此前实现和返工证据。

- Task Source：用户再次提供 Issue #33 及三项 P1 审核反馈。继续同一隔离 checkout；未使用网络、凭据、Git 子进程或修改 HEAD。下节是上一轮记录，本节描述最新差异。
- 最新 Task Source：用户随后提供两项未解决 P1 与文件审批通知 P2。已核对 `action` 实际控制流：旧实现的 decline 会先进入通用拒绝分支并返回，未复现“拒绝后收到批准通知”；所指文件专用分支的文案确为硬编码批准。本次将文件 accept/decline 合并到独立分支，按 decision 同时设置卡片关闭状态和结果通知，两者都在发送 RPC 前消费令牌。增加批准和拒绝消息的精确断言，实际 decline 与通知“已拒绝本次文件变更请求”一致。
- 本轮 Validation：重新执行固定 Node 参数下的三项允许基线及两项 offline 文件，**96/96 通过**；仅修改上述审批分支及结果断言，未触及 sandbox、Shell 或实际写入执行层。两项 P1 仍未解决，不声称 Issue 已完成；不能从本地卡片复核推断外部 App Server 实际执行时具有原子路径绑定。未提交、推送、改 HEAD 或执行真实验收。
- P1 路径执行边界：将 `classifyProjectWrite` 接入真实 `item/fileChange/requestApproval` 的审批路径；精确解析 add/update/delete 及 movePath，展示规范化路径和操作类型，移动同时分类源和目标。批准前复核路径解析、Owner、原消息快照/撤回、turn、steer、diff、项目根配置及外部绑定；未知格式/缺少可信来源拒绝开放卡片。**这只是审批复核，不是 syscall 执行边界**；RPC 批准之后至 App Server 写入之间的 symlink 竞态仍未解决，不能自动批准项目内变更，P1 尚未关闭。
- P1 回合级权限：不再将可复用文件写权限集合回传为批准；自有请求返回空权限，共享外部请求不抢答，展示能力不支持原因；旧权限卡片在 action 入口也拒绝授予。保留原协议 `scope:'turn'` 的空拒绝响应，不虚构 `operation` scope。文件变更卡片令牌在发送响应前消耗，相同请求 ID 不重放，连接结果不确定不能重复提交。此改动封住了已指出的回合级文件写授权入口，但没有新增可替代它的操作级执行器，因此不是完整验收通过。
- P1 Owner Full Authority：未把现有 sandbox 改为不受限，未自动批准任意 Shell/权限请求。当前命令审批协议不提供可验证的全部写入目标，外部 App Server 的执行行为也无法在本 lane 验证；凭命令文本或路径快照放开会违反 Issue 的保留 Gate。该项仍未解决，需要运行时执行层能力与集成验证。
- Validation：固定 Node 24 和安全参数运行三项允许的基线测试，加 `test/offline/owner-authority.test.mjs`、`test/offline/file-review.test.mjs`，最终 **96/96 通过**。新增18项离线回归覆盖移动两端、symlink 外跳、未知权限格式、私有/Shared 权限请求、旧卡片、无来源/伪造 Owner、来源/turn/diff/路径变化、批准/拒绝后相同 ID 重放、RPC 结果不确定和 Shared 观察丢失。文件系统、RPC 和飞书均为内存夹具，测试未执行实际文件变更/服务/网络；不把等待期间路径复核称作消除执行时竞态。
- Remaining / 风险：禁止回合级写权限会使依赖该协议的现有文件操作明确不可用；文件卡片现在要求可信 Owner 来源，不再代办没有飞书原请求的桌面回合审批。旧测试中对应授权/卡片预期仍需在后续允许的全量测试 lane 更新复验。只读/网络权限和 Shell 仍保留原审批，跨工具拒绝后防绕过及 projectRoots 配置文件防模型写入尚无统一执行层保障。三项 P1 均不宣称整体关闭；需要可限定单次 syscall/操作且防路径替换的执行层后再继续 Full Authority 收敛。
- Delivery：源代码、离线测试及 README/PROJECT 已更新；未提交、推送、建 PR、部署或 Merge。全量/SQLite、真实 Codex/飞书/文件操作验收与独立 Reviewer PASS 未执行；最终 `operator-profile:repository_worktree` 验证由调度器执行，本轮未将标记当作命令。不可将此候选作为 Issue #33 完成版本发布。

# 上轮开发断点：Issue #33 Owner Authority（2026-10-04，部分实现，未完成）

- Task Source：用户提供的 Issue #33 完整正文；仅在调度器提供的隔离 checkout 修改源代码、离线测试和文档。未访问 GitHub 或真实配置。只读 `.git/HEAD` 显示 `codex-flow/issue-33-730a1c5e`；未执行 Git 子进程，未核对完整 Git 工作区状态。Node 实测 v24.21.0；未检查真实 Codex 登录/运行环境。
- Implementation：Owner Office 非 GET、电子表格写入和文字样式修改取消重复确认卡片；不再以机器人创建记录/Trusted Document 作为资格前提。继续通过宿主当前可信消息签发一次性执行许可，绑定 Owner、应用、原消息快照、turn、参数摘要和请求 ID；保留10分钟期限、撤回/steer/回合结束失效、防重复、revision 和 unknown 不重试。更新模型工具说明与工具版本标记；创建记录仅保留为审计。Owner 私聊及已进入 Owner 主执行路径的授权群适用同一 Office 行为。
- 项目边界准备：增加 `ownerAccess.projectRoots`（默认空数组），配置加载时要求现有目录、规范化绝对真实路径并去重；新增独立路径分类器，按真实祖先解析未创建目标、识别 symlink 外跳、拒绝 `..`/悬空链接/非目录祖先。数组冻结，无新增模型配置入口。**分类器未接入写入执行层，当前不改变 Codex sandbox/审批策略，也不能保证检查到执行之间路径不变化。**

| 机制 | 本轮处理及剩余范围 |
| --- | --- |
| Owner Office 非 GET / 自建文档确认 | 去掉卡片和创建记录资格门，保留一次性执行校验 |
| Office API 目录和 schema | 保留固定 SDK 路由及参数校验；不是任意 API 代理 |
| OAuth API 名单 / user 与 tenant 路由 | 保留显式身份配置、scope/ACL 与失败不回退；未扩展接口名单 |
| Owner Read / Collection / Trusted Document | 当前 checkout 的 Office 入口未发现独立 Read/Collection Permit；其他候选实现未读取、未合并；创建记录资格门已移除 |
| Group / Knowledge / 普通成员 | 工具注册、独立执行环境、事件身份与群 allowlist 不变；本轮仅做合成事件身份测试 |
| revision / unknown / 撤回与生命周期 | 保留；限定测试覆盖相关 Office 与文档路径，不宣称所有运行时路径已验证 |
| 本机写入 / Shell / Shared Runtime | 保留原审批；尚无跨工具、精确一次操作的统一执行边界 |
| Thread / Work / Gateway | 保留既有配置限制；未完成 Full Authority 收敛 |

- Validation：使用固定 Node 参数 `--openssl-config=/dev/null --no-addons --preserve-symlinks --preserve-symlinks-main --test --test-isolation=none`，运行 `test/documents.test.mjs test/member-names.test.mjs test/send-references.test.mjs test/offline/owner-authority.test.mjs`，最终 **78/78 通过**。新增13项覆盖无卡片 Office 写入、重复执行、Owner/app/turn/steer/撤回/消息变化失效、伪造身份、只读无需写许可、未知写入不重试、OAuth 失败不回退、群事件身份和路径分类；既有文档测试覆盖 revision 与样式校验。
- 测试限制：首次真实目录夹具测试因目录 rename 被 sandbox 拒绝，第二次因清理目录被拒绝，均为 EPERM；没有规避限制或请求提权。最终路径分类测试改为内存文件系统，未将其算作真实写入、删除、移动或 symlink 竞态验收。可能残留 `test/offline/paths-*` 空测试目录，由调度器清理。完整 npm test、SQLite 测试、doctor/smoke、服务和真实 API 调用按本执行 lane 限制未执行；旧全量测试中的 Office 确认卡片预期尚待后续更新和全量复验。`operator-profile:repository_worktree` 是调度器验证标记，未作为命令执行。
- Remaining / 阻塞：现有 `item/commandExecution/requestApproval` 仅给出命令/工作目录等信息，不能证明命令的全部写入目标；`item/permissions/requestApproval` 的目录/turn 权限无法保证一次具体写操作、拒绝后不可换工具、或批准后 symlink 不变。直接自动批准会违反 Issue 的唯一保留 Gate，故未这样实现。需要在能拦截所有写入的运行时执行层实现操作级授权，再接入分类器、精确源/目标路径和当前 Owner/请求/turn；projectRoots 配置文件自身也须在该执行层禁止模型修改。该能力无法在本轮受限工具与协议验证范围内可靠完成。
- 下一步：实现并验证上述执行层后，继续收敛 Thread/Work/Gateway 等剩余本地 Gate，运行全量/Group/Knowledge 隔离回归，由独立 Reviewer 审核，再按 Issue 的六步安全目标做候选部署验收。当前实现不能作为 Issue #33 完成版本部署或关闭 Issue。
- Delivery：代码/文档已修改、限定离线测试已通过；真实 Codex/飞书/文件审批未验证；独立 Reviewer PASS 未取得。未提交、未推送、未建 PR、未部署、未 Merge、未改 HEAD。网络与远程回写由调度器负责，本节作为本地 Implementation / Validation / Remaining 交接记录，不冒充已发布的 Issue Closing Report。

# 当前候选：PR #30 dee803a8 已部署，等待Human飞书私聊验收（2026-10-02）

- Task Source：Human授权部署独立PASS的 `dee803a8def1a9755f777b3ac4ea09ba4b740035`，服务正常后提供真实验收步骤，暂不Merge。[独立审核](https://github.com/dccaoxy/codex-feishu-bot/pull/30#issuecomment-5953211552)的head已在部署前再次核对。
- Deployment：北京时间21:33完成。89个受管文件与审核head逐项匹配；当前配置、OAuth scopes/API白名单、Owner/授权群、Office/Trusted Document、Knowledge、Shared Runtime均保持不变，Group/Knowledge继续使用既有固定0.159.0。仅短暂重启机器人，Shared进程未变。
- Backup：本机Git忽略目录data/pr30-dee803a-backup-*保存旧源码、真实配置、LaunchAgent、加密OAuth文件和两库一致性备份。未导出密钥或token。配置/加密凭据/服务配置前后一致；停机验证两库逐表摘要一致，启动后仅history_sync/sqlite_sequence运行状态变化，业务表未变。
- Validation：安装后的check、全量1287/1287（0失败/取消/跳过）、doctor共享连接检查、ephemeral smoke、Group30/Knowledge19模拟provider隔离探针均通过。最新启动日志Codex与飞书长连接正常，机器人及Shared均running，无新增error或EMFILE。部署记录data/pr30-dee803a-deployment.json。准备暂存目录时曾遇到重复复制test目录的本地错误，已修正准备步骤；发生在停机之前，未触碰候选服务，不涉及部署回滚。
- Human验收：请在机器人私聊发送“读取 FY26 AEG新羽计划群里所有的飞书文档链接，包括多维表格”。检查无需逐个重贴链接、逐项区分正文/元数据/403/unsupported、共享入口不再静默遗漏；不追踪正文二级链接、不写资源、不跨群。实际数量以本次冻结镜像为准，不强行使用历史24作为固定值。
- Remaining：本轮没有代发真实验收请求或Office读取。新版本真实集合效果等待Human反馈；共享入口仍不支持、Docx403/Sheet缺样本和长期refresh限制保留。本节为部署证据文档，不改变已部署源码。未Merge。

# 历史返工：PR #30 中文边界后续链接完整性（2026-10-02）

- Task Source：[c4f86b8独立NEEDS CHANGES](https://github.com/dccaoxy/codex-feishu-bot/pull/30#issuecomment-5952933530)。同一分支，先退回Draft，不部署、不Merge。
- Root cause / Implementation：上一轮仅截取中文边界前的根URL，丢弃其后无空格文本。现在在顶层文本扫描时拆出已验证根，保留剩余正文并继续扫描下一完整URL；每个后续URL仍拥有完整query/fragment，结构化href不参与拆分。共享入口同样保留后续文本，仅列入unsupported清单，不成为grant。
- Validation：新增12项（解析10、Bot集成2），旧实现新增解析反例9失败/1通过；修复后集合/permit/Bot专项250/250通过。覆盖text/post连续标准链接、后续共享入口、三段连续链接、后续query/fragment嵌套拒绝、href原子性；Bot验证同一来源的两个标准资源均可读且撤回后无新增OAuth/SDK调用，共享目标尝试0lease/access/SDK。check及diff检查通过；全量组合 **1287/1287**，0失败/取消/跳过。
- Environment：无飞书凭据、无Shared地址的隔离开发副本，固定Codex0.159.0 doctor/ephemeral smoke通过；Group30/Knowledge19次模拟provider隔离探针通过。未使用真实OAuth、未修改任何飞书资源或生产配置。README已同步。
- Remaining：同一PR推送新head后Draft→Ready请求独立审核。线上候选继续240967c，本轮未部署、未Merge；共享入口不支持、Docx403、Sheet缺样本与长期refresh观察限制不变，不能宣称真实集合验收通过。

# 历史返工：PR #30 链接中文边界与共享入口显式报告（2026-10-02）

- Task Source：Human 同意同一PR返工，修复真实验收发现的紧贴中文正文Docx漏识别，核查共享入口；不部署、不扩大权限、不Merge。分支仍为 `codex/issue-29-owner-read`，返工前退回Draft。
- Implementation：仅可见文本的标准资源根ID后允许中文边界；不裁剪结构化href、编码路径、query/fragment，不发现嵌套目标。共享base/form链接加入冻结分页清单，标记unsupported及明确原因，不加入grant，resourceId为null，保留来源群/消息/URL；同样执行预算和来源/Owner生命周期检查。原有tuple、隔离和用户身份不回退tenant边界保留。
- API核查：固定SDK 1.74.0的表单读取需要app_token/table_id/form_id，现有只读API策略没有分享标识反解接口。因此3个真实共享入口仍未验证可读，不能将分享标识冒充资源ID；不增加API、scope、网页抓取或真实调用。README已记录官方接口参考及清单状态语义。
- Validation：check及diff检查通过；最终全量组合 **1275/1275**，0失败/取消/跳过。本轮新增20项回归覆盖中文正文、富文本href、编码/伪造路径、query/fragment嵌套、共享入口分页/去重/跨群/类型过滤以及撤回撤权和Owner变更；模拟Bot链路证明共享标识0OAuth lease/0SDK调用，标准资源仍可读且撤回后失效。最初新增7项在旧实现3失败/4通过；修复后专项201项通过。补充Owner变更测试需兼容宿主不再响应工具的安全路径，已修正测试断言，无业务实现改动。
- 环境：无飞书凭据、无共享服务地址的临时开发副本，固定Codex 0.159.0 doctor握手/登录/8模型及ephemeral smoke通过；Group30/Knowledge19次模拟provider隔离探针通过。未连接/重启生产服务，未执行真实Office验收。
- Remaining：运行候选继续为240967c，OAuth scopes/API、配置和业务数据未改。中文链接实际可读性、共享入口、已知Docx403/Sheet缺样本和长期refresh限制仍须如实保留；新代码提交后重新Ready请求独立审核，不能以自动化通过代替真实集合验收。未部署、未Merge。

# 当前候选：PR #30 `240967c` 已部署，集合完整性真实验收未通过（2026-10-02）

- Task Source：Human 授权部署独立 PASS 的 `240967caa10049a1240cd698d8ccf8332f48e4b0`，保持现有权限和数据，仅验收指定授权群当前可信本地镜像的 Office 资源集合，不 Merge。后续 Human 单独批准只为 Group/Knowledge 固定已验证的 Codex `0.159.0`。
- 部署前环境差异：应用内置 CLI 已从此前 `0.159.0` 变为 `0.159.0-alpha.12.1`，首次部署尝试在停服务之前被版本门禁拒绝，没有生产变更。经明确授权后，以独立官方固定包配置 `codex.isolatedBinary`；GroupModel 和 KnowledgeWorker 使用该路径，Owner 原 `codex.binary`、Shared Runtime 路径/连接/进程均未改。没有放宽版本门禁或修改审核源码。
- Deployment：北京时间 20:25 完成候选安装；89 个受管文件逐项匹配审核提交。配置语义差异仅 `codex.isolatedBinary`，Owner、授权群、Owner Gateway、Knowledge、Office 写权限、Trusted Document、OAuth 14 scopes/32 API 白名单不变。没有重新 OAuth、扩大权限、修改业务文档或执行 Merge。
- Backup / Data：本机 Git 忽略目录 `data/pr30-240967c-backup-20261002-202355` 保存旧源码、真实配置、LaunchAgent、加密 OAuth 文件以及 state/groups 两库的一致性备份；未导出 Keychain 密钥。停机验证期间两库逐表计数/摘要一致；启动后仅 history_sync / sqlite_sequence 运行状态发生变化，业务消息表未改变。回滚方案只恢复本轮源码/配置，不覆盖业务数据库或刷新后的凭据。
- Validation：安装后的 check、**1255/1255** 全量组合回归（0失败/取消/跳过）、doctor 共享握手/登录/7模型检查、无模型 ephemeral smoke、Group **30** 次及 Knowledge **19** 次隔离探针全部通过。机器人重新启动，Codex/飞书长连接均恢复，Shared App Server 保持原进程；验收后复查服务 running、新增错误及 EMFILE 均为0。没有把模拟 provider 隔离检查表述为真实群成员测试。
- 真实集合读取：北京时间 20:27，通过实际部署的 Bot.officeReadGuard → OwnerOfficeReader → OwnerOAuth/SDK 链路冻结指定群镜像。本机操作员适配器仅在内存保存当前 Human 请求，生产 SQLite 以只读方式打开，没有伪造或保存飞书入站消息，也没有发送群消息。严格解析集合包含 **23 次来源出现、20 个去重资源**（Docx 12、Wiki 8）；全部20项自动得到集合许可并逐项尝试，**0 target_not_authorized**，不需要 Human 逐个重贴链接。
- 逐项结果汇总：直接 Docx 12项中，2项读到首批20块正文（has_more=true），10项元数据成功但正文 HTTP403 / API1770032（resource_denied）；Wiki 8项的节点全部可读，其中2项关联Docx读到首批20块，5项关联Docx元数据成功但正文同样403，1项关联Bitable元数据及1个表目录成功。该Bitable来源未指定table，未将目录返回的table扩为记录读取授权。没有直接Sheet或Drive路径样本，未补选其他资源；元数据成功或首批正文不代表全文读取成功。
- **完整性阻断**：独立只读交叉核对本群321条text/post，JSON解析错误0。标准Office URL前缀可辨认 **24次出现、21个去重候选**，与严格集合的差额为1条紧贴中文正文的Docx链接，被当前解析器遗漏；该候选未生成permit、未调用API，其有效性/可访问性未验证。标准路径有3次重复来源。另外，富文本字段中的9处 `/share/base` 出现去重后为 **3个共享入口**（base 1个、form 2个，各自1条来源），当前未解析成精确Office资源ID，分类为 `unsupported_shared_resource_path`，未建立许可或访问。按本次口径共24个可辨认候选URL（21标准路径+3共享入口），其中20已尝试、1漏识别、3不支持；早前“24”的原始口径未留存，不追认其含义。不能把20项已识别集合的成功授权等同于“全部群Office链接覆盖”。本轮不修改已审核代码、不绕过许可补读，不扩大到新API或scope。
- 身份与权限证据：**48次 Office 请求均使用实际核验属于绑定 Owner 的 user_access_token**；0 tenant回退、0意外出站、0资源写入，不读取其他群正文/资源或文档正文二级链接。授权群目录仅取名称用于唯一匹配。正常读取自然触发1次refresh并验证Owner，scopes/API前后一致；未人为制造到期，未输出/评论/提交token或secret。一次自然刷新成功不等于长期refresh稳定性已证明。
- Evidence / Human Gate：本机 `data/pr30-collection-deployment.json`、`pr30-collection-acceptance.json`、`pr30-collection-completeness-audit.json` 保留脱敏统计；私有来源清单和 `pr30-collection-report.html` 可逐项核对，资源URL/消息ID不进入GitHub。**部署与已识别集合的读取许可链路通过，但本轮“全部Office资源”完整性验收未通过**。直接Docx403、Sheet缺样本和长期自然刷新限制继续保留。下一步先处理解析漏收及不支持的共享入口边界，再独立审核/安排候选验收；未自动返工、未Merge，PR状态未变。本节仅为部署证据文档，运行源码仍是`240967c`。

# 历史返工：PR #30 多语言富文本完整性（2026-10-02）

- Task Source：[957bfc8 的独立 NEEDS CHANGES](https://github.com/dccaoxy/codex-feishu-bot/pull/30#issuecomment-5950597851)。同一 `codex/issue-29-owner-read` 分支与PR，返工前已退回Draft；不部署、不Merge、不扩大真实验收、不修改业务数据。
- 根因：locale分支先按结构有效性filter，损坏分支在完整性检查前被丢弃；顶层content路径还会忽略并存的locale。此前1228项通过不覆盖此反例，不能证明所有原始分支都已验证。
- Implementation：先枚举全部locale候选，再逐分支检查对象、content数组、行、节点及可见字段类型；任何损坏使整个群资源集合建立失败。顶层content与locale并存一律拒绝，多个合法locale全部提取，单顶层结构继续支持。不改资源授权、OAuth/API/scopes、tuple及生命周期边界。
- Validation：check / diff检查通过；集合/permit/Bot专项 **218/218**，全量组合 **1255/1255**，0失败/跳过。本轮新增27项（单元18、集成9）；旧实现单元新案4通过/14失败、集成新案4通过/5失败，修复后全部通过。覆盖合法与损坏locale混合、分支/行/节点/可见字段错误、顶层与locale混合，以及多合法locale/单顶层正向。真实Bot测试使用模拟OAuth/SDK，确认错误时不返回部分集合，连其他合法消息目标也拒绝，0 OAuth lease / 0 token access / 0 SDK出站。
- 环境与复核：无飞书凭据、无共享服务地址的开发配置下重跑真实Codex `0.159.0` doctor（握手、登录、8模型）及ephemeral只读smoke，均通过，未连接候选Shared App Server。此次仅解析校验变更，Group30次/Knowledge19次协议证据沿用957bfc8轮次，未重复运行；新增集成及生产diff经同任务补充复核，仍待新head独立审核。远端暂无CI结果。
- Remaining：本轮修复随新提交推送同一PR，再Ready请求独立复审，不声明独立PASS。候选与生产数据不变，历史真实资源403/缺样本、自然刷新观察限制保留。

# 历史返工：PR #30 Collection-scoped Read Permit（2026-10-02）

- Task Source：Human报告真实候选产品阻断：已找到授权群24个Office链接，但逐链接permit要求Owner重新粘贴。按本轮明确要求在同一PR/分支增加受控群集合许可，返工前已退回Draft；不Merge，不部署、不扩大真实验收、不修改业务数据。
- Implementation：当前Owner明确指定唯一授权群及全部/所有Office资源，宿主冻结本地可信消息镜像的资源集合，逐来源保存群/消息/类型/精确ID及子资源完整组合。增加集合分页工具，既有文档/Office读取统一使用该集合；不从模型参数、旧消息中的命令、文档正文二级链接、搜索或其他群扩权。
- 生命周期：同一次Owner请求跨工具/分页共享冻结快照；后入库链接不会加入。源消息撤回/移除/变化/过保留期使关联许可失效；群撤权、Owner变化、当前请求/steer变化使旧集合失效。Wiki实际节点映射继承来源和子范围，集合不允许Drive子文件枚举或Wiki空间遍历。完整grant tuple、user OAuth/API/scopes、无tenant回退及原写权限边界不降低。
- Validation：check及diff检查通过；全量组合 **1228/1228**，0失败/跳过。本轮新增161项：集合模块82项、真实Bot→Gateway/Office/Reader集成72项、permit专项新增7项。覆盖24个镜像资源无需手工粘贴、Owner私聊/群来源、分页、跨群/模型猜测/正文二级链接/后入库链接拒绝、Sheet/Bitable完整tuple矩阵、Wiki映射继承与来源失效，以及lease/队列/access/响应/交付五个等待边界的撤回、撤权、Owner变化、steer和回合结束。另修正中文标点相邻链接遗漏；富文本href按完整URL原子解析，query/fragment中的嵌套URL不能产生额外许可，Bot级反例确认嵌套目标0 OAuth lease/0 SDK出站。OAuth/SDK均为模拟，不访问真实Office资源。
- 协议与隔离：无飞书凭据的开发配置下，真实Codex `0.159.0` doctor完成握手/登录/8模型检查，ephemeral只读smoke及动态工具注册通过；Group **30** 次、Knowledge **19** 次本地模拟provider对抗调用全部通过，包含新增集合工具的隔离拒绝。本轮未连接候选Shared App Server、未重启服务、未发送真实消息或修改业务数据。补充代码复核未发现阻断项，但不替代新head独立审核。
- 限制：仅从可信text/post可见字段提取资源，超扫描/输出预算或无法可靠解析时保守拒绝。根链接缺Sheet范围/Bitable子表时仍仅允许原有元数据/有界目录，不宣称读完表格正文；每个来源项与原tuple分别检查，重复链接不替换已开始调用的来源。README已说明这些边界。
- Delivery / Remaining：同一PR/分支提交推送本轮实现和文档，重新Ready请求独立审核，以GitHub最新head/状态为准。当前运行候选仍是已部署的 `4d159c2`，本轮变更未部署、未Merge。原有直接Docx403/Sheet缺样本等真实验收限制仍保留，不因自动化通过而消除；没有新的真实群/Office验收，也没有远端CI结果或独立PASS声明。

# 历史部署：PR #30 Owner 用户只读路由已启用，真实验收部分完成（2026-10-02）

- Task Source：Human 授权部署独立 PASS 的 `4d159c2d7f61a1bc3e4e548ef94164216bc13c99`，扩展已审核只读策略并进行真实只读验收；不 Merge，不新增 user 写权限。
- Deployment：候选已安装上述精确审核代码。部署前备份源码、真实配置、服务配置和两份 SQLite；停机检查前后各业务表计数/摘要一致。真实配置和服务配置未改，Shared App Server 保持原进程；机器人重启后确认 Codex 与飞书长连接恢复，启动日志无新错误或 EMFILE。
- Validation：候选 check、全量 **1067/1067**（0失败/跳过）、真实 Codex doctor/smoke 通过；Group **28** 次与 Knowledge **18** 次模拟 provider 隔离探针通过。未发真实群消息、未进行 Office 写操作。远端 CI 未验证。
- Exception：首次安装后的测试为1066通过/1失败，原因是本地部署文件清单遗漏测试依赖的 `config.example.json`；自动回滚旧源码并验证连接正常。补齐同一审核版本中的示例文件后，第二次部署及全部验证通过；未修改审核业务代码或真实配置。
- OAuth / Enable：Human 已在本机 Chrome 完成个人授权，实际绑定 Owner 精确一致。公司无法批准的 `space:document:retrieve` 及 `drive.v1.file.list` 已从本次策略排除，不申请更大替代权限。保留原13 APIs/6 scopes，新增19个已审核固定只读 APIs/8个读取 scopes，共32 APIs/14 scopes；没有新增 user 写权限。新凭据已加密保存在本地忽略目录，密钥在 macOS Keychain；未打印/提交 token。启用前再次备份配置和两份 SQLite，运行配置仅扩展 `ownerOAuth.apis`，其余字段与备份一致；只重启机器人，未改 Shared App Server/服务配置。
- 使用边界：不能遍历文件夹清单；可按当前Owner可信请求中的明确链接/ID读取其有访问权的具体Docx/Wiki/Sheet/Bitable，仍须相应scope和资源访问权。群里出现链接不会自动授予权限或读取授权；本版需Owner在当前请求中明确给出目标。Sheet单元格需明确range，多维表格记录需明确table及分页范围；元数据成功不等于正文读取成功。
- 真实只读验收：通过部署版本的 Bot 当前来源守卫、OwnerOfficeReader、OwnerOAuth 和固定 SDK 发起真实飞书读取；本地操作员在 Human 授权选样范围内指定群内既有链接，使用仅内存的来源适配器，未向生产 inbox 写入模拟消息。这不是飞书入站消息端到端验收。Wiki 节点及关联 Docx 正文成功返回20块（has_more=true，仅首个有界页）；Bitable 节点/元数据及指定表成功返回15条记录（total=15，has_more=false）；Drive 单文档元数据成功1项、失败0项，不涉及文件夹遍历。
- 真实失败：选择并核对历史工具回执中此前 tenant HTTP403/API1770032 的3份 Docx，当前 Owner user 路由均能读取文档元数据，但正文块读取仍返回 HTTP403/API1770032，归类 `resource_denied`。不把元数据成功当正文成功，也不假定这些链接目前对 Owner 可读；需 Human 提供一份当前浏览器可读正文的 Docx 进一步区分资源/接口限制。未切换 tenant 重试。
- 身份/失败边界：共13次真实 Office API 请求逐次核对 Authorization 为当前 Owner 用户凭据，13/13一致，无其他身份请求；每轮真实 user_info 均与绑定 Owner 一致。合成 user 凭据获取失败及非 Owner 来源探针均在出站前拒绝，0网络请求，无tenant回退。凭据密文快照在验收前后未变，未人为制造到期/refresh rotation。Group/Knowledge隔离沿用同一源码1067项回归与28/18项协议探针，未进行真实普通成员冒充或群发测试。
- 启用后健康复核：check通过；只读解析配置后执行与doctor/smoke对应的真实协议检查，握手/登录/7模型、ephemeral只读任务及27个动态工具注册通过；不触发模型任务。机器人PID38762、Shared PID743正常，飞书长连接ready；86个部署文件哈希匹配审核源码，plist不变，增量日志无error/EMFILE。本次未重复全量和隔离探针，复用启用前同源码通过证据。
- 脱敏证据：本地 Git 忽略的 `data/pr30-deployment.json`、`pr30-owner-enable.json`、`pr30-owner-read-acceptance.json` 与两个 additional 验收结果；配置/数据库备份及加密凭据均只在本地。未记录资源正文、Owner标识或任何 access/refresh token 到提交/评论。
- Remaining / Human Gate：个人OAuth授权与候选启用完成，Wiki/Bitable/Drive元数据真实只读通过；“此前tenant403且Owner可读”的直接Docx成功场景尚未通过，Sheet尚无明确样本及工作表/小范围，已向Human索取。**完整真实验收尚未满足，不标记全部PASS**。现有路由继续保守拒绝无权资源，等待补样本；未进行真实Office写操作、业务文档修改或群发送，未Merge。自然refresh rotation保留后续到期观察。

# 历史返工：PR #30 R2 多资源授权组合（2026-10-01）

- Task Source：[3ea2172 的高风险 NEEDS CHANGES](https://github.com/dccaoxy/codex-feishu-bot/pull/30#issuecomment-5923482731)。同一分支与PR，先退回Draft，不部署、不Merge、不改变线上配置/权限/服务/数据。
- 根因：R1的平面目标集合只证明各个ID/范围出现过，丢失了资源与子资源的配对关系；上轮1017项未覆盖跨组拼接，不能证明多目标安全。
- Implementation：按每个根资源保存完整grant tuple，新URL/根ID开启新组，范围和子资源仅属于当前组。授权须匹配同一完整组合，禁止跨组借用；相同根的多组仍分别匹配，不能交叉拼接table/view/record/form或Sheet范围。游离子资源、错误类型、同组重复字段、缺少table父级均保守拒绝。不可省略已有子资源约束扩大正文/记录范围；固定根元数据读取只允许同根元数据，不扩大内容权限。Wiki派生记录仍仅来自当前有效批读的真实节点响应。
- Validation：check / diff检查通过；专项 **590/590**，完整组合 **1067/1067**，0失败/跳过。本轮新增50项，包括真实Bot→Office/Reader路径的typed/URL两张表四组合矩阵、Docx document/block、Sheets spreadsheet/sheet、Bitable app/table/view或record或form的完整组合矩阵；只放行原始组合，交叉组合均0 OAuth lease/0模拟SDK或HTTP出站。另覆盖相同根的多组、Wiki父节点、省略约束、错误分组与字段顺序。既有身份、scope、生命周期、写入审批回归继续通过。
- 环境：本轮重跑隔离真实Codex0.159.0 doctor/smoke与Group28次/Knowledge18次模拟provider隔离探针，均通过。无真实Office读取/写入/群发送；开发配置无飞书凭据，未触碰候选Shared App Server和运行服务。
- Delivery / Remaining：README已补充分组语法、完整组合与元数据边界；推送同一PR新head，更新PR及Issue #29报告后重新Ready请求独立复审。没有远端CI结果，不声称独立PASS。含糊自然语言/历史指代仍要求澄清；真实资源、重新授权及部署/Merge继续保留Human Gate。

# 历史返工：PR #30 R1 绑定可信 Owner 读取目标（2026-10-01）

- Task Source：[e9f04d4 的高风险 NEEDS CHANGES](https://github.com/dccaoxy/codex-feishu-bot/pull/30#issuecomment-5923191153)。沿用 `codex/issue-29-owner-read`，先将同一 PR 退回 Draft；不部署、不 Merge、不改变线上配置、权限、业务数据或服务。
- 根因：原实现只验证 Owner/生命周期/API/scope，目标完全来自模型参数。原873项通过不能证明读取目标已获当前Owner授权；旧文档中“本次明确目标”的描述缺少宿主强制实现。
- Implementation：新增宿主只读 permit，依据当前 `run.sourceIds` 的可信 inbox 原文/身份/会话生成，只用最新输入确定读取意图，全部来源仍为失效依赖。精确校验资源ID/类型、Sheet范围、搜索关键词与子资源；在OAuth lease前及排队、凭据等待、SDK出站、响应和交付前检查同一绑定。来源改变、steer、撤回/撤权/Owner变化后旧permit失效。专用Docx、Sheet、资源批读、搜索及通用Office五类读取共用此边界；无可信permit的底层Owner读取也拒绝。
- 资料隔离：不从模型参数/旧会话/引用/代码块/文档正文/搜索结果生成授权；唯一派生例外为同一有效批读会话中，已授权Wiki节点API实际返回的类型/token。不能将此例外用于猜测其他文档或表格。批量metadata精确绑定每个token与资源类型，不按前缀/子串放行。
- 保守范围：完整解析当前明确读取命令；歧义或混杂解释要求澄清，不引入LLM授权核对或新的确认卡片。README列出链接、typed ID、子资源、范围和关键词示例。历史指代、“刚才那个”、未明确的表ID/块ID等不会自动借用历史资料；这是本轮明确保留的可用性限制，不声称能解析任意自然语言。
- Validation：check / diff检查通过；最终全量组合 **1017/1017**，0失败/跳过（较上轮新增144项）。新增真实宿主调用路径回归覆盖五类通用/专用读取、群/私聊、空目标、模型猜测、否定/引用/代码块、目标前缀/查询串/类型/子资源/范围/关键词替换、steer与原文修改/来源移除等待竞态、返回文档中的链接不扩权。未授权目标的模拟传输为0次OAuth lease、0次SDK/HTTP出站；明确请求正常返回。既有scope、刷新、撤回撤权、预算和写入审批回归继续通过；传输使用模拟响应，不冒充真实飞书验收。
- 环境验证：无飞书凭据的隔离开发配置，真实Codex `0.159.0` doctor握手/登录/8模型及ephemeral smoke通过；Group28次、Knowledge18次本地模拟provider隔离探针通过。未连接/重启候选Shared App Server、未发送真实消息、未读取真实Office资源、未改授权scope或进行OAuth重新绑定。
- Delivery / Remaining：更新同一PR说明和Issue #29返工报告，推送新head后重新Ready请求独立复审，以GitHub实际状态为准。本地通过不等于独立PASS；真实资源效果、部署、重新授权及自然refresh rotation仍待后续Human Gate。无远端CI结果，不自动Merge。

# 历史开发：Issue #29 统一 Owner 只读身份路由（2026-10-01）

- Task Source：[Issue #29](https://github.com/dccaoxy/codex-feishu-bot/issues/29) 与 Human 当前指令；从最新 main `4f280a9` 建立独立 `codex/issue-29-owner-read`。本轮只开发/回归/PR，不部署、不 Merge，不修改真实配置、授权范围、业务数据或运行服务。
- 官方能力核实：固定 SDK `1.74.0`，核对 Docx/Wiki/Drive/Sheets/Bitable 的23个SDK只读接口与2个固定只读适配接口，共25项。逐接口用户身份、只读scope替代项和官方来源保存在 `src/owner-office-read-policy.json` / README；`owner-office-read.policy.example.json` 为只读授权示例，包含 offline_access，不会自动应用或增加scope。Drive根目录分页限制、搜索边界及表单实际API边界明确保留。
- Implementation：Owner启用OAuth时，专用文档读取、单元格读取和通用Office五类读取使用同一固定策略、scope与身份检查；新增明确链接批量读取和关键词搜索。Wiki先解析真实对象类型；元数据成功不冒充正文成功，每项失败单独报告。缺少API授权、scope、SDK支持或用户身份均停止，不回退tenant。未启用OAuth的既有tenant路径及既有写入/Trusted Document审批边界保持不变，无新增写权限。
- 生命周期与预算：守卫覆盖排队、钥匙串解锁、刷新、SDK出站、响应及交付；修复解锁等待期间授权代际变化的竞态。分页单页默认20/最多50，最多5个资源，单元格最多5000格，元数据批量最多20；返回保留续页标记和截断说明，不递归抓取、不后台索引、不下载附件。Group/Knowledge/普通成员不会获得Owner身份工具；工具数据均标记不可信。
- Validation：语法check、最终全量组合 **873/873**、Office/OAuth聚焦 **128/128**、Owner宿主边界 **312/312** 通过，0失败/跳过；全量包含新只读84项与宿主36项。覆盖固定SDK真实HTTP序列化（模拟传输）、user凭据选用且无tenant请求、分页/预算、批量部分失败、Wiki类型、错误脱敏、缺scope、撤回/撤权/Owner变化/重新授权等待竞态，以及旧办公写入审批不变。没有把模拟接口结果当作真实飞书验收。
- 本机协议验证：隔离开发配置无飞书凭据、无Shared App Server连接；真实安装的 Codex `0.159.0` doctor握手/登录/8模型检查及无模型ephemeral smoke通过。Group **28** 次、Knowledge **18** 次本地模拟provider隔离探针通过；未发起真实飞书读取、写入或群消息，未触碰当前候选或长期观察服务。
- Remaining / Delivery：提交、推送后创建Draft，再转Ready请求独立审核，GitHub实际head/状态为准。新增只读scope/API需后续Human授权、重新OAuth绑定及单独部署后才能做真实资源验收；本轮没有扩大现有grant，也未验证真实五类资源读取或自然refresh rotation。无远端CI结果，不声称独立审核PASS。下一步等待独立审核，保留Human部署/Merge门禁。

# 当前候选：PR #28 审核版本部署与 Owner OAuth 只读验收（2026-09-30）

- Human 明确授权部署及真实只读验收；独立 PASS 对应 `36749d260384151c90a58b8178e025621aed1bab`。精确审核源码已部署；本节仅记录结果，线上不随此文档提交变更。未 Merge。
- 基线复核：运行目录全部既有受管文件与 PR #24 部署记录一致、配置字节一致。新版本保留已上线 PR #19 自建文档能力；没有部署 PR #27 或扩大 Trusted Document。变更前无 active/queued 群或私聊请求，无运行中的 Knowledge job。
- 备份：本地 Git 忽略目录 `data/pr28-36749d2-backup-20260930-202524` 保存旧源码、真实配置、LaunchAgent副本及 state/groups SQLite一致性备份。部署锁内复核版本、review、源码、配置、空闲状态；停机检查期间两库逐表内容指纹不变。配置原有字段逐项保持一致，仅按本次授权新增 `ownerOAuth.enabled=true` 与审核固定13 API名单；实际授权6 scopes未变。
- Validation：部署前 check、组合753/753；实际候选安装后 check、组合753/753、doctor/smoke通过。启用路由后再次doctor/smoke通过；实际候选 Group22项、Knowledge15项隔离协议探针通过。普通成员/Owner边界、user请求失败不回退tenant由全量回归覆盖，不声称另做真实普通成员攻击或群发消息。
- 真实 Owner 只读：通过已部署 `Office.execute` / Feishu SDK 路由调用白名单 user-only `task.v2.task.list`，page_size=1/type=my_tasks，成功返回1条任务。请求拦截核对实际GET目标及Authorization等于当前Owner用户凭据；仅1次真实Office请求，未打印或记录token、任务标题/正文/人员信息。另用同一access调用user_info精确核对既有Owner，一致。固定策略/API与实际6 scopes核对通过。
- 失败边界：相同Office路由的合成凭据获取失败探针拒绝，0 HTTP请求、无tenant回退。SDK失败/撤回撤权等回归继续通过；未制造真实服务端错误。无真实Office写操作、业务文档修改、scope扩张或人为token到期。refresh-check/状态检查为有效凭据读取，真实refresh rotation保留后续自然到期观察，未声称已验证。
- 服务：仅机器人按部署/启用两阶段短暂重启，最终PID54048；Shared App Server PID743前后不变，Desktop/Shared服务及plist未改。最新启动日志确认Codex及飞书长连接ready；增量日志未发现error/EMFILE标记。两授权群、Owner Gateway、Knowledge及原有Office能力配置保留。
- 脱敏证据：本地 `data/pr28-deployment.json`、`pr28-owner-enable.json`、`pr28-owner-read-acceptance.json` 和备份目录验证日志；不将真实配置、数据库或凭据提交Git。按Human本轮六项标准，候选部署与只读验收通过，可提交Human Gate判定；不代表自动Merge、真实写入或refresh rotation已验收。

# 当前修正：Owner OAuth 实际交换兼容性（2026-09-30）

- PR #28 修正时退回 Draft。此前 Human 点击授权后，脱敏诊断确认 callback 到达、token exchange 返回 HTTP400/API20049（PKCE失败），未取得或保存凭据；先前753项模拟测试不能替代真实接口兼容验证。
- 按官方授权页 PKCE 提示，交换/刷新明确采用 v2 固定端点及 JSON 格式，保留 S256、state、Owner核验及全部权限边界；不重用失败 code、不静默回退、不取消PKCE。补强真实序列化格式和 challenge/verifier 对应断言。
- 本轮 check、授权专项26/26、完整组合753/753通过，diff检查通过。Human 重新授权后，真实 v2 code交换、user_info精确Owner核验、加密保存及后续状态读取通过：bound=true，access/refresh未过期，refreshPending=false，6 scopes/13 APIs。refresh-check复用有效access成功，未触发真实refresh rotation；不将此冒充刷新端到端验证。随记录推送重新Ready请求独立审核；未启用生产身份路由、未部署/重启/Merge。

# 当前开发：本机一次性 Owner OAuth（2026-09-30）

- Task Source：Human 要求为既有 Owner 绑定飞书用户身份，通过临时 localhost callback 授权、安全保存 access/refresh credentials 并支持自动刷新；不开发完整 `/feishu-login` 产品。用户随后授权继续实施。
- 基线：独立 `codex/owner-oauth-local`，从最新 main `c9fda13` 开始；保留线上 PR #19 已审核 `b70ab30` 的自建文档内容免确认实现，依赖提交为 `3e36ef5`。PR #27 Trusted Document 开发分支未覆盖，未合并 PR #19 或 PR #27。
- Implementation：官方 OAuth v2、随机 state、PKCE S256、仅回环地址的10分钟单次 callback；通过 user_info 精确核对既有 Owner。凭据 AES-256-GCM 加密，密钥保存在本机 macOS 钥匙串；状态目录0700、文件0600、原子写入，拒绝符号链接和不安全权限。无 token/secret 输出或提交。
- Runtime：默认关闭；仅固定 Office API 白名单采用 SDK request-scoped user token，其余保留 tenant。按需提前刷新、刷新串行/跨进程锁、rotation 原子保存；刷新结果不确定则停止复用旧 refresh token，要求重新授权。Owner、应用、策略、grant generation、撤回/撤权在等待后和实际出站前复核。用户身份写入仍走宿主审批，不借用 tenant 的机器人自建文档免确认记录。Group/Knowledge、FIFO、Shared Runtime 不扩权。
- 初始策略：文档读写与任务读取，13个明确支持 user 的 Office API、6个 scope（包含 offline_access）；不声称全部 Office API 已启用。既有专用文档/表格工具仍采用 tenant 身份。
- Validation：check、全量组合 **753/753**（main + PR #19 + OAuth）、聚焦 OAuth/Owner **302/302** 通过。真实 Codex `0.159.0` doctor 完成共享握手、登录及7模型检查；无模型 ephemeral smoke通过。Group22项/Knowledge15项隔离探针通过（本地模拟 provider，无真实群发送）。
- 本地授权准备：开放平台 callback 已保存；真实钥匙串密钥创建/读取成功，临时 callback 已启动，飞书已展示预期5项办公权限及持续访问授权页面。现已取得并安全保存Owner凭据；OAuth授权成功不等于Office端到端验收通过。
- Delivery / Remaining：实现等待独立审核；准备 Draft → Ready，不 Merge、不部署、不重启。生产 config、群名单、业务数据和现有服务未修改，仅创建获准的本地 OAuth 安全状态目录及钥匙串密钥。真实授权绑定已通过；实际 refresh rotation、用户身份 Office 端到端尚待验证；按需刷新无法保证长期闲置超过 refresh 有效期后仍无需重新授权。独立复审后才安排已审核版本启用。

# 当前返工：PR #24 R2 空目标默认拒绝（2026-09-30）

- Task Source：[428e505 的 NEEDS CHANGES](https://github.com/dccaoxy/codex-feishu-bot/pull/24#issuecomment-5908009519)。同一 `codex/issue-23-send-context` 分支，先退回 Draft；不部署、不重启、不 Merge。
- 根因与复现：R1 只在 `targets.size > 0` 时约束 proposed，空集合仍能由主模型和核对器共同补出一个授权群。新增两项在修复前均复现错误发送；上轮706项通过不覆盖此缺口。
- Implementation：同一宿主绑定检查现在先要求非空目标集合，再要求 proposed 属于集合；空集合在核对器前返回“请明确选择授权群”。文档读取和实际发送队列复用该检查，不新增模型兜底或修改引用解析。唯一群、来源群到目标群、歧义拦截、可信近期选择及来源失效检查保留。
- 回归：两项使用始终同意发送的核对器，分别覆盖无历史的“发到群里”、已有可信近期选择但当前指定未知“财务群”；要求零核对器调用、零文档读取、零发送领取和零出站。既有语义/文档/等待测试补上明确群名，使它们仍实际到达各自被测试的边界；语义拒绝及错误目标测试增加调用次数断言，未放宽原断言。
- Validation：最终 `git diff --check`、check、主线 **708/708** 通过；以 PR #19 `b70ab30` 为底应用 main/本分支相对 `c067550` 的运行代码差异，隔离临时组合 check、**723/723** 通过，均0失败/跳过。独立 Gateway 聚焦复核 **36/36**、引用解析专项 **8/8** 通过。真实 Codex `0.159.0` doctor 完成 Shared握手、登录状态与7模型检查，无模型 ephemeral smoke/工具注册通过；开发配置无飞书凭据。
- Remaining / Delivery：本轮已修改、已测试，随本节提交推送同一 PR 并重新 Ready 请求新 head 独立审核；以GitHub实际head和状态为准。真实候选目录、配置、授权、Shared Runtime、Knowledge、FIFO 和数据未修改；没有真实飞书读取/发送、重启、部署或Merge。语义模型、Group/Knowledge隔离及clientId协议旧证据见下节，本轮不将其冒充重跑结果；无远端CI结果不等于CI通过。

# 历史返工：PR #24 R1 绑定宿主解析结果（2026-09-30）

- Task Source：[2f963f0 的 NEEDS CHANGES](https://github.com/dccaoxy/codex-feishu-bot/pull/24#issuecomment-5907544799)。在原 `codex/issue-23-send-context` 分支返工，PR 已退回 Draft；main 仍为 `57c8180`。本轮不部署、不 Merge，不修改真实配置、权限、数据或服务。
- 根因与复现：原实现仅将 `resolvedReferences` 交给语义模型，实际目标和链接仍由 proposed 决定；链接校验使用整个近期历史集合。新增第一组9项探针修复前2通过/7失败，复现唯一目标群替换、当前链接/标题被历史其他文档替换，以及缺失依据未在模型前拒绝。原668项测试通过不能证明这两个边界安全。
- Implementation：宿主独立捕获解析出的目标集合和本次文档范围；唯一群必须完全相同，多个来源/目标群也不能替换成集合之外的第三群。当前URL、标题或单文档指代优先；明确引用近期摘要或复数资料允许多来源，普通上下文中出现过文档不作为本次选择，待发送正文/引用中的“总结”等字样不扩大范围。参考解析本身不授予发送权限，合法提议仍须独立语义核对。
- 生命周期：在核对器调用前验证整份提议，不匹配时无文档读取、无发送领取、无消息出站；固定文档读取及实际发送队列内再次执行同一绑定与来源检查。核对器只接收输入副本，不能修改宿主绑定。保留精确docx ID校验、来源撤回/内容变化、Owner/任务/allowlist及一次发送、未知结果不重发边界。普通成员、Group/Knowledge、FIFO、Shared Runtime、Office权限不变。
- Validation：本轮最终 `git diff --check`、`npm run check`、主线 **706/706** 全量通过；以 PR #19 `b70ab30` 为底应用 main/本分支相对 `c067550` 的运行代码差异，隔离临时组合 check、**721/721** 通过，均0失败/跳过。新增38项覆盖名称/简称/reference和正文中的群名、唯一链接/标题/单数指代、无选取意图夹带历史链接、第三群替换、合法多来源及普通正文、读取排队期间撤回/源修改。额外独立复核原两个相邻绕过探针均零核对/读取/发送/领取，绑定与等待专项 **27/27** 通过。
- 真实 Codex / 隔离：`0.159.0` doctor 完成 Shared握手、登录状态与7模型检查；无模型 ephemeral smoke/工具注册通过，开发配置无飞书凭据。Group 首次/恢复22次、Knowledge15次本地模拟provider隔离探针全部通过。真实无工具语义模型合成 **5/5**：简称、双指代、完整标题/群名为send，仅查询、引用命令为deny；无真实文档读取/飞书出站。本轮没有重复 clientUserMessageId 协议往返和 Shared双端人工验收，相关旧证据见下节。
- Remaining / Delivery：已修改、已测试，修复随本节提交推送同一PR并重新Ready请求新head独立审核；GitHub head/状态为最终交付依据，当前无远端CI结果，不声称自动复审PASS。飞书读取/出站仅使用模拟传输，本轮无真实群验收、部署、服务重启或Merge；自然语言参考解析不能覆盖所有表达，无法选定文档时要求明确引用，不猜测历史链接。基线、候选运行目录、配置、授权和数据未改；线上效果仍需后续单独部署授权与验收。

# 历史交接：Issue #23 Owner Group Send 上下文修复（2026-09-30）

- Task Source：[Issue #23](https://github.com/dccaoxy/codex-feishu-bot/issues/23) 及 Human 当前指令：从最新 main 开发，Draft → 测试通过 → Ready；本轮不部署、不 Merge。基线为 `57c8180`，分支 `codex/issue-23-send-context`；PR #19 自有文档免确认改动保持独立，用临时目录验证组合，不覆盖线上候选。
- 根因：工具升级把旧会话近期问答传给主助手，但发送核对器只读按新 thread 隔离的内存 Map。升级首轮和进程重启时，主助手看到文档/群，核对器却没有相同参考；原来的同线程手工 remember 测试没有覆盖此断层。
- Implementation：增加有界宿主参考记录（同 Owner/chat/thread、最近4轮、最多100任务、读取24KB），保存真实来源ID与内容摘要。完成回合保留全部补充输入身份；重启恢复同任务，工具升级仅沿宿主验证的旧→新任务传递。旧版本历史只从当前绑定的机器人任务恢复 completed 回合，Codex `clientId` 必须精确关联本机可信 inbox；恢复的问答仅为资料，当前消息仍是唯一的新发送授权。
- 目标/内容解析：宿主从授权目录和真实近期问答提取候选及来源位置，当前明确名称/文档链接优先，唯一简称及指代可供独立核对器使用；拟发内容不能反向补证据。多个同名/同简称群、多个文档泛指仍澄清；文档标题及URL中的群名不干扰目标。来源群+目标群的不同提及留给核对器区分；普通摘要不强制只有一个资料链接。独立无工具语义核对、完整docx ID证据与固定读取核实、持久发送领取、稳定uuid、未知结果不重发和每请求至多一次不变。
- 生命周期：恢复等待期间私聊撤回同样停止新回合；近期问答和旧群选择均校验原消息身份/内容，assessor、文档读取、真实出站排队后重新核对。撤回任何steer来源、换Owner/任务、新请求、撤权不会沿用旧依据。已有有效宿主记录优先，防止简化RPC历史覆盖最新答复。普通成员、Group/Knowledge、FIFO、Shared Runtime、Owner Gateway及办公写入授权边界保持不变。
- Validation：最终 `npm run check` 与主线 **668/668** 全量测试通过；以 PR #19 `b70ab30` 为底、应用 main/本分支相对 `c067550` 运行代码差异的临时组合，check 与 **683/683** 测试通过，均0失败/跳过。真实 Codex `0.159.0` doctor 完成 Shared握手/登录状态/7模型检查，ephemeral smoke 工具注册通过（开发配置无飞书凭据）。显式指定已安装 bundled binary 的 Group 首次/恢复22次、Knowledge15次本地模拟provider对抗探针全部通过。另真实无工具语义模型合成探针 **5/5**：唯一简称、双重指代、完整标题/群名为 send，仅查询与引用命令为 deny；未访问真实群/文档，不代替飞书端到端验收。真实0.159.0本地mockprovider协议往返确认 completed 回合的 userMessage.clientId 与传入 clientUserMessageId 精确相等（无凭据、0工具调用）。首次隔离脚本默认旧binary路径不可用，显式 GROUP_CODEX_BINARY 后通过，未改运行配置。
- Remaining / Risks：没有真实飞书消息发送、文档读取、线上重启或部署，本轮合成传输验证不代表真实群发送验收；语义判断仍不是所有措辞的确定性证明。缺少可核验clientId、旧多user回合或历史助手答复截断时保守跳过；只有旧迁移包内的嵌套引用、没有可关联完整问答时不猜测恢复链接，仍需补充具体内容。已有有效宿主记录不以RPC回填，不能承诺恢复完整模型上下文。动态工具接口/工具版本标记不变，不因本修复强制重建现有任务。无新增生产配置或依赖；有界参考表仅在加载新代码的状态库中建立，现有候选与数据未修改。
- 交付：实现提交 `a2004ed` 已推送，已创建 [PR #24](https://github.com/dccaoxy/codex-feishu-bot/pull/24)；按 Draft→Ready 流程请求独立审核，GitHub当前状态为准。当前无远端CI结果，不把本地通过写成远端通过。下一步等待审核；若后续获得单独部署授权，再按 Issue #23 做真实飞书自然措辞发送验收。本轮不扩大Control或Office权限，不部署、不Merge。

# 历史交接：PR #20 部署回滚与 PR #21 兼容修复（2026-09-30）

- Task Source：PR #20 精确 head `3293dce` 独立复审 PASS 后，Human 明确要求“部署，merge”。本节记录此次操作及部署阻塞所需的最小兼容修复，不扩展功能或群权限。
- Merge：PR #20 已 squash merge，main 为 `760047d98fd636f96296b05724b05275342488f5`，其运行代码与已审核 `3293dce3150746953e41980acefa172f9c2fa20e` 一致。PR #19 仍未合并；部署包以线上 `b70ab30` 加 PR #20 的完整运行代码差异构建，保留自有文档免确认能力，隔离组合 check / 596 项测试通过。
- 部署失败：机器人停止并完成代码、配置和 SQLite 一致性备份后，组合代码的 check、doctor、smoke 通过；Group 隔离探针发现本机内置 Codex 已从 `0.158.0-alpha.2.1` 更新为 `0.159.0`，精确版本门拒绝执行，部署未宣告成功。没有删除版本检查或继续启动未验证组合。
- 回滚核对：恢复旧版 `b70ab30` 的全部65个受管文件哈希，移除新发送核对模块；真实配置与 launchd plist 逐字节不变，数据库未恢复或覆盖。机器人 PID 为87771，Shared App Server PID743保持不变；启动日志确认 Codex、飞书连接恢复。15:07回查私人业务表逐行未变；群镜像因接收新消息从1272增至1274，其余变化为 history_sync 与 sqlite_sequence，知识/FIFO业务表未变。备份及本地证据：`data/pr20-3293dce-backup-20260930-145610/{failed-deployment.json,rollback-verified.json}`；不提交配置、数据库或日志。
- 当前局限：连接恢复不代表所有能力可用。线上仍为旧PR #19，普通群助手和 Knowledge 新任务会被旧版本门拦住；PR #20 的自然语义发送尚未部署。未找到本机可复用的旧隔离二进制。没有恢复/重启 Shared App Server、Desktop 或遥测，也没有发送真实飞书消息。
- 最小兼容修复：从最新main建立 `codex/codex-0159-isolation`，仅把 Group/Knowledge/发送核对共用的精确版本固定为已重新验证的 `codex-cli 0.159.0`；全部禁工具、空技能目录、独立HOME、无环境、Owner/FIFO/撤回/撤权规则不变。新增3项回归确认旧版、未来版和夹带额外文本的版本在建立HOME、RPC、工具执行或更改群绑定前拒绝。
- Validation：最终 check、584/584 主线全量测试，保留 PR #19 的隔离组合 check、599/599 测试全部通过，0失败/跳过。真实0.159.0 Group首次/恢复共22次对抗调用、Knowledge15次探针通过（本地模拟provider，无凭据/远端模型）；doctor Shared握手、登录及7模型、无模型ephemeral smoke/工具注册通过（开发配置无飞书凭据）。另以真实模型核对两条合成请求，自然发送判send、只查询不发送判deny，2/2通过；未调用飞书发送或读取真实文档，不作为端到端群发送验收。
- 下一步：README同步当前验证版本，将此最小补丁 Draft→Ready 请求新head独立审核。PR #20的PASS不覆盖该补丁；补丁尚未部署或合并，线上保持上述回滚状态。审核后再按Human Gate处理兼容版本部署与真实发送验收，不把本次测试通过写成线上恢复。

# 历史返工：PR #20 文档链接精确证据 R1（2026-09-30）

- Task Source：[744863a 的 NEEDS CHANGES](https://github.com/dccaoxy/codex-feishu-bot/pull/20#issuecomment-5905428878)。保持 codex/natural-group-send 原分支，先将 PR 转回 Draft；不部署、不 Merge、不重启服务。
- 复现：对话只有 doc123 链接、拟发送 doc1、模拟接口允许读取任意文档时，原实现仍会出站，新增探针修复前 0/1。此前 549/564 项通过和“链接杜撰”测试未覆盖 ID 前缀，此处修正其证据局限，不以旧测试通过代表该边界安全。
- Implementation：当前请求、近期每条 request/answer 与拟发送正文使用同一 URL 解析函数，从合法 HTTPS 飞书 docx 完整路径提取大小写敏感的 document_id，用集合精确匹配后再执行固定读取核验。删除整段 JSON 的子串判断；查询串、片段、尾部标点及 Markdown 包装不改变资源 ID。完整主机名校验拒绝仿冒域名作为依据，额外路径/伪造后缀/编码分隔符不截断成合法 ID。
- 相关边界：括号、方括号和花括号中的查询/片段值作为外层 URL 一起解析，不能将其内嵌链接另算依据。正常 Markdown 链接仍可识别。保留实际发送前的 Owner、当前请求、撤回/撤权、唯一目标和防重复检查；不修改自然语义模型、Group/FIFO/Knowledge 或运行配置。
- Validation：最终代码 check、581/581 全量测试通过；以 PR #19 精确代码 b70ab30 加本 PR 全部代码差异的隔离临时组合 check、596/596 通过，0 失败/跳过。新增 32 项回归覆盖前缀双向、查询串、片段、尾部标点、伪造路径/域名/编码后缀、嵌套链接、近期 request/answer 与单消息多链接；无依据案例在读取接口前拒绝、零出站。独立只读复核额外执行实际解析函数 7 项探针，7/7 通过。
- 协议与局限：doctor 真实 Codex 握手/登录/7 模型和无模型 ephemeral smoke/工具注册通过，使用无飞书凭据的开发配置。飞书读取和发送均为模拟；本轮未重复真实语义模型、Group/Knowledge 协议探针或真人发送验收，原记录仅作历史证据。当前远端检查列表无结果，不声称 CI PASS。
- Delivery：README/PROJECT 已同步，提交推送同一 PR #20 后重新 Ready 请求独立复审；未部署、未 Merge、未重启，真实配置、授权群、Owner、Shared Runtime、Knowledge 和数据未改。PR #19 仍 Open，组合仅在隔离临时目录完成。

# 原实现记录：Owner 自然语义群发送（2026-09-30，744863a）

- Task Source：Human要求取消固定句式，按自然语义识别当前发送命令，程序核对身份/目标/撤回/重复，有歧义才询问。截图两条原始请求在旧sendIntent中均返回null，第二条还是助手建议的无效模板；此前尚未进入飞书发送接口。
- 基线：最新main c067550，独立分支codex/natural-group-send。PR #19仍Open且候选b70ab30，本次不覆盖运行候选；另以PR #19精确代码做组合验证，不执行Merge或部署。
- Implementation：删除生产固定句式解析；发送前用独立无工具语义核对器判断当前Owner请求与拟发送目标/正文，支持自然措辞、简称、近期指代。核对器复用Group已验证的独立临时home/无环境/禁工具配置，临时任务结束即清理；近期对话按Owner/chat/thread隔离，有界保存4轮，重启不恢复旧授权。升级Owner工具版本以加载新说明。
- Host边界：仍校验可信当前事件、Owner、唯一授权目录引用、撤回/撤权/新请求及实际队列出站；持久一次性UUID与不确定不重试保持。语义结果不能改换目标。文档URL须有当前/近期对话依据且固定docx读取验证成功；整段群历史/模型声明不能自行赋权。错误分别为歧义、未授权、核对暂不可用，不再统一误导为权限不足或要求重说模板。
- Validation：check、主线549/549测试通过（新增15项，旧534项保持）；最终代码与PR #19的临时组合check、564/564测试通过，0失败/跳过。涵盖自然措辞调用、语义拒绝/歧义/异常、目标不匹配、等待中Owner/群撤权/新消息/撤回、链接杜撰/无法验证及跨会话隔离。旧输送边界测试使用确定性语义夹具，不当作NLP质量证据。
- 实际模型与协议：4个合成案例通过，截图两种发送措辞都判send，明确不发送及解释引用句均deny；确实调用本机登录的模型，但没有发送飞书消息、读取实际文档或改线上服务。doctor/无模型smoke、Group22类攻击/持久恢复、Knowledge15类隔离探针通过。
- Remaining：自然语义模型不是形式证明，仍需审核后有界部署及真实用户发送验收；额外模型核对增加延迟与用量，异常时零发送。无近期依据/重名/过长上下文询问或拒绝；飞书链接目前仅核实docx，其他资源不自动发送。未部署、未Merge、未修改真实配置/群授权/数据。按仓库协议Draft→Ready提交独立审核。

# 当前交接：PR #18 已审核候选部署（2026-09-28）

- Human 明确授权部署独立复审 PASS 的 fdfd46836fe4e57f11aad554026a1d19d0da52e0，不 Merge。[复审证据](https://github.com/dccaoxy/codex-feishu-bot/pull/18#issuecomment-5863191009)。候选仍为原 data/issue6-candidate，部署前源码与PR #17记录一致，无活跃/排队用户任务或运行中Knowledge任务。
- Deployment：实际文件清单以 data/pr18-deployment.json 为准；src/scripts/test/third_party与package文件均来自精确提交且部署后逐项SHA256校对通过。备份 data/pr18-fdfd468-backup-20260928-134943 包含原代码、配置与两份SQLite一致性快照。仅机器人重启PID1155→52185，Shared App Server PID743不变；Desktop、Shared和遥测服务未重启。真实config.local.json及launchd plist逐字节不变，原2群、Owner、Gateway、Knowledge、FIFO权限配置不变。
- Validation：在实际候选目录执行check、534/534全量组合测试（0失败/跳过）、doctor握手/登录/7模型、无模型ephemeral smoke及动态工具注册全部通过。实际二进制0.158.0-alpha.2.1的Group22类攻击及持久恢复、Knowledge15类攻击隔离探针通过；探针使用本地模拟provider，无真实模型调用或飞书写入。
- 服务与数据：全新日志确认Codex和飞书长连接建立，服务running；新增stdout189字节无error/EMFILE，stderr0字节。停止期间验证前后全部业务表逐行一致；启动后原消息1207条、知识和私人业务表保持一致，仅history_sync.last_reconciled_at与SQLite自动序列随正常同步更新。已有2个blocked Knowledge任务保持原状，未额外重试。完整哈希、日志与快照证据留本地，不提交凭据或数据库。
- Human Gate：可以开始临时文档的格式修改、拒绝写入、撤回使旧确认失效、批准精确删除内容四项真实验收。此前未发送真实确认卡/写入实际文档，不能宣称真人验收已通过。云盘文件/任务tenant scopes和7项user-only接口限制仍存在，PASS和部署不等于全部飞书权限开通。未Merge；运行代码固定fdfd468，不随本次文档记录提交变化。

# 当前返工：PR #18 R2 私聊撤回（2026-09-28）

- Task Source：[ed4acdb 的 R2 NEEDS CHANGES](https://github.com/dccaoxy/codex-feishu-bot/pull/18#issuecomment-5862551514)。R1 授权主体已通过复审，但生产撤回入口仅处理带 ownerChannel 标记的群，私聊原消息撤回没有取消办公许可。本次同分支 Draft 返工。
- Implementation：生产撤回入口对私聊从持久化 inbox 核对当前 Owner、消息类型、chat_id 与 message_id 后取消原消息，清除匹配回合的确认、取消 run 并请求 turn/interrupt。保留群撤回及离群整通道取消；私聊缺失/无关/非Owner来源不能取消当前回合。已发送到飞书的操作无法回滚。
- Validation：check、534/534 全量组合测试通过（0失败/跳过），含 PR #5、Owner、FIFO、Knowledge 既有回归。新增4项生产入口回归覆盖私聊撤回后旧按钮/旧slash零删除传输、批准后SDK排队期间撤回零传输、无关/缺失/非Owner/错会话撤回不影响正常私聊确认。针对性 Owner 测试257/257通过。
- 实际协议验证：doctor Shared App Server握手、登录、7模型及无模型ephemeral smoke/动态工具注册通过。独立开发配置无飞书凭据，未发送真实卡片/执行真实办公写入；不宣称真人UI验收完成。本次未修改隔离工具注册/模型版本，Group22/Knowledge15实际探针沿用R1记录，没有作为本轮重跑结果。
- Delivery：README/PROJECT更新，推送同一PR后转Ready请求新head复审。未部署、未Merge、未改候选配置/数据/服务/授权群；云盘/任务tenant权限及7项user-only限制保留。等待审核和后续Human Gate。

# 当前返工：PR #18 宿主级办公写授权 R1（2026-09-28）

- Task Source：[476a8c7 的 NEEDS CHANGES](https://github.com/dccaoxy/codex-feishu-bot/pull/18#issuecomment-5862288637)。原506项测试未覆盖“有效Owner回合中的模型误调用”这一边界，仅提示词不能证明当前用户批准。已在同一分支先转Draft返工。
- Implementation：全部新增办公目录非GET接口（保守包括POST查询）、sheet_write及新format_text由宿主挂起并展示完整API/参数确认卡片；无宿主许可时即使提供合法通用guard也零传输。Owner必须经真实飞书按钮事件或已持久化的当前/approve消息确认，模型无法提供可用授权字段。普通成员、历史引用、文档内容和伪造/缺失消息不会生成许可。
- 绑定：许可捕获Owner、原message集合及可信inbox快照、原turn、API/完整参数摘要、工具请求ID与10分钟期限。参数先复制，卡片转义控制字符，超出完整展示预算拒绝，不采用摘要代替目标。相同消息/回合/参数及重复request ID最多执行一次，审批不跨重启恢复。签发、实际出站、返回RPC前均复核，出站瞬间消耗一次性许可；拒绝/撤回/撤权/换回合/原消息变化/追加要求/过期使旧授权失效。已到达飞书的操作无法回滚。
- Validation：check及530/530全量组合测试通过（0失败/跳过）；新增24项回归覆盖文件/批量记录/日历/任务删除与邀请/成员变更零授权零传输、真实Owner按钮和slash确认、普通成员、篡改参数、重复/并行请求、原消息变化/撤回/撤权/过期、批准后排队及最终RPC交付守卫。保留PR #5、Owner、FIFO、Knowledge既有组合。
- 协议验证：doctor实际Shared握手/登录/7模型、无模型ephemeral smoke工具注册通过；固定0.158.0-alpha.2.1 Group 22类攻击/重启恢复及Knowledge 15类攻击探针通过。隔离开发配置与模拟飞书SDK；无真实模型请求、未发送飞书确认卡片或写入真实资料，不声称真人审批UI验收通过。
- Delivery：README/PROJECT同步，推送同一PR #18后Draft→Ready请求最新head复审。未部署、未Merge，候选配置/服务/数据/授权群不变。云盘/任务tenant权限和7项user-only限制原样保留；旧文档/本机工具沿用既有授权路径，本次不扩展该边界。

# 当前补充：删除原文档内容能力（2026-09-28）

- Human 反馈原文档有重复表格，机器人因没有删除工具而另建文档，要求匹配权限。只读核对现有应用tenant的docx:document、docx:document:write_only均已获批；线上候选没有office模块及batchDelete内容工具。不能据此判断具体文档协作者权限，但本次截图所示功能缺口来自未部署的新工具。
- PR #18 已含官方 documentBlockChildren.batchDelete；本次同分支补充非负整数/左闭右开删除范围校验、明确读取版本及父块children/目标ID的操作指引，不以另建文档代替用户要求的原文档修改。删除内容不等于删除云盘文档文件。
- 验证：check、506/506全量组合测试（0失败/跳过）及真实无模型ephemeral smoke/动态工具注册通过。补充代码提交推送同一PR #18，重新Ready请求最新head审核。不修改真实文档、应用权限或线上配置，不部署、不Merge。

# 当前交接：Owner 办公工具扩展（2026-09-28）

- Task Source：Human「给飞书机器人配尽量完整的工具和权限」，澄清回复「所有能给他配上的都配上」。本人私聊/已有授权 Owner 群使用扩展工具，普通群成员权限不变。基于最新 main 094de08 新分支 codex/owner-office-tools；未扩大授权群或进入新的共享运行模式。
- Implementation：固定提取官方 lark-mcp 0.5.1 的219项接口目录，212支持应用身份、7项用户身份专用明确拒绝；通过 find/schema/call 按需加载。覆盖文档、多维表格、电子表格、文件、知识库、日历、任务、联系人只读、会议/搜索；增加单元格范围读写、权限清单分页、精确局部文字样式工具。接口数量不代表权限开通或逐项验收。
- 保护：固定SDK目录/JSON Schema、禁止URL/请求头/Token/身份覆盖和路径注入；已有文档块编辑要求具体revision；写入不自动重试；结果预算与截断说明；排队出站/返回前验证原Owner、回合、撤回/撤权。旧机器人自有任务通过既有工具版本升级路径加载新工具。普通Group/Knowledge不注册办公工具。
- Runtime：本机Desktop二进制已为0.158.0-alpha.2.1，原隔离检查因固定0.158.0-alpha.2而拒绝。先在独立临时探针验证新版，再将本开发分支准确版本固定更新至0.158.0-alpha.2.1；没有移除版本门禁。当前候选仍为旧代码且未配置独立二进制，普通群/Knowledge后续新启动可能被原版本门禁拒绝，不能把此开发结果当成线上恢复。
- Validation：check通过；505/505全量测试（0失败/跳过），保留PR #5/Owner Gateway/FIFO/Knowledge组合；随后样式键校验微调的6项文档测试通过。doctor真实Shared握手/登录/7模型通过，无模型ephemeral smoke及全部Owner动态工具注册通过。开发配置不含飞书凭据。新版实际group探针22类调用及持久会话重启恢复通过，Knowledge15类通过，新增办公写入/样式越权请求均被拒绝；无真实模型调用。目录生成器重建逐字节一致，未新增生产依赖。
- 真实只读验证：使用现有应用身份查询权限，知识库列表成功；日历page_size=1被字段校验拒绝，使用默认分页成功（不是权限缺失）。云盘列表报99991672，要求tenant drive:drive / drive:drive:readonly / space:document:retrieve任一；任务清单要求tenant task:tasklist:read / task:tasklist:write任一。已有user grants不能替代用户OAuth或tenant grants。未发送消息、未写飞书资料、未改应用权限。
- Remaining：需要管理员补充所需应用身份权限并使应用版本生效，以及审核后候选部署/真实写入验收。未接入用户OAuth、通用素材二进制上传、人员写入/企业管理、群控制扩权或任意API代理。全部接口仍受飞书资源权限约束；不宣称已经具备所有权限。开发代码cfb6a95已提交推送；[PR #18](https://github.com/dccaoxy/codex-feishu-bot/pull/18)已创建Draft并转Ready请求审核，尚未取得复审结论。未部署、未Merge、未修改现有候选配置/数据/Shared服务/遥测。

# 当前交接：PR #17 已审核版本候选部署（2026-09-26 21:39 北京时间）

- Human 明确授权部署独立复审 PASS 的 `1e6ead72b71564418cf315fb4a3b9c8e042da6c3`，不 Merge，部署后等待 Human Gate；免重复专门24KB边界人工测试。审核评论： https://github.com/dccaoxy/codex-feishu-bot/pull/17#issuecomment-5846675017 。
- 部署：原 data/issue6-candidate；60个 src/scripts/test/package 文件逐项哈希与指定版本完全一致。旧候选尚未包含已合并PR #16，本次带入指定head的既有修复，不另开功能。配置SHA256前后相同，原2个授权群、Owner Gateway（1数据源/私人任务读取）、Knowledge、Shared连接和权限设置不变；不启用配置外的新Owner群入口。备份：data/pr17-1e6ead7-backup-20260926-213912（源码、配置、两份SQLite一致性快照与验证日志），证据索引 data/pr17-deployment.json；均不入Git。
- 服务：部署前无running/queued用户请求或running知识任务。仅重启机器人，PID41445→89055，launchd exit0；Shared App Server PID41044保持不变，Desktop/Shared/遥测服务未改。新增日志确认“Codex 已连接”“飞书长连接已建立”；部署后截至复核stderr新增0字节，无新增error/EMFILE。
- 验证：实际候选 npm run check、446/446全量组合测试（0失败/跳过）、doctor握手/登录/7模型、无模型ephemeral smoke及动态工具注册通过。指定版本的group:check（含持久会话恢复/16类攻击）与knowledge:check（12类攻击）通过，版本0.158.0-alpha.2，无真实模型调用。原PR #5/Owner/FIFO/Knowledge组合自动回归保留。
- 只读真实飞书验证：两个现有授权群本地历史的人类发送者分别2/36人，当前成员API分别匹配2/36个显示名，均complete、0冲突；没有发送真实消息，不等同客户端排版或历史身份验收。未重复专门24KB人工测试。
- 数据：重启前后Raw Messages/messages各1202条、群请求10条、群线程2条、Knowledge jobs7条/digests5条/topics1条/schedule2条，以及私人settings、发送审计、绑定逐行一致。未修改源数据库、名单或权限；正常服务后续可继续写入新消息。
- 异常与局限：部署前已有2个Knowledge blocked任务，部署后原样保留，不把它们宣称已恢复，也不在本次重试。当前连接恢复不代表长期稳定性或客户端显示已完成人工验收。本次仅文档记录提交；运行代码固定为1e6ead7，不跟随后续文档head变化。未Merge，等待Human Gate。

# 当前交接：PR #17 R1 字节预算返工（2026-09-26）

- Task Source：Human 转交 [43d45c5 的 R1/P2 NEEDS CHANGES](https://github.com/dccaoxy/codex-feishu-bot/pull/17#issuecomment-5846600192)。同一分支返工，先转 Draft；不部署、不 Merge。原443项通过未覆盖50条短正文与最大姓名组合，不能证明该预算边界已覆盖。
- Implementation：移除清空正文但保留所有空字段/重复说明的裁剪方式。加入姓名后按实际序列化 UTF-8 字节检查 result≤22000、完整响应≤24000。必要时替换为真正更小的紧凑记录；保留每条消息原ID/顺序/sequence/匿名引用/姓名及回查入口，继续不足时标记 omitted 省略姓名。全部回查使用原 messageId；不删除记录、不改增量 cursor/hasMore。最终检查仍超限则明确报错，不返回成功游标，调用方可缩小请求重试。
- Regression：新增 search/changes 各50条短正文 x、35字符消息ID、198字节姓名的真实 Gateway/Store/Feishu模拟SDK回归，逐页检查完整包装与结果预算，只用返回游标或返回数量推进，验证51条原文（含夹具已有1条）无漏读/重复/停滞，并逐条回查50条原文及姓名。额外超大包装测试验证最终拒绝且原游标重读不丢消息。曾用超大源ID模拟最终异常，但被底层预览提前排除，已改为在包装层注入异常字段以准确覆盖最终守卫。
- Validation：check、446/446 全量测试（0失败/跳过）、diff check 通过，保留 PR #5/Owner/FIFO/Knowledge 组合自动回归；doctor 握手/登录/7模型及无模型 ephemeral smoke/动态工具注册通过。无飞书凭据开发配置和模拟SDK，不代表线上姓名验收；未重复未改动的 Group/Knowledge 进程探针。
- Delivery：修复后推送同一 PR #17 并 Draft→Ready 请求新 head 复审。不宣称 PASS；未部署、未 Merge、未更改当前候选/真实配置/权限/数据库/Shared Runtime/遥测。以下为历史记录，原443项是旧head证据。

# 当前交接：Owner 群发言人姓名映射（2026-09-26）

- Task Source：Human 反馈 Owner 查询只返回 s_ 匿名标识，并授权“那你来操作吧”补齐姓名映射。PR #16 已 Merge；从最新 origin/main 6f986a6 新建 codex/owner-sender-names，独立开发，不混入已结束 PR。
- Implementation：Owner Group Gateway 的 search/message/context/changes 按本地消息原始 open_id 查询该群当前成员名单，仅返回对应显示名和稳定匿名引用；不向模型输出整份成员表或原始 ID，不持久化姓名。ordinary Group/Knowledge 工具与授权不变。工具描述更新，沿用既有 Owner 工具升级机制。未添加多维表格或学员名单关联统计。
- 边界：当前显示名不是历史身份；同名不合并；离群/缺失、冲突、机器人、接口不可用、分页或安全限制分别标记，不能推断零发言。20页/10000成员上限，支持飞书超过 page_size 的同批成员页。队列出站及返回前重查权限；await 期间撤回/过期原文移除；超预算预览缩短正文但保留消息和游标。
- Validation：check、443/443 全量测试（0失败/跳过）、diff check 通过，包含现有 PR #5/Owner/FIFO/Knowledge 组合回归。新增15项：准确ID匹配、分页、同名与冲突、跨群、失败和安全限制、大页/预算、取消/Owner变化/撤权/离群及等待期间目标撤回、普通成员拒绝。使用真实 Gateway/Store/Feishu 队列和模拟成员 SDK，没有发送真实飞书消息。doctor 握手/登录/7模型与真实无模型 ephemeral smoke/动态工具注册通过；无飞书凭据开发配置，不构成线上飞书验收。未重复未改动的 Group/Knowledge 进程隔离探针。
- 交付：创建新 Draft PR 后转 Ready 请求审核；未经复审不宣称 PASS。未部署、未 Merge、未改当前候选配置/群权限/数据库/Shared Runtime/遥测。下一步审核，通过且获得部署授权后再做 Owner 姓名真实验收。

# 当前交接：PR #16 迟到工具回合身份返工 R7（2026-09-26）

- Task Source：Human 要求继续同一分支处理 [a64c336 的 R7/P1](https://github.com/dccaoxy/codex-feishu-bot/pull/16#issuecomment-5846383282)，不部署、不 Merge。先转 Draft。R6 固定当前 run.turn 并不足以证明请求自身属于该回合；原 314 项没有旧 turn 测试。
- Implementation：所有本地 item/tool/call 执行前要求 params.turnId 为非空字符串且严格等于 run.turn，不限 Owner 群或 external。旧/缺失/非法 turn 直接丢弃，无工具调用、无 RPC 响应/拒绝/重放。guard 同时固定请求 turn 与捕获的 run.turn，并在异步阶段检查当前 turn、原 run 对象身份及结束状态；history、全部 Group Gateway、文档、文件及 Repository 分支统一适用。未知 Desktop 工具继续由原宿主处理。
- Validation：check、428/428 全量测试（0失败/跳过）、diff check、doctor 握手/登录/7模型与无模型 ephemeral smoke 通过。19 个本地工具逐一覆盖旧 turn、空/缺失/非字符串 ID、await 期间换 turn、正常恰好一次执行和响应；底层执行替身为零意味着未到达对应 transport。既有跨 Thread/并发私聊、R1–R6 和 PR #5 组合回归保留。两个旧测试文件调整为有效协议夹具：历史工具补真实当前 turnId，Group Gateway 错误 turn 改断言零响应，未放宽生产校验。无真实飞书出站；未重复未改动的真实 work/Group/Knowledge 隔离探针。
- 交付：更新本文件并推送同一 PR，Draft→Ready 请求新 head 独立审核；不宣称 PASS。未部署、未改真实配置/权限/群/数据库/Shared 服务/遥测、未 Merge；真实群和双端验收仍未执行。以下历史说明中的“捕获回合”由本次请求身份校验补齐。

# 当前交接：PR #16 工具生命周期返工 R6（2026-09-26）

- Task Source：Human 转交 [b93e100 的 R6/P1](https://github.com/dccaoxy/codex-feishu-bot/pull/16#issuecomment-5846176831)。原 R1–R5 独立复现通过，但 288 项未覆盖持久 RPC 触发的工具在 await 期间失权；同一 PR 先转 Draft 返工。
- Implementation：item/tool/call 从当前 run 捕获同一 Owner effect guard 和回合 ID，覆盖所有本地工具分支，在执行前和最终 rpc.respond 前检查；取消/撤权后丢弃结果与错误内容，不自动批准/拒绝 Shared 请求。工具阶段显式建立独立的 Feishu 异步守卫上下文，不假定继承 command。history/read/search、owner_group*、repository、文档和文件统一保护结果回传；原未知 Desktop 工具仍由其宿主处理。
- 文档：Documents 的所有 Feishu.call 显式携带 guard，实际 transport 与每次读取重试前检查，API 返回后再次检查。convert/create/insert/协作者授权各阶段串联，取消错误不得被部分成功处理吞掉后继续授权；已有阶段不回滚。Repository 在读取本地凭据前、实际 fetch 前及解析返回结果后检查，不重试写入。
- Validation：check、314/314 全量测试（0失败/跳过）、diff check、doctor 握手/登录/7模型与无模型 ephemeral smoke 通过。新增 history read/search、owner_groups、repository 四分支 × 撤回/撤权/离群的 await 结果丢弃；文档 patch 三种失权队列零写入；文档创建四个阶段失权和正常恰好一次；普通私聊并发不受影响；四种正常工具结果不变；无异步上下文时 Documents 显式守卫也阻止排队写入。真实 Bot/Store/Feishu.call、合成资料、模拟 SDK，无真实飞书出站。保留 R1–R5、PR #5 和群/Knowledge 自动回归；未重复未修改的真实 work/隔离探针。
- 交付边界：修复提交推送同一 PR，Draft→Ready 请求新 head 复审，未宣称 PASS。未部署、未改真实配置/权限/群/数据库/Shared 服务/遥测、未 Merge。doctor 为无飞书凭据开发配置，不算线上连接验收；真实群及双端验收仍未执行。以下为历史交接，旧测试数不代表 R6 已覆盖。

# 当前交接：PR #16 命令边界返工 R4–R5（2026-09-26）

- Task Source：Human 转交 [3ec83ab 的 NEEDS CHANGES](https://github.com/dccaoxy/codex-feishu-bot/pull/16#issuecomment-5846082237)。上轮 R1–R3 独立复现已通过，但 268 项未覆盖命令历史出站和 /reference 来源丢失；先转 Draft，在同一 PR 返工。
- R4：所有 Owner 群命令以来源消息构建统一出站守卫。命令直接回复显式带守卫，嵌套 Feishu 调用通过实例级 AsyncLocalStorage 继承；Feishu.call 在入队时捕获该请求上下文，每次实际 SDK transport/重试前检查。不同并发命令不共享授权状态，私聊为 no-op。drain 错误通知同样绑定来源，失权后不输出原错误/历史。仅卡片 finish 的关闭 streaming 操作绕开继承守卫，以允许取消后清理，不承载旧正文。
- R5：message → command → /reference → run 完整传递原 message_id 和可信 source；history 读取结束重新检查有效性。群请求缺失/非法 ID 明确 fail closed，不向 SQLite 绑定 undefined；活动引用回合保存原 ID，撤回、中断等待/失败及迟到请求继续沿用已修复取消机制。
- Validation：check、288/288 全量测试（0失败/跳过）、diff check、doctor 握手/登录/7模型与无模型 ephemeral smoke 通过。新增 /read、/threads、/status × 撤回/撤权/离群九组队列阻塞测试，三个正常输出恰好一次、异步 history/controller 及错误降级失权、reference 来源传递/读取中撤回/真实 Bot turn 启动后撤回、缺失 ID、并发守卫隔离及取消卡片清理。使用真实 Bot/Store/Feishu.call 配合模拟 SDK，不发送真实飞书消息。测试中发现仅通过原型构建的既有 Feishu 测试实例没有 AsyncLocalStorage 字段，已兼容缺失初始化，保留原测试并最终全量通过。原 R1–R3、PR #5、Group/Knowledge/Gateway 自动组合用例保留；未重复上轮真实 work 与隔离探针。
- 交付：更新代码/本文件后推送同一 PR，Draft→Ready 请求新 head 独立复审；不宣称新 head PASS。未部署/修改真实配置、授权群、数据库、Shared 服务或遥测，未 Merge。真实群/双端验收仍未执行；doctor 为无飞书凭据开发配置，不是线上验收。

# 当前交接：PR #16 审核返工 R1–R3（2026-09-26）

- Task Source：Human 转交 [93b7ec1 的 NEEDS CHANGES](https://github.com/dccaoxy/codex-feishu-bot/pull/16#issuecomment-5846012207)。原 256 项通过未覆盖副作用出站与卡片收尾边界，不能代表取消链路完整；同一分支/PR 返工，先转 Draft。
- R1：Owner 文件工具、`/send`、最终长结果附件和文字降级共享与来源消息/run 绑定的有效性检查；在真实 Feishu.call 队列的 SDK 上传、发送、重试前检查取消、当前 Owner、授权群、离群、关闭及 run 身份。排队中的正文/流式更新也检查。已经完成的上传无法回滚，但后续消息发送仍能阻止。
- R2：撤回在第一个 await 前标记全部匹配回合取消、清除审批 token、结束本地回合；随后才发 interrupt。接收回调、队列动作消费和迟到 serverRequest 拒绝取消回合。中断延迟或失败不恢复授权，不向 Shared 请求自动批准或拒绝；其他有效回合不变。
- R3：已存在/迟到的流式卡片通过仅关闭 streaming 的清理路径收尾，不发布旧结果；慢创建结束后无新回合/计时器。关闭 API 失败记录明确日志，不冒称远端已关闭，也不补发旧内容。
- Validation：check、268 项全量测试通过，0失败/跳过；保留 PR #5 全部组合用例。新增真实 Bot/Store/Feishu.call 队列、替换 SDK transport 的确定性回归：撤回/撤权/离群前尚未上传为零、上传完成后消息为零、正常恰好一次、/send/工具/最终附件入口、发送重试撤权、中断等待/失败与旧 token/迟到工具隔离、已有/慢创建撤回/离群卡片关闭及关闭失败清理。doctor 握手/登录/7模型、无模型 ephemeral smoke 再次通过；使用无飞书凭据开发配置，不算线上连接验收。Group/Knowledge 和真实 work:check 证据沿用本 PR 上轮检查，本轮未重复该未修改部分。
- 交付：本节取代下节关于取消链路完整性的结论。修复提交推送同一 PR 后 Draft→Ready 请求新 head 独立复审，尚无新 head PASS。不部署、不改真实配置/授权群/Shared 服务/遥测、不发送真实飞书消息、不 Merge。真实双端和群卡片验收仍未执行；Desktop 工具宿主边界继续保留。

# 当前交接：Owner 私聊与授权群执行入口（2026-09-26）

- Task Source：Human 明确要求自己的私聊和已授权群中自己的账号拥有相同执行能力，其他群成员保持现有权限，并授权开发。基于已合并 PR #5 的 main `2f84daf`，独立分支 `codex/owner-tool-parity`。
- Implementation：默认关闭的 `ownerAccess` 开关；仅可信事件中的当前 Owner、新群消息、原 allowlist、明确 @ 可进入私聊 Bot 链路。每群 Owner Thread 与私聊、普通成员 GroupModel 分离；原始群消息继续落库，无第二份群 FIFO 请求。原 `/owner`、`/group-doc` 仍走原入口。Owner 复用文件/文档/命令/Shared Work 审批；Group Gateway 接受可信 Owner 群上下文，普通成员与未授权群仍拒绝。审批、工具派发、启动/steer 前重查授权。撤回取消队列或中断对应活动回合，慢卡片返回后不启动回合或遗留计时器；不撤销已发生副作用。
- Runtime：可选继承共享服务器默认 sandbox/approval，未选择则原配置不变；外部绑定不覆写原 Desktop Thread 参数。普通 Group/Knowledge 保持独立进程与原隔离机制；版本门更新为已实测 `0.158.0-alpha.2`，可用 `codex.isolatedBinary` 独立指定。未删除版本或工具权限门。
- Validation：check、全量 256 项测试通过（0失败/跳过），覆盖真实 Bot 撤回竞态、Owner 身份/授权撤销、审批卡隔离、原群 FIFO 与 Gateway、原 PR #5 组合用例。Group 16次、Knowledge 12次真实二进制/假 provider 隔离攻击探针通过，首次/恢复技能查询均要求空结果或不支持；原先首次 skills.list 返回不支持导致脚本解析失败，改为与原恢复断言一致，并非开放技能。doctor 握手/登录/7模型及无模型 ephemeral smoke通过；独立共享 work:check 的 start/steer/fork/interrupt/绑定恢复通过（真实模型调用，无飞书出站）。doctor 用开发配置，飞书凭据空、群功能关闭，不能称为线上飞书验收。开发中旧 fake Store 无 db 的组合测试失败已修复，最终全量复核通过。
- Remaining / Risks：这不是复制所有 Desktop 专属工具；UI、插件及未知动态工具仍依赖目标 Thread 宿主，未增加多维表格写入能力或任意 RPC/Full 管理。Owner 活动回合沿用私聊 steer；普通成员 FIFO 不变。群内 Owner 结果对该群可见。真实飞书 Owner/普通成员对照、审批卡和 Desktop 专属工具验收尚未执行。上一轮二进制路径修复后，旧部署的 Group 版本门可能不匹配新二进制；本轮仅开发态验证修复，不能声称线上 Group/Knowledge 已恢复。
- 交付边界：提交推送并创建 Draft→Ready PR 请求审核；Ready 不等于 PASS。未部署此分支、未改真实配置/allowlist/数据库/Shared 服务/遥测、未发送真实飞书消息、未 Merge。新入口启用需明确候选部署授权，届时只开放当前 Owner 和既有授权群。

# 当前交接：PR #5 文件审批详情返工（2026-09-25）

- Task Source：[c8987ee 复审 NEEDS CHANGES](https://github.com/dccaoxy/codex-feishu-bot/pull/5#issuecomment-5829284696)，R1–R3；同一分支先转 Draft，不部署、不 Merge、不扩展 Phase 3。
- 根因与复现：dispatching 期间仅保留 requestApproval，丢失先到达的 fileChange item。请求本身不含 changes，旧代码还使用最后一个无身份的 run.fileChanges，可能无路径/diff或显示另一修改项却允许批准。新增10项在修复前6失败、4通过；旧225项PASS不能覆盖这一缺口。失败日志保留本机忽略目录 data/pr5-file-approval-rework/before.log。
- 修复提交 `ae7717b`：在dispatch短路之前保存fileChange详情，以run的thread及精确turnId/itemId匹配；删除最后一项替代逻辑。每run最多32项，单项10KB、累计64KB（更新也计入），不淘汰复用；更新缺失/超限会先使旧快照失效。无可靠详情时不创建审批token或按钮，共享外部请求只提示回原客户端，无自动批准/拒绝。resolved、解绑、结束、断线、close清理暂存，保留此前请求身份去重与回合检查。
- 自动验证：Node24.21.0 / Codex0.155.0-alpha.16.3；check及236项全量测试PASS，0失败/跳过。新增11项覆盖真实Bot.run→ThreadController.send的等待期间与之后正常路径、缺失/超限、不同item/turn、resolved/detach/close/disconnect及有界缓存。正常卡片同时断言正确路径/diff、无其他item内容、零start/一次steer/一次批准；异常无token、无自动RPC决定。Group/Knowledge/Owner模块与集成main 9de0926一致，既有FIFO/隔离等测试保留。
- 环境/协议：doctor握手、登录、7模型与无模型smoke通过；Group首次/恢复16次、Knowledge12次隔离探针通过（真实二进制、假provider）。真实Bot+共享App Server+模拟peer/UI双向、steer/interrupt、对端先拒绝及Bot批准后迟到决定不重放通过；一次无副作用printf。独立WS/Unix work:check最终复核通过。
- 未隐藏的失败与限制：独立WS首次及一次复核报 thread/read: list_turns is not supported yet；Unix首次在活动状态断言时返回idle。后续独立复核均通过，未修改脚本、生产协议逻辑或放宽断言；初始波动根因未完全定位，不能将最终通过解释为没有波动。所有失败及成功日志保留 data/pr5-file-approval-rework。文件审批等待竞态为确定性模拟，未做真实飞书/UI文件审批故障注入；真实协议测试有模型调用，无飞书消息。
- 交付与边界：README/PROJECT及PR/Issue同步，推送同一PR后重新Draft→Ready，等待新head独立审核，不宣称自动PASS。未部署/重启候选、修改真实配置、授权群、数据库、Shared服务或遥测；Human接受历史稳定性证据和免重复UI/8小时soak指令继续有效，本轮未重复。既有Knowledge blocked不在本次范围，Issue #3保持开放，停止不撤销已发生修改。以下各节为历史记录，以本节为最新交接。

# 当前交接：PR #5 审核返工（2026-09-25）

- Task Source：[189e5a8审核NEEDS CHANGES](https://github.com/dccaoxy/codex-feishu-bot/pull/5#issuecomment-5827313464)。PR先转Draft，同一分支处理R1–R3；不扩展Phase 3、不部署。
- 复现：真实Bot.run→ThreadController.send→慢stream期间对端启动回合并请求permissions审批。旧代码新增5个用例中4个失败：正常路径漏卡片，以及detach/close/disconnect后仍可能发送输入；resolved用例通过不能证明审批正常接续。旧218项不覆盖这些路径。失败日志保留data/pr5-rework/before.log。
- 修复提交`71d6799`：共享外部观察在dispatching期间按请求ID暂存支持的交互，控制器返回确切turn后仅处理匹配请求一次；保留turn与当前绑定/观察身份检查。每次观察最多32个交互ID，单条10KB、累计64KB；不淘汰旧ID后重新接纳，超限仅一次提示回原客户端处理，无自动决定。正常外部工具路由不受此交互上限限制。resolved删除暂存且保留去重身份；detach/endRun/disconnect/close清空。UI返回后再核对活动观察、绑定、连接及关闭状态，取消后不继续发输入；不重发模型操作、不放松审批策略。
- 回归：225项全量测试PASS，0失败/跳过；新增正常/对端resolved/解绑/关闭/断线/错误turn及暂存上限去重共7项，保留慢卡片A→B、展示失败、迟到卡片和组合恢复。正常路径只有一次steer、0次start、正确turn审批一张、一次决定后token失效；取消路径0次决定、无旧审批恢复。check通过。
- 真实验证：WebSocket/Unix work:check均通过（临时任务的start/steer/竞争/fork/interrupt/detach/绑定恢复）；doctor握手/登录/7模型、无模型smoke通过；Group首次/恢复16次及Knowledge12次隔离探针通过（真实二进制、假provider）。真实Bot+共享App Server+模拟对端/UI双向/steer/interrupt、对端拒绝后旧批准失效、Bot批准后迟到拒绝不重放通过（一次无副作用printf）。本轮有真实模型调用，没有真实飞书出站或Desktop UI操作。首次协议脚本在完成通知到达前检查结果失败，保留shared-initial-failure.log；脚本增加明确等待对应turn/completed，重跑通过，不删断言、不放宽生产逻辑。回归证据仅本机忽略目录data/pr5-rework。
- 边界：main的Group/Knowledge/Owner及既有测试未改，现有生产运行目录、配置、授权群、数据库、Shared服务和遥测均未修改/重启。新修复未部署、慢卡片竞态只做确定性模拟而非真实客户端故障注入；历史部署与观察不冒称新head真实验收。沿用Human接受既有稳定性证据及免重复UI/8小时soak指令；既有Knowledge blocked未处理。
- 交付：代码/文档提交推送后，同一PR #5重新Draft→Ready请求新head审核；Ready不等于PASS，不Merge。Issue #3保持开放，Phase 3未实施。下方收口记录是此前189e5a8时点，已由本节返工状态更新。

# 当前交接：PR #5 Phase 2 最终收口（2026-09-25）

本节为最新事实源；下方各节保留各历史时点的部署、验收及限制，不将旧“待验收/保持Draft”误作本次Gate。

- **Task Source**：Human最新明确指令及PR #5最终收口计划（评论5815781893），Issue #3仅Phase 2。最新main `9de09265c2c50702913c575aeb90ed3e53bd9f0b`已含PR #14/#15；集成到原`codex/issue-3-work-attach`，不是合并PR到main。
- **Implementation**：保留main完整群历史、Persistent Group Thread、Owner Resource Gateway、FIFO、Group Knowledge、Owner Group Gateway及审查修复。group/knowledge/owner模块和既有测试与main逐文件一致；仅Bot imports/recover冲突需组合：外部Work待处理消息标uncertain不重放，机器人自有私聊待处理消息恢复Owner请求授权再调度。保留Shared WS/Unix、原Thread start/steer/interrupt/fork/detach、审批token/卡片生命周期和遥测；Full继续拒绝，不扩展群Control。
- **Validation**：Node24.21.0/Codex0.155.0-alpha.16.3；check、218项全量测试PASS，0失败/跳过（原217项加组合恢复用例）。覆盖Raw/FIFO/Knowledge/Owner边界，以及审批一次性token、对端先处理、迟到卡片、展示失败不重放、FD分类/阈值/轮换。doctor真实握手、登录、7模型和含Owner工具schema的smoke通过；使用本checkout配置（群功能关闭），不冒充在线群配置验证。Group首次/恢复16次及Knowledge12次隔离攻击探针通过（真实二进制、假provider）。
- **真实协议**：WebSocket及Unix独立临时服务器work:check通过，覆盖原ID、idle start、active steer、竞争start同回合、fork、interrupt、detach和绑定恢复。真实Bot+共享App Server+模拟对端/UI通过双向结果、active steer/interrupt、对端拒绝后旧批准失效、Bot批准后迟到拒绝不重复执行（一次无副作用printf）。实际调用模型，只清理测试创建的任务，不发送真实飞书消息、不重做Desktop UI验收。
- **首次失败及修正**：Unix work:check曾在历史完成/恢复后仍读到active，实际返回steer而测试预期start，未算通过；测试原先仅检查历史终态。脚本现在同时等待控制器读取的live idle，且attach之后再次确认，再测试idle start，未放宽生产控制器或把steer算作start。修正后WS/Unix均通过。原始失败及全部成功日志保留本机Git忽略目录`data/pr5-final-check/`。
- **Human Gate**：Human确认双端Shared Runtime已持续真实使用且稳定，明确接受现有长期证据，免重复8小时soak和双端同步人工验收。沿用下方09-25 07:02记录：483样本、8小时4分15.751秒、最大间隔60.392秒，FD31/峰51/末27、pipe3、子进程1、loaded0–2、RSS225632/峰235344/末146288KiB，窗口内无新EMFILE。此次没有重新执行soak/UI，不把历史版本证据称为新head实测，也不承诺绝对无泄漏。
- **部署与边界**：本轮没有部署、重启服务、修改运行目录/真实配置/授权群/数据库/Shared Runtime或遥测安排；现有PR #15 f3d9ec1与PR #5组合候选继续运行。既有Knowledge补算blocked属于保留的已知问题，不借此次收敛重试/扩大整改。自动回归通过不等于其线上补算已恢复。
- **交付与下一步**：README/PROJECT同步，提交推送同一PR #5后核对远端head并Draft→Ready，等待该head独立审核；Ready不等于PASS。新head未部署，不自动Merge，Issue #3保持开放（Phase 3未实施）。此次免重复验收为Human明确调整，不是Agent自行豁免。停止任务不会撤销已发生修改。

## PR #15 真实私聊验收完成（2026-09-25）

- Human明确反馈四步“测试都成功了”：授权群目录、历史事实及原文来源只读查询、明确目标单条发送、带冒号切换群后指代发送被要求明确目标。群客户端正文一致/仅一条、查询及模糊指代不发消息由Human确认，不冒充Agent独立读取全部客户端记录。
- Agent只读核对：私人发送审计相对f3d9ec1部署备份新增且总共仅1条sent记录，存在消息回执；body_hash与指定验收文本完全一致，target为指定测试群；没有新增其他发送审计。任务表无活动任务。该证据支持本轮一次明确发送，不等同网络层恰好一次或所有发送渠道全局零副作用证明。
- 当前运行仍为已审PASS f3d9ec1与PR #5组合；此前184分支/217组合及部署检查结果不重复充当本次Human证据。验收记录已回写PR；PR保持Ready，未Merge，未更改配置/服务/授权。剩余：Human决定合并，既有Knowledge blocked及长期稳定性仍独立跟踪。

## PR #15 已审核 f3d9ec1 部署（2026-09-25）

- Human明确授权部署已自动复审PASS的 `f3d9ec1fafd35c1975df09326f95d5dea70907e4`（评论5826626796）。使用保留PR #5 d305eaf的已测组合；仅替换group-store和owner-group-gateway两个运行文件，其他src逐文件哈希核对不变。
- 部署前用户任务/知识任务空闲，备份配置、两个旧文件及两份SQLite。只重启机器人（PID36000→74706），Shared App Server PID67006不变；Desktop、Shared权限、PR #5遥测未改。配置SHA256不变，原授权群、Owner Gateway、FIFO、Knowledge开关不变。
- 部署后check、doctor、smoke及含10个Owner工具schema的组合smoke通过；217项完整PR #5组合回归PASS（0失败/跳过），运行src与测试组合哈希完全一致。日志确认Codex已连接、飞书长连接已建立，无新增启动错误/EMFILE。Raw、messages、group_requests、group_threads对备份无丢失/改变行。重启按已审核逻辑清除旧发送目标选择，持久发送审计保留。
- Knowledge仍为2个既有blocked、5个completed，本次不重试也不宣称补算问题解决。证据本机data/pr15-f3d9ec1-deployment.json及对应备份；组合日志开发worktree data/pr15-deploy-217.log。
- 可以开始真实Owner私聊验收。本次未发送真实测试消息、未调用真实模型；部署/连接正常不等于发送正文、回执、一次效果或长期稳定性已验收。未Merge。本节是后续文档记录，实际部署代码仍为f3d9ec1审查版本与PR #5组合。

## PR #15 第二轮审核返工（2026-09-25）

- Task Source：[b60023d复审NEEDS CHANGES](https://github.com/dccaoxy/codex-feishu-bot/pull/15#issuecomment-5826524555)。复审确认旧群指代及隐藏终态问题已解决；新增发现单条资源元数据过大时预览为空，增量读取永久停滞。上一轮输出预算测试仅覆盖多条正文累计，不能证明单条超限成立。
- 实现提交 `27fe15a`：仅在模型读取预览层为资源类型/ID/URL、附件字段、限制说明、父级引用设置上限；URL超2048字符整体省略并标记，避免截断链接误导。总字段仍超限时返回messageId/短正文/序号/原文分页提示的可见最小记录。结果数组最多22000 UTF-8字节，为Owner包装留余量；原文按既有offset接口读取，限制说明也有界。Raw及数据库原文/元数据不改，不静默越过可见记录。
- 复现/验证：4个新增用例在旧版本全部失败（原30个网关用例通过），data/rework2-before.log。修复后check及184项全量测试PASS，PR #5 d305eaf组合check及217项PASS，0失败/跳过。新增覆盖正常ingest的30KB链接query、隐藏终态后超长消息、queued完成后可达、单条巨大元数据及多条累计预算；只使用返回cursor可到达后续普通消息，原文分页重建一致、Raw/FIFO/Group cursor不变。
- 真实安装Codex doctor/7模型/schema smoke通过；Group首次/恢复16次及Knowledge12次假provider隔离探针通过。独立空飞书配置，不调用真实模型或发送真实消息；没有远端CI PASS声明。
- 本轮仅代码/文档提交推送并重新Ready复审，未部署、未Merge、未改变运行配置/授权/Shared/PR #5。线上仍为f291e48旧组合，不将代码测试当作线上修复。Human真实群验收豁免继续保留为未执行；真实发送正文/回执/一次效果、线上只读零发送及长期稳定性仍未验证。原Knowledge blocked不处理。

## PR #15 审核返工（2026-09-25）

- Task Source：[ae43cb2审核NEEDS CHANGES](https://github.com/dccaoxy/codex-feishu-bot/pull/15#issuecomment-5826388256)。P1旧群指代可误放行；P2隐藏终态卡住增量游标；既有170/203项通过没有覆盖这些问题。PR已先转Draft，在同一分支返工。
- 修复提交 `240920f`：接收新可信私聊请求时立即失效旧选择（即使后续无工具调用）；只有紧接着且符合窄语法的指代发送可恢复同Owner/私聊/Thread的已验证选择。带冒号、换行、引号/代码引用、多群候选的请求仍可读取，但不建立发送指代；要求明确目标，不猜测。重启清除旧选择，发送一次性审计不清除。兼容正常A→B切换、显式目标和原发送前授权检查。
- 增量读取每次至多扫描limit行，queue_full/cancelled保持隐藏并推进返回游标；queued前停止且不跨过，完成后可读。输出满24000字符时不消费未返回的可见记录，hasMore与retention及可读消息连接条件一致。不删除Raw、不改终态/FIFO、不写Group Thread cursor。
- 实测：修改前新增8个复现用例全部失败（旧20用例通过），日志data/rework-before.log；随后补充单引号/代码引用，共新增10项。修复后check、180项全量测试PASS；以已解决冲突的PR #5 d305eaf组合更新本轮两个源文件及测试，组合check/213项PASS，均0失败/跳过。覆盖隐藏连续页/尾页、queued后续完成、输出预算、retention、Raw/FIFO/cursor不变和选择隔离/重启。
- 真实安装Codex的doctor握手/登录/7模型、schema smoke通过；Group首次及恢复16次、Knowledge12次隔离探针通过（假provider）。使用独立空飞书凭据配置，不连接真实群、不调用真实模型；未声称远端CI通过。
- 部署/验收：本次修复未部署。在线仍为旧实现f291e48与PR #5组合，包含上述已知缺陷；修复部署前发送需明确群名，避免“这个群”。没有重启机器人/Desktop/Shared、修改授权或PR #5遥测。Human豁免剩余真实群发送验收仍有效，但不视为修复真实验收PASS；真实发送回执/正文/一次效果及线上只读零发送未验证。Knowledge blocked保持原状。
- 交付：更新README、PROJECT及PR/Issue报告，推送后核对远端head再Ready触发复审；不Merge、不自动部署。等待审核与单独部署授权。

## Issue #13 Human Gate 调整（2026-09-25）

- Human明确要求“跳过群验收，进行下一步”。剩余真实群发送验收豁免，不标记为通过，不继续发送测试消息；准备将PR #15转Ready触发审核，不Merge。
- Human提供的真实私聊回复展示了两个授权群及本地计数，并查询出欢迎仪式通知、时间地点要求及两条原文来源。本轮按用户提供的客户端记录确认读取展示，不冒充独立后台逐条复核。仅查询零发送的后台效果、明确发送一次的正文/回执与无重复效果仍未实测。
- 沿用实现f291e48的170项分支测试、203项组合回归及部署后check/doctor/smoke结果；本次仅更新交付记录，不改代码、配置、运行服务或PR #5观测。真实发送仍依赖自动测试证据，作为审核Remaining/Risks保留。

## Issue #13 候选部署（2026-09-25 11:32，北京时间）

- Human明确批准部署。已将实现 `f291e48` 与 PR #5 `d305eaf` 的已测组合部署到既有候选；只替换 bot/main 并新增 owner-group-gateway 三个运行文件，不替换配置。部署前用户任务与知识任务均空闲，已备份配置、旧文件和两份SQLite。
- 机器人PID由65936变为36000；日志确认Codex已连接、飞书长连接已建立，无本次新增启动错误。Shared App Server PID67006未变；配置SHA256不变，原两群授权、Owner Gateway、FIFO、Shared权限不变，未改PR #5遥测/服务。
- 部署后候选check/doctor/smoke通过；组合全量203项再次PASS，0失败/跳过；包含10个新工具schema的组合真实协议smoke通过（独立空凭据配置，无模型调用）。组合smoke首次因缺本地配置未启动，补齐独立诊断配置后通过。运行src逐文件hash等于已测组合。Raw对部署前备份逐行核对，丢失或变化0行；私人发送审计表已创建。
- 证据保留本机ignored data/issue13-deployment.json、data/issue13-backup-20260925113214；组合回归日志在开发worktree的issue13-deploy-regression.log。未发送真实验收消息，未执行真实Owner私聊读群/明确发送验收，未声称模型端到端通过。既有Knowledge blocked不追加重试，非本轮修复范围。
- PR #15继续Draft；下一步由Owner在机器人自有私聊任务触发目录、计数、事实来源回查及明确单条发送，核对无额外群副作用。通过后再Ready；不Merge。

## 当前任务：Issue #13 Owner Group Gateway（2026-09-25）

- Task Source：Human要求从最新main执行更新后的[Issue #13](https://github.com/dccaoxy/codex-feishu-bot/issues/13)；完整读取AGENTS、README、PROJECT及Issue（无评论）。基线main `d8b4f0d`已合并PR #14；PR #5实际仍open/Draft、head `d305eaf`，不将其视为main能力。独立worktree `codex-feishu-issue-13` / 分支 `codex/issue-13-owner-group-gateway`，不改现有运行目录、配置、数据库、服务、遥测。
- Implementation：独立Private→Group Gateway；可信p2p sender、当前绑定Owner、当前allowlist、群本地状态、停止/退出与活动私聊Turn共同授权。有限可信名称目录/稳定引用、同名候选、Raw检索/长消息/上下文/增量/确定性count/coverage；Knowledge只读日报/主题/来源同时接入，不注册GroupAssistant工具对象、不写Group cursor/FIFO/Raw、不创建群Turn。群名/原文/链接/派生内容均为不可信资料。
- Owner Explicit Send：宿主从当前可信私聊原文解析窄格式发送意图和唯一目标；近期选择按Owner+私聊+任务隔离且不能由模型选择建立。原文发送逐字核对，明确的总结发送允许当前上下文整理；模糊/重名/非文字来源不发。仅普通文字、禁止mention，4000字符/12000字节上限。私人库持久原子claim+稳定UUID、未知发送结果不重试；实际Feishu.call队列临界点复核撤权/换Owner/停止/任务结束/新消息。新私聊消息立即撤销旧未发发送权。未扩展其他Control权限。
- Validation：check、170项完整自动测试PASS（新增20项网关与真实Bot/Feishu排队路径测试，外部transport/model模拟）；保留PR #5 d305eaf的隔离组合check/203项PASS。组合以共同基线fcd1ab7三方合成，只解决Bot imports与recover冲突，保留PR #5外部绑定恢复不重放语义；未改原PR #5分支。真实安装Codex `0.155.0-alpha.16.3` 的doctor握手/登录/7模型、无模型smoke（含10个网关工具schema）通过。真实二进制Group首次+恢复16次、Knowledge12次攻击探针PASS（假provider），新增owner_groups/send攻击不可用。
- 真实环境：本轮诊断使用空飞书凭据的独立配置，无真实飞书/远端模型调用，未部署、未重启机器人或Shared/Desktop、未发送真实消息；原在线Knowledge补算失败问题保持原状，不借本Issue扩大修复范围。未Merge。
- Commit / PR：实现提交`f291e48`已推送，[Draft PR #15](https://github.com/dccaoxy/codex-feishu-bot/pull/15)已创建。
- Remaining / Human Gate：按Issue要求先Draft。真实Owner私聊列群/计数/具体事实/来源回查、明确发送一次及只分析零发送尚未执行；需授权更新现有候选后由真实Owner私聊触发并核对。验收完成后才Ready触发审核。不为满足形式提前Ready或自动Merge。
- 局限：首次目录依赖群信息API权限，失败则不列出该群；只查镜像而非同步阻塞，coverage明确陈旧/partial/retention。窄自然语言语法及文字入口，不识别任意复合指令；元数据缓存一分钟。已读取资料可保留在Owner私人上下文，撤权后阻止新读取，不抹除已披露上下文。PR #5外部Work不新增网关工具注册，原Work/审批能力以组合回归保障。当前共享环境承载真实任务，候选更新须先核对空闲与备份，不能把以前PR #14部署许可扩张为本轮服务替换许可。

## PR #14 e619bf1 已审核版本部署（2026-09-25）

- 授权：Human明确要求部署e619bf1到当前候选；已读取该head自动复审PASS（https://github.com/dccaoxy/codex-feishu-bot/pull/14#issuecomment-5825090846）。未修改已审核运行代码，不做精细语义验收，不Merge。
- 已部署：备份候选配置、旧knowledge-store和两份SQLite后，仅替换运行文件src/knowledge-store.mjs；机器人正常重启，Codex与飞书长连接恢复。配置SHA256未变，授权群/Owner Gateway/FIFO/Shared权限和其他运行文件未变；Shared App Server PID 67006未变，PR #5遥测不改动。部署记录data/knowledge-mvp-deployment.json，备份data/knowledge-e619bf1-backup-20260925092515。
- 部署后验证：候选check、doctor、真实协议smoke通过；150项分支测试、183项PR #5组合回归通过；部署src与组合回归src逐文件一致。Raw与备份逐行比对无丢失。
- 既有补算问题：部署前两群分别在2026-02-27、2026-08-18出现knowledge_worker_failed三次上限，和终态来源问题不同；当前数据库没有仍保留在messages中的queue_full/cancelled行，不能声称已在线重现/解除本轮终态缺陷。终态修复以本轮回归覆盖为证。
- 为验证部署后实际日期推进，保留失败快照data/deploy-e619bf1-controlled-retry.json，并对上述两个原失败日期各给予一次受控重试；不提高全局上限、不跳过日期、不关闭校验。09:35最终核对：两个日期均再次进入blocked / attempts=3 / knowledge_worker_failed；next_date仍为2026-02-27和2026-08-18，后者last_successful_day仍为2026-08-17。实际日期推进未通过，不将模型失败归因于已修复的终态缺陷；具体生成失败根因尚未查明，不再追加重试。
- 连接最终核对：飞书历史同步状态仍为complete，09:32有成功reconcile；无活动用户队列。此次未发送群消息、未重做人工@或精细语义验收。剩余：单独诊断knowledge_worker_failed，恢复后再验证两个日期实际前进。部署成功不等于完整在线验收通过。
- 交付：本节作为部署记录提交/推送同一PR；仅文档变化，实际运行Knowledge代码仍为已审核e619bf1，不自动部署后续文档head。

## PR #14 审核返工：终态来源阻塞补算（2026-09-25）

- Task Source：https://github.com/dccaoxy/codex-feishu-bot/pull/14#issuecomment-5824986193 ，审核3431340为NEEDS CHANGES。本机新增两例测试在旧组合代码上均复现“终态请求导致当日无法生成”，失败证据保留data/rework-terminal-before.log；原145项通过不能覆盖该缺口。
- 已修改：snapshot仅排除queue_full/cancelled终态，仍等待queued；不删除Raw、不改终态、不放宽visible。过滤发生在模型输入及大小限制之前；coverage记录filtered、总数/纳入数/分状态排除数，随输入指纹校验，日报及主题revision读取可见。仅终态日以明确零输入覆盖推进，不冒充全消息完整摘要。
- 自动回归新增：两个终态与重启/次日补算、真正queued等待至完成、全终态日、撤回活动请求取消其他排队消息后重启；断言Raw保留、隐藏正文不进入Worker/派生知识、既有隐藏策略不变。语义细分类不扩展。
- 验证：check、150项全量测试、独立PR #5 d305eaf组合check/183项测试通过；真实安装Codex二进制的Group正反向/恢复探针（12次调用）及Knowledge隔离探针（10次越权调用）通过，使用假provider。隔离开发配置的doctor握手/登录检查及真实协议smoke通过；飞书凭据为空，因此不声称本轮真实飞书或模型验收通过。
- 返工当时状态（后续部署结果见顶部）：本轮修复已提交并推送同一PR，重新Ready触发复审；当时修复尚未部署，在线为3431340。不得把上轮最小真实模型验收作为本修复真实验收；本轮不操作在线数据库、不重启服务，部署后需核对受影响群补算进度。不Merge，不启动Issue #13。

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
让用户在飞书中与本机 Codex 交互，由本地 Node.js 服务通过 stdio / JSON-RPC（Work 可选本机共享 WebSocket / Unix socket）调用 codex app-server，并通过飞书长连接收发消息、卡片和附件。

## Phase 2 资源观察完成（2026-09-25 07:02复核）

本段为最新观察结论，覆盖下方“观察进行中”的历史记录。部署源码仍8cd4418，47个部署文件哈希与清单一致。本轮仅更新观察记录，不改代码、配置或服务。

- 正式起点09-24 22:56:47；采用起点之后的483条实际样本，首条22:57:26.134、末条09-25 07:01:41.885（北京时间），实际连续覆盖8小时4分15.751秒，超过8小时。最大间隔60.392秒，无可见采样缺口、无轮换遗漏、无异常样本；不计起点前数据，也未把睡眠/停机缺口补成覆盖。
- 全窗Shared PID67006及启动时间不变；FD31起、51峰、27末（范围25–51），pipe始终3；直接子进程始终1；连接计数始终1；loaded tasks范围0–2、末值1，10条样本为0。RSS首225632、峰235344、末146288 KiB（范围146240–235344）。没有发现FD/pipe/子进程持续累积，RSS有回落；RSS下降不单独证明对象释放。
- alerts.jsonl不存在，采样stderr为0字节；机器人及Shared服务日志无窗口内新增EMFILE/Too many open files。日志历史错误保留，未清除。采样级连接正常不等于真实消息往返验收。
- 空闲/低负载阶段FD及RSS回落，但末尾仍1个已加载任务，不能称所有任务已卸载；此前短测loaded 0→3→0仅作为独立短测证据。本轮不是持续高并发压力测试，也没有专门执行sleep/wake恢复测试。期间23:06授权新增群/机器人重启已记deployment-events；独立PR #14历史验收曾使用同机资源，但未替换本候选或共享服务。
- 结论：本次至少8小时资源观察已完成，在该窗口与负载下未发现资源持续增长或句柄耗尽迹象，不承诺绝对无泄漏、无再次耗尽风险。审批沿用用户确认的此前验收，按要求免重复，未重做本次部署后UI验收。
- 原始样本、marker、deployment-events及本次phase2-observation-result.json保留在本机忽略目录data/shared-lab/telemetry；每60秒launchd采样保留。本heartbeat按授权在回写后暂停。PR保持现有审核状态，后续最终审核/合并由既有流程另行处理；本次不Merge、不进入Phase3、不重启服务、不改权限，不影响PR #14独立开发。

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

## 新群正式启用（2026-09-24 23:06）

Task Source：用户明确要求将新群加入本地授权名单，启用@自动回复并允许Owner访问私人任务和数据库，正式使用机器人。本次是本机配置部署，源码仍8cd4418；授权群从1扩为2，保留原测试群。Owner Gateway仍限原先1个私人任务的1条授权片段、1个只读统计数据库资源；没有扩展字段、数据源、文档写权限或Shared Runtime Work权限。普通成员不能调用Owner Gateway，Owner须显式使用/owner命令；授权读取结果会在群中回复。

已备份本地配置到忽略目录data/production-group-backup-20260924230636，并核对除groups.allowedChatIds新增一项外其余配置不变。确认无活动/排队请求后仅重启机器人，launchd running，启动后Codex与飞书长连接均ready；未重启Desktop或共享App Server。新群历史同步于23:06:43完成，initial_complete=1，收录250条可用消息，无历史请求生成、无停止标记。先前只读API检查259条含9条删除记录，与本地250条一致；complete仅指API可见历史范围，不代表附件内容或平台未提供的消息。

实际候选check、doctor、无模型smoke通过；加载真实配置的本地策略检查通过（@响应、非@忽略、非Owner拒绝、非显式命令拒绝、保留资源范围）。未代用户发送群测试消息，新增群的真实@模型回复及Owner读取仍待首次实际使用确认。未修改源码，未Merge，未进入Phase3。

原8小时资源观察继续，起点未重置；本次新增生产群和机器人重启作为负载/部署事件记入本地遥测deployment-events.jsonl。最新23:06:28样本同一共享PID，FD25、pipe3、子进程1、loaded0、RSS211712KiB、连接1、normal。点状正常不代表8小时已完成；长期稳定Gate仍在进行中。PR #5保持Draft等待收口，不将本次生产启用等同于最终验收完成。

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
