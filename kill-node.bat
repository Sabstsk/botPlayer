@echo off
echo Stopping all Node.js processes...
taskkill /f /im node.exe 2>nul
taskkill /f /im nodemon.exe 2>nul
echo Done! You can now run npm run dev
pause
