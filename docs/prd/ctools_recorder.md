# 录屏技术方案

本文档描述 **recorder-core** 当前实现，以及后续可优化点。产品功能清单见 `docs/prd/README.md`（只记有什么，不写实现细节）。

---

## 1. 整体架构

```
Electron UI / 悬浮条 / 框选遮罩
  → preload IPC
  → 主进程 host（启停、权限、另存为）
  → napi-rs（.node，同进程加载，复用 macOS TCC）
  → recorder-core（纯 Rust）
       ├─ 画面采集（SCK / xcap）
       ├─ 音频采集（SCK 同源 / flexaudio）
       ├─ 音画对齐（CaptureClock / av_sync）
       └─ ffmpeg sidecar（编码 + 混流）
```

### 成片流水线

1. 采集线程写 **临时视频** `*.video.tmp.mp4`（仅 H.264，无音轨）  
2. 采集线程写 **临时音频** `*.audio.tmp.wav`（48k / 立体声 PCM）  
3. 停录：音频片头裁切 + 时长对齐到视频 CFR  
4. ffmpeg **mux** → 最终 MP4（视频 copy，音频 AAC）  
5. 默认删除临时文件（`RECORDER_KEEP_TEMP=1` 可保留）

### 模块与文件

| 模块 | 路径 | 职责 |
|------|------|------|
| 调度 | `pipeline.rs` | 启停、暂停、选路径（SCK / xcap）、进度事件 |
| mac 捕获 | `sck_capture.rs` | ScreenCaptureKit 同源画面 + 系统声 |
| 音频 | `audio.rs` | flexaudio 麦 / 环回；写入侧补静音；混音收尾 |
| 共享时钟 | `capture_clock.rs` | xcap/Windows：首视频帧锚定 |
| 停录对齐 | `av_sync.rs` | 片头 trim + `apad`/`atrim` 贴合 CFR 时长 |
| 回声 | `aec.rs` | 麦+系统同时开时简易回声消除 |
| 编码 | `encoder.rs` | raw RGBA → x264；mux |
| 裁剪 | `crop.rs` | 区域录屏 RGBA crop |
| 设备 | `screen.rs` / `types.rs` | 屏幕枚举、清晰度档位、配置 |

---

## 2. Rust 对外导出的方法

上层通过 **recorder-core**（纯 Rust）→ **recorder-napi**（`.node`）暴露给 Electron 主进程。进程内单例 `Recorder`，全局一份状态。

### 2.1 recorder-core 公开 API

实现见 `native-rs/recorder-core`（`lib.rs` 再导出）。

#### 设备枚举

| 方法 | 说明 |
|------|------|
| `list_screens() -> Result<Vec<DeviceInfo>>` | 枚举显示器；`width`/`height` 为物理像素；`is_primary` 标主屏 |
| `list_mics() -> Result<Vec<DeviceInfo>>` | 枚举麦克风（排除虚拟环回名，避免与系统声双录） |
| `list_system_outputs() -> Result<Vec<DeviceInfo>>` | 枚举系统环回输出；附带虚拟声卡（`id` 常带 `virt:` 前缀） |

#### `Recorder` 生命周期

| 方法 | 说明 |
|------|------|
| `Recorder::new()` | 创建调度器 |
| `set_event_callback(EventCallback)` | 注册事件回调（`Arc<dyn Fn(RecorderEvent) + Send + Sync>`） |
| `state() -> RecorderState` | 当前状态：`Idle` / `Recording` / `Paused` / `Stopping` |
| `start(RecordConfig) -> Result<()>` | **非阻塞**开录；已在录制中则 `AlreadyRecording` |
| `pause() -> Result<()>` | 软暂停：音画不写盘，成片时间轴不推进 |
| `resume() -> Result<()>` | 从暂停恢复 |
| `stop() -> Result<()>` | 停录并 **join** 采集线程；录制中/暂停中均可；结束后状态回 `Idle` |
| `set_mic_enabled(bool) -> Result<()>` | 录制中实时开关麦（关=写静音，开=真实采样） |
| `set_system_audio_enabled(bool) -> Result<()>` | 录制中实时开关系统声（同上） |

