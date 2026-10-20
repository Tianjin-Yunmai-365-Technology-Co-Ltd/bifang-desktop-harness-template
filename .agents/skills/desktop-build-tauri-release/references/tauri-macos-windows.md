# Tauri macOS 与 Windows 候选参考

本文件保留旧路径与章节锚点。完整公共流程以 [构建 Skill](../SKILL.md) 为准，只读取当前路线命中的合同。

## Tauri updater 签名制品

仅 updaterEnabled 为 true 时读取 [对应合同](tauri-updater.md)。

## macOS→Windows x64

macOS→Windows NSIS 路线读取 [对应合同](tauri-windows-xwin.md)。

## Windows 原生 x64 NSIS

Windows 原生 NSIS 路线读取 [对应合同](tauri-windows-native.md)。

## macOS Developer ID 直接分发

仅 macOS 签名已启用时读取 [对应合同](tauri-macos-signing.md)。

## DMG Finder 拖拽布局

macOS DMG 路线读取 [对应合同](tauri-macos-dmg.md)。

## 选择、可用性与秘密边界

选择冻结见主 Skill；仅已启用 macOS 签名时读取 [对应合同](tauri-macos-signing.md)。
