# Music Score Tool (樂譜圖床與處理工具)

A powerful, privacy-focused React application for musicians to process, clean, and enhance sheet music images.

**Current Version: V3 (Pro)**

## ✨ Key Features (V3)

### 🧠 Dual Processing Algorithms
- **Adaptive (自適應)**: Best for photos. Automatically handles uneven lighting, shadows, and paper wrinkles to produce a clean, high-contrast result.
- **Classic (經典)**: Best for scans. Uses a Red Channel filter to remove specific artifacts and colored markings.

### 🎨 Background & Layout Control
- **Transparent Background**: One-click removal of the paper background for easy compositing.
- **Custom Background Color**: Choose any color for the background if transparency is off.
- **Smart Auto-Crop**: Automatically detects the music content and crops out excess margins.
- **Flexible Padding**: Adjust padding (Uniform, Axis, or Independent) to frame your score perfectly.

### 🛠️ Advanced Image Enhancement
- **Super Resolution**: Adjustable scaling (up to 3x) for crisp, print-ready edges.
- **Edge Smoothing**: Configurable anti-aliasing to remove jagged edges.
- **Live Comparison**: Split-screen slider to compare the original and processed images in real-time.

### ⚡ Workflow Efficiency
- **Local History**: Keeps track of your recent uploads and settings within the session.
- **Privacy First**: All processing is done **locally in your browser**. No images are ever uploaded to a server.
- **Sync Crop**: View the original image cropped exactly like the processed result for precise comparison.

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- npm

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/br/music-score-tool.git
   cd music-score-tool
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open `http://localhost:5173` in your browser.

## 📖 Usage Guide (V3)

1. **Upload**: Drag & drop images or paste from clipboard (Ctrl+V/Cmd+V).
2. **Select Algorithm**:
   - Use **Adaptive** for most phone camera photos.
   - Use **Classic** if you need to filter out red ink or have a flat scan.
3. **Fine-Tune**:
   - Adjust **Threshold** to control line thickness.
   - Tweak **Smoothness** to reduce noise.
4. **Layout**:
   - Enable **Auto Crop** to remove borders.
   - Set **Padding** as needed.
   - Toggle **Transparent Background** or pick a **Background Color**.
5. **Download**: Click the Download button to save the processed PNG.

## 🛠️ Tech Stack

- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS 4
- **Icons**: Lucide React

## 📦 Deployment

This project is configured for GitHub Pages.

```bash
# Build for production
npm run build

# Deploy to GitHub Pages
npm run deploy
```

## License

MIT
