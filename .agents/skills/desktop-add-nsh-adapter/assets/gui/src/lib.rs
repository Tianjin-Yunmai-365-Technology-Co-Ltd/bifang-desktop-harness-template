//! NSH Mixed 模式的薄模块；领域状态仍由共享 core 判定。
use nsh_core::prelude::*;

/// TSX 使用此模块读取中性 core 的初始化状态。
#[module]
pub struct Scaffold;

#[module]
impl Scaffold {
    /// 返回共享 core 对工程是否已初始化的判定。
    pub async fn status() -> bool {
        __PROJECT_ID___core::scaffold_status()
            .await
            .initialized
    }

    __RELEASE_NOTES_METHOD__
}

/// 只导出明确的 core 映射，不在 UI 模块复制业务规则。
#[native_module("__PROJECT_ID__/native")]
fn native(registry: &mut Registry) {
    registry.module::<Scaffold>();
}
