import React, { useState, useEffect, useCallback, useRef, type ChangeEvent, type ClipboardEvent } from 'react';
import { Upload, X, Download, Image as ImageIcon, Sliders, Loader2, Trash2, Sparkles, Zap, History, ArrowRightLeft, ScanLine, Type, Droplet, LayoutTemplate, Columns, Crop, Move, Maximize, Minimize } from 'lucide-react';

// --- CONSTANTS ---
const CONFIG = {
    defaults: {
        algorithm: 'adaptive' as const,
        threshold: {
            adaptive: 60,
            classic: 140
        },
        contrastBoost: 20,
        scaleMultiplier: 2.0,
        smoothness: 5,
        autoCrop: true,
        paddingMode: 'uniform' as const,
        padding: {
            top: 50,
            right: 50,
            bottom: 50,
            left: 50
        },
        backgroundColor: '#FFFFFF',
        isTransparent: false
    },
    ranges: {
        scale: { min: 1.0, max: 3.0, step: 0.5 },
        threshold: {
            adaptive: { min: 0, max: 100 },
            classic: { min: 50, max: 220 }
        },
        contrastBoost: { min: 0, max: 60 },
        smoothness: { min: 0, max: 20 },
        padding: { min: 0, max: 300 }
    }
};

// --- TYPES ---
type ViewMode = 'split' | 'original' | 'processed';
type PaddingMode = 'uniform' | 'axis' | 'independent';

interface Settings {
    algorithm: 'classic' | 'adaptive';
    threshold: number;
    contrastBoost: number;
    scaleMultiplier: number;
    smoothness: number;
    autoCrop: boolean;
    paddingMode: PaddingMode;
    paddingTop: number;
    paddingRight: number;
    paddingBottom: number;
    paddingLeft: number;
    backgroundColor: string;
    isTransparent: boolean;
}

interface GalleryItem {
    id: string;
    name: string;
    originalUrl: string;
    processedUrl: string | null;
    croppedOriginalUrl: string | null; // NEW: For synchronized comparison
    status: 'processing' | 'done' | 'error';
    timestamp: Date;
    settingsUsed: Settings;
}

interface ComparisonViewProps {
    originalUrl: string;
    processedUrl: string | null;
    croppedOriginalUrl: string | null;
    settings: Settings;
    viewMode: ViewMode;
}

interface ProcessResult {
    processed: string;
    croppedOriginal: string;
}

