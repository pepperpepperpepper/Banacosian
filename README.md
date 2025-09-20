# 🎵 Melodic Dictation - Ear Training App

A web-based ear training application that helps musicians improve their melodic dictation skills through interactive practice.

## 🎯 Features

- **Interactive Piano Keyboard**: Click or tap to play notes
- **Visual Staff Display**: See notes displayed on musical staff
- **Customizable Difficulty**: Choose sequence length (2-5 notes)
- **Multiple Scales**: Diatonic and chromatic modes
- **Real-time Feedback**: Immediate accuracy scoring
- **Progress Tracking**: Monitor your improvement over time
- **Mobile Responsive**: Works on desktop and mobile devices
- **Audio Context**: Uses Web Audio API for high-quality sound

## 🚀 Quick Start

### Development Mode (Live Reload)

```bash
# Start development server with live reload
./start-dev.sh

# Or using npm
npm run dev:open
```

Open your browser to `http://localhost:8080`

### Manual Server Start

```bash
# Using Node.js
npm run dev

# Using Python (no Node.js required)
npm run serve
```

## 🎮 How to Use

1. **Choose Settings**: Select sequence length, scale type, and mode
2. **Generate Sequence**: Click "New Sequence" to create a melody
3. **Listen Carefully**: The sequence will play automatically
4. **Play Back**: Click the piano keys to reproduce what you heard
5. **Get Feedback**: See your accuracy and score immediately
6. **Practice More**: Use "Replay" to hear the sequence again

## 📁 Project Structure

```
ear_training/
├── index.html              # Main application interface
├── css/
│   └── styles.css         # Styling and responsive design
├── js/
│   └── script.js          # Core application logic
├── android/               # Android app wrapper
│   └── app/src/main/assets/  # Web assets for Android
├── package.json           # Node.js dependencies
├── start-dev.sh           # Development server script
├── DEV_SETUP.md           # Development setup guide
└── README.md              # This file
```

## 🔧 Development

### Prerequisites

- Node.js (v14 or higher) OR Python 3
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev:open
```

### Live Development Features

- ✅ **Live Reload**: Browser automatically refreshes on file changes
- ✅ **Hot Module Replacement**: CSS changes apply without full reload
- ✅ **Cross-device Testing**: Access from mobile devices on same network
- ✅ **Developer Tools**: Full debugging capabilities

### File Changes

- **HTML**: `index.html` - Layout and structure
- **CSS**: `css/styles.css` - Styling and responsive design  
- **JavaScript**: `js/script.js` - Application logic and audio handling

## 📱 Mobile Testing

To test on mobile devices:

1. Ensure your development machine and mobile device are on the same WiFi network
2. Find your local IP address:
   ```bash
   # Linux/Mac
   hostname -I | awk '{print $1}'
   
   # Windows
   ipconfig
   ```
3. Access `http://your-local-ip:8080` on your mobile browser

## 🎵 Audio Features

### Supported Notes
- **Range**: C4 to B5 (two octaves)
- **Types**: Natural and sharp notes
- **Scales**: Diatonic (major modes) and Chromatic (all notes)

### Audio Context
- Uses Web Audio API for high-quality sound synthesis
- Requires user interaction to initialize (browser security)
- Supports multiple simultaneous notes

## 🏆 Scoring System

### Round-based Progress
- **Current Round**: Tracks accuracy within current session
- **Overall Score**: Cumulative performance across all sessions
- **Accuracy Percentage**: Real-time feedback on performance

### Data Persistence
- **Session History**: View detailed performance metrics
- **Export/Import**: Save and load progress data
- **Local Storage**: Automatic save of current session

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly using the development server
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🐛 Troubleshooting

### Common Issues

**Audio Not Working**
- Check browser console for errors
- Ensure user has interacted with the page (click/tap)
- Try refreshing the page

**Mobile Display Issues**
- Ensure responsive meta tag is present
- Test in device emulation mode
- Check CSS media queries

**Server Won't Start**
- Check if port 8080 is available
- Try a different port: `npm run dev -- --port=3000`
- Ensure Node.js is installed correctly

### Getting Help

- Check `DEV_SETUP.md` for detailed setup instructions
- Review browser console for JavaScript errors
- Test in different browsers if issues persist

## 🎯 Future Enhancements

- [ ] Additional scales and modes
- [ ] Rhythm dictation exercises
- [ ] Multi-part harmony exercises
- [ ] Progress analytics and charts
- [ ] Audio recording and comparison
- [ ] Custom sequence creation
- [ ] Learning curriculum with levels

---

**Happy practicing! 🎹🎵**