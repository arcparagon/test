const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require("@whiskeysockets/baileys")

const pino = require("pino")
const express = require("express")

const OWNER = "447463445574"

const app = express()

app.get("/", (_, res) => {
  res.status(200).send("WhatsApp Bot Online")
})

app.get("/health", (_, res) => {
  res.json({
    status: true,
    uptime: process.uptime()
  })
})

app.listen(process.env.PORT || 3000, () => {
  console.log("Web server running")
})

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./session")

  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    browser: ["Render Bot", "Chrome", "1.0.0"]
  })

  if (!sock.authState.creds.registered) {
    const phoneNumber = process.argv[2] || "6283835144173"

    try {
      const pairingCode = await sock.requestPairingCode(phoneNumber)

      console.log("")
      console.log("================================")
      console.log("PAIRING CODE")
      console.log(pairingCode)
      console.log("================================")
      console.log("")
    } catch (err) {
      console.error(err)
    }
  }

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", async (update) => {
    const {
      connection,
      lastDisconnect
    } = update

    if (connection === "connecting") {
      console.log("Connecting...")
    }

    if (connection === "open") {
      console.log("Connected")
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut

      console.log("Disconnected")

      if (shouldReconnect) {
        setTimeout(() => {
          startBot()
        }, 5000)
      }
    }
  })

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0]

    if (!msg?.message) return

    const jid = msg.key.remoteJid

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      ""

    console.log(`[MESSAGE] ${jid} -> ${text}`)

    if (text === ".ping") {
      await sock.sendMessage(jid, {
        text: "pong 🗿"
      })
    }

    if (text === ".owner") {
      await sock.sendMessage(jid, {
        text: `Owner: ${OWNER}`
      })
    }

    if (text === ".runtime") {
      await sock.sendMessage(jid, {
        text: `Runtime ${Math.floor(process.uptime())} seconds`
      })
    }

    if (text === ".menu") {
      await sock.sendMessage(jid, {
        text: `
MENU

.ping
.owner
.runtime
.menu
        `.trim()
      })
    }
  })
}

startBot()
