const fs = require('fs');

const raw = fs.readFileSync('C:\\Users\\BRAYAN\\.gemini\\antigravity\\brain\\87c24fe0-d267-4f42-ac1a-fa1d4f2003a2\\.system_generated\\steps\\400\\output.txt', 'utf8');
const lines = raw.split(/\r?\n/);
const result = [];
let started = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('+++ b/backend/src/db/init.js')) {
    started = true;
    continue;
  }
  if (!started) continue;

  if (line.startsWith('+')) {
    result.push(line.slice(1));
  } else if (line.startsWith(' ')) {
    result.push(line.slice(1));
  } else if (line.startsWith('@@')) {
    // chunk header, ignore
  } else if (line.startsWith('-')) {
    // deleted line in diff, ignore
  }
}

fs.writeFileSync('backend/src/db/init.js', result.join('\n'), 'utf8');
console.log('Restored init.js successfully with lines:', result.length);

