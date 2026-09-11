//! 简易声学回声消除：用系统声作参考，从麦克风轨减去外放漏音，便于麦+系统声同时开。

use crate::RecorderError;
use hound::{SampleFormat, WavReader, WavSpec, WavWriter};
use std::path::Path;

const TARGET_RATE: u32 = 48_000;
/// 搜索最大延迟（外放→麦常见几十毫秒，留足余量）
const MAX_DELAY_MS: u32 = 180;
/// 归一化互相关低于此值视为无明显漏音（如耳机），跳过消除
const MIN_CORR: f32 = 0.18;
/// 分析段最长秒数（过长影响停录耗时）
const ANALYZE_SECS: f32 = 4.0;

/// 若检测到麦轨含系统声回授，则写入消除后的 mic；返回是否实际做了消除。
pub fn cancel_system_echo_from_mic(
    mic_path: &Path,
    sys_path: &Path,
    output: &Path,
) -> Result<bool, RecorderError> {
    let (mic_spec, mic) = read_pcm16(mic_path)?;
    let (sys_spec, sys) = read_pcm16(sys_path)?;
    if mic_spec.channels == 0 || sys_spec.channels == 0 {
        return Ok(false);
    }
    if mic_spec.sample_rate != TARGET_RATE || sys_spec.sample_rate != TARGET_RATE {
        eprintln!(
            "[recorder-aec] skip: unexpected rate mic={} sys={}",
            mic_spec.sample_rate, sys_spec.sample_rate
        );
        return Ok(false);
    }

    let mic_ch = mic_spec.channels as usize;
    let sys_ch = sys_spec.channels as usize;
    let mic_frames = mic.len() / mic_ch;
    let sys_frames = sys.len() / sys_ch;
    if mic_frames < TARGET_RATE as usize / 4 || sys_frames < TARGET_RATE as usize / 4 {
        return Ok(false);
    }

    let mic_mono = to_mono(&mic, mic_ch);
    let sys_mono = to_mono(&sys, sys_ch);
    let max_delay = ((TARGET_RATE * MAX_DELAY_MS) / 1000) as usize;
    let analyze_len = ((TARGET_RATE as f32) * ANALYZE_SECS) as usize;
    let (delay, corr) = estimate_delay_and_corr(&mic_mono, &sys_mono, max_delay, analyze_len);

    if corr < MIN_CORR {
        eprintln!("[recorder-aec] skip: low corr={corr:.3} (likely headphones / no bleed)");
        return Ok(false);
    }

    let gain = estimate_gain(&mic_mono, &sys_mono, delay, analyze_len).clamp(0.05, 1.35);
    eprintln!("[recorder-aec] apply delay={delay} samples corr={corr:.3} gain={gain:.3}");

    let cleaned = subtract_echo(&mic, mic_ch, &sys, sys_ch, delay, gain);
    write_pcm16(output, mic_spec, &cleaned)?;
    Ok(true)
}

fn read_pcm16(path: &Path) -> Result<(WavSpec, Vec<i16>), RecorderError> {
    let mut reader =
        WavReader::open(path).map_err(|e| RecorderError::Audio(format!("aec open: {e}")))?;
    let spec = reader.spec();
    if spec.sample_format != SampleFormat::Int || spec.bits_per_sample != 16 {
        return Err(RecorderError::Audio(format!(
            "aec expects pcm_s16le, got {:?}/{}bit",
            spec.sample_format, spec.bits_per_sample
        )));
    }
    let samples: Result<Vec<i16>, _> = reader.samples::<i16>().collect();
    let samples = samples.map_err(|e| RecorderError::Audio(format!("aec read: {e}")))?;
    Ok((spec, samples))
}

fn write_pcm16(path: &Path, spec: WavSpec, samples: &[i16]) -> Result<(), RecorderError> {
    let mut writer =
        WavWriter::create(path, spec).map_err(|e| RecorderError::Audio(format!("aec write: {e}")))?;
    for &s in samples {
        writer
            .write_sample(s)
            .map_err(|e| RecorderError::Audio(format!("aec sample: {e}")))?;
    }
    writer
        .finalize()
        .map_err(|e| RecorderError::Audio(format!("aec finalize: {e}")))?;
    Ok(())
}

