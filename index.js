const {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  Browsers
} = require('@exclipz/bails');
const pino = require('pino');

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    browser: Browsers.ubuntu('Chrome'), // helps avoid some connection issues
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
    },
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    connectTimeoutMs: 60_000, // give it time to connect
  });

  sock.ev.on('creds.update', saveCreds);

  // We'll use a promise that resolves only when connection === 'open'
  const waitForOpen = () =>
    new Promise((resolve, reject) => {
      const handler = ({ connection }) => {
        if (connection === 'open') {
          sock.ev.off('connection.update', handler);
          resolve();
        } else if (connection === 'close') {
          sock.ev.off('connection.update', handler);
          reject(new Error('Connection closed before open'));
        }
      };
      sock.ev.on('connection.update', handler);
    });

  // Permanent connection watcher (for reconnection & logging)
  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      console.log('✅ Bot connected successfully!');
    } else if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed. Reconnecting:', shouldReconnect);
      if (shouldReconnect) {
        startBot(); // restart
      } else {
        console.log('👋 Logged out. Delete "auth_info" folder and redeploy.');
      }
    }
  });

  // If not registered, wait until the socket is OPEN before requesting a pairing code
  if (!sock.authState.creds.registered) {
    try {
      console.log('Waiting for connection to open...');
      await waitForOpen();
      const ownerNumber = '447463445574';
      console.log('Requesting pairing code for', ownerNumber);
      const code = await sock.requestPairingCode(ownerNumber);
      console.log(`\n🔐 Your pairing code: ${code}\n`);
      console.log('Enter this code on your phone: WhatsApp → Linked Devices → Link with phone number.');
    } catch (err) {
      console.error('Failed to request pairing code:', err.message);
      // Retry after a short delay
      setTimeout(() => startBot(), 5000);
      return;
    }
  }

  return sock;
}

// Start and ignore any WebSocket-level crash to let reconnection logic handle it
startBot().catch(err => console.error('❌ Bot crashed:', err));
