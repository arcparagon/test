const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require("@whiskeysockets/baileys")

const pino = require("pino")
const express = require("express")

const app = express()

const PORT = process.env.PORT || 3000
const BOT_NUMBER = (process.env.BOT_NUMBER || "447463445574").replace(/\+/g, "")

app.get("/", (req, res) => {
  res.status(200).send("WhatsApp Bot Online")
})

app.get("/health", (req, res) => {
  res.json({
    status: true,
    uptime: Math.floor(process.uptime())
  })
})

app.listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`)
})

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./session")

  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    browser: ["Render Pairing Bot", "Chrome", "1.0.0"]
  })

  sock.ev.on("creds.update", saveCreds)

  let pairingPrinted = false

  sock.ev.on("connection.update", async (update) => {
    const {
      connection,
      lastDisconnect
    } = update

    console.log("Connection Update:", connection)

    try {
      if (
        !sock.authState.creds.registered &&
        !pairingPrinted
      ) {
        pairingPrinted = true

        await new Promise(resolve =>
          setTimeout(resolve, 8000)
        )

        const code = await sock.requestPairingCode(
          BOT_NUMBER
        )

        console.log("")
        console.log("====================================")
        console.log("PAIRING CODE")
        console.log(code)
        console.log("====================================")
        console.log("")
      }
    } catch (err) {
      pairingPrinted = false
      console.error("Pairing Error:", err)
    }

    if (connection === "open") {
      console.log("WhatsApp Connected Successfully")
    }

    if (connection === "close") {
      console.log("Connection Closed")

      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut

      if (shouldReconnect) {
        console.log("Reconnecting in 5 seconds...")

        setTimeout(() => {
          startBot()
        }, 5000)
      } else {
        console.log("Logged Out")
      }
    }
  })

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages?.[0]

    if (!msg?.message) return

    const jid = msg.key.remoteJid

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      ""

    console.log(`[MSG] ${jid}: ${text}`)

    if (text === ".ping") {
      await sock.sendMessage(jid, {
        text: "pong 🗿"
      })
    }

    if (text === ".runtime") {
      await sock.sendMessage(jid, {
        text: `Runtime: ${Math.floor(
          process.uptime()
        )} seconds`
      })
    }

    if (text === ".menu") {
      await sock.sendMessage(jid, {
        text:
`MENU

.ping
.runtime
.menu`
      })
    }
  })
}

startBot().catch(err => {
  console.error("Fatal Error:", err)
})
