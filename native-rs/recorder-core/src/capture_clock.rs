//! 录制会话共享时钟：首视频帧锚定后，音频按相对墙钟补欠载
//!
//! 仅供 xcap 路径（Windows 主路径 / macOS SCK 失败回退）使用；
//! macOS SCK 同源轨自有时间基，不传入此时钟。

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

/// 会话级单调时钟：`session_start` + 可选「首视频帧」锚点
pub struct CaptureClock {
    session_start: Instant,
    /// 0 = 尚未写出首帧；否则为相对 `session_start` 的纳秒（至少为 1）
    first_video_ns: AtomicU64,
}

impl CaptureClock {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            session_start: Instant::now(),
            first_video_ns: AtomicU64::new(0),
        })
    }

    /// 记录首帧写出时刻（仅首次生效）
    pub fn mark_first_video(&self) {
        let ns = self.session_start.elapsed().as_nanos() as u64;
        let _ = self.first_video_ns.compare_exchange(
            0,
            ns.max(1),
            Ordering::SeqCst,
            Ordering::SeqCst,
        );
    }

    pub fn has_first_video(&self) -> bool {
        self.first_video_ns.load(Ordering::SeqCst) != 0
    }

    /// 自首视频帧起的墙钟时长（未扣暂停）；首帧未到则 None
    pub fn elapsed_since_first_video(&self) -> Option<Duration> {
        let fv = self.first_video_ns.load(Ordering::SeqCst);
        if fv == 0 {
            return None;
        }
        let since_start = self.session_start.elapsed();
        Some(since_start.saturating_sub(Duration::from_nanos(fv)))
    }
}
