# Tauri Mantine UI 设计规范

本文是 `$desktop-add-gui-adapter` 创建或维护真实 Tauri React 界面时的 Mantine 详细规范。应用身份、窗口元数据和图标以项目的 `docs/GUI_APP_PROFILE.md` 为事实源；状态所有权、i18n、工具链与 Rust core 边界以 [React 前端基线](react-frontend-baseline.md)和 [GUI 基线](gui-baseline.md)为准。

## 1. 设计原则

- 任务优先：每个视图先突出用户当前要完成的任务，再展示辅助信息和技术细节。
- 克制一致：同一语义使用同一组件、颜色、密度和反馈，不以额外颜色、阴影或动画制造层级。
- 渐进披露：首屏只保留当前任务所需信息，低频设置与诊断进入展开区、帮助或专用设置页。
- 可恢复：加载、空态、错误、禁用和破坏性操作必须说明当前状态与下一步。
- 内容驱动：适配中英文、文本缩放和窄窗口，不把开发机字体或固定文案长度写成布局前提。
- 无障碍默认开启：键盘、可见焦点、语义名称、对比度、live region 与 reduced motion 是实现基线。

## 2. Theme 与令牌

### 2.1 单一入口

- 每个 React 根只挂载一个 `MantineProvider`；theme 保存在 GUI 前端的唯一稳定模块，定义在组件外，不随渲染重建。
- 初始化主题使用显式 `localStorageColorSchemeManager` 与稳定 key，默认 `auto`，设置页允许 `light`、`dark`、`auto`；存储失败时回退安全默认，不得阻断应用启动。
- 应用主色、字体、字号、行高、间距、圆角、阴影、断点和组件默认值先进入 `createTheme`。跨组件语义变量无法由内置 key 表达时，才通过 `theme.other` 或 CSS variables 暴露。
- 项目身份或品牌色只从 `docs/GUI_APP_PROFILE.md` 批准输入派生；页面、组件和 CSS 不复制十六进制品牌值，也不固定特定字体或仅亮色主题。
- 自定义颜色必须提供当前 Mantine 版本要求的完整色阶并验证 hover、active、对比与暗色行为；不得把重复单色假装成明暗语义。

样式优先顺序：

1. theme token 与组件 `defaultProps`；
2. Mantine 组件 props 和简单 style props；
3. 稳定、复杂或复用样式使用 CSS Modules 与 Mantine CSS variables；
4. 修改组件内部 slot 时使用 Styles API；
5. 只由运行时测量或计算得到的一次性值才使用内联 `style`。

不得使用高优先级全局 CSS、`!important` 或依赖 Mantine 内部 DOM 结构的选择器批量覆盖组件。

### 2.2 语义令牌

| 领域 | 语义 | 约束 |
|---|---|---|
| 间距 | `xs/sm/md/lg/xl` | `xs/sm` 用于同组细节与控件内部，`md` 用于常规组件，`lg/xl` 用于区块与页面 |
| 圆角 | `sm/md/lg/xl` | 控件使用 `sm/md`，普通 surface 使用 `lg`，强品牌容器才使用 `xl` |
| 阴影 | 无、`xs/sm/md` | 普通内容优先边框；浮层与临时叠层才使用轻阴影 |
| 品牌色 | `brand` | 用于主动作、选中、焦点和少量强调，不替代正文或全部状态色 |
| 中性色 | `gray/dark` | 表达页面、surface、边框、主文本和次文本，不为每页建立一套近似灰色 |
| 状态色 | success/warning/danger/info | 同时提供文字、图标或语义属性，颜色不得成为唯一线索 |

- 普通文字与背景至少满足 `4.5:1`，大号文字、必要非文字界面信息和焦点指示至少满足 `3:1`。
- focus ring 不得关闭；sticky header、overlay 和滚动容器不能遮挡当前焦点。
- 动画和过渡尊重 `prefers-reduced-motion`，且不得成为唯一状态提示。
- 标题按 `h1 → h2 → h3` 连续组织，不为视觉大小跳级；正文和辅助文字通过字号、字重与间距建立层级。

## 3. 布局与操作层级

