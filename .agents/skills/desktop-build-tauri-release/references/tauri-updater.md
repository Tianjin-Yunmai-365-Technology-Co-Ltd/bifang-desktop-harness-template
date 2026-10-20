> 官方资料核对日期：2026-09-04（沿用原参考核对日期；本次仅整理现有合同）

本文件是 [构建 Skill](../SKILL.md) 的条件执行合同；`scripts/` 路径均相对该 Skill 根目录。共享的选择冻结、版本、测试、锁策略、manifest 与原子提交仍按主流程执行。

## Tauri updater 签名制品

- 官方 Tauri 2 updater 要求更新制品签名，签名验证不能关闭。`plugins.updater.pubkey` 可以安全进入应用配置；私钥必须留在发布环境，构建通常通过 `TAURI_SIGNING_PRIVATE_KEY` 和密钥实际需要的密码来源消费，不得写入仓库、日志或前端 bundle。
- `bundle.createUpdaterArtifacts: true` 让 bundler 为目标平台生成 updater archive 及相邻签名。真实扩展名和路径随平台/bundler 变化，必须从 Tauri 输出或 bundle 元数据发现，不得猜文件名。
- updater endpoints 支持 target、arch 和当前版本变量；生产使用 TLS。默认不允许降级。检查、下载和安装可以分阶段执行，Windows 在安装阶段可能退出应用。
- 安装包的 Developer ID/Authenticode/渠道代码签名与 updater archive 签名不是同一件事。允许 unsigned 安装包不能关闭 updater 签名；启用 updater 的候选缺少 archive、`.sig` 或公钥验证时必须失败。
- 本 Skill 只生成本次候选及可审计清单，不上传 update feed、不创建 release，也不持有发布私钥。强更的最低支持版本策略还需要应用层认证与 core 判定，不能由 updater manifest 中一个未认证布尔字段直接触发。

官方来源：

- [Tauri Updater](https://v2.tauri.app/plugin/updater/)
- [Tauri updater JavaScript API](https://v2.tauri.app/reference/javascript/updater/)

## 测试前配置门禁

3. 从批准的产品事实解析 GUI profile 之外的 `updaterEnabled` 发布门。它只控制当前候选是否生成、签名和声明 updater archive，绝不能控制固定 updater 插件是否安装。若为 false，保留第 2 步基线与 `NotConfigured` 零出站行为，要求 `bundle.createUpdaterArtifacts` 未启用，不生成、签名或伪造更新制品，也不得留下会使运行时主动检查的 endpoint/pubkey 配置；若为 true，在任何测试前要求：Tauri 配置启用 `bundle.createUpdaterArtifacts: true`，官方 updater 插件具有非空公钥和受限 HTTPS endpoints，产品文档记录 channel/target/arch 与强更策略认证边界，源码/配置/前端不含服务端 secret 或发布私钥。构建运行时必须存在已批准的 `TAURI_SIGNING_PRIVATE_KEY` 安全来源及该密钥实际需要的密码来源；只探测存在性/可用性，不输出值、路径正文或派生私钥。任一条件缺失或 false 分支混入发布配置都阻断候选，不得通过删除固定插件、关闭签名验证、临时改写 `updaterEnabled` 或把外部浏览器下载冒充自更新来继续。

## 构建后制品与验签

12. `updaterEnabled: true` 时，从每次 Tauri 构建的真实输出或 bundle 元数据发现当前 platform/target 的官方 updater archive 与相邻 `.sig`，不得猜测文件名或用安装包 checksum 代替 updater 签名。要求 archive/签名均为非空普通文件，使用配置中的公钥执行实际签名验证，并确认版本、channel、target、arch 与安装包一致；缺失、重复、无法验证或签名不匹配都使该平台 updater 候选失败。不得把 `TAURI_SIGNING_PRIVATE_KEY`、密码、私钥路径或私钥派生内容写入 manifest、日志或制品。