#### `RecordConfig` 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `screen_id` | `Option<String>` | 目标显示器；空=主屏 |
| `enable_mic` | `bool` | 开录时麦是否有声（内部转 mute 标志；默认 true） |
| `enable_system_audio` | `bool` | 开录时系统声是否有声（默认 true） |
| `mic_device_id` | `Option<String>` | 麦克风设备 id |
| `system_device_id` | `Option<String>` | 系统环回 / 虚拟声卡 id |
| `fps` | `u32` | 帧率；0 当 30；上限 60 |
| `quality` | `VideoQuality` | `Original` / `Ultra` / `Smooth` |
| `output_path` | `String` | 最终 MP4 **绝对路径**（必填） |
| `ffmpeg_path` | `Option<String>` | ffmpeg 可执行路径；空则 PATH / 打包路径解析 |
| `region` | `Option<RecordRegion>` | 相对显示器的裁剪区（物理像素）；`width/height < 2` 视为整屏 |

`RecordRegion`：`{ x, y, width, height }`（u32，相对所选显示器左上角）。

#### 事件 `RecorderEvent`（serde tag = `type`，camelCase）

| type | 字段 | 说明 |
|------|------|------|
| `stateChanged` | `state` | 状态变更 |
| `progress` | `elapsedMs` | 未暂停累计时长（毫秒） |
| `error` | `message` | 采集/编码等错误（部分可继续无声录屏） |
| `finished` | `outputPath` | 成片路径（mux 或仅视频落盘后） |

### 2.2 recorder-napi → JS 方法名

实现见 `native-rs/recorder-napi/src/lib.rs`。主进程 `require` `.node` 后调用：

| JS 方法 | 对应 core | 说明 |
|---------|-----------|------|
| `listScreens()` | `list_screens` | 返回 `DeviceInfoJs[]` |
| `listMics()` | `list_mics` | 同上 |
| `listSystemOutputs()` | `list_system_outputs` | 同上 |
| `onEvent(callback)` | `set_event_callback` | 注册 TSFN；payload 为事件对象（camelCase） |
| `startRecord(config)` | `Recorder::start` | `RecordConfigJs`；布尔字段可省略（默认 true）；`quality` 为 `"original"\|"ultra"\|"smooth"` |
| `stopRecord()` | `stop` | |
| `pauseRecord()` | `pause` | |
| `resumeRecord()` | `resume` | |
| `setMicEnabled(enabled)` | `set_mic_enabled` | |
| `setSystemAudioEnabled(enabled)` | `set_system_audio_enabled` | |
| `getState()` | `state` | 返回字符串：`idle` / `recording` / `paused` / `stopping` |

`DeviceInfoJs`：`{ id, name, deviceType, width, height, isPrimary }`，其中 `deviceType` 为 `"screen" | "mic" | "systemAudio"`。

产品侧再经 IPC 包一层（`window.api.recorder`），字段语义与上表一致；UI/托盘细节见 `docs/prd/README.md`。

---

## 3. 画面 + 系统声（按平台）

### 3.1 macOS（优先）

| 项 | 方案 |
|----|------|
| API | **ScreenCaptureKit**（crates.io `screencapturekit` 0.3，**MIT**） |
| 流 | 同一条 `SCStream`：画面 + `captures_audio` |
| 系统声 | 同源轨；`excludesCurrentProcessAudio` 排除本进程 |
| 分辨率 | 缓冲用 `CGDisplayModeGetPixelWidth/Height`（物理像素）；**不用** `CGDisplayPixelsWide`（Retina 下可能仍是逻辑点 → 画面挤角+黑边） |
| 区域 | 上层 `region` = 物理像素；`sourceRect` = 逻辑点；`scales_to_fit(false)` |
| 色彩 | 强制 sRGB 色彩空间，再进 bt709 / yuv420p 编码 |
| 限帧 | `minimumFrameInterval` + 墙钟 CFR：无脏帧/Idle 时仍按 fps 写入当前画面，进度按墙钟推进（避免静止时段成片短于系统声/麦） |
| 麦克风 | 仍走 **flexaudio** Mic（与 SCK 系统声分轨） |
| 失败 | 回退 **xcap + flexaudio Process Tap / 虚拟声卡** |

