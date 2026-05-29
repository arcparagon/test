const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require("@exclipz/bails")

const express = require("express")
const pino = require("pino")

const app = express()

const PORT = process.env.PORT || 10000
const BOT_NUMBER = (process.env.BOT_NUMBER || "447463445574")
  .replace(/\+/g, "")
  .replace(/\s/g, "")

app.get("/", (req, res) => {
  res.send("Bot Online")
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
  const { state, saveCreds } =
    await useMultiFileAuthState("./session")

  const { version } =
    await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    auth: state,
    version,
    logger: pino({ level: "silent" }),
    browser: [
      "Ubuntu",
      "Chrome",
      "20.0.04"
    ]
  })

  sock.ev.on("creds.update", saveCreds)

  let pairingSent = false

  sock.ev.on("connection.update", async (update) => {
    const {
      connection,
      lastDisconnect
    } = update

    console.log("Connection Update:", connection)

    if (
      !sock.authState.creds.registered &&
      !pairingSent
    ) {
      pairingSent = true

      try {
        await new Promise(resolve =>
          setTimeout(resolve, 15000)
        )

        const code =
          await sock.requestPairingCode(
            BOT_NUMBER
          )

        console.log("")
        console.log("================================")
        console.log("PAIRING CODE")
        console.log(code)
        console.log("================================")
        console.log("")
      } catch (err) {
        pairingSent = false
        console.log("Pairing Error:", err)
      }
    }

    if (connection === "open") {
      console.log("WhatsApp Connected")
    }

    if (connection === "close") {
      console.log("Connection Closed")

      const shouldReconnect =
        lastDisconnect?.error?.output
          ?.statusCode !==
        DisconnectReason.loggedOut

      if (shouldReconnect) {
        setTimeout(() => {
          startBot()
        }, 5000)
      }
    }
  })

  sock.ev.on("messages.upsert", async ({
    messages
  }) => {
    const msg = messages?.[0]

    if (!msg?.message) return

    const jid = msg.key.remoteJid

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      ""

    if (text === ".ping") {
      await sock.sendMessage(jid, {
        text: "pong 🗿"
      })
    }
  })
}

startBot().catch(console.error)
