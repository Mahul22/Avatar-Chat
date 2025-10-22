const io = require('socket.io-client');

const socket = io('http://localhost:3001');

socket.on('connect', () => {
  console.log('test client connected', socket.id);
  // ensure LLM off for deterministic behavior
  socket.emit('setLLM', false);
  // send a message as zoya
  const payload = { text: "I feel sad and overwhelmed", persona: 'zoya' };
  console.log('sending payload:', payload);
  socket.emit('newMessage', payload);
});

socket.on('message', (m) => {
  console.log('received message event:', m);
  if (m && m.sender === 'bot' && m.persona === 'zoya') {
    console.log('Zoya reply:', m.text);
    socket.disconnect();
    process.exit(0);
  }
});

socket.on('connect_error', (err) => {
  console.error('connect_error', err);
});

setTimeout(() => {
  console.error('Timeout waiting for reply');
  process.exit(2);
}, 8000);