SCK 路径 **不传** `CaptureClock`：音画已共享 CMSampleBuffer 时间基；系统声片头按 **SCK 启动时刻 → 首视频帧** 裁切，**不能**用麦会话 `started_at`（会多裁真实系统声，尾部再被补静音 →「开头没声」）。

### 3.2 Windows（主路径）/ 全平台 xcap 回退

| 项 | 方案 |
|----|------|
| 画面 | **xcap** `video_recorder`（优先）；失败则 `capture_image` 轮询 |
| 系统声 | **flexaudio** `SystemLoopback` |
| Windows 环回 | WASAPI **事件驱动**（`LOOPBACK \| EVENTCALLBACK`，flexaudio 已实现；无需再「改轮询为事件」） |
| mac 回退环回 | CoreAudio Process Tap；失败 → BlackHole / OrayVirtual 等虚拟声卡作 Mic |
| 限帧 | 按目标 fps 墙钟丢帧，避免 60fps 灌入 `-r 30` 拉长时间轴 |
| 同步 | `CaptureClock` 首帧锚定 + PTS/墙钟补静音 + 停录 CFR 对齐（见 §5） |

---

## 4. 麦克风与混音

| 项 | 方案 |
|----|------|
| 采集 | flexaudio `SourceKind::Mic` → hound WAV（48k / 2ch） |
| 实时开关 | mute 时写 0，抽干队列，保持与画面时间轴等长 |
| 暂停 | 丢弃采样不写盘；推进 PTS/dropped 游标，恢复时不把暂停当断流 |
| 设备 | 枚举排除虚拟环回名，避免与系统声双录叠音 |
| 麦+系统 | 停录前简易 AEC（`aec.rs`，以系统声为参考）；无明显相关则跳过 → `amix` |
| 系统轨听感 | ffmpeg 轻微 highshelf + volume + alimiter（环回常偏闷偏小） |

---

## 5. 音画同步（当前实现）

### 5.1 问题背景（已踩过的坑）

- 视频按时长 **CFR**（`frames_written / fps`），音频按 **采样计数**，两套时钟各自跑会漂。  
- 环回欠载 / Process Tap 空窗 / 丢块若不补静音 → 音频偏短，旧 mux `-shortest` 会裁视频或听感「声画不同步」。  
- 误用 `asetrate`、错误 Retina 尺寸、强制 `in_range=full:out_range=tv` 等会带来变调、黑边、发暗。

### 5.2 分层策略

```
写入侧（实时）          停录侧（定长）           混流
─────────────────      ─────────────────       ────────
补静音跟墙钟/PTS        裁片头 + 对齐 CFR         视频 copy
（不断时间轴）          （贴合 frames/fps）       音频 AAC
                                               不用 -shortest
```

| 路径 | 实时写入 | 停录 |
|------|----------|------|
| **macOS SCK** | 系统声按同源 PTS 空洞补静音；麦用 flexaudio wall-clock | 系统声按 `sck_epoch→first_video` 裁片头；再 `align_wav_to_duration` |
| **Windows / xcap** | `CaptureClock`：首视频帧后才按墙钟补欠载；`dropped_before` / PTS 空洞补静音；Windows **连续块也查 PTS 空洞**（不依赖 DISCONTINUITY） | 按 `session.started_at→first_video` 裁片头；再对齐 CFR |

### 5.3 CaptureClock（仅 xcap）

- 首帧 `write_rgba` 成功时 `mark_first_video()`。  
- 音频线程检测到锚点后：暂停累计清零；欠载比较用「锚点后采样数」，避免片头掩盖断流。  
- 锚点前：不按墙钟狂补静音（减少「先垫静音再被 trim」）。

### 5.4 视频编码与时长

- stdin raw RGBA → libx264，**CFR** `-r fps`。  
- 清晰度：原画 scale=1 CRF18 / 超清 0.75 CRF22 / 流畅 0.5 CRF28。  
- 缩放：`lanczos+accurate_rnd+full_chroma_int`；色彩 `in_range=full:out_range=full` + `color_range=pc`（减轻发暗）。  
- **成片音画时长以视频 CFR 为准**；音频强制贴合后再 mux。

