# Development Setup for Ear Training App

## Quick Start Options

### Option 1: Using Live Server (Recommended)

1. **Install Node.js** if you haven't already:
   ```bash
   # Check if Node.js is installed
   node --version
   npm --version
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start development server (desktop)**:
   ```bash
   # Start server (will open browser automatically)
   npm run dev:open
   
   # Or start server without opening browser
   npm run dev
   ```

4. **Open your browser** to `http://localhost:8080`

### LAN testing with auto-reload (phone/tablet)

```bash
# Serve to your local network (0.0.0.0) so phones can connect
npm run dev:lan

# Or open the default browser automatically
npm run dev:open:lan
```

Then visit `http://YOUR-LAN-IP:8080` on your device (the `start-dev.sh` script prints the IP).

### Option 2: Using Python (No Node.js required)

```bash
# Start a simple HTTP server
npm run serve

# Or manually:
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

### Option 3: VS Code Live Server Extension

1. Install the "Live Server" extension in VS Code
2. Right-click on `index.html` and select "Open with Live Server"
3. Or click the "Go Live" button in the bottom status bar

## Features

✅ **Live Reload**: Any changes to HTML, CSS, or JS files will automatically refresh the browser
✅ **Local Development**: Works offline without internet connection
✅ **Cross-browser**: Works in Chrome, Firefox, Safari, Edge
✅ **Mobile Responsive**: Test on mobile devices by accessing `http://your-local-ip:8080`

## Development Workflow

1. **Make changes** to any file:
   - `index.html` - Structure and content
   - `css/styles.css` - Styling and layout
   - `js/MelodicDictation.js` & files in `js/modules/` - Application logic

2. **See changes instantly** - browser automatically reloads

3. **Test thoroughly**:
   - Desktop browsers
   - Mobile devices (connect to same WiFi)
   - Different screen sizes

## Troubleshooting

### Port Already in Use
If port 8080 is busy:
```bash
# Use a different port
live-server --port=3000
# or
python3 -m http.server 3000
```

### CORS Issues
If you encounter CORS errors, the live server handles this automatically.

### Audio Context Issues
Modern browsers require user interaction to start audio. The app handles this by:
- Waiting for first user click to initialize audio
- Showing clear instructions to users

## Production Deployment

When ready to deploy to Android app:
1. Copy the web files to `android/app/src/main/assets/`
2. The Android WebView will load these files
3. Test thoroughly on Android device

## File Structure

```
ear_training/
├── index.html              # Main HTML file
├── css/
│   └── styles.css         # All styles
├── js/
│   ├── MelodicDictation.js  # Application bootstrap
│   ├── modules/             # Core game logic, audio, storage, UI
│   └── vexflow/StaffDisplay.js  # Shared VexFlow renderer
├── package.json           # Project configuration
├── DEV_SETUP.md           # This file
└── node_modules/          # Dependencies (after npm install)
```

## Tips for Development

- **Use browser dev tools** (F12) for debugging
- **Test audio functionality** regularly
- **Check mobile responsiveness** using browser device emulation
- **Monitor console** for errors and warnings
- **Save frequently** - live reload will handle the rest
