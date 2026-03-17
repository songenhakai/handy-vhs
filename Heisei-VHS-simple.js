class HeiseiVHS {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.originalImageData = null;
        this.params = {
            apply_jpeg: true,
            jpeg_quality: 100,
            apply_strong_ringing: true,
            sharpen_amount: 1.3,
            sharpen_size: 2,
            tone_low: 17,
            tone_high: 232,
            cutoff_y: 0.73,
            cutoff_i: 0.03,
            cutoff_q: 0.03,
            chroma_shift_x: 4,
            noise_intensity_y: 0.016,
            noise_intensity_c: 0.046,
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
            vhs_resolution: 200
        };
        this.rng = this._createRNG();
    }

    _createRNG(seed = Date.now()) {
        let s = seed;
        return () => {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            return s / 0x7fffffff;
        };
    }

    loadImage(src) {
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
                this.originalImageData = this.ctx.getImageData(0, 0, w, h);
                resolve();
            };
            img.onerror = reject;
            img.src = src;
        });
    }

    setParams(params) {
        Object.assign(this.params, params);
    }

    process() {
        if (!this.originalImageData) return null;

        const origWidth = this.canvas.width;
        const origHeight = this.canvas.height;
        this.rng = this._createRNG(Date.now());

        const vhsWidth = Math.min(this.params.vhs_resolution, origWidth);
        const scale = vhsWidth / origWidth;
        const vhsHeight = Math.round(origHeight * scale);

        const downsampled = this._downscale(this.originalImageData, origWidth, origHeight, vhsWidth, vhsHeight);
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

        if (this.params.apply_jpeg) {
            this._applyJPEGArtifacts(finalData, finalWidth, finalHeight);
        }

        const outputData = new ImageData(finalData, finalWidth, finalHeight);
        this.ctx.putImageData(outputData, 0, 0);
        return this.canvas.toDataURL('image/png');
    }

    _downscale(imageData, srcW, srcH, dstW, dstH) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = dstW;
        tempCanvas.height = dstH;
        const tempCtx = tempCanvas.getContext('2d');
        
        const srcCanvas = document.createElement('canvas');
        srcCanvas.width = srcW;
        srcCanvas.height = srcH;
        const srcCtx = srcCanvas.getContext('2d');
        srcCtx.putImageData(imageData, 0, 0);
        
        tempCtx.drawImage(srcCanvas, 0, 0, dstW, dstH);
        return tempCtx.getImageData(0, 0, dstW, dstH);
    }

    _upscale(imageData, srcW, srcH, dstW, dstH) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = srcW;
        tempCanvas.height = srcH;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.putImageData(imageData, 0, 0);
        
        const dstCanvas = document.createElement('canvas');
        dstCanvas.width = dstW;
        dstCanvas.height = dstH;
        const dstCtx = dstCanvas.getContext('2d');
        
        dstCtx.imageSmoothingEnabled = true;
        dstCtx.imageSmoothingQuality = 'medium';
        dstCtx.drawImage(tempCanvas, 0, 0, dstW, dstH);
        
        return dstCtx.getImageData(0, 0, dstW, dstH);
    }

    _applyColorCast(data, width, height) {
        const { cast_r, cast_g, cast_b } = this.params;
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.min(255, data[i] * cast_r);
            data[i + 1] = Math.min(255, data[i + 1] * cast_g);
            data[i + 2] = Math.min(255, data[i + 2] * cast_b);
        }
    }

    _rgbToYiq(r, g, b) {
        const y = 0.299 * r + 0.587 * g + 0.114 * b;
        const i = 0.596 * r - 0.274 * g - 0.322 * b;
        const q = 0.211 * r - 0.523 * g + 0.312 * b;
        return { y, i, q };
    }

    _yiqToRgb(y, i, q) {
        const r = Math.max(0, Math.min(255, y + 0.956 * i + 0.621 * q));
        const g = Math.max(0, Math.min(255, y - 0.272 * i - 0.647 * q));
        const b = Math.max(0, Math.min(255, y - 1.106 * i + 1.703 * q));
        return { r, g, b };
    }

    _applyLuminanceBlur(data, width, height) {
        const blurRadius = Math.ceil((1 - this.params.cutoff_y) * 3);
        const temp = new Float32Array(data.length);
        
        for (let i = 0; i < data.length; i++) {
            temp[i] = data[i];
        }

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let sumR = 0, sumG = 0, sumB = 0, count = 0;
                
                for (let dy = -blurRadius; dy <= blurRadius; dy++) {
                    for (let dx = -blurRadius; dx <= blurRadius; dx++) {
                        const nx = Math.min(width - 1, Math.max(0, x + dx));
                        const ny = Math.min(height - 1, Math.max(0, y + dy));
                        const idx = (ny * width + nx) * 4;
                        sumR += data[idx];
                        sumG += data[idx + 1];
                        sumB += data[idx + 2];
                        count++;
                    }
                }

                const idx = (y * width + x) * 4;
                temp[idx] = sumR / count;
                temp[idx + 1] = sumG / count;
                temp[idx + 2] = sumB / count;
            }
        }

        for (let i = 0; i < data.length; i++) {
            data[i] = Math.round(temp[i]);
        }
    }

    _applyChromaShift(data, width, height) {
        const shift = this.params.chroma_shift_x;
        const original = new Uint8ClampedArray(data);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const srcX = Math.min(width - 1, x + shift);
                const srcIdx = (y * width + srcX) * 4;

                const { y: lum, i: chromI, q: chromQ } = this._rgbToYiq(
                    original[idx],
                    original[idx + 1],
                    original[idx + 2]
                );

                const srcYiq = this._rgbToYiq(
                    original[srcIdx],
                    original[srcIdx + 1],
                    original[srcIdx + 2]
                );

                const { r, g, b } = this._yiqToRgb(lum, srcYiq.i, srcYiq.q);
                data[idx] = r;
                data[idx + 1] = g;
                data[idx + 2] = b;
            }
        }
    }

    _applyNoise(data, width, height) {
        const { noise_intensity_y, noise_intensity_c } = this.params;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                
                const { y: lum, i: chromI, q: chromQ } = this._rgbToYiq(
                    data[idx],
                    data[idx + 1],
                    data[idx + 2]
                );

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

    _applyRinging(data, width, height) {
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

    _applyToneMapping(data, width, height) {
        const { tone_low, tone_high } = this.params;
        const low = tone_low;
        const high = tone_high;
        const scale = 255 / (high - low);

        for (let i = 0; i < data.length; i += 4) {
            for (let c = 0; c < 3; c++) {
                const v = data[i + c];
                const mapped = (v - low) * scale;
                data[i + c] = Math.max(0, Math.min(255, mapped));
            }
        }
    }

    _applyJitter(data, width, height) {
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

    _applyHeadSwitch(data, width, height) {
        const { head_switch_rows, head_switch_pull, head_switch_noise } = this.params;
        if (head_switch_rows <= 0) return;
        
        const startY = height - head_switch_rows;
        const original = new Uint8ClampedArray(data);

        for (let y = startY; y < height; y++) {
            const progress = (y - startY) / head_switch_rows;
            const pull = Math.round(head_switch_pull * progress);
            const noiseIntensity = head_switch_noise * progress * progress;

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

    _applyDropouts(data, width, height) {
        const { dropout_count, dropout_max_len, dropout_noise_freq } = this.params;
        const original = new Uint8ClampedArray(data);

        for (let i = 0; i < dropout_count; i++) {
            const y = Math.floor(this.rng() * height);
            const startX = Math.floor(this.rng() * width);
            const len = Math.floor(this.rng() * dropout_max_len) + 10;
            const thickness = Math.floor(this.rng() * 2) + 1;

            for (let t = 0; t < thickness; t++) {
                const rowY = Math.min(height - 1, Math.max(0, y + t));
                
                for (let dx = 0; dx < len && (startX + dx) < width; dx++) {
                    const x = startX + dx;
                    const idx = (rowY * width + x) * 4;

                    const originalR = original[idx];
                    const originalG = original[idx + 1];
                    const originalB = original[idx + 2];
                    const originalBrightness = (originalR + originalG + originalB) / 3;

                    let dropoutR, dropoutG, dropoutB;
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
    }

    _applyScanlines(data, width, height) {
        const { scanline_weight } = this.params;

        for (let y = 0; y < height; y++) {
            if (y % 2 === 1) {
                for (let x = 0; x < width; x++) {
                    const idx = (y * width + x) * 4;
                    data[idx] = Math.round(data[idx] * scanline_weight);
                    data[idx + 1] = Math.round(data[idx + 1] * scanline_weight);
                    data[idx + 2] = Math.round(data[idx + 2] * scanline_weight);
                }
            }
        }
    }

    _applyJPEGArtifacts(data, width, height) {
        const blockSize = 8;
        const quality = this.params.jpeg_quality;
        const strength = Math.max(0, (100 - quality) / 100);
        
        if (strength === 0) return;

        for (let by = 0; by < height; by += blockSize) {
            for (let bx = 0; bx < width; bx += blockSize) {
                let avgR = 0, avgG = 0, avgB = 0, count = 0;
                
                for (let dy = 0; dy < blockSize && (by + dy) < height; dy++) {
                    for (let dx = 0; dx < blockSize && (bx + dx) < width; dx++) {
                        const idx = ((by + dy) * width + (bx + dx)) * 4;
                        avgR += data[idx];
                        avgG += data[idx + 1];
                        avgB += data[idx + 2];
                        count++;
                    }
                }
                avgR /= count;
                avgG /= count;
                avgB /= count;

                for (let dy = 0; dy < blockSize && (by + dy) < height; dy++) {
                    for (let dx = 0; dx < blockSize && (bx + dx) < width; dx++) {
                        const idx = ((by + dy) * width + (bx + dx)) * 4;
                        
                        const origR = data[idx];
                        const origG = data[idx + 1];
                        const origB = data[idx + 2];

                        const blockNoise = strength * 30;
                        const noiseR = (this.rng() - 0.5) * blockNoise;
                        const noiseG = (this.rng() - 0.5) * blockNoise;
                        const noiseB = (this.rng() - 0.5) * blockNoise;
                        
                        data[idx] = Math.max(0, Math.min(255, origR + noiseR));
                        data[idx + 1] = Math.max(0, Math.min(255, origG + noiseG));
                        data[idx + 2] = Math.max(0, Math.min(255, origB + noiseB));

                        const isEdge = (dx === 0 || dx === blockSize - 1 || dy === 0 || dy === blockSize - 1);
                        if (isEdge && strength > 0.3) {
                            const edgeStrength = strength * 5;
                            data[idx] = Math.max(0, Math.min(255, data[idx] + (this.rng() - 0.5) * edgeStrength));
                            data[idx + 1] = Math.max(0, Math.min(255, data[idx + 1] + (this.rng() - 0.5) * edgeStrength));
                            data[idx + 2] = Math.max(0, Math.min(255, data[idx + 2] + (this.rng() - 0.5) * edgeStrength));
                        }

                        if (strength > 0.5) {
                            const colorShift = (avgR - data[idx]) * strength * 0.1;
                            data[idx] = Math.max(0, Math.min(255, data[idx] + colorShift));
                            data[idx + 1] = Math.max(0, Math.min(255, data[idx + 1] + (avgG - data[idx + 1]) * strength * 0.1));
                            data[idx + 2] = Math.max(0, Math.min(255, data[idx + 2] + (avgB - data[idx + 2]) * strength * 0.1));
                        }
                    }
                }
            }
        }

        if (strength > 0.6) {
            const artifactChance = (strength - 0.6) * 2;
            for (let by = 0; by < height; by += blockSize) {
                for (let bx = 0; bx < width; bx += blockSize) {
                    if (this.rng() < artifactChance * 0.01) {
                        const corruptType = Math.floor(this.rng() * 3);
                        
                        for (let dy = 0; dy < blockSize && (by + dy) < height; dy++) {
                            for (let dx = 0; dx < blockSize && (bx + dx) < width; dx++) {
                                const idx = ((by + dy) * width + (bx + dx)) * 4;
                                
                                if (corruptType === 0) {
                                    const shift = Math.floor(this.rng() * 50);
                                    data[idx] = Math.min(255, data[idx] + shift);
                                    data[idx + 1] = Math.min(255, data[idx + 1] + shift);
                                    data[idx + 2] = Math.min(255, data[idx + 2] + shift);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    download(filename = 'heisei_vhs_output.png') {
        const dataUrl = this.canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        link.click();
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = HeiseiVHS;
}