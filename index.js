const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

const port = process.env.PORT || 3000;

// Serveur minimal : Render voit un port ouvert, et un pinger peut garder le bot éveillé
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("NixBot is running ✅");
}).listen(port, () => console.log("[launcher] port " + port));

let child = null;
let stopping = false;
let fails = 0;

function startBot() {
  const startedAt = Date.now();
  child = spawn(process.execPath, [path.join(__dirname, "nix.js")], {
    cwd: __dirname,
    stdio: "inherit",
    env: process.env
  });

  child.on("exit", (code, signal) => {
    if (stopping) return process.exit(0);
    // code 2 = redémarrage demandé par le bot
    if (code === 2) return setTimeout(startBot, 1000);
    // plantage : on relance, avec une pause plus longue s'il replante vite
    fails = Date.now() - startedAt < 30000 ? fails + 1 : 0;
    const wait = Math.min(5000 * (fails + 1), 60000);
    console.log(`[launcher] nix.js arrêté (code ${code}, signal ${signal}). Relance dans ${wait / 1000}s`);
    setTimeout(startBot, wait);
  });
}

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    stopping = true;
    if (child) child.kill(sig);
    else process.exit(0);
  });
}

startBot();
