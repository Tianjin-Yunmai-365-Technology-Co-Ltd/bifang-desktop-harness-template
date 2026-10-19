# Linux 原生宿主方案

只在修改 Linux 窗口、托盘、通知或后台热键机制时读取。这里收录从下游实践中提炼的可复用方法，不是中性 renderer 的能力清单。当前 renderer 仍拒绝生成 Linux 托盘与后台热键；扩展须在已批准的下游范围内独立接线、回归和取证。具体版本、产品策略及历史验收结果留在目标项目。

## 图形会话与窗口

启动前捕获会话能力。确需全局定位或置顶且存在有效 `DISPLAY` 的产品，可按批准需求选择 X11/XWayland；不要为选择后端改写进程环境。纯 Wayland 普通 toplevel 不承诺相同的全局定位和置顶合同；未接通协议路径时明确失败并保留恢复入口，不能以激活窗口代替置顶。

X11 使用真实 XID 与 checked request。需要持久化全局几何时明确使用 root 物理坐标，仅在原生边界换算 DIP；工作区按 RandR 活动显示器与当前桌面 `_NET_WORKAREA` 求交，缺协议时才回退 root 几何。混合 DPI 与热插拔另行实测。

[EWMH](https://specifications.freedesktop.org/wm/latest/) 置顶是窗口管理器协商状态。首次 map 后重新核对请求，以有总预算的异步观察确认状态，再验证实际覆盖关系，不阻塞主循环。确认后释放临时几何或显隐目标，避免旧目标拦住拖动或输入穿透切换。Shape Input 与视觉区域分别拥有；写后读回，失败尝试恢复，恢复失败披露未知状态。需要保存偏好时，原生效果确认后才提交，退出接管已接受但尚未提交的最后意图。

## 托盘与关闭恢复

KSNI/StatusNotifierItem 使用会话 D-Bus，不在 GPUI 主线程混入 GTK 循环。对象创建不证明窗口可恢复：后台有界 worker 联合核对 Watcher 的真实 host、注册列表、本进程拥有的服务和预期托盘 ID。owner 变化、注销、断连或未知结果撤销旧可用性；主线程只读已发布事实。

关闭回调已经借用当前 GPUI 窗口，不可在其中再次 update 同窗取得 XID。在安装机制时捕获所需原生能力；关闭及延迟隐藏阶段仍重新核对恢复入口。缺少可靠入口时允许正常关闭，不能隐藏到不可恢复状态。最终验收操作真实托盘恢复和退出，D-Bus 属性读回不代替点击。

## Dock 与桌面身份

窗口 `app_id`、桌面文件标识、`StartupWMClass` 及图标名来自同一已确认身份。已批准 Logo 派生窗口 ARGB 图标和实际尺寸的 hicolor PNG；`_NET_WM_ICON` 读回只证明窗口属性，Dock 还须能解析有效 `.desktop` 和 `Exec`。隔离解包运行时宿主未必能访问包内路径，临时宿主映射须精确登记并恢复。最终包解包检查与真实 Dock 呈现分别取证，包布局与图标尺寸见 [Linux 打包合同](../../desktop-build-gpui-release/references/linux-packaging.md)。

## freedesktop 通知

[Desktop Notifications](https://specifications.freedesktop.org/notification/latest-single/) 的固定会话服务为 `org.freedesktop.Notifications`；`GetCapabilities` 只证明服务及其能力可查询，没有每应用授权查询。不可达和超时不伪装为用户拒绝。启动不投递测试消息，实际发送遵守应用偏好及 core 事件规则。

产品要求可控原生桥时，worker 拥有有界提交邮箱与通知 ID 映射，连接、认证和调用共享总预算。关闭、暂停投递和退出撤销尚未提交的命令；确定拒绝与未知回执分别处理，超时不盲目重投。服务唯一 owner 变化后丢弃旧 ID，只处理当前 owner 下本应用已发送通知的已批准动作，未知动作不恢复窗口。正文按纯文本转义，通知桌面入口和图标沿用产品身份。API Accepted、真实横幅和点击恢复分别验证；这些要求不表示 Kit 提交入口已实现上述原生桥。

## 热键与回归边界

Wayland 全局快捷键使用 [GlobalShortcuts Portal](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.GlobalShortcuts.html)，管理真实会话、用户配置及实际返回的绑定集合；服务存在不等于授权或绑定成功。X11 注册需要 checked request 和确定的错误传播。`global-hotkey 0.8` 的 Linux 断连回执不能当可靠注册成功；具体库版本及补丁以目标清单和源码为准。依赖声明、空 action 合同和只读探测不构成后台服务或按键验证，也不授权注册键位。

协议回归使用 owned 私有 D-Bus daemon，不改变用户 session bus；产品桌面运行不要求用相同 daemon 实现。按实际修改覆盖托盘 owner/恢复入口丢失、通知迟到动作/未知结果、原生窗口确认/回滚和退出回收。真实 X11 测试处于 ignored 状态不等于已执行；完整候选另验真实桌面交互，并记录源码、包摘要、架构、桌面会话及未覆盖场景。
