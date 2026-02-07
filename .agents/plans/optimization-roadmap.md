# GeminiAutoGen 优化计划（2026-02）

## 1. 目标
- 提升批处理稳定性（减少误判、漏判、错误重试）
- 降低维护成本（减少 `content.ts` 单点复杂度）
- 提高可观测性与回归信心（日志结构化 + 测试覆盖）

## 2. 优先级总览

| 优先级 | 主题 | 预期收益 | 实施成本 |
|------|------|------|------|
| P0 | Reset 最小化清理 | 避免误清用户配置 | 低 |
| P0 | 本轮 hash-set 去重 | 防止非连续重复图 | 低-中 |
| P1 | 下载识别增强（时间窗/mtime/稳定确认） | 降低误捡外部下载风险 | 中 |
| P1 | 重试分级 + 退避策略 | 减少无效重试和抖动 | 中 |
| P1 | content.ts 模块拆分 | 维护成本显著下降 | 中-高 |
| P2 | MutationObserver + 轮询兜底 | 性能和稳定性提升 | 中-高 |
| P2 | 轻集成测试（message/DOM 夹具） | 回归保护增强 | 中 |
| P3 | 结构化运行报告 | 调参与排障效率提升 | 低-中 |

## 3. 分阶段执行

### Phase A（短平快）
1. Reset 最小化清理
- 仅清理运行态 key：`currentTask`、`currentTaskMode`、`loadedTasks`、`lockedConversationUrl`、日志折叠状态等。
- 保留用户配置：目录句柄、语言、超时参数、重试参数。

2. 本轮 hash-set 去重
- 在一次 run 生命周期中维护 `Set<hash>`。
- 保留已有 `lastFileHash` 逻辑作为轻量快速检查。

3. 验收标准
- Reset 后无需重新配置目录/语言/超时。
- 同一 run 内重复图片（非相邻）可被拦截并归类为 generation error。

### Phase B（核心稳定性）
1. 下载识别增强
- 引入任务时间窗（task start/end）。
- 新文件判定增加 `mtime >= taskStart` 约束。
- 稳定检测保留“三次相同 size”并记录稳定耗时。

2. 重试分级 + 退避
- `download`：短退避（如 1s, 2s, 4s）。
- `generation`：中退避（如 2s, 5s, 10s）。
- `folder/locked-url`：立即停止。
- 保留 `maxRetries` 与 `maxConsecutiveFailures` 上限逻辑。

3. 验收标准
- 非任务下载干扰显著降低。
- 重试日志可清楚显示错误类型、退避时长、当前重试计数。

### Phase C（可维护性）
1. `content.ts` 拆分模块
- `selectors.ts`：DOM 选择器与元素判定
- `generation-flow.ts`：发送与生成等待逻辑
- `download-flow.ts`：下载按钮与下载菜单逻辑
- `content-errors.ts`：错误类型和错误构造

2. 统一状态机语义
- 明确状态：`idle/running/retrying/stopped/completed`
- SidePanel 仅通过状态驱动 UI，不直接散落布尔控制。

3. 验收标准
- `content.ts` 主文件显著瘦身，主流程可读。
- 新增选择器变更时仅需修改单一模块。

### Phase D（测试与可观测性）
1. 测试扩展
- 保留当前 BDD 核心逻辑测试。
- 增加轻集成：
  - sidepanel 消息驱动流程（`TASK_COMPLETE/TASK_ERROR`）
  - content 的 Gemini DOM 夹具选择器回归

2. 结构化日志与运行报告
- 统一字段：`taskId`、`filename`、`phase`、`errorType`、`retryCount`、`tabId`。
- run 结束输出汇总：完成/跳过/失败、平均耗时、Top 错误。

3. 验收标准
- CI 可执行核心 + 轻集成测试。
- 日志支持快速定位“哪一步失败、为何失败、是否可重试”。

## 4. 风险与对策
- Gemini DOM 频繁变化：选择器集中化 + 夹具回归测试。
- 复杂度迁移风险：每阶段独立合并，避免大爆炸重构。
- 文件系统 API 权限不稳定：保持 folder error 立即停止并给出明确文案。

## 5. 建议落地顺序
1. Phase A（1-2 次提交）
2. Phase B（2-3 次提交）
3. Phase C（按模块拆分，多次小提交）
4. Phase D（持续补充）
