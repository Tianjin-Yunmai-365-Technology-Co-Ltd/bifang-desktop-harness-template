//! 中性 CLI 的最薄进程入口；结构状态和协议映射分别位于核心与适配器。

mod adapter;

/// 建立 Tokio 运行时并把完整命令处理委托给 CLI 适配器。
#[tokio::main(flavor = "current_thread")]
async fn main() -> std::process::ExitCode {
    adapter::run().await
}
