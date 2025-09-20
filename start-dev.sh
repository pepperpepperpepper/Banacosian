#!/bin/bash

# Development server start script for Ear Training App

echo "🎵 Starting Ear Training App Development Server..."
echo "📍 Directory: $(pwd)"
echo "🌐 URL: http://localhost:8080"
echo ""
echo "🔄 Live reload is enabled - changes will auto-refresh the browser"
echo "📱 Test on mobile: http://$(hostname -I | awk '{print $1}'):8080"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start the development server
npm run dev