- 页面按 `page → surface → section → field → action` 组织：页面控制宽度，surface 承载相关内容，section 分组，field 保持 label/输入/helper/error 相邻，action 靠近影响对象。
- 默认密度为 comfortable。受限窗口可使用 compact，但交互目标仍至少满足 `24 × 24 CSS px` 或具备标准允许的间距例外；高频主操作优先接近 `40 × 40 CSS px`。
- 同一操作组只保留一个视觉主动作。主动作使用品牌 filled，次要动作使用 default/outline，低优先级动作使用 subtle/link，危险动作使用 danger 且不能与品牌主色混淆。
- `Paper/Card` 承载一个明确主题；避免卡片套卡片。普通内容使用边框，只有浮层、拖拽对象或临时脱离页面的区域使用 shadow。
- 主要内容 DOM 顺序与视觉/键盘顺序一致。弹层关闭后焦点返回触发器；路由切换和错误恢复采用明确的焦点策略。

## 4. 响应式与桌面窗口

- 应用壳层使用固定左侧菜单：Jotai 默认值为收起；选中的应用 Logo 永远位于最顶部，当前版本紧随其下，功能项再在可滚动区域按产品顺序向下增长，赞助/设置/关于按该视觉顺序固定贴底。折叠只改变宽度和标签展示，不隐藏 Logo、当前版本或可访问名称；主内容按实际侧栏宽度偏移，不能被 fixed 区域覆盖。
- 侧栏展开/折叠按钮使用 `ActionIcon` 并具有本地化名称；每个功能项和固定项必须提供从 `@tabler/icons-react` 命名导入的语义明确图标。折叠时 Logo 与每个图标沿同一侧栏中心线水平居中且无裁切，显示图标并以本地化 Tooltip 补充名称；展开时显示图标与名称。菜单项同时使用链接或 button 语义、独立可访问名称、可见选中态和清晰焦点。Tooltip 不能是折叠态的唯一名称，版本也不能只存在于 tooltip。
- 采用 mobile-first/窄窗口优先：先在等价 `320 CSS px` 宽度、200% 文本缩放和用户覆盖文本间距下保持可用，再扩展列数与留白。
- 断点只处理真实结构变化，例如单列/多列、导航显隐、操作组换行和次要信息折叠；不为每个组件发明局部断点。
- 少量变化使用 Mantine 响应式 props；复杂或重复布局使用 CSS Modules。大列表不逐项生成响应式 style props。
- 文案、按钮、表单和状态区域允许自然换行；不固定高度裁切中文或英文。二维数据可以局部横向滚动，但整个页面不应产生横向滚动。
- Tauri 最小窗口尺寸必须与最窄可用布局一致；不得依赖最大化窗口才能完成核心任务。
- GUI 初始化的主窗口使用 1440×900 逻辑像素、最小 960×640、居中并防止溢出工作区；1440×900 必须让展开的 248px 侧栏与赞助页三张档位卡同时可见。不要把它与 660×400 的 macOS DMG 安装卷窗口配置混为一谈。
- Mantine provider 使用 `defaultColorScheme="auto"`，共享主题同时为亮色与暗色定义页面背景、surface、主文字、次文字、边框与强调色。应用根与固定侧栏必须消费这些语义变量；Sponsor 等带背景图的页面从运行时有效主题选择明确叠层、surface 和对比色。不透明的亮色插图应放入受控的中性承载面，避免在暗色卡片上形成无意的刺眼方块。

## 5. 组件语义

### 5.1 动作与导航

- Button 文案使用“动词 + 对象”。仅图标动作使用 `ActionIcon`，必须提供可访问名称；Tooltip 只能补充，不能成为唯一名称。
- 菜单、操作、状态、空态和图表周边控件存在适用 Tabler 图标时优先使用 `@tabler/icons-react`；不得另装图标库或以手写 SVG、字符、emoji 替代。图表数据图形本身由另行批准的数据可视化方案负责。
- 提交期间使用 loading/disabled 防止重复提交，完成后提供可感知的成功或失败反馈。
- 页面跳转使用链接语义，触发操作使用 button；不得用 `div onClick` 模拟按钮。
- 破坏性操作显示对象和影响范围。不可轻易恢复时二次确认，并让取消保持安全默认。

### 5.2 表单与数据

