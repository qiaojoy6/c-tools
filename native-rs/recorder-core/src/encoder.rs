//! 通过 ffmpeg 子进程把 RGBA 原始帧打成 MP4；可选与 WAV 混流

use crate::RecorderError;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};

/// 编码会话：持有 ffmpeg stdin（仅视频）
pub struct FfmpegEncoder {
    child: Child,
    stdin: ChildStdin,
    width: u32,
    height: u32,
}

impl FfmpegEncoder {
    /// 启动 ffmpeg：从 stdin 读 rawvideo rgba，按清晰度档位缩放/CRF 输出 H.264 MP4（无音轨）
    pub fn start(
        ffmpeg_bin: &str,
        output: &Path,
        width: u32,
        height: u32,
        fps: u32,
        quality: crate::VideoQuality,
    ) -> Result<Self, RecorderError> {
        if width == 0 || height == 0 {
            return Err(RecorderError::InvalidConfig("screen size is zero".into()));
        }
        if let Some(parent) = output.parent() {
            std::fs::create_dir_all(parent).map_err(RecorderError::Io)?;
        }

        let w = width & !1;
        let h = height & !1;
        let size = format!("{w}x{h}");
        let fps_s = fps.max(1).to_string();
        let (scale, crf) = quality.encode_params();
        let crf_s = crf.to_string();

        // RGB 全范围 → YUV pc + bt709；默认 yuv420p 会压成 tv(白=235) 导致轻微发暗偏色
        // 原画只做色度抽样（不改分辨率）；非原画 lanczos 降采样
        // full_chroma_int 减轻文字边缘彩边（yuv420 无法完全消除）
        let (tw, th, scale_flags) = if (scale - 1.0).abs() < f32::EPSILON {
            (w, h, "accurate_rnd+full_chroma_int")
        } else {
            let tw = ((w as f32) * scale).round() as u32 & !1;
            let th = ((h as f32) * scale).round() as u32 & !1;
            (tw.max(2), th.max(2), "lanczos+accurate_rnd+full_chroma_int")
        };
        let vf = format!(
            "scale={tw}:{th}:flags={scale_flags}:in_range=full:out_range=full:out_color_matrix=bt709,format=yuv420p"
        );

        let mut cmd = Command::new(ffmpeg_bin);
        cmd.args([
            "-y",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgba",
            "-s",
            &size,
            "-r",
            &fps_s,
            "-i",
            "pipe:0",
            "-an",
            "-vf",
            &vf,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            &crf_s,
            "-pix_fmt",
            "yuv420p",
            "-color_range",
            "pc",
            "-colorspace",
            "bt709",
            "-color_primaries",
            "bt709",
            "-color_trc",
            "bt709",
            "-x264-params",
            "colorprim=bt709:transfer=bt709:colormatrix=bt709:fullrange=on",
            "-movflags",
            "+faststart",
        ])
        .arg(output.as_os_str())
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| {
            RecorderError::Encoder(format!("spawn ffmpeg failed ({ffmpeg_bin}): {e}"))
        })?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| RecorderError::Encoder("ffmpeg stdin missing".into()))?;

        Ok(Self {
            child,
            stdin,
            width: w,
            height: h,
        })
    }

    /// 写入一帧 RGBA；若尺寸不匹配则裁剪/填黑
    pub fn write_rgba(&mut self, width: u32, height: u32, rgba: &[u8]) -> Result<(), RecorderError> {
        let (tw, th) = (self.width, self.height);
        let expected = (tw as usize) * (th as usize) * 4;

        if width == tw && height == th && rgba.len() >= expected {
            self.stdin
                .write_all(&rgba[..expected])
                .map_err(|e| RecorderError::Encoder(format!("write frame: {e}")))?;
            return Ok(());
        }

        let mut buf = vec![0u8; expected];
        let copy_w = tw.min(width) as usize;
        let copy_h = th.min(height) as usize;
        for y in 0..copy_h {
            let src_off = y * (width as usize) * 4;
            let dst_off = y * (tw as usize) * 4;
            let src_end = src_off + copy_w * 4;
            if src_end <= rgba.len() {
                buf[dst_off..dst_off + copy_w * 4].copy_from_slice(&rgba[src_off..src_end]);
            }
        }
        self.stdin
            .write_all(&buf)
            .map_err(|e| RecorderError::Encoder(format!("write frame: {e}")))?;
        Ok(())
    }

    /// 关闭 stdin 并等待 ffmpeg 退出
    pub fn finish(mut self) -> Result<(), RecorderError> {
        drop(self.stdin);
        let status = self
            .child
            .wait()
            .map_err(|e| RecorderError::Encoder(format!("wait ffmpeg: {e}")))?;
        if !status.success() {
            let code = status.code().unwrap_or(-1);
            return Err(RecorderError::Encoder(format!(
                "ffmpeg exited with code {code}"
            )));
        }
        Ok(())
    }
}

