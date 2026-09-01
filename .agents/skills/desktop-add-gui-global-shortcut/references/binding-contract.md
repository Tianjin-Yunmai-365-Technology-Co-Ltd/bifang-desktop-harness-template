# GUI 全局快捷键绑定契约

本参考定义全局快捷键能力的唯一通用数据模型、运行时边界和最小回归。产品动作名称、chord 与界面位置不是 Harness 默认值。

## Profile contract

保留九字段 `gui-initialization-config` 中的 `global_shortcut = enabled|disabled`。启用时，`docs/GUI_APP_PROFILE.md` 还必须有且只有一个 JSON 围栏：

````markdown
```gui-global-shortcut-contract
{
  "schemaVersion": 1,
  "actions": []
}
```
````

中性初始化固定写入空 `actions`，不得借初始化接收产品业务动作。产品范围批准后，每项动作使用以下闭合 schema：

```json
{
  "id": "stable_snake_case_id",
  "bindingPolicy": "user-configurable",
  "defaultChord": null,
  "dispatch": {
    "kind": "core-use-case",
    "target": "stable_approved_target"
  },
  "e2eSafe": false
}
```

- `id` 在 contract 内唯一，只使用 ASCII `snake_case`。
- `fixed` 必须有需求明确给出的非空 `defaultChord`；`user-configurable` 允许 `null`，也只在需求明确给出时设置初始 chord。不得使用 fallback、推荐值或旧 Harness chord 填补 `null`。设备配置和保存命令只能改变 `user-configurable` 项，必须拒绝修改 fixed 项。
- `dispatch.kind = host-action` 只用于窗口/宿主自身动作；`core-use-case` 必须指向一个已批准、有类型且稳定的 core 用例。`target` 使用 ASCII 小写 snake_case 或点分 snake_case（如 `window.restore_main`），不允许任意代码、脚本、URL、路径、参数或动态命令。
- `e2eSafe` 只声明能否在无确认、无外部副作用的隔离验收中触发；它不授权动作本身。不可逆、付费、删除、外发、凭据或生产动作不得直接由全局快捷键触发。
- 非空 chord 最多 128 UTF-8 字节，由官方 `Shortcut` 解析/规范化，至少包含一个修饰键；规范化后的 chord 在 contract 和设备配置中都必须唯一。
- `global_shortcut = disabled` 时本围栏必须缺席。产品模式下启用能力但没有已批准动作时保持 `actions = []`，不得用中性动作填空。

## 状态与持久化

三层状态不得合并：

1. profile capability：插件能力是否存在；
2. desired bindings：每个动作的 `Option<String>`，`None` 表示未绑定；
3. active registrations：本进程实际成功注册并由本模块拥有的 chord 集合。

向前端返回逐项快照，至少包含 `actionId`、`configuredChord: string | null`、`registered: boolean` 与 `errorCode: string | null`。只有插件 API 或本模块确实能区分的原因才使用独立错误码；其余收敛为稳定的 `shortcut-registration-failed`，不得展示原始 OS 错误。

可编辑绑定采用版本化、严格拒绝未知字段且有大小上限的设备级 JSON。读取拒绝符号链接和超限/未知版本；损坏时回到 contract 的显式初始值，若其为 `null` 就保持未绑定。写入使用同目录临时文件、flush/`sync_all` 与原子替换；不得由 localStorage、sessionStorage、Jotai、TanStack Query 或 WebView 文件 API 保存权威绑定。

## 注册事务

- 启动只尝试注册非空绑定；空 contract 或全部 `null` 必须产生空 active registry。
- Rust 的 `GLOBAL_SHORTCUT_ACTIONS` 必须是 profile contract 的逐字段等价物化：动作数量、ID、策略、初始 chord、dispatch kind/target 与 `e2eSafe` 全部一致。typed dispatcher 必须为每个声明 target 有明确分支；缺失、额外动作、字段漂移或 wildcard/no-op 分支都阻断。
- 更新前先解析、规范化并拒绝重复。替换以完整配置快照为单位：保留旧配置与旧 active registry，注销 owned 旧项，注册全部新项；任一新注册失败时清理本轮新项并恢复旧注册。
- OS 注册成功后才持久化。持久化失败时恢复旧注册与旧文件；不能把“内存已更新、磁盘失败”报告为成功。
- handler 通过规范化 chord 查找 contract action ID，再调用编译期登记的 typed dispatcher。只响应 `Pressed`，同一次按键的 `Released` 不触发第二次动作。
- 初始化失败、正常退出、异常清理与 E2E 都遍历 active registry 注销 owned chord；不得使用 `unregister_all()`，除非能机械证明整个插件实例只归本模块所有且未来不会共享。

## 可编辑录制

只有 `bindingPolicy = user-configurable` 才建立录制界面：

- 非空动作的可见名称是产品 i18n 事实，以稳定 action ID 关联中英文资源；不得直接显示原始 ID，也不得由 Harness 填入通用动作文案。固定只读界面同样遵守此规则。

- 使用 `KeyboardEvent.code` 记录稳定物理键，按统一顺序组合修饰键；普通单键拒绝。
- `Tab` 保留焦点导航，`Escape` 取消，明确提交或失焦保存，无修饰键的 Backspace/Delete 清空为 `null`；忽略自动重复与 IME composition。
- 录制开始必须先通过窄 Rust command 取得唯一 token。宿主确认前不接受按键；失败时关闭录制并显示稳定错误。
- 录制期间不注销旧 binding，只凭有效 token 暂停本模块业务分派，避免录入 chord 触发旧动作。多窗口使用 token 集合或引用计数；结束、路由卸载、窗口关闭和异常路径都释放 token。
- 提交完整配置快照并串行保存；语义等价的 chord 不重复写入。失败时 UI 恢复服务端返回的旧快照并通过 live region 提示。

## 最小回归

所有启用模式都覆盖：

- `global_shortcut_initial_bindings_match_contract`（空 contract 为零绑定；固定动作使用需求 chord；可编辑 `null` 保持未绑定）
- `global_shortcut_registers_only_configured_bindings`
- `global_shortcut_dispatches_pressed_events_to_declared_actions`
- `global_shortcut_reports_real_registration_state`
- `global_shortcut_unregisters_owned_bindings_on_shutdown`
- `global_shortcut_setup_failure_unregisters_owned_bindings`

存在可编辑动作时另覆盖：

- `shortcut_bindings_require_modifier_and_reject_equivalent_duplicates`
- `global_shortcut_replace_rolls_back_on_registration_failure`
- `global_shortcut_persistence_failure_restores_previous_bindings`
- `global_shortcut_recording_suppresses_dispatch_until_released`

前端按实际策略覆盖固定只读状态，或可编辑录制的提交、取消、清空、重复/IME、失败恢复、live region 与卸载清理。中性空 contract 不创建空洞前端测试，只证明无 UI、无默认 chord、无启动注册和无清理残留。
