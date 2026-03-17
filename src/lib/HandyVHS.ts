export interface VHSParams {
  apply_strong_ringing: boolean;
  sharpen_amount: number;
  sharpen_size: number;
  tone_low: number;
  tone_high: number;
  cutoff_y: number;
  cutoff_i: number;
  cutoff_q: number;
  chroma_shift_x: number;
  noise_intensity_y: number;
  noise_intensity_c: number;
  jitter_freq: number;
  jitter_amp: number;
  head_switch_rows: number;
  head_switch_pull: number;
  head_switch_noise: number;
  dropout_count: number;
  dropout_max_len: number;
  dropout_noise_freq: number;
  apply_color_cast: boolean;
  cast_r: number;
  cast_g: number;
  cast_b: number;
  apply_scanlines: boolean;
  scanline_weight: number;
  vhs_resolution: number;
}

const defaultParams: VHSParams = {
  apply_strong_ringing: true,
  sharpen_amount: 2.6,
  sharpen_size: 2,
  tone_low: 17,
  tone_high: 232,
  cutoff_y: 0.73,
  cutoff_i: 0.03,
  cutoff_q: 0.03,
  chroma_shift_x: 4,
  noise_intensity_y: 0.008,
  noise_intensity_c: 0.023,
  jitter_freq: 0.05,
  jitter_amp: 0.5,
  head_switch_rows: 4,
  head_switch_pull: 30.0,
  head_switch_noise: 0.40,
  dropout_count: 2,
  dropout_max_len: 80,
  dropout_noise_freq: 0.8,
  apply_color_cast: true,
  cast_r: 0.99,
  cast_g: 1.07,
  cast_b: 0.93,
  apply_scanlines: true,
  scanline_weight: 0.91,
  vhs_resolution: 0,
};

type RNG = () => number;

