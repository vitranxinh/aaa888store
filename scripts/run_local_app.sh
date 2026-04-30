#!/bin/zsh
set -e

cd ~/Projects/soban-retail

if [ ! -d node_modules ]; then
  npm install
fi

npx prisma generate
npm run build
nohup npm run start > app.log 2>&1 & echo $! > app.pid

echo "App started in background."
echo "PID: $(cat app.pid)"
echo "URL: http://localhost:3000"
echo "Log: ~/Projects/soban-retail/app.log"
