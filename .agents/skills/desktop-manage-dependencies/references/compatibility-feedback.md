# 已核实的依赖兼容边界

本参考记录 2026-10-29 的通用依赖准入反馈，供创建下游和主动更新依赖时复用。它不授权增加数据库、卷扫描或其他产品能力，也不把单一 macOS 下游的测试结果当成所有新项目或三平台验证。

## 前端范围必须覆盖真实 peer 合同

- TypeScript 6.0.3 与 typescript-eslint 8.72.1 可配合；后者的官方 [peer metadata](https://registry.npmjs.org/typescript-eslint/8.72.1) 限制为 `>=4.8.4 <6.1.0`。因此声明 `>=6.0.3 <6.1.0`，不能写成允许 6.1 及以上的 `^6.0.3`。初始化前端合同必须检查实际 `package.json`，不能只检查文档中的候选数字。
- `Vitest 4.1.12`、`jsdom 29.1.1` 保持当前连续 `Node >=24.0.0` 合同；Vitest 5.0.5 和 jsdom 30.1.3 的 engine 排除了 Node 25，后者也排除 24.0–24.14。若项目继续承诺全部更高正式版本，不能采用这些不连续的 engine。
- `@types/node` 使用与最低运行时一致的 24 线；类型包可安装不等于较低 Node 已实现对应 API。Jotai 3 使用公共 atom/store/Provider，不生成已移除的 atomFamily、loadable 或 setSelf 调用。具体范围及来源仍取 [候选登记](registry-candidates.json) 与 [技术基线](../../../../docs/RUST_CLI_TEMPLATE.md)；Tauri 项目再按其 GUI Skill 读取前端专项基线。
- 最低直接版本测试只证明下界。还需使用最终交付范围正常解析，检查 peer，并运行受影响的非空测试；没有锁文件的新项目尤其不能把旧锁中的偶然组合当作范围保证。

## SeaORM 2 的参数化语句与执行器

固定技术族候选保持 SeaORM 2.0.4；仅在关系型数据库能力已批准时使用，不为初始化预装。官方 [ConnectionTrait](https://docs.rs/sea-orm/2.0.4/sea_orm/trait.ConnectionTrait.html) 和 [连接源码](https://docs.rs/crate/sea-orm/2.0.4/source/src/database/connection.rs) 的入口分为：

| 输入 | 入口 |
|---|---|
| 已拥有的 `Statement`（含 SQL 与绑定值） | `execute_raw`、`query_one_raw`、`query_all_raw` |
| 借用的 `StatementBuilder` | `execute`、`query_one`、`query_all` |

这些泛型方法使 `ConnectionTrait` 不再 dyn-compatible；不要生成旧式 `&dyn ConnectionTrait` 或把 owned Statement 交给新借用入口。执行器已在编译期确定时用泛型；必须在既有连接和事务之间运行时选择时，可使用只借用它们的明确枚举分发。适配不能另开连接、嵌套事务、改变提交/回滚所有权，或通过丢掉绑定值改成字符串拼接。

涉及数据库升级时，以真实执行器覆盖未提交数据可见性、成功提交、取消/失败回滚，以及最高风险的迁移和重试；已有下游测试不替代新项目自己的领域与适配器回归。

## 可选卷枚举依赖的行为变化

whichdisk 不是 Harness 默认依赖。只有批准的宿主能力确有需要时，才评估它的具体平台实现：

- [0.7.0 Linux 实现](https://docs.rs/crate/whichdisk/0.7.0/source/src/linux.rs) 的观察路径依赖 `openat2`，缺少支持时失败关闭；该系统调用要求 Linux 5.6 及以上。不能从 crate 声明的 Rust MSRV 推断内核支持。
- [0.6.0 Windows 实现](https://docs.rs/crate/whichdisk/0.6.0/source/src/windows.rs) 使用 fixed/removable DriveType 过滤；[0.7.0 实现](https://docs.rs/crate/whichdisk/0.7.0/source/src/windows.rs) 的列举依据变为本地存储设备类别，可包含光驱。旧产品若把枚举结果直接视为允许扫描的本地卷，升级会改变实际集合。
- 需要保留原内核或卷集合合同的既有项目可先评估 0.6.0；采用 0.7.0 必须先明确目标内核及卷分类策略，并完成对应宿主回归。不得把某个下游保留 0.6.0 的选择推广为所有产品的永久上界。

## 工具链与验证边界

通用环境下界和根 Cargo 的项目 MSRV 分别成立。初始化必须对将生成的 MSRV 检查工具链，真实编译失败后的恢复必须使用当前项目声明；通用 Rust 1.95 已合格不证明能编译声明 1.98.1 的新项目。不得为了使门禁通过而降低尚未在更低工具链实测的模板 MSRV。

这些约束来自官方 registry/API/源码与真实开发回归。新项目仍须验证自己的直接下界、正常解析、实际消费者和所选平台；未执行的平台编译、安装、GUI E2E、签名或分发继续报告未验证。
