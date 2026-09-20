# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

static HTML/CSS/JavaScript — confirmed by the user for the initial working prototype.

## Users

- 实训成员：在手机上选择本人并完成开始、结束实训与现场照片留档。
- 实训室管理员：后续在电脑端查看成员、记录和统计。

## Product Purpose

在实训室局域网中，以低维护、可本地部署的方式准确记录成员的实训开始与结束时间、现场照片和个人训练进度。

## Positioning

把每一次现场打卡、时长和照片成果绑定为一条可核验的实训记录，而不是分散的纸质或表格登记。

## Operating Context

约 15 人在实训室连接局域网后，以手机扫码或打开网页完成打卡；数据最终需使用 SQLite 和本地照片目录保存。首轮实现仅验证成员端签到闭环。

## Capabilities and Constraints

- 当前范围：成员识别、开始/结束实训、必填现场照片预览、持续计时、时长统计、月度目标与历史记录。
- 一名成员同一时间仅能有一条进行中的实训记录。
- 所有真实生产时间应以后端服务器时间为准；本静态原型使用浏览器时间演示流程。
- 管理端、管理员登录、SQLite、真实照片落盘、导出和异常处置留待后续阶段。

## Brand Commitments

产品名称为“电气仪控实训室”。已有视觉稿采用深海军蓝、明亮电气蓝、浅灰工作台底色与清晰的数据化操作界面；视觉稿位于 `design-assets/training-system-ui-concept.png`。

## Evidence on Hand

- 已确认需求：[PRD.md](PRD.md)。
- 已确认视觉参考：`design-assets/training-system-ui-concept.png`。
- 当前没有真实成员、训练记录或现场照片；界面中的示例数据明确作为演示数据使用。

## Product Principles

1. 打卡主操作应始终清晰、单一、适合手机触控。
2. 照片与时间记录同等重要，均需即时可见和可核验。
3. 用文字和颜色共同表达状态，不能仅依赖色彩。
4. 统计自动生成，成员无需手工计算。

## Accessibility & Inclusion

手机端控件需有足够点击面积、明确文字状态和可见焦点；重要状态不可只依赖颜色传达。