export class HandyVHS {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private _originalImageData: ImageData | null = null;
  params: VHSParams;
  private rng: RNG;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.params = { ...defaultParams };
    this.rng = this._createRNG();
  }

  private _createRNG(seed: number = Date.now()): RNG {
    let s = seed;
    return () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }

  loadImage(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const maxDim = 1280;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.floor(w * ratio);
          h = Math.floor(h * ratio);
        }
        this.canvas.width = w;
        this.canvas.height = h;
        this.ctx.drawImage(img, 0, 0, w, h);
        this._originalImageData = this.ctx.getImageData(0, 0, w, h);
        resolve();
      };
      img.onerror = reject;
      img.src = src;
    });
  }

  set originalImageData(data: ImageData | null) {
    this._originalImageData = data;
  }

  get originalImageData(): ImageData | null {
    return this._originalImageData;
  }

  setParams(params: Partial<VHSParams>): void {
    Object.assign(this.params, params);
  }

  process(): string | null {
    if (!this._originalImageData) return null;

    const origWidth = this.canvas.width;
    const origHeight = this.canvas.height;
    this.rng = this._createRNG(Date.now());

    let vhsWidth: number;
    if (this.params.vhs_resolution <= 0) {
      const aspectRatio = origWidth / origHeight;
      const targetHeight = Math.min(360, origHeight / 2);
      vhsWidth = Math.round(targetHeight * aspectRatio);
      vhsWidth = Math.max(200, Math.min(480, vhsWidth));
    } else {
      vhsWidth = Math.min(this.params.vhs_resolution, origWidth);
    }
    const scale = vhsWidth / origWidth;
    const vhsHeight = Math.round(origHeight * scale);

    const downsampled = this._downscale(this._originalImageData, origWidth, origHeight, vhsWidth, vhsHeight);
    const data = new Uint8ClampedArray(downsampled.data);
    const width = vhsWidth;
    const height = vhsHeight;

    if (this.params.apply_color_cast) {
      this._applyColorCast(data, width, height);
    }

    if (this.params.cutoff_y < 1.0) {
      this._applyLuminanceBlur(data, width, height);
    }

    if (this.params.chroma_shift_x > 0) {
      this._applyChromaShift(data, width, height);
    }

    if (this.params.noise_intensity_y > 0 || this.params.noise_intensity_c > 0) {
      this._applyNoise(data, width, height);
    }

    if (this.params.apply_strong_ringing) {
      this._applyRinging(data, width, height);
    }

    this._applyToneMapping(data, width, height);

    if (this.params.jitter_amp > 0) {
      this._applyJitter(data, width, height);
    }

    if (this.params.head_switch_rows > 0) {
      this._applyHeadSwitch(data, width, height);
    }

    if (this.params.dropout_count > 0) {
      this._applyDropouts(data, width, height);
    }

    const vhsImageData = new ImageData(data, width, height);
    const upscaled = this._upscale(vhsImageData, vhsWidth, vhsHeight, origWidth, origHeight);
    const finalData = new Uint8ClampedArray(upscaled.data);
    const finalWidth = origWidth;
    const finalHeight = origHeight;

    if (this.params.apply_scanlines) {
      this._applyScanlines(finalData, finalWidth, finalHeight);
    }

    const outputData = new ImageData(finalData, finalWidth, finalHeight);
    this.ctx.putImageData(outputData, 0, 0);
    return this.canvas.toDataURL('image/png');
  }

  private _downscale(imageData: ImageData, srcW: number, srcH: number, dstW: number, dstH: number): ImageData {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = dstW;
    tempCanvas.height = dstH;
    const tempCtx = tempCanvas.getContext('2d')!;

    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = srcW;
    srcCanvas.height = srcH;
    const srcCtx = srcCanvas.getContext('2d')!;
    srcCtx.putImageData(imageData, 0, 0);

    tempCtx.drawImage(srcCanvas, 0, 0, dstW, dstH);
    return tempCtx.getImageData(0, 0, dstW, dstH);
  }

  private _upscale(imageData: ImageData, srcW: number, srcH: number, dstW: number, dstH: number): ImageData {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = srcW;
    tempCanvas.height = srcH;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.putImageData(imageData, 0, 0);

    const dstCanvas = document.createElement('canvas');
    dstCanvas.width = dstW;
    dstCanvas.height = dstH;
    const dstCtx = dstCanvas.getContext('2d')!;

    dstCtx.imageSmoothingEnabled = true;
    dstCtx.imageSmoothingQuality = 'medium';
    dstCtx.drawImage(tempCanvas, 0, 0, dstW, dstH);

    return dstCtx.getImageData(0, 0, dstW, dstH);
  }

  private _applyColorCast(data: Uint8ClampedArray, _width: number, _height: number): void {
    const { cast_r, cast_g, cast_b } = this.params;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, data[i] * cast_r);
      data[i + 1] = Math.min(255, data[i + 1] * cast_g);
      data[i + 2] = Math.min(255, data[i + 2] * cast_b);
    }
  }

  private _rgbToYiq(r: number, g: number, b: number): { y: number; i: number; q: number } {
    return {
      y: 0.299 * r + 0.587 * g + 0.114 * b,
      i: 0.596 * r - 0.274 * g - 0.322 * b,
      q: 0.211 * r - 0.523 * g + 0.312 * b,
    };
  }

  private _yiqToRgb(y: number, i: number, q: number): { r: number; g: number; b: number } {
    return {
      r: Math.max(0, Math.min(255, y + 0.956 * i + 0.621 * q)),
      g: Math.max(0, Math.min(255, y - 0.272 * i - 0.647 * q)),
      b: Math.max(0, Math.min(255, y - 1.106 * i + 1.703 * q)),
    };
  }

  private _applyLuminanceBlur(data: Uint8ClampedArray, width: number, height: number): void {
    const blurRadius = Math.ceil((1 - this.params.cutoff_y) * 5);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sumR = 0, sumG = 0, sumB = 0, count = 0;

        for (let dx = -blurRadius; dx <= blurRadius; dx++) {
          const nx = Math.min(width - 1, Math.max(0, x + dx));
          const idx = (y * width + nx) * 4;
          sumR += data[idx];
          sumG += data[idx + 1];
          sumB += data[idx + 2];
          count++;
        }

        const idx = (y * width + x) * 4;
        data[idx] = Math.round(sumR / count);
        data[idx + 1] = Math.round(sumG / count);
        data[idx + 2] = Math.round(sumB / count);
      }
    }
  }

  private _applyChromaShift(data: Uint8ClampedArray, width: number, height: number): void {
    const shift = this.params.chroma_shift_x;
    const original = new Uint8ClampedArray(data);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const srcX = Math.min(width - 1, x + shift);
        const srcIdx = (y * width + srcX) * 4;

        const { y: lum } = this._rgbToYiq(original[idx], original[idx + 1], original[idx + 2]);
        const srcYiq = this._rgbToYiq(original[srcIdx], original[srcIdx + 1], original[srcIdx + 2]);

        const { r, g, b } = this._yiqToRgb(lum, srcYiq.i, srcYiq.q);
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
      }
    }
  }

  private _applyNoise(data: Uint8ClampedArray, width: number, height: number): void {
    const { noise_intensity_y, noise_intensity_c } = this.params;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;

        const { y: lum, i: chromI, q: chromQ } = this._rgbToYiq(data[idx], data[idx + 1], data[idx + 2]);

        const noiseY = (this.rng() - 0.5) * 2 * noise_intensity_y * 255;
        const noiseI = (this.rng() - 0.5) * 2 * noise_intensity_c * 100;
        const noiseQ = (this.rng() - 0.5) * 2 * noise_intensity_c * 100;

        const newY = Math.max(0, Math.min(255, lum + noiseY));
        const newI = chromI + noiseI;
        const newQ = chromQ + noiseQ;

        const { r, g, b } = this._yiqToRgb(newY, newI, newQ);
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
      }
    }
  }

  private _applyRinging(data: Uint8ClampedArray, width: number, height: number): void {
    const { sharpen_amount, sharpen_size } = this.params;
    const original = new Uint8ClampedArray(data);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;

        for (let c = 0; c < 3; c++) {
          const center = original[idx + c];
          let sum = 0;
          for (let dy = -sharpen_size; dy <= sharpen_size; dy++) {
            for (let dx = -sharpen_size; dx <= sharpen_size; dx++) {
              const nidx = ((y + dy) * width + (x + dx)) * 4 + c;
              sum += original[nidx];
            }
          }
          const neighbor = sum / ((sharpen_size * 2 + 1) ** 2);

          const ringing = center + (center - neighbor) * sharpen_amount;

          if (center < 60) {
            const ghost = Math.min(255, center + (255 - center) * 0.3 * sharpen_amount);
            data[idx + c] = Math.max(0, Math.min(255, ringing + (ghost - center) * 0.15));
          } else {
            data[idx + c] = Math.max(0, Math.min(255, ringing));
          }
        }
      }
    }
  }

  private _applyToneMapping(data: Uint8ClampedArray, _width: number, _height: number): void {
    const { tone_low, tone_high } = this.params;
    const low = tone_low;
    const high = Math.max(low + 1, tone_high);
    const scale = 255 / (high - low);

    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const v = data[i + c];
        const mapped = (v - low) * scale;
        data[i + c] = Math.max(0, Math.min(255, mapped));
      }
    }
  }

  private _applyJitter(data: Uint8ClampedArray, width: number, height: number): void {
    const { jitter_freq, jitter_amp } = this.params;
    const original = new Uint8ClampedArray(data);

    for (let y = 0; y < height; y++) {
      const phase = Math.sin(y * jitter_freq * Math.PI * 2) * jitter_amp;
      const offset = Math.round(phase);

      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const srcX = Math.max(0, Math.min(width - 1, x + offset));
        const srcIdx = (y * width + srcX) * 4;

        data[idx] = original[srcIdx];
        data[idx + 1] = original[srcIdx + 1];
        data[idx + 2] = original[srcIdx + 2];
      }
    }
  }

  private _applyHeadSwitch(data: Uint8ClampedArray, width: number, height: number): void {
    const { head_switch_rows } = this.params;
    if (head_switch_rows <= 0) return;

    const startY = height - head_switch_rows;
    const original = new Uint8ClampedArray(data);

    for (let y = startY; y < height; y++) {
      const progress = (y - startY) / head_switch_rows;
      const pull = Math.round(30 * progress * progress);
      const noiseIntensity = 0.4 * progress * progress;

      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const srcX = Math.max(0, Math.min(width - 1, x - pull));
        const srcIdx = (y * width + srcX) * 4;

        const baseR = original[srcIdx];
        const baseG = original[srcIdx + 1];
        const baseB = original[srcIdx + 2];

        if (progress > 0.5 && this.rng() < noiseIntensity) {
          const noise = this.rng() * 255;
          const blend = 0.3 + this.rng() * 0.4;
          data[idx] = Math.round(baseR * (1 - blend) + noise * blend);
          data[idx + 1] = Math.round(baseG * (1 - blend) + noise * blend);
          data[idx + 2] = Math.round(baseB * (1 - blend) + noise * blend);
        } else {
          data[idx] = baseR;
          data[idx + 1] = baseG;
          data[idx + 2] = baseB;
        }
      }
    }
  }

  private _applyDropouts(data: Uint8ClampedArray, width: number, height: number): void {
    const { dropout_count, dropout_max_len, dropout_noise_freq } = this.params;
    const original = new Uint8ClampedArray(data);

    for (let i = 0; i < dropout_count; i++) {
      const y = Math.floor(this.rng() * height);
      const startX = Math.floor(this.rng() * width);
      const len = Math.floor(this.rng() * dropout_max_len) + 10;

      for (let dx = 0; dx < len && startX + dx < width; dx++) {
        const x = startX + dx;
        const idx = (y * width + x) * 4;

        const originalR = original[idx];
        const originalG = original[idx + 1];
        const originalB = original[idx + 2];
        const originalBrightness = (originalR + originalG + originalB) / 3;

        let dropoutR: number, dropoutG: number, dropoutB: number;
        let blendFactor = 0.7 + this.rng() * 0.3;

        if (this.rng() < dropout_noise_freq) {
          if (this.rng() < 0.6) {
            const noise = this.rng() * 255;
            dropoutR = dropoutG = dropoutB = noise;
          } else {
            dropoutR = dropoutG = dropoutB = originalBrightness > 128 ? 255 : 0;
          }
        } else {
          const whiteLevel = originalBrightness > 128 ? 255 : 200;
          dropoutR = dropoutG = dropoutB = whiteLevel;
        }

        const edgeFade = Math.min(1, Math.min(dx, len - dx - 1) / 5);
        blendFactor *= edgeFade;

        data[idx] = Math.round(originalR * (1 - blendFactor) + dropoutR * blendFactor);
        data[idx + 1] = Math.round(originalG * (1 - blendFactor) + dropoutG * blendFactor);
        data[idx + 2] = Math.round(originalB * (1 - blendFactor) + dropoutB * blendFactor);
      }
    }
  }

  private _applyScanlines(data: Uint8ClampedArray, width: number, height: number): void {
    const { scanline_weight } = this.params;

    for (let y = 1; y < height; y += 2) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        data[idx] = Math.round(data[idx] * scanline_weight);
        data[idx + 1] = Math.round(data[idx + 1] * scanline_weight);
        data[idx + 2] = Math.round(data[idx + 2] * scanline_weight);
      }
    }
  }

  download(filename: string = 'handy_vhs_output.png'): void {
    const dataUrl = this.canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.click();
  }
}

export default HandyVHS;