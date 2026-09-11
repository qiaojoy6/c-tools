//! 整屏 RGBA 帧按区域裁剪（区域相对显示器左上角，与捕获缓冲同坐标系）

use crate::types::RecordRegion;

/// 将区域夹紧到帧内，宽高对齐到偶数（H.264）；无效则返回 None
pub fn clamp_region(region: RecordRegion, frame_w: u32, frame_h: u32) -> Option<RecordRegion> {
    if frame_w == 0 || frame_h == 0 || region.width == 0 || region.height == 0 {
        return None;
    }
    if region.x >= frame_w || region.y >= frame_h {
        return None;
    }
    let mut w = region.width.min(frame_w - region.x);
    let mut h = region.height.min(frame_h - region.y);
    // yuv420 / libx264 需要偶数边长
    w &= !1;
    h &= !1;
    if w < 2 || h < 2 {
        return None;
    }
    Some(RecordRegion {
        x: region.x,
        y: region.y,
        width: w,
        height: h,
    })
}

/// 从整屏 RGBA 裁出区域；失败返回 None（调用方应跳过本帧或回退整屏）
pub fn crop_rgba(
    src: &[u8],
    src_w: u32,
    src_h: u32,
    region: RecordRegion,
) -> Option<(u32, u32, Vec<u8>)> {
    let r = clamp_region(region, src_w, src_h)?;
    let expected = (src_w as usize).saturating_mul(src_h as usize).saturating_mul(4);
    if src.len() < expected {
        return None;
    }
    let rw = r.width as usize;
    let rh = r.height as usize;
    let mut out = vec![0u8; rw * rh * 4];
    let src_stride = src_w as usize * 4;
    let dst_stride = rw * 4;
    let x0 = r.x as usize * 4;
    for row in 0..rh {
        let src_off = (r.y as usize + row) * src_stride + x0;
        let dst_off = row * dst_stride;
        out[dst_off..dst_off + dst_stride].copy_from_slice(&src[src_off..src_off + dst_stride]);
    }
    Some((r.width, r.height, out))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crop_2x2_from_4x4() {
        // 4x4，每像素 RGBA 递增便于校验
        let mut src = vec![0u8; 4 * 4 * 4];
        for i in 0..16 {
            src[i * 4] = i as u8;
        }
        let (w, h, out) = crop_rgba(
            &src,
            4,
            4,
            RecordRegion {
                x: 1,
                y: 1,
                width: 2,
                height: 2,
            },
        )
        .unwrap();
        assert_eq!((w, h), (2, 2));
        // (1,1)=5, (2,1)=6, (1,2)=9, (2,2)=10
        assert_eq!(out[0], 5);
        assert_eq!(out[4], 6);
        assert_eq!(out[8], 9);
        assert_eq!(out[12], 10);
    }
}
