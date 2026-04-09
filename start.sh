#!/bin/bash
# Convenience launcher for AI Terminal Manager (development mode)
# Run this script to start both React dev server and Electron

cd "$(dirname "$0")"

# Kill any existing instances
pkill -f "react-scripts start" 2>/dev/null
pkill -f "electron ." 2>/dev/null
sleep 1

# Start React dev server in background
npm run react-start &
REACT_PID=$!

# Wait for React to be ready
echo "Waiting for React dev server..."
until curl -s http://localhost:3000 > /dev/null 2>&1; do
  sleep 1
done
echo "React ready. Launching Electron..."

# Launch Electron
NODE_ENV=development ./node_modules/.bin/electron .

# Cleanup on exit
kill $REACT_PID 2>/dev/null
