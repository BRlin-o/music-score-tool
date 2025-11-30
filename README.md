# Music Score Tool Pro (樂譜圖床與合併工具 - 旗艦版)

A powerful React-based tool for musicians and music educators to process, merge, and enhance sheet music images.

## Features

- **Image Merging**: Upload multiple sheet music screenshots and merge them into a single, seamless vertical image.
- **Red Light Filter (Red Channel Filtering)**: Specifically designed to remove background noise and artifacts, perfect for processing scanned or photographed sheet music.
- **Super Resolution (2x Upscaling)**: Uses high-quality bicubic interpolation with smoothing to upscale images by 2x, creating crisp, vector-like edges for printing.
- **Ink Boost**: Enhance the contrast and depth of the music notes (ink) while keeping the background clean.
- **Interactive Preview**: Real-time preview of the processed result with zoom and pan capabilities.
- **Drag & Drop Reordering**: Easily reorder uploaded images before merging.
- **Privacy Focused**: All processing happens locally in your browser. No images are uploaded to any server.

## Tech Stack

- **Frontend Framework**: React 19 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS 4
- **Icons**: Lucide React

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn

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

4. Open your browser and navigate to `http://localhost:5173` (or the URL shown in your terminal).

## Usage

1. **Upload**: Click the upload area to select your sheet music images (PNG or JPG).
2. **Adjust Order**: Use the up/down arrows to arrange the pages in the correct order.
3. **Tune Settings**:
   - **Threshold**: Adjust the black/white cutoff point. Lower values make lines thinner, higher values make them thicker.
   - **Ink Boost**: Increase the darkness of the notes.
   - **Super Resolution**: Toggle this on for high-quality 2x upscaling (recommended for final export).
4. **Download**: Click the "Download Result" button to save the merged sheet music as a PNG file.

## Deployment

This project is configured for deployment to GitHub Pages.

1. Build the project:
   ```bash
   npm run build
   ```

2. Deploy:
   ```bash
   npm run deploy
   ```

## License

MIT
