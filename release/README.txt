Self-contained builds for historic-portfolio-ai.

Windows:
1. Open release/windows
2. Double-click start-windows.bat
3. Browser opens http://127.0.0.1:5087
4. To stop the app, double-click stop-windows.bat

macOS Apple Silicon:
1. Open release/mac-arm64
2. Double-click start-mac.command
3. Browser opens http://127.0.0.1:5087
4. To stop the app, double-click stop-mac.command

macOS Intel:
1. Open release/mac-x64
2. Double-click start-mac.command
3. Browser opens http://127.0.0.1:5087
4. To stop the app, double-click stop-mac.command

If macOS blocks the app after download, open System Settings -> Privacy & Security and allow it, or run:
chmod +x ./historic-portfolio-ai ./start-mac.command ./stop-mac.command
./start-mac.command
