import fs from 'node:fs';

const SOURCE_FILES = ['server/index.js', 'server/room-gifts.js', 'server/photo-gifts.js'];
const DOC_FILE = 'notes/API.md';

function sourceRoutes() {
  const routes = new Set();
  const pattern = /app\.(get|post|patch|delete|put)\(['"](\/api[^'"]*)['"]/g;
  for (const file of SOURCE_FILES) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(pattern)) {
      routes.add(`${match[1].toUpperCase()} ${match[2]}`);
    }
  }
  return routes;
}

function documentedRoutes() {
  const doc = fs.readFileSync(DOC_FILE, 'utf8');
  const routes = new Set();
  const pattern = /`(GET|POST|PATCH|DELETE|PUT) (\/api[^`\s]+)`/g;
  for (const match of doc.matchAll(pattern)) routes.add(`${match[1]} ${match[2]}`);
  return routes;
}

const actual = sourceRoutes();
const documented = documentedRoutes();
const missing = [...actual].filter((route) => !documented.has(route)).sort();
const stale = [...documented].filter((route) => !actual.has(route)).sort();

if (missing.length || stale.length) {
  if (missing.length) console.error(` undocumented routes in ${DOC_FILE}:\n - ${missing.join('\n - ')}`);
  if (stale.length) console.error(` documented routes not found in server sources:\n - ${stale.join('\n - ')}`);
  process.exit(1);
}

console.log(`api documentation verified (${actual.size} routes)`);
