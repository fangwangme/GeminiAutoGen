# GeminiAutoGen - 技术架构文档

## 1. 项目概述
Chrome 扩展，用于在 Google Gemini 上批量自动生成图像并下载到本地指定目录。

## 2. 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        Chrome Extension                         │
├─────────────┬─────────────┬─────────────┬───────────────────────┤
│  SidePanel  │   Options   │  Background │      Content          │
│  (UI/控制)  │  (配置)     │  (服务)     │      (DOM交互)        │
├─────────────┼─────────────┼─────────────┼───────────────────────┤
│src/sidepanel.ts│src/options.ts│src/background.ts│  src/content.ts   │
│sidepanel.html │options.html │             │                       │
└──────┬──────┴──────┬──────┴──────┬──────┴───────────┬───────────┘
       │             │             │                  │
       │  chrome.storage.local     │                  │
       ├───────────────────────────┤                  │
       │                           │                  │
       │    chrome.runtime.sendMessage                │
       └───────────────────────────┴──────────────────┘
                      │
              ┌───────┴───────┐
              │src/utils/idb.ts│
              │  (IndexedDB)  │
              └───────────────┘
```

## 3. 模块职责

| 模块 | 文件 | 职责 |
|------|------|------|
| **SidePanel** | src/sidepanel.ts + sidepanel.html | 任务加载、队列管理、进度显示、Tab生命周期 |
| **Options** | src/options.ts + options.html | 目录选择、超时/轮询参数配置 |
| **Background** | src/background.ts | 文件系统操作、下载检测、哈希去重、宽高比验证 |
| **Content** | src/content.ts | Gemini页面DOM交互、输入提示词、点击下载 |
| **Utils** | src/utils/idb.ts | IndexedDB封装，存储目录句柄 |

## 4. 核心流程

### 4.1 任务执行流程
```
[SidePanel] 加载JSON任务列表
     │
     ▼
[SidePanel] 过滤已存在文件 (LIST_ALL_FILES)
     │
     ▼
[SidePanel] 创建/激活 Gemini Tab
     │
     ▼
[SidePanel] 注入 content.js ──────────────────────┐
     │                                            │
     ▼                                            ▼
[Content] 等待页面稳定              [Background] 处理消息
     │
     ▼
[Content] 写入提示词 → 点击发送
     │
     ▼
[Content] 等待图像生成 (轮询检测下载按钮)
     │
     ▼
[Content] 点击下载按钮
     │
     ▼
[Content] 发送 WAIT_AND_RENAME ──► [Background]
                                        │
                                        ▼
                               轮询检测新文件
                                        │
                                        ▼
                               验证宽高比 (16:9)
                                        │
                                        ▼
                               计算哈希去重
                                        │
                                        ▼
                               移动并重命名文件
                                        │
     ┌──────────────────────────────────┘
     ▼
[Content] 发送 TASK_COMPLETE ──► [SidePanel]
     │
     ▼
[SidePanel] 关闭Tab → 重新创建 → 下一个任务
```

### 4.2 消息协议

| Action | 发送方 | 接收方 | 说明 |
|--------|--------|--------|------|
| `CHECK_FILE_EXISTS` | Content | Background | 检查文件是否存在 |
| `WAIT_AND_RENAME` | Content | Background | 等待下载并重命名 |
| `LIST_ALL_FILES` | SidePanel | Background | 列出所有已有文件 |
| `FOCUS_TAB` | Content | Background | 聚焦当前Tab |
| `TASK_COMPLETE` | Content | SidePanel | 任务完成通知 |
| `TASK_ERROR` | Content | SidePanel | 任务错误通知 |
| `UPDATE_STATUS` | Content | SidePanel | 状态更新 |
| `RESET_STATE` | SidePanel | Background | 重置后台状态 |

## 5. 数据存储

### 5.1 chrome.storage.local
- `loadedTasks` - 任务列表
- `currentTask` - 当前执行任务
- `lockedConversationUrl` - 锁定的会话URL
- `settings_*` - 各类超时/轮询配置

### 5.2 IndexedDB (via src/utils/idb.ts)
- `sourceHandle` - 下载源目录句柄
- `outputHandle` - 输出目录句柄

## 6. 配置参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| generationTimeout | 300s | 图像生成超时 |
| downloadTimeout | 120s | 下载等待超时 |
| pageLoadTimeout | 30s | 页面加载超时 |
| stepDelay | 1s | 操作步骤间隔 |
| taskInterval | 2s | 任务间隔 |
| pollInterval | 1s | 统一轮询间隔（输入/发送/生成/下载） |
