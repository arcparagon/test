const {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason
} = require('@exclipz/bails');
const pino = require('pino');

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
    },
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false
  });

  // Always save credentials when they update
  sock.ev.on('creds.update', saveCreds);

  // Promise that resolves when the socket reaches a state where we can request a pairing code
  const waitForValidConnection = () => new Promise((resolve, reject) => {
    const onUpdate = (update) => {
      const { connection } = update;
      if (connection && connection !== 'close') {
        sock.ev.off('connection.update', onUpdate);  // clean up
        resolve();
      } else if (connection === 'close') {
        sock.ev.off('connection.update', onUpdate);
        reject(new Error('Connection closed before pairing code could be requested'));
      }
    };
    sock.ev.on('connection.update', onUpdate);
  });

  // Main connection handler (for reconnection / logging)
  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      console.log('✅ Bot connected successfully!');
    } else if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed. Reconnecting:', shouldReconnect);
      if (shouldReconnect) {
        startBot();  // restart the whole process
      } else {
        console.log('👋 Logged out. Delete the "auth_info" folder to re-pair.');
      }
    }
  });

  // If the bot isn't registered yet, request a pairing code once the socket is ready
  if (!sock.authState.creds.registered) {
    try {
      await waitForValidConnection();  // wait until WebSocket is open enough
      const ownerNumber = '447463445574';
      const code = await sock.requestPairingCode(ownerNumber);
      console.log(`\n🔐 Your pairing code: ${code}\n`);
      console.log('Enter this code in WhatsApp on your phone (Linked Devices > Link with phone number).');
    } catch (err) {
      console.error('Failed to get pairing code:', err.message);
      startBot(); // retry
      return;
    }
  }

  return sock;
}

startBot().catch(err => console.error('❌ Fatal error:', err));
