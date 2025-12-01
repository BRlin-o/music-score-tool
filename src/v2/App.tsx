import React, { useState, useEffect, useCallback, useRef, type ChangeEvent } from 'react';
import { Upload, X, Download, Image as ImageIcon, Loader2, Trash2, Sparkles, Zap, History, Clipboard, ArrowRightLeft } from 'lucide-react';

// --- TYPES ---
interface Settings {
    threshold: number;
    contrastBoost: number;
    superResolution: boolean;
}

interface GalleryItem {
    id: string;
    name: string;
    originalUrl: string;
    processedUrl: string | null;
    status: 'processing' | 'done' | 'error';
    timestamp: Date;
    settingsUsed: Settings;
}

// --- HELPER: Core processing logic ---
const processSingleImage = async (imgSrc: string, settings: Settings): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            try {
                const { threshold, contrastBoost, superResolution } = settings;
                const maxWidth = img.width;
                const scaleMult = superResolution ? 2 : 1;
                const targetWidth = maxWidth * scaleMult;
                const scaleFactor = targetWidth / img.width;
                const scaledHeight = img.height * scaleFactor;

                const canvas = document.createElement('canvas');
                canvas.width = targetWidth;
                canvas.height = scaledHeight;
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error("Could not get canvas context");

                // High Quality Scaling
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, targetWidth, scaledHeight);

                const imageData = ctx.getImageData(0, 0, targetWidth, scaledHeight);
                const data = imageData.data;
                const boostFactor = contrastBoost / 100;

                // Red Channel Filter & Binarization
                for (let i = 0; i < data.length; i += 4) {
                    let r = data[i];
                    if (r < threshold + 40) {
                        r = r * (1 - boostFactor);
                    }
                    const finalVal = r < threshold ? 0 : 255;
                    data[i] = finalVal;
                    data[i + 1] = finalVal;
                    data[i + 2] = finalVal;
                }

                ctx.putImageData(imageData, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            } catch (err) {
                reject(err);
            }
        };
        img.onerror = (err) => reject(err);
        img.src = imgSrc;
    });
};

// --- COMPONENT: Comparison Slider ---
interface ComparisonViewProps {
    originalUrl: string;
    processedUrl: string | null;
    settings: Settings;
}

const ComparisonView = ({ originalUrl, processedUrl, settings }: ComparisonViewProps) => {
    const [sliderPos, setSliderPos] = useState(50);
    const containerRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);

    const handleMove = useCallback((clientX: number) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
        const percent = (x / rect.width) * 100;
        setSliderPos(percent);
    }, []);

    const onMouseDown = () => (isDragging.current = true);
    const onMouseUp = () => (isDragging.current = false);
    const onMouseMove = (e: React.MouseEvent) => {
        if (isDragging.current) handleMove(e.clientX);
    };

    const onTouchMove = (e: React.TouchEvent) => {
        handleMove(e.touches[0].clientX);
    };

    // Reset slider when image changes
    useEffect(() => {
        setSliderPos(50);
    }, [originalUrl]);

    // Global mouse up to catch drag release outside component
    useEffect(() => {
        const handleGlobalMouseUp = () => (isDragging.current = false);
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, []);

    if (!originalUrl) return null;

    return (
        <div
            className="relative w-full h-full flex items-center justify-center bg-slate-200/50 overflow-hidden select-none"
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onTouchMove={onTouchMove}
        >
            <div
                ref={containerRef}
                className="relative max-w-full max-h-full shadow-2xl bg-white"
                style={{ aspectRatio: 'auto' }} // Layout depends on image content
            >
                {/* 1. Base Image (Original) - acts as layout anchor */}
                <img
                    src={originalUrl}
                    alt="Original"
                    className="block max-w-full max-h-[85vh] object-contain pointer-events-none"
                    draggable="false"
                />

                {/* 2. Overlay Image (Processed) - Clipped */}
                {processedUrl && (
                    <div
                        className="absolute inset-0 overflow-hidden"
                        style={{ width: `${sliderPos}%` }}
                    >
                        <img
                            src={processedUrl}
                            alt="Processed"
                            className="block w-full h-full object-contain pointer-events-none max-w-none"
                        // Note: max-w-none is critical here to ensure the clipped image doesn't shrink inside the narrower container
                        // But since we are using width% on container, we need the inner img to match the PARENT's dimensions exactly.
                        // Better approach: Use CLIP PATH instead of width container for perfect alignment regardless of CSS sizing.
                        />
                    </div>
                )}

                {/* Re-implementing with Clip-Path for safer alignment */}
                {processedUrl && (
                    <img
                        src={processedUrl}
                        alt="Processed Overlay"
                        className="absolute inset-0 w-full h-full object-contain pointer-events-none bg-white"
                        style={{
                            clipPath: `inset(0 ${100 - sliderPos}% 0 0)`
                        }}
                    />
                )}

                {/* 3. Slider Handle */}
                <div
                    className="absolute inset-y-0 w-1 bg-indigo-500 cursor-ew-resize z-20 hover:bg-indigo-400 transition-colors shadow-[0_0_10px_rgba(0,0,0,0.3)]"
                    style={{ left: `${sliderPos}%` }}
                    onMouseDown={onMouseDown}
                    onTouchStart={onMouseDown}
                >
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center shadow-lg border-2 border-white text-white">
                        <ArrowRightLeft className="w-4 h-4" />
                    </div>
                </div>

                {/* Labels */}
                <div className="absolute top-4 left-4 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm z-10 pointer-events-none">
                    處理後 (Processed) {settings?.superResolution && <span className="text-amber-300 font-bold ml-1">HQ</span>}
                </div>
                <div className="absolute top-4 right-4 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm z-10 pointer-events-none">
                    原始 (Original)
                </div>
            </div>
        </div>
    );
};


