# 聊天信息流移动端复刻审计

## 审计范围

- 产品表面：LinHub Web 手机版聊天页与原生 Compose 聊天页。
- 用户目标：打开历史会话后快速识别自己的问题、工具/思考状态和正文结构，并自然继续输入。
- 视口：Web 411 × 924 CSS px；Android Pixel 9 AVD 1080 × 2424 px，按宽度归一为 411 × 924。
- 状态：浅色主题、历史会话、用户消息、Web 搜索摘要、长 Markdown 回复、消息操作栏和底部输入框。

## 审计步骤

1. Web 首页基线：`01-web-home.png`。健康度：良好，用于确认移动端顶部操作与输入框语言。
2. Web 信息流顶部：`07-web-chat-feed-pixel9.png`。健康度：视觉真值，包含用户气泡、工具摘要、思考摘要、Markdown 标题/列表。
3. Android 修改前：`05-native-chat-feed-before.png`。健康度：较差；用户消息、每次搜索和正文均过大，一屏信息量明显低于 Web。
4. 第一轮实现对照：`08-comparison-pass-1.png`。健康度：基本可用；气泡、工具摘要和正文密度已经接近 Web。
5. Android 最终顶部：`15-native-chat-feed-top-final.png`，组合证据为 `16-comparison-final-top.png`。健康度：良好。
6. Android 最终底部：`14-native-auto-bottom-pass.png`，组合证据为 `18-comparison-final-bottom.png`。健康度：良好；历史会话首次进入和“回到底部”都能抵达最后一条长回复末尾。
7. Android 复杂信息流：`20-native-python-code-block.png`、`21-native-python-code-output.png`、`22-native-markdown-table.png`、`23-native-source-expanded.png`。健康度：良好；覆盖长代码折叠/运行、输出错误态、二维表格和来源展开态。
8. Android 字号入口与五档菜单：`25-native-font-size-entry.png`、`26-native-font-size-options.png`。健康度：良好；默认“小”和当前选项语义清晰。
9. Android 极大字号：`27-native-font-extra-large-drawer.png`、`28-native-font-extra-large-chat.png`。健康度：良好；侧栏和长回复没有上下裁切，窄行按规则截断。
10. Android 输入框最终状态：`29-native-small-chat-composer-raised.png`、`34-native-history-composer-ime-resize-padding.png`。健康度：良好；关闭键盘时轻微上移，打开键盘时不留异常空白且不被遮挡。

## 主要结论

### 优点

- 用户气泡只包裹正文，圆角、右下角收口、85% 最大宽度和操作栏层级与 Web 一致。
- 多次 Web 搜索从大卡片合并为一条“已搜索 N 次 · N 个来源”摘要；展开后仍能查看调用和来源。
- 思考过程改为 Web 同款轻量折叠行，不再使用整块底色卡片。
- Markdown 正文按 Web 的 15sp、26sp 行高重设；H1/H2/H3、列表、行内代码、代码块与表格保留完整语义。
- 代码块补齐 Web 的语言顶栏、复制反馈、24 行折叠、Python / JavaScript 运行、HTML 预览和可滚动输出；表格去掉多余纵向网格，来源展开仍保留完整调用与链接层级。
- 账户菜单新增五档全局字号，默认“小”保持本轮 Web 对齐尺寸；输入框底部增加 6dp 呼吸空间，IME 打开时仍稳定贴近键盘。
- 助手操作栏补齐模型名，并保持复制、重新生成、反馈、朗读、引用和分支切换能力。

### UX 风险与修复

- 已修复 P1：原生搜索结果曾以多张大卡片堆叠，打断消息阅读。
- 已修复 P1：用户操作按钮曾被包进气泡背景，导致气泡过高且角色层级错误。
- 已修复 P2：历史会话自动定位和“回到底部”对超长单条回复只到达消息开头。
- 已修复 P2：Android 默认 Markdown H2 使用 24sp，显著大于 Web 的 20px。
- 已修复 P2：代码运行输出固定高度时超长内容会被裁切，现改为 224dp 内纵向滚动。
- 已修复 P1：单独移除 IME inset 会使历史会话输入框被 Gboard 遮挡，而未明确 resize 策略时又会重复避让产生大空白；最终使用 Activity `adjustResize` 与 Compose `imePadding()` 的单一闭环。

### 无障碍检查与证据限制

- UI 自动化树确认侧栏、消息列表、搜索摘要、复制、重新生成、反馈、朗读、引用、分支切换和回到底部均具有可读语义或内容描述。
- 原生正文使用系统字体并允许系统字体缩放；新增五档会继续乘以系统字体倍率。设备已验证 1.3 倍“极大”下侧栏与聊天主链路，但未执行 TalkBack 连续朗读、系统放大 200%、深色主题对比度或物理键盘焦点顺序测试，因此不声明完整无障碍合规。
- Web mock 与 Android 真实服务使用不同会话文本；对照只判断相同组件状态、比例和密度，不对逐行换行作伪精确比较。

## 剩余差异

- P3：Android 保留系统状态栏和手势导航条，Web 截图没有对应系统区域。
- P3：Web 使用浏览器字体与 Lucide，Android 使用系统中文字体和 Material 图标，存在字形与抗锯齿差异。
- P3：真实 Android 会话包含更长代码块和表格，因此底部截图的正文内容与 Web mock 不同；组件样式、运行错误态和交互状态已单独核验。

final result: passed
