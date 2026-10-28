# Harness 设计入口

所有 GUI 的统一设计基座由 [UI 基座规范](docs/design_standards/ui_foundation.md) 管理：语义 Token 单一来源、标准组件复用、视觉与交互一致、业务样式分层。它是实现约束，不是仅供检索的参考资料。

初始化、修改或复核 GUI 时，从 [设计标准索引](docs/design_standards/README.md) 进入：当前共用基座是唯一视觉规则来源，Tauri、GPUI、列表和侧栏文档只补充相容的框架与行为合同。冲突的旧风格、像素硬锁和自动安装风格 Skill 已清理；实际展示值集中在主题 Token，不在多处并列维护。

本文件只负责导航。新下游保留此入口与完整设计标准目录；既有下游自有的 `DESIGN.md` 由项目维护，Harness 升级通过标准索引接入基座，不覆盖该文件。CLI、TUI、MCP 不因保留设计资料而引入 GUI 或前端依赖。
