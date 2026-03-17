# Handy-VHS frei0r Plugin

VHS effect plugin for video editors (Shotcut, Kdenlive, etc.)

## Build

```bash
mkdir build
cd build
cmake ..
make
```

## Install

Copy `handy_vhs.so` (Linux), `handy_vhs.dylib` (macOS), or `handy_vhs.dll` (Windows) to your frei0r plugin directory:

- Linux: `/usr/lib/frei0r-1/` or `~/.frei0r-1/`
- macOS: `/usr/local/lib/frei0r-1/` or `~/.frei0r-1/`
- Windows: `C:\Program Files\frei0r\` or alongside the application

## Parameters

| Parameter | Range | Description |
|------------|-------|-------------|
| Apply JPEG | 0-1 | Enable JPEG artifacts |
| JPEG Quality | 0-1 | JPEG quality (mapped to 1-100) |
| Apply Ringing | 0-1 | Enable ringing effect |
| Sharpen Amount | 0-1 | Sharpen intensity (mapped to 0-10) |
| Black Crush | 0-1 | Black crush level (mapped to 0-50) |
| White Blowout | 0-1 | White blowout level (mapped to 200-255) |
| Blur | 0-1 | Luminance blur |
| Chroma Shift | 0-1 | Chroma shift X (mapped to 0-15) |
| Luma Noise | 0-1 | Luminance noise (mapped to 0-0.1) |
| Chroma Noise | 0-1 | Chroma noise (mapped to 0-0.1) |
| Jitter Amp | 0-1 | Jitter amplitude (mapped to 0-5) |
| Jitter Freq | 0-1 | Jitter frequency (mapped to 0-0.2) |
| Head Switch | 0-1 | Head switch rows (mapped to 0-50) |
| Dropout Count | 0-1 | Dropout count (mapped to 0-50) |
| Apply Color Cast | 0-1 | Enable color cast |
| Scanline Weight | 0-1 | Scanline brightness (mapped to 0.5-1.0) |
| Apply Scanlines | 0-1 | Enable scanlines |

## Effects

- **Color Cast**: Adjusts RGB color balance
- **Blur**: Luminance blur for analog softness
- **Chroma Shift**: Shifts color channel horizontally
- **Noise**: Adds analog video noise
- **Ringing**: Oversharpen ghosting effect
- **Tone Mapping**: Crushes blacks, blows out whites
- **Jitter**: Horizontal wobble
- **Head Switch**: Bottom screen noise/distortion
- **Dropouts**: Horizontal scratch artifacts
- **Scanlines**: CRT line effect
- **JPEG**: Block compression artifacts