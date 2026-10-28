# Harness 设计入口

所有 GUI 的统一设计基座由 [UI 基座规范](docs/design_standards/ui_foundation.md) 管理：语义 Token 单一来源、标准组件复用、视觉与交互一致、业务样式分层。它是实现约束，不是仅供检索的参考资料。

初始化、修改或复核 GUI 时，从 [设计标准索引](docs/design_standards/README.md) 进入：先读共用基座，再叠加精确命中的 Tauri、GPUI、列表和侧栏标准。框架实现、具体像素和状态存储各自保留唯一来源；产品已批准的专属约束按索引治理。

本文件只负责导航。新下游保留此入口与完整设计标准目录；既有下游自有的 `DESIGN.md` 由项目维护，Harness 升级通过标准索引接入基座，不覆盖该文件。CLI、TUI、MCP 不因保留设计资料而引入 GUI 或前端依赖。
