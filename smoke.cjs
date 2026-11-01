// Four HTML pages plus actual episode-list POSTs. Never prints signed URLs.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { create } = require('./test-runtime.cjs');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'jkanime-smoke-'));
const headerFile = path.join(temporary, 'headers.txt');
const { ext, calls } = create(async (url, headers, method, body) => {
  // No curl cookie jar: only the extension carries cookies between requests.
  const args = ['-sS', '-L', '--max-time', '25', '-D', headerFile, '-w', '\n%{http_code}'];
  for (const [name, value] of Object.entries(headers || {})) args.push('-H', name + ': ' + value);
  if (method === 'POST') args.push('--data', body);
  const text = execFileSync('curl.exe', args.concat(url), { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  const split = text.lastIndexOf('\n');
  const responseHeaders = {};
  const blocks = fs.readFileSync(headerFile, 'utf8').trim().split(/\r?\n\r?\n/);
  for (const line of blocks[blocks.length - 1].split(/\r?\n/).slice(1)) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const name = line.slice(0, colon).toLowerCase(), value = line.slice(colon + 1).trim();
    responseHeaders[name] = responseHeaders[name] ? responseHeaders[name] + ',' + value : value;
  }
  return { body: text.slice(0, split), statusCode: Number(text.slice(split + 1)), headers: responseHeaders };
});
(async () => {
  const browse = await ext.getPopular(1);
  const latest = await ext.getLatestUpdates(1);
  const search = await ext.search('naruto', 1);
  const detail = await ext.getDetail('/dragon-ball-super-beerus/');
  if (!browse.list.length || !latest.list.length || !search.list.length || !detail.chapters.length) throw Error('Empty live result');
  console.log(JSON.stringify({ directory: browse.list.length, directoryNext: browse.hasNextPage,
    latest: latest.list.length, search: search.list.length, title: detail.name, actualEpisodes: detail.chapters.length,
    seriesCovers: [browse, latest, search].every(result => result.list.every(item => !item.imageUrl || item.imageUrl.includes('/animes/image/'))),
    requests: calls.length, playback: 'NOT TESTED; native Mangayomi extractors required' }, null, 2));
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => {
  if (fs.existsSync(headerFile)) fs.unlinkSync(headerFile);
  fs.rmdirSync(temporary);
});
