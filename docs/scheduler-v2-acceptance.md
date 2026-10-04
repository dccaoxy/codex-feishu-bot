# 调度器 v2 验收：开发与独立审核交接

本文是 [Issue #35](https://github.com/dccaoxy/codex-feishu-bot/issues/35) 的流程说明，不是执行成功回执；尚未发生的审核或通知不能记录为成功。

1. 一个新 Issue 对应一个 Builder thread；同一 Issue 需要返工时，复用原 Builder，保留任务上下文。
2. Builder 自行完成文档修改、离线检查、commit、push 和 Draft PR，并在提交与 PR 中引用本 Issue。本次只检查文件内容及运行 `git diff --check`，无需启动应用或接触凭据。
3. 每次审核使用新的独立 Reviewer（fresh Reviewer），审核结论必须绑定 PR 的精确 head SHA。需要修改时交回原 Builder；新提交产生新 head 后须重新独立审核，旧结论不能用于新 head。准入与角色交接由正常调度器完成，无需人工额外向 Builder 或 Reviewer 发指令。
4. PASS 只代表对应精确 head 的审核结论，不代表自动 merge 或 deploy。通知不可用时如实显示“通知不可用”，不能宣称已送达，也不代替用户发送。

本次 PR 仅新增 `docs/scheduler-v2-acceptance.md`，不修改运行代码、依赖、配置、权限或任何现有文件（包括 `PROJECT.md`）；这是本验收 Issue 的明确小范围，不是调度器对后续任务施加的项目白名单。PR 创建后保持 Draft，不标记 Ready、不合并、不部署，也不修改或继续 Issue #33 / PR #34。实际执行结果与交接状态记录在本 Issue / PR 中，以真实回执为准。
