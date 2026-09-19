# 飞书本地 Codex 机器人 — Agent 协作约定

## 开始工作
- 先读取 AGENTS.md、README.md 和 PROJECT.md。
- 开始修改前确认当前分支、工作区状态、Node.js / Codex 环境。
- 默认中文交流；真实环境能力以实际 doctor / smoke / test 结果为准。

## 安全与边界
- 禁止把真实飞书 App ID、App Secret、OpenAI/Codex 凭据、用户 Open ID、config.local.json、SQLite 数据库或日志提交到 Git。
- config.example.json 只能保留占位值。
- 不把本地 Codex 登录状态、另一台机器的会话或配置假定为可跨设备自动同步。
- 群聊、多用户、实时语音和桌面同步不属于当前第一版能力，除非后续明确扩展。

## 修改与验证
- 保留现有 Node.js + codex app-server + 飞书长连接架构，避免无关重构。
- 修改消息处理、审批、工具注册、附件、会话恢复或服务管理时，运行相关 check / test / doctor / smoke；涉及模型或飞书真实环境时明确标记是否实际调用。
- 停止任务不会自动撤销已经发生的文件修改；交接时必须记录。

## 结束与交接
- 更新 PROJECT.md：记录当前状态、完成项、关键决定、未解决问题、下一步和交接断点。
- 明确区分“代码已修改、测试已通过、真实 Codex 已验证、真实飞书已验证、已提交、已推送、已部署/安装服务”。
- 提交、推送、安装 launchd、发送真实消息分别需要相应授权。