- 每个输入都有可见 label；placeholder 只提供示例。helper 描述要求，error 描述问题和恢复动作，两者不混成常驻红字。
- 表单默认单列，相关短字段才并排；主要提交动作位于表单末尾，服务器错误靠近表单或相关字段，不只用瞬时通知。
- 原生 Mantine 输入足够时不自建底层控件。只有真实复杂表单需要时才评估 `@mantine/form`。
- 列表/表格分别处理首次加载、后台刷新、空数据与失败。刷新保留已有内容并显示局部进度，不用整页闪烁替换。
- Tooltip、Popover、Menu、Modal 和 Drawer 必须可用键盘打开/关闭，并验证 escape、焦点圈定和关闭后的焦点恢复。

## 6. 状态与反馈

| 状态 | 必需信息 | 默认呈现 |
|---|---|---|
| 首次加载 | 正在加载什么 | 接近最终结构的 Skeleton 或有名称的进度 |
| 后台刷新 | 旧内容仍可用、正在更新 | 保留内容并显示局部进度 |
| 提交中 | 哪个动作执行、不能重复提交 | 触发 Button loading/disabled |
| 成功 | 完成了什么、必要时下一步 | 就近持久状态或短时辅助提示 |
| 空态 | 为什么为空、接下来能做什么 | 标题、简短说明与至多一个主动作 |
| 可重试错误 | 哪项失败、数据是否保留、如何重试 | 就近 Alert/错误面板与重试入口 |
| 权限错误 | 缺少什么条件、如何恢复 | 专用说明与安全入口 |
| 系统错误 | 操作是否可继续、用户数据是否安全 | Error boundary；技术细节进入脱敏日志 |

- 更新 `NotConfigured`、检查中、最新版、可选更新、强更和失败状态必须使用持久、可读的状态区域；检查失败不得显示为最新版。
- 强更不是普通 Modal：应用根在 `RequiredUpdate` 时不挂载侧栏和业务内容，只呈现 `role="alertdialog"` 的安装/安全退出界面，不提供关闭图标、Escape 或遮罩绕过。
- 统计上报开关默认关闭，label 和说明必须明确何时发送、可撤回以及未配置时零出站；不得预勾选或用颜色暗示推荐打开。

全局通知只有真实需求时才增加 `@mantine/notifications`，每个 React 根只挂载一个容器。Toast 不能承载字段错误、长说明或唯一完成证据。

## 7. 无障碍、i18n 与内容

- 目标为 WCAG 2.2 AA；至少验证 landmarks、连续标题、键盘全流程、可见焦点、可访问名称、状态消息与正确 name/role/value。
- 图像有信息时提供有意义替代文本；纯装饰图从辅助技术隐藏。颜色不是错误、选中、趋势或必填的唯一线索。
- 文本放大到 200% 后不丢失内容或功能；等价 `320 CSS px` 宽度下保持单向回流，确需二维布局的区域才局部双向滚动。
- 当前 locale 同步到文档根 `lang`。用户可见文案进入 i18next，不用字符串拼接组成句子；变量、复数、日期、数字和单位通过完整翻译模板与明确 locale 格式化。
- 未移动焦点的异步结果、提交结果和错误必须使用 `role="status"`、`role="alert"`、`aria-live` 或等价机制，并验证只播报一次。
- 错误文案说明影响和恢复动作，不展示原始异常、内部消息、令牌、路径或堆栈。

## 8. 测试与自检

- UI 测试使用 Testing Library 从角色、名称和用户操作验证，不以 class、内部 DOM 或大快照代替语义断言；侧栏回归同时锁定 Tabler 组件来源和折叠态居中样式，真实本机调试窗口再由初始化 E2E 复核可见居中。
- 至少覆盖核心成功路径和最高风险失败路径，并按真实变更补 loading/empty/error、键盘、焦点恢复、禁用防重、live region、i18n 和响应式结构断言。
- theme 或共享状态组件变化在真实 `MantineProvider` 消费方下测试；测试环境配置只能稳定 transition/portal，不能替代视觉与真实窗口验收。
- 检查中文、英文、200% 文本缩放、窄窗口、用户覆盖文本间距、键盘焦点、对比度和 reduced motion。
- 检查没有散落品牌 hex、任意间距、重复 Provider、多个 filled 主动作、Query 数据的 Jotai 镜像或未批准的 Mantine 扩展包。

官方参考：

- [Mantine Theme object](https://mantine.dev/theming/theme-object/)
- [MantineProvider](https://mantine.dev/theming/mantine-provider/)
- [Mantine Styles API](https://mantine.dev/styles/styles-api/)
- [Mantine responsive styles](https://mantine.dev/styles/responsive/)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
