# Run Doc — Muragoods Dev Server

## How to Reproduce Uncommitted Artifacts
- Copy `.env.local` from the main checkout (contains `MONGODB_URI` and other env vars)
- Run `npm install` to install dependencies

## How to Run the Server
- Port: 3456 (project default from `package.json`)
- Command: `npm run dev -- -p 3456`
- The server is a Next.js dev server with Turbopack
- Detach on Windows: `powershell -NoProfile -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','cd /d <workdir> && npm run dev -- -p 3456 > <log> 2> <log>.err' -WindowStyle Hidden -PassThru"`
