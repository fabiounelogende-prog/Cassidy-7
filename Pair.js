// Générateur de session WhatsApp (code de liaison) - à lancer UNE fois pour créer creds.json
// Utilisation : variable PHONE = ton numéro WhatsApp avec l'indicatif, sans + (ex: 243812345678)
const fs = require("fs");
const path = require("path");
const http = require("http");

const PHONE = (process.env.PHONE || "").replace(/\D/g, "");
if (!PHONE) {
  console.log("❌ Ajoute la variable PHONE (ex: 243812345678, indicatif inclus, sans +)");
  process.exit(1);
}

// Port ouvert pour que Render ne considère pas le service comme en échec
http.createServer((q, r) => r.end("pairing en cours...")).listen(process.env.PORT || 3000);

const dir = path.join(__dirname, "session");

(async () => {
  const B = await import("@whiskeysockets/baileys");
  const makeWASocket = (B.default && B.default.default) || B.default || B.makeWASocket;
  const { useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } = B;
  const pino = require("pino");

  async function go() {
    const { state, saveCreds } = await useMultiFileAuthState(dir);
    const v = await fetchLatestBaileysVersion().catch(() => ({}));
    const sock = makeWASocket({
      auth: state,
      version: v.version,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      browser: Browsers.ubuntu("Chrome")
    });
    sock.ev.on("creds.update", saveCreds);

    if (!sock.authState.creds.registered) {
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(PHONE);
          console.log("\n==============================");
          console.log("   CODE WHATSAPP : " + (code.match(/.{1,4}/g) || [code]).join("-"));
          console.log("==============================");
          console.log("WhatsApp > Appareils connectés > Connecter un appareil > Lier avec le numéro de téléphone\n");
        } catch (e) {
          console.log("❌ Impossible d'obtenir le code : " + e.message);
        }
      }, 3000);
    }

    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
      if (connection === "open") {
        console.log("✅ Connecté. Préparation de creds.json...");
        setTimeout(() => {
          try {
            const json = JSON.stringify(JSON.parse(fs.readFileSync(path.join(dir, "creds.json"), "utf8")));
            console.log("\n===== DEBUT creds.json (copie tout, sans les lignes ====) =====");
            console.log(json);
            console.log("===== FIN creds.json =====\n");
            console.log("⚠️ Garde ce contenu secret. Colle-le dans Render > Environment > Secret Files (nom : creds.json).");
          } catch (e) {
            console.log("❌ creds.json introuvable : " + e.message);
          }
          setTimeout(() => process.exit(0), 20000);
        }, 4000);
      }
      if (connection === "close") {
        const code = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode;
        if (code === DisconnectReason.loggedOut) {
          console.log("❌ Session refusée par WhatsApp. On repart de zéro : relance le déploiement.");
          fs.rmSync(dir, { recursive: true, force: true });
          process.exit(1);
        }
        setTimeout(go, 1500); // normal juste après la liaison (redémarrage demandé)
      }
    });
  }
  go();
})();