/// 将无音轨视频 + WAV 混成最终 MP4
pub fn mux_video_audio(
    ffmpeg_bin: &str,
    video: &Path,
    audio_wav: &Path,
    output: &Path,
) -> Result<(), RecorderError> {
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent).map_err(RecorderError::Io)?;
    }

    let video_len = std::fs::metadata(video).map(|m| m.len()).unwrap_or(0);
    let audio_len = std::fs::metadata(audio_wav).map(|m| m.len()).unwrap_or(0);
    if video_len < 32 {
        return Err(RecorderError::Encoder(format!(
            "video temp too small ({video_len} bytes)"
        )));
    }
    if audio_len < 64 {
        return Err(RecorderError::Encoder(format!(
            "audio wav too small ({audio_len} bytes)"
        )));
    }

    // 音频已在停录时按视频 CFR 时长对齐，此处不再用 -shortest（避免残留偏差时误裁）
    // s16le WAV → AAC；优先 soxr，失败则回退默认重采样
    let af_candidates = [
        "aresample=resampler=soxr:precision=28:osr=48000",
        "anull",
    ];
    let mut last_err = String::new();
    for af in af_candidates {
        let mut cmd = Command::new(ffmpeg_bin);
        cmd.args(["-hide_banner", "-y", "-i"])
            .arg(video.as_os_str())
            .arg("-i")
            .arg(audio_wav.as_os_str())
            .args(["-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy"]);
        if af != "anull" {
            cmd.args(["-af", af]);
        }
        let out = cmd
            .args([
                "-c:a",
                "aac",
                "-b:a",
                "256k",
                "-ar",
                "48000",
                "-ac",
                "2",
                "-movflags",
                "+faststart",
            ])
            .arg(output.as_os_str())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .output()
            .map_err(|e| RecorderError::Encoder(format!("mux spawn failed: {e}")))?;

        if out.status.success() {
            return Ok(());
        }
        last_err = String::from_utf8_lossy(&out.stderr).chars().rev().take(800).collect::<String>().chars().rev().collect();
    }
    Err(RecorderError::Encoder(format!(
        "mux failed video={}B audio={}B: {last_err}",
        video_len, audio_len
    )))
}

/// 仅移动/复制视频到最终路径（无麦克风时）
pub fn finalize_video_only(video: &Path, output: &Path) -> Result<(), RecorderError> {
    if video == output {
        return Ok(());
    }
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent).map_err(RecorderError::Io)?;
    }
    if output.exists() {
        let _ = std::fs::remove_file(output);
    }
    match std::fs::rename(video, output) {
        Ok(()) => Ok(()),
        Err(_) => {
            std::fs::copy(video, output).map_err(RecorderError::Io)?;
            let _ = std::fs::remove_file(video);
            Ok(())
        }
    }
}

/// 同目录临时文件路径
pub fn sibling_temp(output: &Path, suffix: &str) -> PathBuf {
    let stem = output
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("recording");
    output.with_file_name(format!("{stem}.{suffix}"))
}

/// 解析 ffmpeg 路径
pub fn resolve_ffmpeg(configured: Option<&str>) -> Result<String, RecorderError> {
    if let Some(p) = configured.filter(|s| !s.is_empty()) {
        if Path::new(p).is_file() {
            return Ok(p.to_string());
        }
        return Err(RecorderError::Encoder(format!(
            "ffmpeg not found at configured path: {p}"
        )));
    }

    if which("ffmpeg").is_some() {
        return Ok("ffmpeg".into());
    }

    for candidate in [
        "/opt/homebrew/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
        "C:\\ffmpeg\\bin\\ffmpeg.exe",
    ] {
        if Path::new(candidate).is_file() {
            return Ok(candidate.into());
        }
    }

    Err(RecorderError::Encoder(
        "ffmpeg not found in PATH; install ffmpeg or set ffmpegPath".into(),
    ))
}

fn which(bin: &str) -> Option<String> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let full = dir.join(bin);
        if full.is_file() {
            return Some(full.to_string_lossy().into_owned());
        }
        #[cfg(windows)]
        {
            let exe = dir.join(format!("{bin}.exe"));
            if exe.is_file() {
                return Some(exe.to_string_lossy().into_owned());
            }
        }
    }
    None
}