const App2 = () => {
    // --- STATE ---
    const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
    const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);

    // Settings
    const [threshold, setThreshold] = useState(140);
    const [contrastBoost, setContrastBoost] = useState(20);
    const [superResolution, setSuperResolution] = useState(false);

    const settingsRef = useRef<Settings>({ threshold, contrastBoost, superResolution });

    useEffect(() => {
        settingsRef.current = { threshold, contrastBoost, superResolution };
    }, [threshold, contrastBoost, superResolution]);


    // --- LOGIC ---
    const handleNewFiles = useCallback(async (files: File[]) => {
        if (files.length === 0) return;

        const newItems: GalleryItem[] = files.map(file => ({
            id: Math.random().toString(36).substr(2, 9),
            name: file.name.split('.')[0] || 'Screenshot',
            originalUrl: URL.createObjectURL(file),
            processedUrl: null,
            status: 'processing',
            timestamp: new Date(),
            settingsUsed: { ...settingsRef.current }
        }));

        setGalleryItems(prev => [...newItems, ...prev]);

        // Process first item immediately and select it
        if (newItems.length > 0) {
            setSelectedItem(newItems[0]);
        }

        newItems.forEach(async (item) => {
            try {
                const processedUrl = await processSingleImage(item.originalUrl, item.settingsUsed);

                setGalleryItems(prev => prev.map(prevItem =>
                    prevItem.id === item.id
                        ? { ...prevItem, processedUrl, status: 'done' }
                        : prevItem
                ));

                // If this item is currently selected, trigger a re-render/update
                setSelectedItem(curr => curr && curr.id === item.id ? { ...item, processedUrl, status: 'done' } : curr);

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
        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
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
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [handleNewFiles]);


    const downloadItem = (item: GalleryItem) => {
        if (!item || !item.processedUrl) return;
        const link = document.createElement('a');
        link.href = item.processedUrl;
        const suffix = item.settingsUsed.superResolution ? '_HQ' : '';
        link.download = `${item.name}_clean${suffix}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const deleteItem = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setGalleryItems(prev => prev.filter(i => i.id !== id));
        if (selectedItem?.id === id) setSelectedItem(null);
    };

    return (
        <div className="h-screen bg-slate-100 text-slate-800 font-sans flex flex-col md:flex-row overflow-hidden">

            {/* === LEFT SIDEBAR === */}
            <div className="w-full md:w-80 lg:w-96 bg-white border-r border-slate-200 flex flex-col h-[40vh] md:h-full z-10 shadow-xl">
                {/* Header */}
                <div className="p-4 border-b border-slate-100">
                    <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <History className="w-6 h-6 text-indigo-600" />
                        樂譜工作站
                    </h1>
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                        <Clipboard className="w-3 h-3" /> Ctrl+V 貼上 / 拖曳上傳
                    </p>
                </div>

                {/* Controls */}
                <div className="p-4 space-y-5 overflow-y-auto flex-shrink-0 custom-scrollbar">
                    {/* Super Resolution */}
                    <div
                        className={`relative overflow-hidden rounded-lg p-3 border-2 transition-all cursor-pointer group select-none ${superResolution ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-slate-50 hover:border-amber-200'}`}
                        onClick={() => setSuperResolution(!superResolution)}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className={`p-1.5 rounded-md ${superResolution ? 'bg-amber-400 text-white' : 'bg-slate-200 text-slate-400'}`}>
                                    <Sparkles className="w-4 h-4" />
                                </div>
                                <span className={`font-bold text-sm ${superResolution ? 'text-amber-900' : 'text-slate-600'}`}>2x 超解析優化</span>
                            </div>
                            {superResolution && <Zap className="w-3 h-3 text-amber-500 fill-current" />}
                        </div>
                    </div>

                    {/* Sliders */}
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <div className="flex justify-between">
                                <label className="text-xs font-bold text-slate-600">黑白閾值</label>
                                <span className="text-xs font-mono text-indigo-600">{threshold}</span>
                            </div>
                            <input type="range" min="50" max="220" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-lg accent-indigo-600" />
                        </div>
                        <div className="space-y-1">
                            <div className="flex justify-between">
                                <label className="text-xs font-bold text-slate-600">墨色加深</label>
                                <span className="text-xs font-mono text-indigo-600">{contrastBoost}%</span>
                            </div>
                            <input type="range" min="0" max="60" value={contrastBoost} onChange={(e) => setContrastBoost(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-lg accent-indigo-600" />
                        </div>
                    </div>

                    {/* Upload Button */}
                    <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-indigo-200 rounded-xl cursor-pointer bg-indigo-50/50 hover:bg-indigo-50 transition-colors group">
                        <div className="flex flex-col items-center justify-center text-indigo-400 group-hover:text-indigo-600">
                            <Upload className="w-5 h-5 mb-1" />
                            <span className="text-xs font-bold">點擊上傳圖片 或 Ctrl+V 貼上</span>
                        </div>
                        <input type="file" className="hidden" accept="image/jpeg, image/png" multiple onChange={handleFileUpload} />
                    </label>
                </div>

                {/* Mini Gallery (History) */}
                <div className="flex-1 flex flex-col min-h-0 border-t border-slate-100 bg-slate-50">
                    <div className="p-3 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                        <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                            <ImageIcon className="w-3 h-3" /> 歷史紀錄 ({galleryItems.length})
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
                                className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer border transition-all relative group
                                ${selectedItem?.id === item.id ? 'bg-white border-indigo-500 shadow-md ring-1 ring-indigo-500' : 'bg-white border-slate-200 hover:border-indigo-300'}
                            `}
                            >
                                <div className="w-12 h-12 bg-slate-100 rounded overflow-hidden flex-shrink-0 border border-slate-100">
                                    {item.status === 'processing' ? (
                                        <div className="w-full h-full flex items-center justify-center text-indigo-500">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        </div>
                                    ) : (
                                        <img src={item.processedUrl || item.originalUrl} className="w-full h-full object-cover" alt="thumb" />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className={`text-xs font-bold truncate ${selectedItem?.id === item.id ? 'text-indigo-700' : 'text-slate-700'}`}>
                                        {item.name}
                                    </p>
                                    <p className="text-[10px] text-slate-400 mt-0.5 flex gap-1">
                                        {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        {item.settingsUsed.superResolution && <span className="text-amber-500 font-bold">HQ</span>}
                                    </p>
                                </div>

                                {/* Delete Action */}
                                <button
                                    onClick={(e) => deleteItem(item.id, e)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                        {galleryItems.length === 0 && (
                            <div className="text-center py-8 text-slate-300 text-xs">
                                暫無紀錄
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* === RIGHT MAIN AREA === */}
            <div className="flex-1 bg-slate-200/80 relative flex flex-col h-[60vh] md:h-full">
                {selectedItem ? (
                    <>
                        {/* Toolbar */}
                        <div className="absolute top-4 right-4 z-30 flex gap-2">
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

                        {/* Comparison Viewer */}
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
                                    settings={selectedItem.settingsUsed}
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

export default App2;