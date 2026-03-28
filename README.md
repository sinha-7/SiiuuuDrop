# ⚡ SiiuuuDrop

SiiuuuDrop is a high-performance **Mobile-to-PC Gallery Browser** and media streamer. It allows you to instantly browse your entire iPhone photo library from any PC browser on the same network and download thousands of files in a single, memory-optimized batch ZIP.

![SiiuuuDrop Banner](https://img.shields.io/badge/SiiuuuDrop-v1.0.0-blue?style=for-the-badge&logo=apple)

## ✨ Key Features

- **🚀 Instant PC Sync**: Share your entire 10,000+ item gallery in seconds via a 6-digit session code.
- **🖼️ Progressive Thumbnails**: Meta-data streams instantly; thumbnails populate the grid in the background.
- **📦 Batch ZIP Downloads**: Select multiple (or all) items on your PC and download them as a single `.zip` archive.
- **🛡️ iOS Memory Protection**: 
  - **Backpressure**: The phone pauses streaming until the PC confirms receipt of the last chunk.
  - **Task Prioritization**: Background thumbnail generation pauses during active downloads to prevent OOM (Out of Memory) crashes.
  - **Breather Delays**: Intelligent yield points in the JavaScript loop allow the iOS garbage collector to keep RAM flat.
- **🛠️ Zero Config**: Works over local WiFi using Expo Go and a small Node.js relay server.

---

## 🏗️ Architecture

- **Mobile**: React Native (Expo SDK 54) - iOS Gallery Access.
- **Client**: React (Vite) + Tailwind CSS - Web UI.
- **Server**: Node.js + Socket.IO - Real-time signaling & data relay.

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** installed on your PC.
- **Expo Go** app installed on your iPhone (App Store).
- PC and iPhone must be on the **same WiFi network**.

### 2. Installation

Clone the repository and install dependencies in all three folders:

```bash
# Install Server deps
cd server && npm install

# Install Client deps
cd ../client && npm install

# Install Mobile deps
cd ../mobile && npm install
```

### 3. Run the Application

You need to run all three components simultaneously. Open 3 terminal tabs:

**Tab 1: Node.js Relay Server**
```bash
cd server
node index.js
```

**Tab 2: PC UI (Vite)**
```bash
cd client
npm run dev -- --host
```

**Tab 3: Mobile Packager (Expo)**
```bash
cd mobile
npx expo start --tunnel
```

### 4. How to Connect
1. Open the PC UI URL shown in Tab 2 (e.g., `http://localhost:5173/gallery`).
2. Note the **6-digit Session Code** at the top.
3. Open the **SiiuuuDrop** app on your iPhone via Expo Go.
4. Enter your **PC's Local IP** (shown in Tab 2 network address) and the **Session Code**.
5. Hit **Connect & Share Gallery**.
6. **Enjoy!** Browse on PC and download your memories.

---

## 🛠️ Tech Highlights

- **Custom Binary-over-Socket Streaming**: Bypasses React Native WebSocket limitations using chunked Base64 fragments.
- **Client-Side Zipping**: Uses `JSZip` to bundle multi-file selections directly in the browser.
- **Expo SDK 54 Compat**: Uses `expo-file-system/legacy` for stable File I/O on modern iOS versions.

---
