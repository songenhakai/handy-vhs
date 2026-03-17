import { useState, useCallback, useRef, useEffect } from 'react';
import HandyVHS, { type VHSParams } from './lib/HandyVHS';
import './App.css';

const defaultParams: VHSParams = {
  apply_jpeg: true,
  jpeg_quality: 100,
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

function App() {
  const [showVHS, setShowVHS] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [params, setParams] = useState<VHSParams>(defaultParams);
  const [autoResolution, setAutoResolution] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [hasImage, setHasImage] = useState(false);

  const srcCanvasRef = useRef<HTMLCanvasElement>(null);
  const dstCanvasRef = useRef<HTMLCanvasElement>(null);
  const vhsRef = useRef<HandyVHS | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (dstCanvasRef.current) {
      vhsRef.current = new HandyVHS(dstCanvasRef.current);
    }
  }, []);

  const processImage = useCallback(() => {
    if (!vhsRef.current || !srcCanvasRef.current || !dstCanvasRef.current) return;
    if (!srcCanvasRef.current.width) return;

    setProcessing(true);
    const processParams = autoResolution ? { ...params, vhs_resolution: 0 } : params;
    
    setTimeout(() => {
      const ctx = srcCanvasRef.current!.getContext('2d')!;
      vhsRef.current!.originalImageData = ctx.getImageData(0, 0, srcCanvasRef.current!.width, srcCanvasRef.current!.height);
      vhsRef.current!.canvas.width = srcCanvasRef.current!.width;
      vhsRef.current!.canvas.height = srcCanvasRef.current!.height;
      vhsRef.current!.setParams(processParams);
      vhsRef.current!.process();
      setProcessing(false);
    }, 50);
  }, [params, autoResolution]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const maxDim = 800;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        const ratio = Math.min(maxDim / w, maxDim / h);
        w = Math.floor(w * ratio);
        h = Math.floor(h * ratio);
      }
      if (srcCanvasRef.current) {
        srcCanvasRef.current.width = w;
        srcCanvasRef.current.height = h;
        srcCanvasRef.current.getContext('2d')!.drawImage(img, 0, 0, w, h);
      }
      URL.revokeObjectURL(url);
      setHasImage(true);
      setShowVHS(true);
      setTimeout(processImage, 100);
    };
    img.src = url;
  }, [processImage]);

  const handleDownload = useCallback(() => {
    if (vhsRef.current) {
      vhsRef.current.download();
    }
  }, []);

  const updateParam = useCallback(<K extends keyof VHSParams>(key: K, value: VHSParams[K]) => {
    setParams(prev => ({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    if (hasImage) {
      processImage();
    }
  }, [params, autoResolution, processImage, hasImage]);

  const Slider = ({ label, id, min, max, step, value }: {
    label: string;
    id: keyof VHSParams;
    min: number;
    max: number;
    step: number;
    value: number;
  }) => (
    <div className="row">
      <label>{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => updateParam(id, step < 1 ? parseFloat(e.target.value) : parseInt(e.target.value))}
      />
      <span className="val">{step < 0.01 ? value.toFixed(3) : step < 0.1 ? value.toFixed(2) : value}</span>
    </div>
  );

  const Checkbox = ({ label, id, checked }: {
    label: string;
    id: keyof VHSParams;
    checked: boolean;
  }) => (
    <div className="row">
      <label>
        <input
          type="checkbox"
          checked={checked}
          onChange={e => updateParam(id, e.target.checked)}
        />
        {label}
      </label>
    </div>
  );

return (
    <div className="app">
      <div className="toolbar">
        <button className={showVHS ? 'active' : ''} onClick={() => setShowVHS(!showVHS)}>
          {showVHS ? 'VHS' : 'Original'}
        </button>
        <button className={panelOpen ? 'active' : ''} onClick={() => setPanelOpen(!panelOpen)}>
          ⚙️
        </button>
        <button onClick={() => fileInputRef.current?.click()}>📁</button>
        <button onClick={handleDownload}>💾</button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />
      </div>

      <div className="main">
        <div className="workspace">
          <canvas ref={srcCanvasRef} style={{ display: showVHS ? 'none' : 'block' }} />
          <canvas ref={dstCanvasRef} style={{ display: showVHS ? 'block' : 'none' }} />
          {processing && <div className="processing"><div className="spinner" /></div>}
        </div>

        <div className={`panel ${panelOpen ? 'open' : ''}`}>
          <div className="panel-header">
            <h2>Handy VHS</h2>
            <button onClick={() => setPanelOpen(false)}>×</button>
          </div>
          <div className="panel-content">
            <div className="section">
              <h4>Digital Layer</h4>
              <Checkbox label="JPEG" id="apply_jpeg" checked={params.apply_jpeg} />
              <Slider label="Quality" id="jpeg_quality" min={1} max={100} step={1} value={params.jpeg_quality} />
              <Slider label="Black Crush" id="tone_low" min={0} max={50} step={1} value={params.tone_low} />
              <Slider label="White Blowout" id="tone_high" min={200} max={255} step={1} value={params.tone_high} />
            </div>

            <div className="section">
              <h4>Hardware Layer</h4>
              <Checkbox label="Ringing" id="apply_strong_ringing" checked={params.apply_strong_ringing} />
              <Slider label="Sharpen" id="sharpen_amount" min={0} max={10} step={0.1} value={params.sharpen_amount} />
              <Checkbox label="Color Cast" id="apply_color_cast" checked={params.apply_color_cast} />
              <Slider label="Red" id="cast_r" min={0.8} max={1.2} step={0.01} value={params.cast_r} />
              <Slider label="Green" id="cast_g" min={0.8} max={1.2} step={0.01} value={params.cast_g} />
              <Slider label="Blue" id="cast_b" min={0.8} max={1.2} step={0.01} value={params.cast_b} />
            </div>

            <div className="section">
              <h4>Analog Layer</h4>
              <div className="row">
                <label>
                  <input type="checkbox" checked={autoResolution} onChange={e => setAutoResolution(e.target.checked)} />
                  Auto Resolution
                </label>
              </div>
              {!autoResolution && (
                <Slider label="Resolution" id="vhs_resolution" min={160} max={480} step={10} value={params.vhs_resolution} />
              )}
              <Slider label="Blur" id="cutoff_y" min={0.01} max={1.0} step={0.01} value={params.cutoff_y} />
              <Slider label="Chroma Shift" id="chroma_shift_x" min={0} max={15} step={1} value={params.chroma_shift_x} />
              <Slider label="Luma Noise" id="noise_intensity_y" min={0} max={0.1} step={0.001} value={params.noise_intensity_y} />
              <Slider label="Chroma Noise" id="noise_intensity_c" min={0} max={0.1} step={0.001} value={params.noise_intensity_c} />
            </div>

            <div className="section">
              <h4>Mechanical</h4>
              <Slider label="Jitter" id="jitter_amp" min={0} max={5} step={0.1} value={params.jitter_amp} />
              <Slider label="Head Switch" id="head_switch_rows" min={0} max={50} step={1} value={params.head_switch_rows} />
              <Slider label="Dropouts" id="dropout_count" min={0} max={50} step={1} value={params.dropout_count} />
              <Checkbox label="Scanlines" id="apply_scanlines" checked={params.apply_scanlines} />
              <Slider label="Scanline Brightness" id="scanline_weight" min={0.5} max={1.0} step={0.01} value={params.scanline_weight} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;