// Removes the previous stage build (index.html and assets/) but keeps public/stage/cover.local.json.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'public', 'stage');
fs.mkdirSync(dir, { recursive: true });
fs.rmSync(path.join(dir, 'assets'), { recursive: true, force: true });
fs.rmSync(path.join(dir, 'index.html'), { force: true });