// --- CORE ALGORITHM ---
const processSingleImage = async (imgSrc: string, settings: Settings): Promise<ProcessResult> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            try {
                const {
                    algorithm,
                    threshold,
                    contrastBoost,
                    scaleMultiplier,
                    smoothness = 0,
                    autoCrop,
                    paddingTop,
                    paddingRight,
                    paddingBottom,
                    paddingLeft,
                    backgroundColor = '#FFFFFF',
                    isTransparent = false
                } = settings;

                const originalWidth = img.width;
                const targetWidth = originalWidth * scaleMultiplier;
                const scaleFactor = targetWidth / originalWidth;
                const scaledHeight = img.height * scaleFactor;

                // 1. Setup Scaled Canvas (Base for both processed and cropped-original)
                const scaledCanvas = document.createElement('canvas');
                scaledCanvas.width = targetWidth;
                scaledCanvas.height = scaledHeight;
                const scaledCtx = scaledCanvas.getContext('2d');
                if (!scaledCtx) throw new Error("Could not get scaled canvas context");

                // High Quality Scaling
                scaledCtx.imageSmoothingEnabled = true;
                scaledCtx.imageSmoothingQuality = 'high';
                scaledCtx.drawImage(img, 0, 0, targetWidth, scaledHeight);

                // 2. Create Working Canvas for Processing (Clone of Scaled)
                const canvas = document.createElement('canvas');
                canvas.width = targetWidth;
                canvas.height = scaledHeight;
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error("Could not get working canvas context");
                ctx.drawImage(scaledCanvas, 0, 0);

                const imageData = ctx.getImageData(0, 0, targetWidth, scaledHeight);
                const data = imageData.data;

                // Helper for Soft Thresholding
                const getSoftVal = (val: number, thresh: number, smooth: number) => {
                    if (smooth === 0) return val < thresh ? 0 : 255;
                    const lower = thresh - smooth;
                    const upper = thresh + smooth;
                    if (val <= lower) return 0;
                    if (val >= upper) return 255;
                    return ((val - lower) / (upper - lower)) * 255;
                };

                // Parse Background Color
                let bgR = 255, bgG = 255, bgB = 255;
                if (!isTransparent && backgroundColor.startsWith('#')) {
                    const hex = backgroundColor.substring(1);
                    bgR = parseInt(hex.substring(0, 2), 16);
                    bgG = parseInt(hex.substring(2, 4), 16);
                    bgB = parseInt(hex.substring(4, 6), 16);
                }

                // ALGORITHM IMPLEMENTATION
                if (algorithm === 'adaptive') {
                    const blurCanvas = document.createElement('canvas');
                    blurCanvas.width = targetWidth;
                    blurCanvas.height = scaledHeight;
                    const blurCtx = blurCanvas.getContext('2d');
                    if (!blurCtx) throw new Error("Could not get blur canvas context");

                    const blurRadius = 20 * scaleMultiplier;
                    blurCtx.filter = `blur(${blurRadius}px)`;
                    blurCtx.drawImage(canvas, 0, 0);
                    blurCtx.clearRect(0, 0, targetWidth, scaledHeight);
                    blurCtx.drawImage(img, 0, 0, targetWidth, scaledHeight);

                    const blurData = blurCtx.getImageData(0, 0, targetWidth, scaledHeight).data;

                    for (let i = 0; i < data.length; i += 4) {
                        const r = data[i];
                        const bgR_pixel = blurData[i];
                        const sensitivityOffset = (100 - threshold) / 2;
                        const localThreshold = bgR_pixel - sensitivityOffset;

                        // 0 (Ink) to 255 (Paper)
                        const whiteness = getSoftVal(r, localThreshold, smoothness);
                        const t = whiteness / 255;

                        if (isTransparent) {
                            // Ink is black (0,0,0), Alpha depends on whiteness
                            data[i] = 0;
                            data[i + 1] = 0;
                            data[i + 2] = 0;
                            data[i + 3] = 255 - whiteness; // 255 (Ink) -> 0 (Paper)
                        } else {
                            // Blend Ink (Black) with Background Color
                            // Pixel = Ink * (1-t) + Bg * t
                            // Assuming Ink is Black (0,0,0): Pixel = Bg * t
                            data[i] = bgR * t;
                            data[i + 1] = bgG * t;
                            data[i + 2] = bgB * t;
                            data[i + 3] = 255;
                        }
                    }
                } else {
                    const boostFactor = contrastBoost / 100;
                    for (let i = 0; i < data.length; i += 4) {
                        let r = data[i];
                        if (r < threshold + 40) {
                            r = r * (1 - boostFactor);
                        }
                        const whiteness = getSoftVal(r, threshold, smoothness);
                        const t = whiteness / 255;

                        if (isTransparent) {
                            data[i] = 0;
                            data[i + 1] = 0;
                            data[i + 2] = 0;
                            data[i + 3] = 255 - whiteness;
                        } else {
                            data[i] = bgR * t;
                            data[i + 1] = bgG * t;
                            data[i + 2] = bgB * t;
                            data[i + 3] = 255;
                        }
                    }
                }

                ctx.putImageData(imageData, 0, 0);

                // --- AUTO CROP & PADDING ---
                let finalProcessedUrl = '';
                let finalCroppedOriginalUrl = '';

                if (autoCrop) {
                    // 1. Find Bounding Box
                    let minX = targetWidth, minY = scaledHeight, maxX = 0, maxY = 0;
                    let hasContent = false;

                    for (let y = 0; y < scaledHeight; y++) {
                        for (let x = 0; x < targetWidth; x++) {
                            const idx = (y * targetWidth + x) * 4;
                            let isContent = false;

                            if (isTransparent) {
                                if (data[idx + 3] > 10) isContent = true; // Alpha > 10
                            } else {
                                // Check if pixel differs significantly from background color
                                // Or just check if it's "dark enough" (since ink is black-ish)
                                // Our logic above sets pixel = Bg * t.
                                // So if t < 0.9 (whiteness < 230), it's content.
                                // We can check if pixel is darker than background.
                                // Simplest: check if R channel < bgR * 0.9 (approx)
                                // But bgR might be 0.
                                // Let's stick to the "whiteness" logic if possible, but we lost it.
                                // Wait, we can re-calculate or just check R channel if we assume ink is black.
                                // If background is black, this fails.
                                // But usually background is light.
                                // Let's use a simple heuristic: if R+G+B < (bgR+bgG+bgB) - 20 ?
                                // Or just use the original image for crop detection?
                                // The user said "Crop based on PROCESSED image".
                                // So we must use processed data.

                                // If background is white (255,255,255), content is darker.
                                // If background is black (0,0,0), content is... wait, ink is black too.
                                // If background is black, you can't see black ink.
                                // Assuming background is not black.

                                // Let's assume standard usage: Light background.
                                // If R < 230 (default threshold), it works for White bg.
                                // For arbitrary bg, we need to know "is this ink?".
                                // Ink is always Black (0,0,0) in our logic (scaled by t).
                                // So if pixel is close to Bg, it's paper.
                                // Distance = |R - bgR| + |G - bgG| + |B - bgB|.
                                const dist = Math.abs(data[idx] - bgR) + Math.abs(data[idx + 1] - bgG) + Math.abs(data[idx + 2] - bgB);
                                if (dist > 30) isContent = true;
                            }

                            if (isContent) {
                                if (x < minX) minX = x;
                                if (x > maxX) maxX = x;
                                if (y < minY) minY = y;
                                if (y > maxY) maxY = y;
                                hasContent = true;
                            }
                        }
                    }

                    if (hasContent) {
                        const contentWidth = maxX - minX + 1;
                        const contentHeight = maxY - minY + 1;

                        const finalWidth = contentWidth + paddingLeft + paddingRight;
                        const finalHeight = contentHeight + paddingTop + paddingBottom;

                        // A. Final Processed Canvas
                        const finalCanvas = document.createElement('canvas');
                        finalCanvas.width = finalWidth;
                        finalCanvas.height = finalHeight;
                        const finalCtx = finalCanvas.getContext('2d');
                        if (!finalCtx) throw new Error("Could not get final canvas context");

                        // Fill Background
                        if (!isTransparent) {
                            finalCtx.fillStyle = backgroundColor;
                            finalCtx.fillRect(0, 0, finalWidth, finalHeight);
                        } else {
                            finalCtx.clearRect(0, 0, finalWidth, finalHeight);
                        }

                        finalCtx.drawImage(canvas,
                            minX, minY, contentWidth, contentHeight,
                            paddingLeft, paddingTop, contentWidth, contentHeight
                        );
                        finalProcessedUrl = finalCanvas.toDataURL('image/png');

                        // B. Final Cropped Original Canvas (Sync Crop)
                        const finalOrgCanvas = document.createElement('canvas');
                        finalOrgCanvas.width = finalWidth;
                        finalOrgCanvas.height = finalHeight;
                        const finalOrgCtx = finalOrgCanvas.getContext('2d');
                        if (!finalOrgCtx) throw new Error("Could not get final org canvas context");

                        // Fill white (or transparent? White is safer for consistency)
                        // For original crop, we probably still want White background for padding?
                        // Or match the user setting?
                        // Matching user setting is better for "Sync".
                        if (!isTransparent) {
                            finalOrgCtx.fillStyle = backgroundColor;
                            finalOrgCtx.fillRect(0, 0, finalWidth, finalHeight);
                        } else {
                            finalOrgCtx.clearRect(0, 0, finalWidth, finalHeight);
                        }

                        // Draw from SCALED ORIGINAL canvas
                        finalOrgCtx.drawImage(scaledCanvas,
                            minX, minY, contentWidth, contentHeight,
                            paddingLeft, paddingTop, contentWidth, contentHeight
                        );
                        finalCroppedOriginalUrl = finalOrgCanvas.toDataURL('image/png');
                    } else {
                        // Fallback if no content found (shouldn't happen often, but just in case return full)
                        finalProcessedUrl = canvas.toDataURL('image/png');
                        finalCroppedOriginalUrl = scaledCanvas.toDataURL('image/png');
                    }
                } else {
                    // No Auto Crop - Return full scaled images
                    finalProcessedUrl = canvas.toDataURL('image/png');
                    finalCroppedOriginalUrl = scaledCanvas.toDataURL('image/png');
                }

                resolve({
                    processed: finalProcessedUrl,
                    croppedOriginal: finalCroppedOriginalUrl
                });
            } catch (err) {
                reject(err);
            }
        };
        img.onerror = (err) => reject(err);
        img.src = imgSrc;
    });
};

