const http = require('http');

const query = encodeURIComponent("I feel sad and overwhelmed");
const persona = 'zoya';
const options = {
  hostname: 'localhost',
  port: 3001,
  path: `/_testReply?q=${query}&persona=${persona}`,
  method: 'GET'
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('STATUS', res.statusCode);
    console.log('HEADERS', res.headers);
    console.log('BODY', data);
  });
});

req.on('error', (e) => { console.error('problem with request:', e.message); });
req.end();
