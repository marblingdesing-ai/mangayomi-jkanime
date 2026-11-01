const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { create } = require('./test-runtime.cjs');
const response = body => ({ statusCode: 200, body: '<html>' + body + '</html>' });
const cover = 'https://cdn.jkdesa.com/assets/images/animes/image/show.jpg';
test('directory reads JSON, canonical links, pagination; no per-card requests', async () => {
  const data = { current_page: 1, last_page: 2, data: [{ title: 'Show', url: 'https://jkanime.net/show/', image: cover }] };
  const { ext, calls } = create(async () => response('<script>var animes = ' + JSON.stringify(data) + ';</script>'));
  const result = await ext.getPopular(1);
  assert.equal(result.list[0].imageUrl, cover);
  assert.equal(result.hasNextPage, true);
  assert.equal(calls.length, 1);
  assert.throws(() => ext.jsonVariable('var animes = {bad:true}', 'animes'));
  assert.equal(ext.jsonVariable('var animes = {"text":"a}\\\"b"};', 'animes').text, 'a}"b');
});
test('latest deduplicates episode links, uses data-animepic, excludes external cards', async () => {
  const card = '<div class="dir1"><a href="https://jkanime.net/show/2/"><img src="https://cdn.jkdesa.com/assets/images/animes/video/episode.jpg" data-animepic="' + cover + '"><h5 class="card-title">Show</h5></a></div>';
  const { ext, calls } = create(async () => response('<div id="animes">' + card + card + '</div>'));
  const result = await ext.getLatestUpdates(1);
  assert.equal(result.list.length, 1); assert.equal(result.list[0].imageUrl, cover);
  assert.equal(result.list[0].link, 'https://jkanime.net/show/');
  await ext.getLatestUpdates(2); assert.equal(calls.length, 1);
  assert.equal(ext.seriesCover('https://cdn.jkdesa.com/assets/images/animes/video/x.jpg'), '');
});
test('search encodes query; declared empty results allowed, unexpected HTML rejected', async () => {
  const { ext, calls } = create(async () => response('<div class="anime__page__content"></div>'));
  assert.equal((await ext.search('a & b', 1)).list.length, 0);
  assert.match(calls[0], /q=a%20%26%20b&p=1$/);
  await assert.rejects(create(async () => response('unknown layout')).ext.search('a', 1), /no reconocida/);
  await assert.rejects(create(async () => ({ statusCode: 403, body: '' })).ext.getPopular(1), /HTTP 403/);
});
test('details enumerate real episodes despite metadata count 0, handle gaps and pagination', async () => {
  const html = '<meta name="csrf-token" content="test-token"><div id="guardar-anime" data-anime="123"></div><div class="anime_info"><h3>Show</h3><p>Description</p></div><div class="anime_pic"><img src="'+cover+'"></div><div class="anime_data"><li><span>Episodios:</span> 0</li><a href="/genero/action/">Action</a><a href="/genero/action/">Action</a></div><div class="enemision">Concluido</div>';
  const { ext } = create(async (url, headers, method, body) => {
    if (method === 'GET') return { ...response(html), headers: { 'set-cookie': 'session=test; Path=/; HttpOnly' } };
    assert.equal(headers.Cookie, 'session=test'); assert.equal(body, '_token=test-token');
    const page = Number(url.split('/').pop());
    return { statusCode: 200, body: JSON.stringify({ current_page: page, last_page: 2, data: page === 1 ? [{number:1},{number:0.5}] : [{number:3},{number:1}] }) };
  }); const data = await ext.getDetail('/show/');
  assert.equal(data.chapters.length, 3); assert.equal(data.chapters[0].url, 'https://jkanime.net/show/3/');
  assert.equal(data.genre.length, 1); assert.equal(data.status, 1);
  assert.equal(data.chapters[0].dateUpload, undefined);
  assert.equal(data.chapters[2].url, 'https://jkanime.net/show/0.5/');
  assert.equal(ext.getHeaders().Cookie, undefined);
  await assert.rejects(ext.getDetail('https://evil.test/show/'), /inválida/);
  assert.equal(ext.path('/naruto-vs.-konohamaru/').slug, 'naruto-vs.-konohamaru');
  assert.throws(() => ext.path('/a../'), /inválida/);
  await assert.rejects(create(async () => response('<div class="anime_info"><h3>No count</h3></div>')).ext.getDetail('/show/'), /no se pudo/);
});
test('episode page errors cannot silently return incomplete chapters', async () => {
  const { ext } = create(async () => ({statusCode:419, body:''}));
  await assert.rejects(ext.episodePage('123',1,'token','https://jkanime.net/show/'), /HTTP 419/);
  await assert.rejects(create(async () => ({statusCode:200,body:'<html>'})).ext.episodePage('123',1,'token',''), /no devolvió JSON/);
  await assert.rejects(create(async () => ({statusCode:200,body:'{"current_page":1,"last_page":500,"data":[]}'})).ext.episodePage('123',1,'token',''), /paginación/);
});
test('extractors fail independently, keep headers, deduplicate and reject HTML embeds', async () => {
  const servers = [
    { server: 'VOE', remote: Buffer.from('https://voe.sx/e/id').toString('base64'), lang: 1 },
    { server: 'Mp4upload', remote: Buffer.from('https://www.mp4upload.com/embed-id.html').toString('base64'), lang: 1 }
  ];
  const get = async () => response('<script>var servers = '+JSON.stringify(servers)+';</script>');
  const { ext } = create(get, { voeExtractor: async () => { throw Error(); }, mp4UploadExtractor: async () => [
    { url: 'https://cdn.example/video.mp4', quality: '720p', headers: { Referer: 'host' } },
    { url: 'https://cdn.example/video.mp4', quality: '720p' } ] });
  const result = await ext.getVideoList('/show/1/');
  assert.equal(result.length, 1); assert.equal(result[0].headers.Referer, 'host');
  await assert.rejects(create(get, { voeExtractor: async url => [{ url }] }).ext.getVideoList('/show/1/'), /ningún extractor/);
  assert.equal(ext.decodeRemote('not base64'), '');
});
test('index describes a separate JavaScript anime source', () => {
  const [entry] = JSON.parse(fs.readFileSync(__dirname + '/anime_index.json'));
  assert.equal(entry.itemType, 1); assert.equal(entry.sourceCodeLanguage, 1);
  assert.equal(entry.isManga, false); assert.notEqual(entry.id, 1847302101);
  assert.match(entry.sourceCodeUrl, /mangayomi-jkanime\/main\/jkanime.js$/);
});
