console.log('Hello from Node.js!');
console.log('This is a simple test script');
console.log('Starting application...');

// Simple HTTP server example (optional)
const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello World! Server is running.\n');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
