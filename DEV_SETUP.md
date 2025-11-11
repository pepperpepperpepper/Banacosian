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
   - `index.html` – Landing page layout and staff container dataset hints (`data-staff-*`)
   - `css/` – Shared styling (see `css/components/`, `css/layout/`)
   - `js/modules/` – Application orchestration (`Staff.js`, `StaffFonts.js`, keyboard/audio logic)
   - `js/vexflow/core/` – Shared rendering pipeline (`config.js`, `renderPipeline.js`, `draw.js`, `seeds.js`)
   - `js/shared/utils.js` – Cross-cutting helpers (structured logging, debounce, dataset parsing, DOM rects)
   - `www/staff/` – VexFlow demo entry points that consume the shared core

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
project-root/
├── index.html                 # Main page; configures the app staff via data-staff-* attributes
├── css/                       # Shared styles (components, layout, utilities)
├── js/
│   ├── modules/               # App-level controllers (Staff.js, StaffFonts.js, Keyboard.js, etc.)
│   ├── shared/utils.js        # Logging, debounce, dataset parsing, DOM helpers
│   └── vexflow/
│       ├── StaffDisplay.js    # High-level staff orchestrator used on the main page
│       └── core/              # Shared VexFlow pipeline (config, draw, renderPipeline, seeds, helpers)
├── www/staff/
│   ├── index.html             # Standalone UI + interaction demos
│   └── vexflow-demo.js        # Demo bootstrap wired into the shared VexFlow core
├── docs/                      # Reference docs (refactor map, dependency graphs, notes)
├── package.json               # Project configuration & scripts
└── node_modules/              # Dependencies (after npm install)
```

### Shared VexFlow modules

- `js/vexflow/core/config.js` centralizes staff sizing, padding defaults, and SVG theme application slots.
- `js/shared/utils.js` hosts reusable helpers (structured logging, debounce, dataset readers, `normalizeDomRect`).
- Both the main app (`js/modules/Staff.js`) and the `/staff` demos rely on these modules; extend them when adding new staff features instead of duplicating logic locally.

## Tips for Development

- **Use browser dev tools** (F12) for debugging
- **Test audio functionality** regularly
- **Check mobile responsiveness** using browser device emulation
- **Monitor console** for errors and warnings
- **Save frequently** - live reload will handle the rest