// --- COMPONENT: Comparison Slider ---
const ComparisonView: React.FC<ComparisonViewProps> = ({ originalUrl, processedUrl, croppedOriginalUrl, settings, viewMode }) => {
    const [sliderPos, setSliderPos] = useState(50);
    const [syncCrop, setSyncCrop] = useState(true); // Default to true for better UX
    const containerRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);

    const handleMove = useCallback((clientX: number) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
        setSliderPos((x / rect.width) * 100);
    }, []);

    useEffect(() => {
        const up = () => (isDragging.current = false);
        const move = (e: MouseEvent) => { if (isDragging.current) handleMove(e.clientX); };
        const touchMove = (e: TouchEvent) => { if (isDragging.current) handleMove(e.touches[0].clientX); };

        window.addEventListener('mouseup', up);
        window.addEventListener('mousemove', move);
        window.addEventListener('touchmove', touchMove, { passive: false });
        return () => {
            window.removeEventListener('mouseup', up);
            window.removeEventListener('mousemove', move);
            window.removeEventListener('touchmove', touchMove);
        };
    }, [handleMove]);

    if (!originalUrl) return null;

    // Determine which original image to show
    // If syncCrop is ON and we have a croppedOriginalUrl, use it.
    // Otherwise use the raw originalUrl.
    const displayOriginal = (syncCrop && croppedOriginalUrl) ? croppedOriginalUrl : originalUrl;

    return (
        <div className="relative w-full h-full flex flex-col">
            {/* Toolbar for View Options */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex gap-2">
                {croppedOriginalUrl && (
                    <button
                        onClick={() => setSyncCrop(!syncCrop)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold shadow-lg backdrop-blur-md border transition-all flex items-center gap-1.5
                        ${syncCrop ? 'bg-emerald-500/90 text-white border-emerald-400' : 'bg-white/80 text-slate-600 border-slate-200 hover:bg-white'}
                        `}
                    >
                        <Crop className="w-3 h-3" />
                        {syncCrop ? '同步裁切 (Sync)' : '原始比例 (Raw)'}
                    </button>
                )}
            </div>

            <div className="flex-1 flex items-center justify-center bg-slate-200/50 select-none p-4 overflow-hidden">
                <div
                    ref={containerRef}
                    className="relative shadow-2xl bg-white max-w-full max-h-full"
                    onMouseDown={() => (viewMode === 'split' && (isDragging.current = true))}
                    onTouchStart={() => (viewMode === 'split' && (isDragging.current = true))}
                >
                    {/* Base Image (Original or Cropped Original) */}
                    <img
                        src={displayOriginal}
                        alt="Original"
                        className={`block max-w-full max-h-[85vh] object-contain pointer-events-none ${viewMode === 'processed' ? 'opacity-0' : ''}`}
                    />

                    {/* Processed Image Overlay */}
                    {processedUrl && (viewMode === 'split' || viewMode === 'processed') && (
                        <img
                            src={processedUrl}
                            alt="Processed"
                            className="absolute inset-0 w-full h-full object-contain pointer-events-none bg-white"
                            style={{
                                clipPath: viewMode === 'split' ? `inset(0 ${100 - sliderPos}% 0 0)` : 'none'
                            }}
                        />
                    )}

                    {/* Slider Handle - Only in Split Mode */}
                    {viewMode === 'split' && (
                        <div className="absolute inset-y-0 w-1 bg-indigo-500 cursor-ew-resize z-20 hover:bg-indigo-400 shadow-[0_0_10px_rgba(0,0,0,0.5)]" style={{ left: `${sliderPos}%` }}>
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center shadow-lg border-2 border-white text-white">
                                <ArrowRightLeft className="w-4 h-4" />
                            </div>
                        </div>
                    )}

                    {/* Labels */}
                    {(viewMode === 'split' || viewMode === 'processed') && (
                        <div className="absolute top-4 left-4 bg-black/70 text-white text-xs px-2 py-1 rounded backdrop-blur-md z-10 pointer-events-none border border-white/10">
                            處理後 (Processed) {settings?.scaleMultiplier > 1 && <span className="text-amber-300 font-bold ml-1">{settings.scaleMultiplier}x</span>}
                        </div>
                    )}
                    {(viewMode === 'split' || viewMode === 'original') && (
                        <div className="absolute top-4 right-4 bg-black/70 text-white text-xs px-2 py-1 rounded backdrop-blur-md z-10 pointer-events-none border border-white/10">
                            {syncCrop ? '原始 (Synced Crop)' : '原始 (Original)'}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};


const App3: React.FC = () => {
    // --- STATE ---
    const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
    const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);

    // Settings
    const [algorithm, setAlgorithm] = useState<'classic' | 'adaptive'>(CONFIG.defaults.algorithm);
    const [threshold, setThreshold] = useState(CONFIG.defaults.threshold.adaptive);
    const [contrastBoost, setContrastBoost] = useState(CONFIG.defaults.contrastBoost);
    const [scaleMultiplier, setScaleMultiplier] = useState(CONFIG.defaults.scaleMultiplier);
    const [smoothness, setSmoothness] = useState(CONFIG.defaults.smoothness);

    // Auto Crop & Padding
    const [autoCrop, setAutoCrop] = useState(CONFIG.defaults.autoCrop);
    const [paddingMode, setPaddingMode] = useState<PaddingMode>(CONFIG.defaults.paddingMode);
    const [paddingTop, setPaddingTop] = useState(CONFIG.defaults.padding.top);
    const [paddingRight, setPaddingRight] = useState(CONFIG.defaults.padding.right);
    const [paddingBottom, setPaddingBottom] = useState(CONFIG.defaults.padding.bottom);
    const [paddingLeft, setPaddingLeft] = useState(CONFIG.defaults.padding.left);

    // Background
    const [backgroundColor, setBackgroundColor] = useState(CONFIG.defaults.backgroundColor);
    const [isTransparent, setIsTransparent] = useState(CONFIG.defaults.isTransparent);

    // View Mode
    const [viewMode, setViewMode] = useState<ViewMode>('split');

    const settingsRef = useRef<Settings>({
        algorithm, threshold, contrastBoost, scaleMultiplier, smoothness,
        autoCrop, paddingMode, paddingTop, paddingRight, paddingBottom, paddingLeft,
        backgroundColor, isTransparent
    });

    useEffect(() => {
        settingsRef.current = {
            algorithm, threshold, contrastBoost, scaleMultiplier, smoothness,
            autoCrop, paddingMode, paddingTop, paddingRight, paddingBottom, paddingLeft,
            backgroundColor, isTransparent
        };
    }, [algorithm, threshold, contrastBoost, scaleMultiplier, smoothness, autoCrop, paddingMode, paddingTop, paddingRight, paddingBottom, paddingLeft, backgroundColor, isTransparent]);

    // --- LIVE PREVIEW LOGIC ---
    const processTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 1. Sync sliders when switching images
    useEffect(() => {
        if (selectedItem && selectedItem.settingsUsed) {
            const s = selectedItem.settingsUsed;
            setAlgorithm(prev => prev !== s.algorithm ? s.algorithm : prev);
            setThreshold(prev => prev !== s.threshold ? s.threshold : prev);
            setContrastBoost(prev => prev !== s.contrastBoost ? s.contrastBoost : prev);
            setScaleMultiplier(prev => prev !== s.scaleMultiplier ? s.scaleMultiplier : prev);
            setSmoothness(prev => prev !== (s.smoothness ?? 0) ? (s.smoothness ?? 0) : prev);

            setAutoCrop(prev => prev !== (s.autoCrop ?? CONFIG.defaults.autoCrop) ? (s.autoCrop ?? CONFIG.defaults.autoCrop) : prev);
            setPaddingMode(prev => prev !== (s.paddingMode ?? CONFIG.defaults.paddingMode) ? (s.paddingMode ?? CONFIG.defaults.paddingMode) : prev);
            setPaddingTop(prev => prev !== (s.paddingTop ?? CONFIG.defaults.padding.top) ? (s.paddingTop ?? CONFIG.defaults.padding.top) : prev);
            setPaddingRight(prev => prev !== (s.paddingRight ?? CONFIG.defaults.padding.right) ? (s.paddingRight ?? CONFIG.defaults.padding.right) : prev);
            setPaddingBottom(prev => prev !== (s.paddingBottom ?? CONFIG.defaults.padding.bottom) ? (s.paddingBottom ?? CONFIG.defaults.padding.bottom) : prev);
            setPaddingLeft(prev => prev !== (s.paddingLeft ?? CONFIG.defaults.padding.left) ? (s.paddingLeft ?? CONFIG.defaults.padding.left) : prev);

            setBackgroundColor(prev => prev !== (s.backgroundColor ?? CONFIG.defaults.backgroundColor) ? (s.backgroundColor ?? CONFIG.defaults.backgroundColor) : prev);
            setIsTransparent(prev => prev !== (s.isTransparent ?? CONFIG.defaults.isTransparent) ? (s.isTransparent ?? CONFIG.defaults.isTransparent) : prev);
        }
    }, [selectedItem?.id]);

    // 2. Auto-process when settings change (Debounced)
    useEffect(() => {
        if (!selectedItem) return;

        const newSettings: Settings = {
            algorithm, threshold, contrastBoost, scaleMultiplier, smoothness,
            autoCrop, paddingMode, paddingTop, paddingRight, paddingBottom, paddingLeft,
            backgroundColor, isTransparent
        };

        const isSame =
            selectedItem.settingsUsed.algorithm === newSettings.algorithm &&
            selectedItem.settingsUsed.threshold === newSettings.threshold &&
            selectedItem.settingsUsed.contrastBoost === newSettings.contrastBoost &&
            selectedItem.settingsUsed.scaleMultiplier === newSettings.scaleMultiplier &&
            selectedItem.settingsUsed.smoothness === newSettings.smoothness &&
            selectedItem.settingsUsed.autoCrop === newSettings.autoCrop &&
            selectedItem.settingsUsed.paddingMode === newSettings.paddingMode &&
            selectedItem.settingsUsed.paddingTop === newSettings.paddingTop &&
            selectedItem.settingsUsed.paddingRight === newSettings.paddingRight &&
            selectedItem.settingsUsed.paddingBottom === newSettings.paddingBottom &&
            selectedItem.settingsUsed.paddingLeft === newSettings.paddingLeft &&
            selectedItem.settingsUsed.backgroundColor === newSettings.backgroundColor &&
            selectedItem.settingsUsed.isTransparent === newSettings.isTransparent;

        if (isSame) return;

        if (processTimeoutRef.current) clearTimeout(processTimeoutRef.current);

        processTimeoutRef.current = setTimeout(async () => {
            try {
                const result = await processSingleImage(selectedItem.originalUrl, newSettings);

                setSelectedItem(prev => {
                    if (!prev || prev.id !== selectedItem.id) return prev;
                    return {
                        ...prev,
                        processedUrl: result.processed,
                        croppedOriginalUrl: result.croppedOriginal,
                        settingsUsed: newSettings,
                        status: 'done'
                    };
                });

                setGalleryItems(prev => prev.map(i =>
                    i.id === selectedItem.id
                        ? {
                            ...i,
                            processedUrl: result.processed,
                            croppedOriginalUrl: result.croppedOriginal,
                            settingsUsed: newSettings,
                            status: 'done'
                        }
                        : i
                ));
            } catch (error) {
                console.error("Live preview failed:", error);
            }
        }, 300);

        return () => {
            if (processTimeoutRef.current) clearTimeout(processTimeoutRef.current);
        };
    }, [algorithm, threshold, contrastBoost, scaleMultiplier, smoothness, autoCrop, paddingMode, paddingTop, paddingRight, paddingBottom, paddingLeft, backgroundColor, isTransparent]);


    // --- LOGIC ---
    const handleNewFiles = useCallback(async (files: File[]) => {
        if (files.length === 0) return;

        const newItems: GalleryItem[] = files.map(file => ({
            id: Math.random().toString(36).substr(2, 9),
            name: file.name.split('.')[0] || 'Image',
            originalUrl: URL.createObjectURL(file),
            processedUrl: null,
            croppedOriginalUrl: null,
            status: 'processing',
            timestamp: new Date(),
            settingsUsed: { ...settingsRef.current }
        }));

        setGalleryItems(prev => [...newItems, ...prev]);

        if (newItems.length > 0) setSelectedItem(newItems[0]);

        newItems.forEach(async (item) => {
            try {
                const result = await processSingleImage(item.originalUrl, item.settingsUsed);

                setGalleryItems(prev => prev.map(prevItem =>
                    prevItem.id === item.id
                        ? {
                            ...prevItem,
                            processedUrl: result.processed,
                            croppedOriginalUrl: result.croppedOriginal,
                            status: 'done'
                        }
                        : prevItem
                ));

                setSelectedItem(curr => curr && curr.id === item.id ? {
                    ...item,
                    processedUrl: result.processed,
                    croppedOriginalUrl: result.croppedOriginal,
                    status: 'done'
                } : curr);

            } catch (error) {
                console.error("Processing failed:", error);
                setGalleryItems(prev => prev.map(prevItem =>
                    prevItem.id === item.id ? { ...prevItem, status: 'error' } : prevItem
                ));
            }
        });
    }, []);

    const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            handleNewFiles(Array.from(e.target.files));
            e.target.value = '';
        }
    };

    useEffect(() => {
        const handlePaste = (e: ClipboardEvent | Event) => {
            const clipboardEvent = e as ClipboardEvent;
            if (!clipboardEvent.clipboardData) return;

            const items = clipboardEvent.clipboardData.items;
            const imageFiles: File[] = [];
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const blob = items[i].getAsFile();
                    if (blob) {
                        const file = new File([blob], `Paste_${new Date().toLocaleTimeString('en-GB').replace(/:/g, '')}.png`, { type: blob.type });
                        imageFiles.push(file);
                    }
                }
            }
            if (imageFiles.length > 0) handleNewFiles(imageFiles);
        };
        window.addEventListener('paste', handlePaste as any);
        return () => window.removeEventListener('paste', handlePaste as any);
    }, [handleNewFiles]);

    const downloadItem = (item: GalleryItem) => {
        if (!item || !item.processedUrl) return;
        const link = document.createElement('a');
        link.href = item.processedUrl;
        link.download = `${item.name}_${item.settingsUsed.algorithm}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const deleteItem = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setGalleryItems(prev => prev.filter(i => i.id !== id));
        if (selectedItem?.id === id) setSelectedItem(null);
    };

    useEffect(() => {
        if (algorithm === 'adaptive') {
            setThreshold(CONFIG.defaults.threshold.adaptive);
        } else {
            setThreshold(CONFIG.defaults.threshold.classic);
        }
    }, [algorithm]);

    return (
        <div className="h-screen bg-slate-100 text-slate-800 font-sans flex flex-col md:flex-row overflow-hidden">

            {/* === LEFT SIDEBAR === */}
            <div className="w-full md:w-80 lg:w-96 bg-white border-r border-slate-200 flex flex-col h-[45vh] md:h-full z-10 shadow-xl">
                {/* Header */}
                <div className="p-4 border-b border-slate-100 bg-slate-50">
                    <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <History className="w-6 h-6 text-indigo-600" />
                        樂譜工作站 <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1 rounded border border-indigo-200">PRO V3</span>
                    </h1>
                </div>

                {/* Controls Container */}
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50">

                    {/* 1. Scale Control */}
                    <div className="p-4 border-b border-slate-200 bg-white">
                        <div className="flex items-center gap-2 mb-3 text-slate-700">
                            <ScanLine className="w-4 h-4 text-indigo-500" />
                            <span className="text-sm font-bold">重建解析度 (Scale)</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-mono w-8 text-right">{scaleMultiplier}x</span>
                            <input
                                type="range"
                                min={CONFIG.ranges.scale.min}
                                max={CONFIG.ranges.scale.max}
                                step={CONFIG.ranges.scale.step}
                                value={scaleMultiplier}
                                onChange={(e) => setScaleMultiplier(Number(e.target.value))}
                                className="flex-1 h-2 bg-slate-200 rounded-lg accent-indigo-600 cursor-pointer"
                            />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 text-right">數值越高邊緣越圓潤，但速度較慢</p>
                    </div>

                    {/* 2. Algorithm Selection */}
                    <div className="p-4 border-b border-slate-200 bg-white">
                        <div className="flex items-center gap-2 mb-3 text-slate-700">
                            <Zap className="w-4 h-4 text-amber-500" />
                            <span className="text-sm font-bold">處理演算法</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => setAlgorithm('adaptive')}
                                className={`p-2 rounded-lg text-xs font-bold border transition-all flex flex-col items-center gap-1
                                ${algorithm === 'adaptive' ? 'bg-amber-50 border-amber-400 text-amber-800' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}
`}
                            >
                                <Sparkles className="w-4 h-4" />
                                自適應 (抗陰影)
                            </button>
                            <button
                                onClick={() => setAlgorithm('classic')}
                                className={`p-2 rounded-lg text-xs font-bold border transition-all flex flex-col items-center gap-1
                                ${algorithm === 'classic' ? 'bg-indigo-50 border-indigo-400 text-indigo-800' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}
`}
                            >
                                <Type className="w-4 h-4" />
                                經典 (紅光濾鏡)
                            </button>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                            {algorithm === 'adaptive'
                                ? "推薦！根據局部光線自動調整，完美去除陰影與紙張皺褶，保留細節。"
                                : "適合光線均勻的截圖，能強力去除有色游標。"}
                        </p>
                    </div>

                    {/* 3. Detailed Sliders */}
                    <div className="p-4 bg-white">
                        <div className="flex items-center gap-2 mb-4 text-slate-700">
                            <Sliders className="w-4 h-4 text-slate-500" />
                            <span className="text-sm font-bold">參數微調</span>
                        </div>

                        <div className="space-y-5">
                            <div className="space-y-1">
                                <div className="flex justify-between">
                                    <label className="text-xs font-bold text-slate-600">
                                        {algorithm === 'adaptive' ? '線條靈敏度 (Sensitivity)' : '黑白閾值 (Threshold)'}
                                    </label>
                                    <span className="text-xs font-mono text-indigo-600">{threshold}</span>
                                </div>
                                <input
                                    type="range"
                                    min={algorithm === 'adaptive' ? CONFIG.ranges.threshold.adaptive.min : CONFIG.ranges.threshold.classic.min}
                                    max={algorithm === 'adaptive' ? CONFIG.ranges.threshold.adaptive.max : CONFIG.ranges.threshold.classic.max}
                                    value={threshold}
                                    onChange={(e) => setThreshold(Number(e.target.value))}
                                    className="w-full h-1.5 bg-slate-200 rounded-lg accent-indigo-600"
                                />
                                <p className="text-[10px] text-slate-400">
                                    {algorithm === 'adaptive' ? "越高線條越粗，越低越乾淨" : "調整黑白分界點"}
                                </p>
                            </div>

                            <div className="space-y-1">
                                <div className="flex justify-between">
                                    <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                                        <Droplet className="w-3 h-3 text-cyan-500" />
                                        邊緣柔化 (Smoothness)
                                    </label>
                                    <span className="text-xs font-mono text-indigo-600">{smoothness}</span>
                                </div>
                                <input
                                    type="range"
                                    min={CONFIG.ranges.smoothness.min}
                                    max={CONFIG.ranges.smoothness.max}
                                    value={smoothness}
                                    onChange={(e) => setSmoothness(Number(e.target.value))}
                                    className="w-full h-1.5 bg-slate-200 rounded-lg accent-cyan-600"
                                />
                                <p className="text-[10px] text-slate-400">
                                    數值越高邊緣越平滑，可消除鋸齒感
                                </p>
                            </div>

                            {algorithm === 'classic' && (
                                <div className="space-y-1">
                                    <div className="flex justify-between">
                                        <label className="text-xs font-bold text-slate-600">墨色加深</label>
                                        <span className="text-xs font-mono text-indigo-600">{contrastBoost}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min={CONFIG.ranges.contrastBoost.min}
                                        max={CONFIG.ranges.contrastBoost.max}
                                        value={contrastBoost}
                                        onChange={(e) => setContrastBoost(Number(e.target.value))}
                                        className="w-full h-1.5 bg-slate-200 rounded-lg accent-indigo-600"
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 4. Auto Crop & Padding */}
                    <div className="p-4 border-t border-slate-200 bg-white">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2 text-slate-700">
                                <Crop className="w-4 h-4 text-emerald-500" />
                                <span className="text-sm font-bold">裁切與留白</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={autoCrop}
                                    onChange={(e) => setAutoCrop(e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                            </label>
                        </div>

                        {autoCrop && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                {/* Mode Selection */}
                                <div className="flex bg-slate-100 p-1 rounded-lg">
                                    <button
                                        onClick={() => setPaddingMode('uniform')}
                                        className={`flex-1 py-1 text-[10px] font-bold rounded-md transition-all ${paddingMode === 'uniform' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'} `}
                                    >
                                        統一
                                    </button>
                                    <button
                                        onClick={() => setPaddingMode('axis')}
                                        className={`flex-1 py-1 text-[10px] font-bold rounded-md transition-all ${paddingMode === 'axis' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'} `}
                                    >
                                        對稱
                                    </button>
                                    <button
                                        onClick={() => setPaddingMode('independent')}
                                        className={`flex-1 py-1 text-[10px] font-bold rounded-md transition-all ${paddingMode === 'independent' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'} `}
                                    >
                                        獨立
                                    </button>
                                </div>

                                {/* Sliders based on Mode */}
                                <div className="space-y-2">
                                    {paddingMode === 'uniform' && (
                                        <div className="space-y-1">
                                            <div className="flex justify-between">
                                                <label className="text-xs font-bold text-slate-600 flex items-center gap-1"><Maximize className="w-3 h-3" /> 四邊留白</label>
                                                <span className="text-xs font-mono text-emerald-600">{paddingTop}px</span>
                                            </div>
                                            <input
                                                type="range" min={CONFIG.ranges.padding.min} max={CONFIG.ranges.padding.max}
                                                value={paddingTop}
                                                onChange={(e) => {
                                                    const val = Number(e.target.value);
                                                    setPaddingTop(val); setPaddingRight(val); setPaddingBottom(val); setPaddingLeft(val);
                                                }}
                                                className="w-full h-1.5 bg-slate-200 rounded-lg accent-emerald-500"
                                            />
                                        </div>
                                    )}

                                    {paddingMode === 'axis' && (
                                        <>
                                            <div className="space-y-1">
                                                <div className="flex justify-between">
                                                    <label className="text-xs font-bold text-slate-600 flex items-center gap-1"><Move className="w-3 h-3 rotate-90" /> 上下留白</label>
                                                    <span className="text-xs font-mono text-emerald-600">{paddingTop}px</span>
                                                </div>
                                                <input
                                                    type="range" min={CONFIG.ranges.padding.min} max={CONFIG.ranges.padding.max}
                                                    value={paddingTop}
                                                    onChange={(e) => {
                                                        const val = Number(e.target.value);
                                                        setPaddingTop(val); setPaddingBottom(val);
                                                    }}
                                                    className="w-full h-1.5 bg-slate-200 rounded-lg accent-emerald-500"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex justify-between">
                                                    <label className="text-xs font-bold text-slate-600 flex items-center gap-1"><Move className="w-3 h-3" /> 左右留白</label>
                                                    <span className="text-xs font-mono text-emerald-600">{paddingRight}px</span>
                                                </div>
                                                <input
                                                    type="range" min={CONFIG.ranges.padding.min} max={CONFIG.ranges.padding.max}
                                                    value={paddingRight}
                                                    onChange={(e) => {
                                                        const val = Number(e.target.value);
                                                        setPaddingRight(val); setPaddingLeft(val);
                                                    }}
                                                    className="w-full h-1.5 bg-slate-200 rounded-lg accent-emerald-500"
                                                />
                                            </div>
                                        </>
                                    )}

                                    {paddingMode === 'independent' && (
                                        <div className="grid grid-cols-2 gap-3">
                                            {/* Top */}
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-slate-500">上 (Top)</label>
                                                <input type="range" min={CONFIG.ranges.padding.min} max={CONFIG.ranges.padding.max} value={paddingTop} onChange={(e) => setPaddingTop(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-lg accent-emerald-500" />
                                            </div>
                                            {/* Bottom */}
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-slate-500">下 (Bottom)</label>
                                                <input type="range" min={CONFIG.ranges.padding.min} max={CONFIG.ranges.padding.max} value={paddingBottom} onChange={(e) => setPaddingBottom(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-lg accent-emerald-500" />
                                            </div>
                                            {/* Left */}
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-slate-500">左 (Left)</label>
                                                <input type="range" min={CONFIG.ranges.padding.min} max={CONFIG.ranges.padding.max} value={paddingLeft} onChange={(e) => setPaddingLeft(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-lg accent-emerald-500" />
                                            </div>
                                            {/* Right */}
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-slate-500">右 (Right)</label>
                                                <input type="range" min={CONFIG.ranges.padding.min} max={CONFIG.ranges.padding.max} value={paddingRight} onChange={(e) => setPaddingRight(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-lg accent-emerald-500" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 5. Background Settings */}
                    <div className="p-4 border-t border-slate-200 bg-white">
                        <div className="flex items-center gap-2 mb-4 text-slate-700">
                            <LayoutTemplate className="w-4 h-4 text-purple-500" />
                            <span className="text-sm font-bold">背景設定</span>
                        </div>

                        <div className="space-y-4">
                            <label className="flex items-center justify-between cursor-pointer">
                                <span className="text-xs font-bold text-slate-600">透明背景</span>
                                <div className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={isTransparent}
                                        onChange={(e) => setIsTransparent(e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-500"></div>
                                </div>
                            </label>

                            {!isTransparent && (
                                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="flex justify-between items-center">
                                        <label className="text-xs font-bold text-slate-600">背景顏色</label>
                                        <span className="text-xs font-mono text-slate-500 uppercase">{backgroundColor}</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <input
                                            type="color"
                                            value={backgroundColor}
                                            onChange={(e) => setBackgroundColor(e.target.value)}
                                            className="h-8 w-12 p-0 border-0 rounded cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            value={backgroundColor}
                                            onChange={(e) => setBackgroundColor(e.target.value)}
                                            className="flex-1 text-xs border border-slate-200 rounded px-2 font-mono uppercase focus:outline-none focus:border-purple-500"
                                            placeholder="#FFFFFF"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Upload Button */}
                    <div className="p-4">
                        <label className="flex flex-col items-center justify-center w-full h-16 border-2 border-dashed border-indigo-200 rounded-xl cursor-pointer bg-indigo-50/50 hover:bg-indigo-50 transition-colors group">
                            <div className="flex items-center gap-2 text-indigo-400 group-hover:text-indigo-600">
                                <Upload className="w-5 h-5" />
                                <span className="text-xs font-bold">上傳 / 貼上圖片</span>
                            </div>
                            <input type="file" className="hidden" accept="image/jpeg, image/png" multiple onChange={handleFileUpload} />
                        </label>
                    </div>
                </div>

                {/* Mini Gallery (History) */}
                <div className="h-48 border-t border-slate-200 bg-slate-50 flex flex-col">
                    <div className="p-2 border-b border-slate-100 flex justify-between items-center bg-white">
                        <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                            <ImageIcon className="w-3 h-3" /> 歷史 ({galleryItems.length})
                        </span>
                        {galleryItems.length > 0 && (
                            <button onClick={() => setGalleryItems([])} className="text-slate-400 hover:text-red-500 p-1 rounded hover:bg-red-50">
                                <Trash2 className="w-3 h-3" />
                            </button>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                        {galleryItems.map(item => (
                            <div
                                key={item.id}
                                onClick={() => setSelectedItem(item)}
                                className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition-all relative group
                                ${selectedItem?.id === item.id ? 'bg-white border-indigo-500 shadow-md ring-1 ring-indigo-500' : 'bg-white border-slate-200 hover:border-indigo-300'}
`}
                            >
                                <div className="w-10 h-10 bg-slate-100 rounded overflow-hidden flex-shrink-0 border border-slate-100">
                                    {item.status === 'processing' ? (
                                        <div className="w-full h-full flex items-center justify-center text-indigo-500">
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                        </div>
                                    ) : (
                                        <img src={item.processedUrl || item.originalUrl} className="w-full h-full object-cover" alt="thumb" />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className={`text-xs font-bold truncate ${selectedItem?.id === item.id ? 'text-indigo-700' : 'text-slate-700'} `}>
                                        {item.name}
                                    </p>
                                    <p className="text-[9px] text-slate-400 flex gap-1 items-center mt-0.5">
                                        {item.settingsUsed.algorithm === 'adaptive' ? '自適應' : '經典'}
                                        {item.settingsUsed.scaleMultiplier > 1 && <span className="bg-amber-100 text-amber-700 px-1 rounded">{item.settingsUsed.scaleMultiplier}x</span>}
                                    </p>
                                </div>
                                <button
                                    onClick={(e) => deleteItem(item.id, e)}
                                    className="p-1 text-slate-300 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                        {galleryItems.length === 0 && <div className="text-center py-4 text-slate-300 text-xs">暫無紀錄</div>}
                    </div>
                </div>
            </div>

            {/* === RIGHT MAIN AREA === */}
            <div className="flex-1 bg-slate-200/80 relative flex flex-col h-[55vh] md:h-full">
                {selectedItem ? (
                    <>
                        <div className="absolute top-4 right-4 z-30 flex gap-2">
                            {/* View Mode Toggle */}
                            <div className="bg-white/90 backdrop-blur shadow-sm rounded-lg p-1 flex gap-1 border border-slate-200">
                                <button
                                    onClick={() => setViewMode('original')}
                                    className={`p-1.5 rounded-md transition-all ${viewMode === 'original' ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'} `}
                                    title="僅原圖 (Original Only)"
                                >
                                    <ImageIcon className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setViewMode('split')}
                                    className={`p-1.5 rounded-md transition-all ${viewMode === 'split' ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'} `}
                                    title="對比模式 (Split View)"
                                >
                                    <Columns className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setViewMode('processed')}
                                    className={`p-1.5 rounded-md transition-all ${viewMode === 'processed' ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'} `}
                                    title="僅成品 (Processed Only)"
                                >
                                    <LayoutTemplate className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="w-px h-8 bg-slate-300 mx-1 self-center"></div>

                            <button
                                onClick={() => downloadItem(selectedItem)}
                                disabled={selectedItem.status !== 'done'}
                                className={`px-4 py-2 rounded-full shadow-lg font-bold text-sm flex items-center gap-2 transition-transform active:scale-95
                                ${selectedItem.status === 'done' ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-300 text-slate-500 cursor-not-allowed'}
`}
                            >
                                <Download className="w-4 h-4" /> 下載成品
                            </button>
                        </div>

                        <div className="flex-1 w-full h-full relative">
                            {selectedItem.status === 'processing' ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-indigo-600">
                                    <Loader2 className="w-10 h-10 animate-spin mb-3" />
                                    <p className="font-bold">正在處理...</p>
                                </div>
                            ) : selectedItem.status === 'error' ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-red-500">
                                    <p>處理失敗</p>
                                </div>
                            ) : (
                                <ComparisonView
                                    originalUrl={selectedItem.originalUrl}
                                    processedUrl={selectedItem.processedUrl}
                                    croppedOriginalUrl={selectedItem.croppedOriginalUrl}
                                    settings={selectedItem.settingsUsed}
                                    viewMode={viewMode}
                                />
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                        <div className="p-6 bg-slate-100 rounded-full mb-4">
                            <ArrowRightLeft className="w-10 h-10 text-slate-300" />
                        </div>
                        <p className="font-bold">請選擇或上傳一張圖片</p>
                        <p className="text-sm mt-1">左側歷史紀錄可切換檢視</p>
                    </div>
                )}
            </div>

            <style>{`
            .custom-scrollbar::-webkit-scrollbar { width: 4px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
`}</style>
        </div>
    );
};

export default App3;