---
name: desktop-add-gui-telemetry
description: 在 Tauri 产品明确批准统计上报后接入默认关闭的同意界面、固定最小事件和有界传输；不为初始化预置隐私控件，不发送真实遥测。
---

# 接入 GUI 统计上报

本执行路线适用于 Tauri GUI；GPUI 不加载 React/Tauri 实现，新增原生实现须另行明确范围。读取 [统计合同](references/telemetry-contract.md)、当前 GUI profile 与已批准产品/隐私事实；合同不授权收集实例数据。

## 执行

1. 核对目的、接收方、字段、同意/退出、保留/删除、法律依据和实际 HTTPS endpoint 已在终端下游获批。缺失或扩大边界先确认；Harness 源不收集产品地址、账号或隐私文本。写入前进入或复用 `$desktop-implement-change`。
2. 经 `$desktop-prepare-gui-support-surfaces` 建立受保护 `docs/GUI_SUPPORT_SURFACES.md` 的独立出站清单；新增传输依赖才调用 `$desktop-manage-dependencies`。客户端不得保存服务端 secret；需要长期服务端身份秘密的方案停止实施。
3. 只有产品明确启用统计能力后才增加统计同意界面，默认关闭、明确同意；不恢复初始化设置页隐私区块。设备偏好归 adapter，不进 core 权威业务存储。未配置、未同意和撤回后均零出站，不回补同意前事件。
4. 按合同由 GUI Rust adapter 使用 HTTPS JSON `POST` body，只发送一次每进程的固定 `app_started` 与字段白名单；禁止 GET/query、自由文本、业务载荷和稳定标识符。新增事件/字段/持久队列必须重新批准。
5. 撤回立即取消在途请求、清空内存队列并阻止入队；每个发送任务有应用生命周期 owner，禁止 detached task。按合同限制队列、超时和重试，失败始终 fail-open，日志只留稳定结果，不记录 body 或设备信息。
6. 使用隔离传输夹具验证零出站、撤回、字段、POST、上限与关闭回收，再回原实施流程。不得向真实接收端发送测试事件，不自动构建或验收候选。

## 输出

报告同意与出站状态、字段/传输边界、数据与任务所有权、实际隔离测试和未验证事项；保留本 Skill 或更新能力均不构成遥测同意。
