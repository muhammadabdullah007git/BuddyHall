# BuddyHall 🎥🍿

**Watch, Talk, and Hang out with your buddies.**

BuddyHall is a real-time synchronized video watching and chat application. It allows you to watch videos together with friends in perfect sync, chat in real-time, and even share your screen—all available on the web or as a native desktop application.

![BuddyHall Screenshot](./public/file.svg) *(Replace with actual screenshot)*

## ✨ Features

- **Synced Video Playback**: Pause, Play, and Seek are synchronized for everyone in the room.
- **Real-time Chat**: Instant messaging with a persistent connection.
- **Voice Chat**: Toggle microphone support (`getUserMedia`) for voice communication.
- **Screen Sharing**: Native screen sharing support (Desktop App) or browser-based sharing.
- **Cross-Platform**:
  - 🌐 **Web**: Next.js application compatible with modern browsers.
  - 🐧 **Desktop**: Electron-based native application (Linux AppImage ready).
- **Mobile Optimized**: Responsive layout that stacks video and chat for great mobile usability.

## 🛠️ Tech Stack

- **Frontend**: Next.js 15+, React 19
- **Desktop Wrapper**: Electron 28+
- **Real-time**: Socket.io
- **P2P Streaming**: WebRTC (simple-peer)
- **Styling**: CSS Modules (Glassmorphism design)

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ installed.

### 1. Web Version (Development)

Run the web application locally:

```bash
# Install dependencies
npm install

# Run development server (runs custom server.js)
npm run dev
```

Open `http://localhost:3000` in your browser.

### 2. Desktop Application (Electron)

Build and run the native desktop app:

```bash
# Run Electron in development mode
npm run electron:dev

# Build for Production (Linux AppImage)
npm run electron:build
```

The output AppImage will be in the `dist/` folder.

## 📱 Mobile Testing

Mic permissions require a secure context (HTTPS) or `localhost`.

1. Connect phone via USB.
2. Use Chrome Remote Debugging to forward port `3000`.
3. Open `http://localhost:3000` on your phone.

## 🤝 Contributing

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
