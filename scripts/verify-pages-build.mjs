// Verifies the exact properties production depends on but wrangler cannot
// inject into an already-built Pages bundle. Run after `npm run build:pages`.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const jsName = readdirSync(join(dist, 'assets')).find((f) => /^index-.*\.js$/.test(f));
if (!jsName) throw new Error('dist assets do not contain an index-*.js bundle');
const js = readFileSync(join(dist, 'assets', jsName), 'utf8');

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const buildScript = pkg.scripts?.['build:pages'] || '';
const requiredLinks = ['TRAIL', 'HIDE', 'SET'].map((tier) => {
  const m = buildScript.match(new RegExp(`VITE_STRIPE_LINK_${tier}=(\\S+)`));
  return m?.[1] || null;
});
const failures = [];
if (requiredLinks.some((link) => !link)) failures.push('build:pages does not define all three payment links');
for (const link of requiredLinks.filter(Boolean)) {
  if (!js.includes(link)) failures.push(`missing payment link: ${link}`);
}
if (/buy\.stripe\.com\/test_/.test(js)) failures.push('bundle contains a Stripe test payment link');
if (html.includes('three.module-')) failures.push('index.html preloads the three.js chunk');
if (html.includes('world.glb')) failures.push('index.html preloads the demo GLB');

const terms = readFileSync(join(dist, 'terms.html'), 'utf8');
if (!terms.includes('server-side JPEG re-encoding')) failures.push('terms do not describe server-side JPEG re-encoding');

if (failures.length) {
  console.error('pages build verification failed:');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`pages build verification passed (${jsName})`);