---

## 6. 依赖与许可注意

| 依赖 | 用途 | 备注 |
|------|------|------|
| screencapturekit 0.3 | mac 同源音画 | MIT |
| xcap 0.9 | 屏幕捕获 / Windows 主路径 | |
| flexaudio 0.2 | 麦 + 环回（含 WASAPI 事件驱动） | 内部 rubato SRC → 48k，WAV 头勿再乱改 asetrate |
| hound | WAV 读写 | |
| ffmpeg-static | 编码 / 混流 sidecar | 打包进 `Resources/bin` |
| napi-rs | Electron 同进程桥 | |

**不要**直接接入 Cap 的 `cap-recording` 等 **AGPL** 整栈；可参考思路，自研或只用 MIT 组件。

---

## 7. 已知限制

1. 视频仍是 **CFR 灌帧**，单帧没有写入真实捕获 PTS（mux 时间轴 = 帧序号 / fps）。  
2. Windows 仍是 **xcap 画面 + WASAPI 分源**，不是 WGC「同会话」音画；同步靠时钟与补静音，极端负载下仍可能有几十毫秒级漂移（停录对齐兜底）。  
3. yuv420 编码无法完全消除细文字彩边；原画已尽量保色度。  
4. AEC 为离线简易相关/增益估计，非 WebRTC 级实时 AEC。  
5. mac Process Tap 依赖系统隐私授权；无权限时靠虚拟声卡兜底，体验不如 SCK。

---

## 8. 后续优化点

按优先级大致排序（未排期，供迭代选用）：

### P1 — 同步与 Windows

- [ ] **Windows.Graphics.Capture（WGC）+ WASAPI QPC 同源锚定**  
  接近 Cap 的 Windows 方案：捕获时间戳与音频用同一性能计数器对齐，减少「分源 + 事后 pad」依赖。  
- [ ] **视频帧打真实 PTS**（捕获墙钟 / QPC / SCK PTS）  
  编码端 VFR 或按 PTS 插值，替代纯 CFR `frames/fps`，停录对齐更准。  
- [ ] **停录软拉伸**（小偏差用 `atempo` / rubberband，大偏差才 pad/trim）  
  当前一律 `apad`/`atrim`，对「全程轻微采样率漂移」不够优雅。  
- [ ] **Windows 实录回归清单**  
  长录、暂停、静音开关、仅麦/仅系统、高 CPU、多显示器、区域录屏。

### P2 — 画质与编码

- [ ] 可选 **硬件编码**（VideoToolbox / QSV / NVENC），降 CPU、提高帧率稳定性。  
- [ ] 原画档评估 **444 / 更高码率** 或「几乎无损」档（体积换清晰度）。  
- [ ] SCK / 编码色彩管线再校准（Display P3 → sRGB → bt709 是否还有可感偏差）。

### P3 — 音频体验

- [ ] 实时 AEC / 降噪（或接入系统 Voice Processing）；替换停录后简易 AEC。  
- [ ] 系统声响度自动归一（当前固定 highshelf + volume）。  
- [ ] 分轨导出选项（成片外另存 mic/sys WAV，便于后期）。

### P4 — 工程与产品

- [ ] 采集指标上报（欠载次数、gap silence ms、对齐 delta）便于线上诊断。  
- [ ] 单元/集成测试：`av_sync`、补静音、CFR 对齐边界；CI 上 Windows runner 烟雾测。  
- [ ] 明确「保留临时文件 / 调试日志」开关进设置，而不仅是环境变量。

### 明确不做 / 暂缓

- 为「事件驱动」重写 WASAPI（flexaudio 已是事件模式）。  
- 引入 Cap AGPL 录制栈。  
- 在 macOS SCK 路径强行挂 `CaptureClock`（会干扰同源时间基与片头裁切语义）。

---

## 9. 本地构建

```bash
bash scripts/build-native.sh   # → native/recorder.*.node
npm run build:native           # 若已配置同等脚本
```

调试对齐时可：`RECORDER_KEEP_TEMP=1` 保留 `video.tmp.mp4` / `audio.tmp.wav`，用 ffprobe 对比时长。
