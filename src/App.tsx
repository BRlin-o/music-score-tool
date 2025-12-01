import { useState, useEffect, useCallback, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { Upload, X, ArrowUp, ArrowDown, Download, Image as ImageIcon, Layers, Sliders, Loader2, Trash2, Sparkles, Zap } from 'lucide-react';

interface ImageItem {
  id: string;
  file: File;
  preview: string;
  name: string;
  width: number;
  height: number;
}

const SheetMusicToolPro = () => {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [processedResult, setProcessedResult] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const processingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Settings
  const [threshold, setThreshold] = useState(140);
  const [contrastBoost, setContrastBoost] = useState(20);
  // New Feature: Super Resolution
  const [superResolution, setSuperResolution] = useState(false);

  // --- CLIPBOARD PASTE SUPPORT ---
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) files.push(file);
        }
      }

      if (files.length > 0) {
        const newImagesPromises = files.map(file => {
          return new Promise<ImageItem>((resolve) => {
            const img = new Image();
            const objectUrl = URL.createObjectURL(file);
            img.onload = () => {
              resolve({
                id: Math.random().toString(36).substr(2, 9),
                file,
                preview: objectUrl,
                name: file.name || `pasted_image_${new Date().getTime()}.png`,
                width: img.width,
                height: img.height
              });
            };
            img.src = objectUrl;
          });
        });

        Promise.all(newImagesPromises).then(newImages => {
          setImages(prev => [...prev, ...newImages]);
        });
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, []); // Empty dependency array means this runs once on mount

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newImagesPromises = files.map(file => {
      return new Promise<ImageItem>((resolve) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        img.onload = () => {
          resolve({
            id: Math.random().toString(36).substr(2, 9),
            file,
            preview: objectUrl,
            name: file.name,
            width: img.width,
            height: img.height
          });
        };
        img.src = objectUrl;
      });
    });

    Promise.all(newImagesPromises).then(newImages => {
      setImages(prev => [...prev, ...newImages]);
    });
  };

  const removeImage = (id: string) => {
    setImages(prev => {
      const newImages = prev.filter(img => img.id !== id);
      const imgToRemove = prev.find(img => img.id === id);
      if (imgToRemove) URL.revokeObjectURL(imgToRemove.preview);
      return newImages;
    });
  };

  const moveImage = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index > 0) {
      const newImages = [...images];
      [newImages[index], newImages[index - 1]] = [newImages[index - 1], newImages[index]];
      setImages(newImages);
    } else if (direction === 'down' && index < images.length - 1) {
      const newImages = [...images];
      [newImages[index], newImages[index + 1]] = [newImages[index + 1], newImages[index]];
      setImages(newImages);
    }
  };

  // --- CORE PROCESSING LOGIC ---
  const processAndMerge = useCallback(async () => {
    if (images.length === 0) {
      setProcessedResult(null);
      return;
    }
    setIsProcessing(true);

    try {
      const loadedImages = await Promise.all(images.map(imgData => {
        return new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "Anonymous";
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = imgData.preview;
        });
      }));

      // 1. Calculate base dimensions
      const maxWidth = Math.max(...loadedImages.map(img => img.width));

      // 2. Determine Scale Factor (Super Resolution)
      const scaleMult = superResolution ? 2 : 1;
      const targetWidth = maxWidth * scaleMult;

      // 3. Calculate total height with scaling
      const totalHeight = loadedImages.reduce((acc, img) => {
        const scaleFactor = targetWidth / img.width; // Scale to match target width (which is base * 2)
        // Note: effectively this is (maxWidth * 2) / img.width
        // So image scales up to fit the 2x width
        return acc + (img.height * scaleFactor);
      }, 0);

      // Safety check for browser canvas limits (usually around 32,767px height)
      if (totalHeight > 30000) {
        alert("警告：合併後的圖片高度可能超出瀏覽器限制，建議分批處理。");
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = totalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Could not get canvas context");

      // Initialize white background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      let currentY = 0;
      const boostFactor = contrastBoost / 100;

      for (const img of loadedImages) {
        const scaleFactor = targetWidth / img.width;
        const scaledHeight = img.height * scaleFactor;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = targetWidth;
        tempCanvas.height = scaledHeight;
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) continue;

        // CRITICAL: High Quality Smoothing for Super Resolution
        // When we scale up 2x, this creates smooth gray edges instead of pixelated blocks.
        // The threshold later cuts through these grays to make smooth vector-like curves.
        tempCtx.imageSmoothingEnabled = true;
        tempCtx.imageSmoothingQuality = 'high';

        tempCtx.drawImage(img, 0, 0, targetWidth, scaledHeight);

        const imageData = tempCtx.getImageData(0, 0, targetWidth, scaledHeight);
        const data = imageData.data;

        // --- PIXEL MANIPULATION (RED CHANNEL FILTER) ---
        for (let i = 0; i < data.length; i += 4) {
          let r = data[i];
          // g and b are ignored to filter out blue/cyan artifacts

          // Ink Boost (Contrast Enhance)
          if (r < threshold + 40) {
            r = r * (1 - boostFactor);
          }

          // Thresholding
          if (r < threshold) {
            data[i] = 0;
            data[i + 1] = 0;
            data[i + 2] = 0;
          } else {
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
          }
        }

        tempCtx.putImageData(imageData, 0, 0);
        ctx.drawImage(tempCanvas, 0, currentY);
        currentY += scaledHeight;
      }

      setProcessedResult(canvas.toDataURL('image/png'));

    } catch (error) {
      console.error("Error processing images:", error);
    } finally {
      setIsProcessing(false);
    }
  }, [images, threshold, contrastBoost, superResolution]);


  // --- REAL-TIME PREVIEW EFFECT ---
  useEffect(() => {
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
    }

    if (images.length === 0) {
      setProcessedResult(null);
      return;
    }

    // Longer debounce for Super Resolution because it's heavy
    const delay = superResolution ? 600 : 300;

    processingTimeoutRef.current = setTimeout(() => {
      processAndMerge();
    }, delay);

    return () => {
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
      }
    };
  }, [images, threshold, contrastBoost, superResolution, processAndMerge]);


  const downloadImage = () => {
    if (!processedResult) return;
    const link = document.createElement('a');
    link.href = processedResult;
    // Add suffix to filename if super resolution is on
    const suffix = superResolution ? '_HighRes' : '';
    link.download = `sheet_music${suffix}_${new Date().getTime()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 md:p-8 font-sans font-medium">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 text-center md:text-left border-b border-slate-200 pb-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center justify-center md:justify-start gap-3">
              <Layers className="w-8 h-8 text-indigo-600" />
              樂譜圖床與合併工具 (旗艦版)
            </h1>
            <p className="text-slate-500 mt-2">
              紅光濾鏡去背 + 2x 超解析度重建 (Super Resolution)
            </p>
          </div>
          {processedResult && (
            <div className="hidden md:block">
              <button
                onClick={downloadImage}
                className="px-6 py-3 rounded-xl bg-indigo-600 text-white font-bold shadow-lg hover:bg-indigo-700 hover:shadow-xl transition-all flex items-center gap-2"
              >
                <Download className="w-5 h-5" />
                下載成品
              </button>
            </div>
          )}
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* LEFT PANEL: CONTROLS */}
          <div className="lg:col-span-4 space-y-6 sticky top-8">

            {/* Upload */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-700">
                <ImageIcon className="w-5 h-5" />
                步驟 1: 上傳圖片
              </h2>
              <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-indigo-200 rounded-xl cursor-pointer bg-indigo-50/30 hover:bg-indigo-50 transition-colors">
                <div className="flex flex-col items-center justify-center pt-2">
                  <Upload className="w-8 h-8 mb-1 text-indigo-400" />
                  <p className="text-sm text-slate-600">點擊上傳多張截圖 或 Ctrl+V 貼上</p>
                </div>
                <input type="file" className="hidden" accept="image/jpeg, image/png" multiple onChange={handleFileUpload} />
              </label>

              {/* List */}
              <div className="mt-4 space-y-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                {images.map((img, idx) => (
                  <div key={img.id} className="flex items-center gap-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <img src={img.preview} alt="thumb" className="w-8 h-8 rounded object-cover border border-slate-200" />
                    <span className="text-xs font-bold text-slate-400 w-4">#{idx + 1}</span>
                    <p className="text-xs text-slate-600 truncate flex-1">{img.name}</p>
                    <div className="flex gap-1">
                      <button onClick={() => moveImage(idx, 'up')} className="p-1 hover:bg-slate-200 rounded text-slate-500"><ArrowUp className="w-3 h-3" /></button>
                      <button onClick={() => moveImage(idx, 'down')} className="p-1 hover:bg-slate-200 rounded text-slate-500"><ArrowDown className="w-3 h-3" /></button>
                      <button onClick={() => removeImage(img.id)} className="p-1 hover:bg-red-100 rounded text-red-400"><X className="w-3 h-3" /></button>
                    </div>
                  </div>
                ))}
                {images.length === 0 && <p className="text-center text-xs text-slate-400 py-2">尚未選擇圖片</p>}
                {images.length > 0 && (
                  <button onClick={() => setImages([])} className="w-full text-xs text-red-400 hover:text-red-600 flex items-center justify-center gap-1 py-1 mt-2 hover:bg-red-50 rounded">
                    <Trash2 className="w-3 h-3" /> 清空
                  </button>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className={`bg-white p-5 rounded-xl shadow-sm border border-slate-200 transition-opacity ${images.length === 0 ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
              <h2 className="text-lg font-bold mb-5 flex items-center gap-2 text-slate-700">
                <Sliders className="w-5 h-5" />
                步驟 2: 畫質與參數
              </h2>

              <div className="space-y-6">

                {/* SUPER RESOLUTION TOGGLE */}
                <div
                  className={`relative overflow-hidden rounded-xl p-4 border-2 transition-all cursor-pointer group ${superResolution ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-slate-50 hover:border-amber-200'}`}
                  onClick={() => setSuperResolution(!superResolution)}
                >
                  <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${superResolution ? 'bg-amber-400 text-white' : 'bg-slate-200 text-slate-400'}`}>
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className={`font-bold text-sm ${superResolution ? 'text-amber-900' : 'text-slate-600'}`}>2x 超解析優化</h3>
                        <p className={`text-xs ${superResolution ? 'text-amber-700' : 'text-slate-400'}`}>
                          {superResolution ? '已開啟：平滑邊緣，消除鋸齒' : '點擊開啟高畫質重建'}
                        </p>
                      </div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${superResolution ? 'bg-amber-500 border-amber-500' : 'border-slate-300 bg-white'}`}>
                      {superResolution && <Zap className="w-3 h-3 text-white fill-current" />}
                    </div>
                  </div>
                  {/* Background decoration */}
                  {superResolution && <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-amber-200/50 rounded-full blur-xl"></div>}
                </div>

                {/* Threshold */}
                <div className="space-y-3 pt-2">
                  <div className="flex justify-between items-end">
                    <label className="text-sm font-bold text-slate-700">黑白臨界值 (Threshold)</label>
                    <span className="text-sm font-mono text-indigo-600 bg-indigo-50 px-2 rounded">{threshold}</span>
                  </div>
                  <input
                    type="range" min="50" max="220" value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                  <p className="text-xs text-slate-400">往左筆畫細，往右筆畫粗 (建議值: 140)</p>
                </div>

                {/* Ink Boost */}
                <div className="space-y-3">
                  <div className="flex justify-between items-end">
                    <label className="text-sm font-bold text-slate-700">墨色加深 (Ink Boost)</label>
                    <span className="text-sm font-mono text-indigo-600 bg-indigo-50 px-2 rounded">{contrastBoost}%</span>
                  </div>
                  <input
                    type="range" min="0" max="60" value={contrastBoost}
                    onChange={(e) => setContrastBoost(Number(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                  <p className="text-xs text-slate-400">增強淡色音符的深度</p>
                </div>

              </div>

              {isProcessing && (
                <div className="mt-6 p-3 bg-blue-50 text-blue-700 rounded-lg flex items-center justify-center gap-2 animate-pulse text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {superResolution ? '正在進行超解析重建運算...' : '正在處理影像...'}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT PANEL: PREVIEW */}
          <div className="lg:col-span-8">
            <div className="bg-slate-200/50 rounded-xl border border-slate-200 h-[85vh] flex flex-col overflow-hidden relative shadow-inner">

              {/* Loading Overlay */}
              {isProcessing && images.length > 0 && (
                <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-20 flex flex-col items-center justify-center text-indigo-600">
                  <Loader2 className="w-12 h-12 animate-spin mb-4" />
                  <p className="font-bold text-lg">
                    {superResolution ? 'AI 級插值運算中...' : '處理中...'}
                  </p>
                  {superResolution && <p className="text-sm text-indigo-400 mt-1">超解析度模式需要較多運算時間</p>}
                </div>
              )}

              {!processedResult && !isProcessing ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <div className="p-8 bg-white rounded-full mb-6 shadow-sm">
                    <Layers className="w-16 h-16 text-slate-200" />
                  </div>
                  <p className="text-xl font-bold text-slate-500">等待圖片輸入</p>
                  <p className="mt-2">請在左側上傳您的樂譜</p>
                </div>
              ) : (
                processedResult && (
                  <div className="flex-1 overflow-auto p-4 md:p-8 flex justify-center items-start">
                    <img
                      src={processedResult}
                      alt="Processed Result"
                      className="max-w-full shadow-2xl border border-white bg-white"
                      style={{
                        minHeight: '200px',
                        // Make sure high res images scale down nicely in preview
                        imageRendering: 'auto'
                      }}
                    />
                  </div>
                )
              )}

              {/* Mobile Download Button (Fixed Bottom) */}
              {processedResult && (
                <div className="absolute bottom-6 right-6 md:hidden">
                  <button
                    onClick={downloadImage}
                    className="w-14 h-14 bg-indigo-600 rounded-full text-white shadow-xl flex items-center justify-center hover:bg-indigo-700 active:scale-95 transition-all"
                  >
                    <Download className="w-6 h-6" />
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
      `}</style>
    </div>
  );
};

export default SheetMusicToolPro;