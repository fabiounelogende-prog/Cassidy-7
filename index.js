const { spawn } = require("child_process");
const path = require("path");
const http = require("http");
const fs = require("fs");

const port = process.env.PORT || 3000;

// Serveur minimal : Render voit un port ouvert, et un pinger peut garder le bot éveillé
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("NixBot is running ✅");
}).listen(port, () => console.log("[launcher] port " + port));


// Session WhatsApp : si session/creds.json manque, on le copie depuis un Secret File Render
// (Render > Environment > Secret Files > nom du fichier : creds.json)
function restoreSession() {
  try {
    const dir = path.join(__dirname, "session");
    const dest = path.join(dir, "creds.json");
    if (fs.existsSync(dest)) return;
    const sources = ["/etc/secrets/creds.json", path.join(__dirname, "creds.json")];
    const src = sources.find((f) => fs.existsSync(f));
    if (!src) return console.log("[launcher] aucun creds.json trouvé (Secret File « creds.json » manquant)");
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(src, dest);
    console.log("[launcher] session restaurée depuis " + src);
  } catch (e) {
    console.log("[launcher] restauration de la session impossible : " + e.message);
  }
}

let child = null;
let stopping = false;
let fails = 0;

function startBot() {
  restoreSession();
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
