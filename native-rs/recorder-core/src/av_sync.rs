//! 音画时长对齐：片头裁切 + 欠载补静音后的最终 WAV 贴合视频 CFR 时长

use crate::RecorderError;
use hound::WavReader;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

/// 读取 WAV 时长（秒）；损坏或空文件返回 0
pub fn wav_duration_secs(path: &Path) -> f64 {
    let Ok(reader) = WavReader::open(path) else {
        return 0.0;
    };
    let rate = reader.spec().sample_rate.max(1) as f64;
    reader.duration() as f64 / rate
}

/// 裁掉 WAV 片头 `lead_secs`（音频早于首视频帧启动时用）
pub fn trim_wav_lead(
    ffmpeg_bin: &str,
    path: &Path,
    lead_secs: f64,
) -> Result<(), RecorderError> {
    if lead_secs <= 0.02 {
        return Ok(());
    }
    let cur = wav_duration_secs(path);
    if cur <= lead_secs + 0.05 {
        eprintln!(
            "[recorder-av-sync] skip lead trim: wav={cur:.3}s lead={lead_secs:.3}s"
        );
        return Ok(());
    }

    let tmp = sibling(path, "lead.tmp.wav");
    let _ = std::fs::remove_file(&tmp);
    let start = format!("{lead_secs}");
    let out = Command::new(ffmpeg_bin)
        .args(["-hide_banner", "-y", "-ss"])
        .arg(&start)
        .arg("-i")
        .arg(path.as_os_str())
        .args(["-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2"])
        .arg(tmp.as_os_str())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| RecorderError::Audio(format!("lead trim spawn: {e}")))?;

    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        let _ = std::fs::remove_file(&tmp);
        eprintln!("[recorder-av-sync] lead trim failed, keep original: {err}");
        return Ok(());
    }

    std::fs::rename(&tmp, path)
        .or_else(|_| std::fs::copy(&tmp, path).and_then(|_| std::fs::remove_file(&tmp)))
        .map_err(RecorderError::Io)?;

    let after = wav_duration_secs(path);
    eprintln!(
        "[recorder-av-sync] trimmed lead {lead_secs:.3}s: {cur:.3}s → {after:.3}s"
    );
    Ok(())
}

/// 将 WAV 时长对齐到目标秒数：偏短则尾部补静音，偏长则裁剪
///
/// 偏差小于 `slack_secs` 时跳过，避免无意义的二次编码。
pub fn align_wav_to_duration(
    ffmpeg_bin: &str,
    path: &Path,
    target_secs: f64,
    slack_secs: f64,
) -> Result<(), RecorderError> {
    if target_secs <= 0.05 {
        return Ok(());
    }
    let cur = wav_duration_secs(path);
    if cur <= 0.0 {
        return Ok(());
    }
    let delta = target_secs - cur;
    if delta.abs() <= slack_secs {
        eprintln!(
            "[recorder-av-sync] wav={cur:.3}s target={target_secs:.3}s delta={delta:.3}s (skip)"
        );
        return Ok(());
    }

    let tmp = sibling(path, "align.tmp.wav");
    let _ = std::fs::remove_file(&tmp);

    // 先 apad 到至少目标长，再 atrim 裁到精确时长（偏长/偏短统一路径）
    let af = format!("apad=whole_dur={target_secs},atrim=0:{target_secs}");
    let out = Command::new(ffmpeg_bin)
        .args(["-hide_banner", "-y", "-i"])
        .arg(path.as_os_str())
        .args(["-af", &af, "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2"])
        .arg(tmp.as_os_str())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| RecorderError::Audio(format!("align spawn: {e}")))?;

    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        let _ = std::fs::remove_file(&tmp);
        eprintln!("[recorder-av-sync] align failed, keep original: {err}");
        return Ok(());
    }

    std::fs::rename(&tmp, path).or_else(|_| {
        std::fs::copy(&tmp, path).and_then(|_| std::fs::remove_file(&tmp))
    }).map_err(RecorderError::Io)?;

    let after = wav_duration_secs(path);
    eprintln!(
        "[recorder-av-sync] aligned wav {cur:.3}s → {after:.3}s (target={target_secs:.3}s)"
    );
    Ok(())
}

fn sibling(path: &Path, suffix: &str) -> PathBuf {
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("audio");
    path.with_file_name(format!("{stem}.{suffix}"))
}