fn to_mono(interleaved: &[i16], channels: usize) -> Vec<f32> {
    if channels == 0 {
        return Vec::new();
    }
    let frames = interleaved.len() / channels;
    let mut out = Vec::with_capacity(frames);
    for i in 0..frames {
        let mut acc = 0.0f32;
        for c in 0..channels {
            acc += interleaved[i * channels + c] as f32;
        }
        out.push(acc / channels as f32 / 32768.0);
    }
    out
}

/// 外放漏音：mic[t] ≈ voice + g * sys[t - delay]。在 delay∈[0,max] 找归一化相关最大者。
fn estimate_delay_and_corr(
    mic: &[f32],
    sys: &[f32],
    max_delay: usize,
    analyze_len: usize,
) -> (usize, f32) {
    let n = mic.len().min(sys.len()).min(analyze_len);
    if n < 1024 {
        return (0, 0.0);
    }
    // 降采样加速（~6kHz）
    const STEP: usize = 8;
    let mic_ds: Vec<f32> = mic[..n].iter().step_by(STEP).copied().collect();
    let sys_ds: Vec<f32> = sys[..n].iter().step_by(STEP).copied().collect();
    let max_d = (max_delay / STEP).min(mic_ds.len().saturating_sub(64));
    if max_d == 0 || sys_ds.len() < 64 {
        return (0, 0.0);
    }
    let win = (mic_ds.len() - max_d).min(sys_ds.len());
    if win < 64 {
        return (0, 0.0);
    }

    let sys_w = &sys_ds[..win];
    let sys_energy = energy(sys_w).max(1e-12);

    let mut best_delay = 0usize;
    let mut best_corr = 0.0f32;
    for d in 0..=max_d {
        // mic[d..] 对齐 sys[0..]：即假设麦比系统声晚 d 个降采样点
        let mic_w = &mic_ds[d..d + win];
        let mic_energy = energy(mic_w).max(1e-12);
        let mut dot = 0.0f32;
        for i in 0..win {
            dot += mic_w[i] * sys_w[i];
        }
        let corr = (dot / (mic_energy * sys_energy).sqrt()).abs();
        if corr > best_corr {
            best_corr = corr;
            best_delay = d * STEP;
        }
    }
    (best_delay, best_corr)
}

fn energy(xs: &[f32]) -> f32 {
    xs.iter().map(|x| x * x).sum()
}

/// 最小二乘：mic[i+delay] ≈ gain * sys[i]
fn estimate_gain(mic: &[f32], sys: &[f32], delay: usize, analyze_len: usize) -> f32 {
    let usable = mic
        .len()
        .saturating_sub(delay)
        .min(sys.len())
        .min(analyze_len.saturating_sub(delay));
    if usable < 256 {
        return 0.5;
    }
    let mut num = 0.0f32;
    let mut den = 0.0f32;
    for i in 0..usable {
        let s = sys[i];
        let mi = mic[i + delay];
        num += mi * s;
        den += s * s;
    }
    if den < 1e-12 {
        0.5
    } else {
        num / den
    }
}

/// cleaned[t] = mic[t] - gain * sys[t - delay]
fn subtract_echo(
    mic: &[i16],
    mic_ch: usize,
    sys: &[i16],
    sys_ch: usize,
    delay: usize,
    gain: f32,
) -> Vec<i16> {
    let mic_frames = mic.len() / mic_ch;
    let sys_frames = sys.len() / sys_ch;
    let mut out = Vec::with_capacity(mic.len());
    for i in 0..mic_frames {
        for c in 0..mic_ch {
            let m = mic[i * mic_ch + c] as f32;
            let echo = if i >= delay {
                let si = i - delay;
                if si < sys_frames {
                    let sc = c.min(sys_ch - 1);
                    sys[si * sys_ch + sc] as f32 * gain
                } else {
                    0.0
                }
            } else {
                0.0
            };
            let v = (m - echo).clamp(-32768.0, 32767.0);
            out.push(v as i16);
        }
    }
    out
}
