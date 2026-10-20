# GUI 工程方案索引

本文按任务组织 GUI 依赖版本、实现方案、性能和打包知识。根 Cargo 决定实际框架/接口/目标/版本；中性 renderer、已有产品接线与目标运行证据分别判断。普通实现只读命中主题，不自动初始化、升级依赖、跑基准或构建。

| 任务 | 入口与事实 | 完成边界 |
| --- | --- | --- |
| 依赖清单、版本或 features | [$desktop-manage-gpui-dependencies](../.agents/skills/desktop-manage-gpui-dependencies/SKILL.md)；其中依赖矩阵记录中性声明下界和已有采用参考 | 分清声明/resolved/vendor，实际升级才改清单与回归 |
| 后端兼容、字体/AX/窗口/托盘问题 | [兼容补丁合同](../.agents/skills/desktop-manage-gpui-dependencies/references/compatibility.md) | 原样来源 + 严格生成 + 按后端证据，不默认复制补丁 |
| 已有 core 增加 GUI、原生接线 | [$desktop-add-gpui-adapter](../.agents/skills/desktop-add-gpui-adapter/SKILL.md) | 按 profile 装配，禁用能力无残留；不复制业务权威状态 |
| 异步/队列/重绘/缓存/图片性能 | [$desktop-optimize-gpui-performance](../.agents/skills/desktop-optimize-gpui-performance/SKILL.md) | 定场景、测成本、最小修改、行为回归、同条件复测 |
| 本地试包与发布候选 | [$desktop-build-gpui-release](../.agents/skills/desktop-build-gpui-release/SKILL.md) | 公共生命周期 + 按平台引用，产物与运行验收分开 |
| 最终候选验收 | 保留的 desktop-verify-delivery / desktop-test-final-artifact-e2e | 真实最终字节和目标宿主，构建通过不代替验收 |
| Linux 宿主、工具链及能力边界 | 下文 Linux 问题索引与对应 Skill 引用 | 区分中性生成、独立接线、协议回归与目标运行证据 |

## Linux 问题索引

Linux 知识按既有 Skill 职责维护；只读取当前问题对应的引用，不自动安装、构建或运行验收。

| 问题 | 知识入口 | 判断边界 |
| --- | --- | --- |
| GNU x64/ARM64 系统依赖、root 接续、旧进程 PATH | [环境恢复](../.agents/skills/desktop-check-development-environment/references/development-environment-gates.md#linux-gpui-专项恢复) | 系统安装、原用户 Rust target 复探与真实链接探针分开判断 |
| X11/XWayland 窗口、托盘恢复、任务栏/Dock、通知及 Portal 热键 | [Linux 原生宿主方案](../.agents/skills/desktop-add-gpui-adapter/references/linux-native.md) | EWMH 请求与真实桌面效果分开；中性 renderer 仍拒绝 Linux 托盘/后台热键生成 |
| 登录项读回、旧项迁移、隐藏启动与显窗恢复 | [Linux 登录项与隐藏启动](../.agents/skills/desktop-add-gpui-adapter/references/linux-native.md#登录项与隐藏启动)、[$desktop-add-gpui-autostart](../.agents/skills/desktop-add-gpui-autostart/SKILL.md) | 读取跟随真实写入驱动；扩展须独立接线，不因模板生成或旧候选通过宣称已验证 |
| D-Bus、X11 与 Portal 的依赖选择 | [依赖矩阵](../.agents/skills/desktop-manage-gpui-dependencies/references/dependency-matrix.md) | 按真实消费者裁剪 features，声明依赖不等于服务接线 |
| 静态首帧、共享设置缓存吞掉首次发布 | [资源与缓存](../.agents/skills/desktop-optimize-gpui-performance/references/resources-and-caches.md)、[运行时与需求](../.agents/skills/desktop-optimize-gpui-performance/references/runtime-and-demand.md) | 正式帧请求和消费者初始化分别回归，不把正确性修复写成性能测量 |
| deb/tar.gz、交叉链接、权限、图标及 glibc | [Linux 打包合同](../.agents/skills/desktop-build-gpui-release/references/linux-packaging.md) | 宿主测试、最终包校验与目标运行验收分别记录 |
| Tauri deb/AppImage、托盘运行库、非 ASCII 产品名派生的非法 Debian 包名 | [Tauri Linux 本地试包与宿主要点](../.agents/skills/desktop-build-tauri-local-install/references/tauri-linux.md) | 只规范安装标识并核对 payload 不变；本地试包不构成 Linux 候选证据 |
| Tauri 用户/XDG 目录、卷边界、发现测试与取消 | [Linux 运行时与测试边界](../.agents/skills/desktop-add-gui-adapter/references/linux-runtime.md) | 枚举省略不等于递归排除；策略与宿主 I/O 分开回归 |
| Tauri 托盘恢复、自启、WebView origin 与应用 command ACL | [Linux 桌面生命周期](../.agents/skills/desktop-add-gui-adapter/references/linux-runtime.md#托盘窗口与登录启动)、[WebView 与权限](../.agents/skills/desktop-add-gui-adapter/references/linux-runtime.md#webview-与-command-权限) | 菜单恢复不依赖 Linux 图标事件；ACL 与 origin 按项目实际配置判断 |

下游历史候选只证明其精确源码、最终字节、架构、桌面会话和场景；其它版本或平台不继承通过状态。产品能力矩阵及原始验收记录留在下游，Harness 只沉淀中性机制与取证要求。新增引用沿各框架对应的条件 Skill 传播，不把产品知识库、身份、业务参数或来源锁反向复制进模板。

## 方案选择

原生 GPUI/Kit 负责视图与图标，rust-i18n/sys-locale 负责语言，端侧日志使用有界后台 sink。宿主依赖按 target/profile 裁剪。业务确需才加 Tokio、图片解码、数据库或网络；Tokio 服务拥有 runtime，GPUI loop 仍在同步主线程。renderer 未接线的 Linux 能力保持限制，产品可以通过独立实现扩展，不能反向宣称模板已支持。

性能优化优先减少无消费者的工作、合并最新意图、限制并发/驻留和完善失效。CPU像素、GPU纹理、Scene及任务分别拥有寿命；API/微基准、整应用短窗、长期及跨平台结论分层，不以固定产品阈值替代测量。

macOS 使用 app.zip/DMG，Windows x64 使用 NSIS；两者核对全局 cargo-packager 0.11.8。Linux GNU x64/ARM64 使用系统 tar/dpkg-deb/readelf，可同系统交叉架构。独立 CLI 全局安装，产品 Rust/Node 依赖仍按项目清单；本索引不授权安装。local 不发布，candidate 只消费已发布源码与当次选择；签名、解包、运行各自取证。

## Skills 维护与传播

adapter 只负责装配，依赖 Skill 管版本/补丁，性能 Skill 管定位/测量，build Skill 管产物。平台是 build 的按需 reference，不另建重复生命周期的 Skill。新增两个 GPUI Skill 仅向 Cargo 已选 gpui 的下游传播；Tauri 与非 GUI 不接收。共享规则通过索引引用，产品参数和历史性能证据留在产品文档。回流 Harness 定点合并中性工程，不覆盖产品源码/身份/策略或其他新工具，也不伪造完整升级来源锁。
