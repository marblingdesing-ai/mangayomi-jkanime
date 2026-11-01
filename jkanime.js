// Written for Mangayomi's QuickJS MProvider API; no Node/browser dependencies.
class DefaultExtension extends MProvider {
  constructor() {
    super();
    // rhttp's headerMap keeps only the last repeated Set-Cookie. JKAnime needs
    // all session cookies; Dart HTTP combines repeated headers instead.
    this.client = new Client({ useDartHttpClient: true });
    this.cookies = {};
  }
  get supportsLatest() { return true; }
  getHeaders() { return { Referer: 'https://jkanime.net/' }; }
  getFilterList() { return []; }
  getSourcePreferences() { return []; }

  siteHeaders(referer) {
    const headers = { Referer: referer || 'https://jkanime.net/' };
    const cookie = Object.keys(this.cookies).map(key => key + '=' + this.cookies[key]).join('; ');
    if (cookie) headers.Cookie = cookie;
    return headers;
  }

  rememberCookies(response) {
    const raw = response.headers && (response.headers['set-cookie'] || response.headers['Set-Cookie']);
    if (typeof raw !== 'string') return;
    for (const part of raw.split(/,(?=\s*[^;,\s=]+=)/)) {
      const match = part.trim().match(/^([^=;\s]+)=([^;]*)/);
      if (match) this.cookies[match[1]] = match[2];
    }
  }

  async html(path) {
    const response = await this.client.get('https://jkanime.net' + path, this.siteHeaders());
    this.rememberCookies(response);
    if (response.statusCode !== 200) throw new Error('JKAnime: HTTP ' + response.statusCode + '.');
    if (!/<html[\s>]/i.test(response.body) || /<title>[^<]*(?:Just a moment|Attention Required)/i.test(response.body)) {
      throw new Error('JKAnime: respuesta inesperada o protección del sitio.');
    }
    return response.body;
  }

  path(url, episode) {
    const m = String(url).match(/^(?:https:\/\/jkanime\.net)?\/([a-z0-9][a-z0-9.-]*)(?:\/(\d+(?:\.\d+)?))?\/?$/i);
    if (!m || m[1].includes('..') || (episode && !m[2])) throw new Error('JKAnime: URL inválida.');
    return { slug: m[1], episode: m[2] };
  }

  // Extract JSON data only. Never evaluate scripts supplied by the website.
  jsonVariable(html, name) {
    const marker = new RegExp('(?:var|let|const)\\s+' + name + '\\s*=\\s*');
    const match = marker.exec(html);
    if (!match) throw new Error('JKAnime: no se encontró ' + name + '.');
    const start = match.index + match[0].length;
    let depth = 0, quote = false, escape = false;
    if (html[start] !== '{' && html[start] !== '[') throw new Error('JKAnime: JSON inválido.');
    for (let i = start; i < html.length; i++) {
      const c = html[i];
      if (quote) {
        if (escape) escape = false;
        else if (c === '\\') escape = true;
        else if (c === '"') quote = false;
      } else if (c === '"') quote = true;
      else if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') {
        if (--depth === 0) return JSON.parse(html.slice(start, i + 1));
      }
    }
    throw new Error('JKAnime: JSON incompleto.');
  }

  seriesCover(image) {
    // Episode cards expose the real series cover as data-animepic.
    return /^https:\/\/(?:cdn\.jkdesa\.com|cdn\.jkanime\.net)\/assets\/images\/animes\/image\//i.test(image || '') ? image : '';
  }

  async getPopular(page) {
    const data = this.jsonVariable(await this.html('/directorio?p=' + Math.max(1, Number(page) || 1)), 'animes');
    if (!Array.isArray(data.data) || typeof data.current_page !== 'number' || typeof data.last_page !== 'number') {
      throw new Error('JKAnime: directorio inválido.');
    }
    const list = data.data.map(item => ({ name: item.title, link: 'https://jkanime.net/' + this.path(item.url).slug + '/', imageUrl: this.seriesCover(item.image) }));
    return { list: list, hasNextPage: data.current_page < data.last_page };
  }

  async getLatestUpdates(page) {
    if (page > 1) return { list: [], hasNextPage: false };
    const doc = new Document(await this.html('/'));
    const seen = new Set(), list = [];
    for (const card of doc.select('#animes .dir1, #donghuas .dir1, #ovas .dir1')) {
      const href = card.selectFirst('a').attr('href');
      if (!/^https:\/\/jkanime\.net\//i.test(href)) continue;
      const link = 'https://jkanime.net/' + this.path(href).slug + '/';
      if (seen.has(link)) continue;
      seen.add(link);
      const image = card.selectFirst('img');
      list.push({ name: card.selectFirst('.card-title').text.trim(), link: link,
        imageUrl: this.seriesCover(image.attr('data-animepic')) || this.seriesCover(image.attr('src')) });
    }
    if (!list.length) throw new Error('JKAnime: no se reconocieron las novedades.');
    return { list: list, hasNextPage: false };
  }

  async search(query, page, filters) {
    if (!String(query).trim()) return this.getPopular(page);
    const doc = new Document(await this.html('/buscar?q=' + encodeURIComponent(query) + '&p=' + Math.max(1, Number(page) || 1)));
    const list = [], seen = new Set();
    for (const card of doc.select('.anime__page__content .anime__item')) {
      const title = card.selectFirst('h5 a');
      const link = 'https://jkanime.net/' + this.path(title.attr('href')).slug + '/';
      if (seen.has(link)) continue;
      seen.add(link);
      list.push({ name: title.text.trim(), link: link, imageUrl: this.seriesCover(card.selectFirst('.anime__item__pic').attr('data-setbg')) });
    }
    if (!list.length && !doc.select('.anime__page__content').length) throw new Error('JKAnime: búsqueda no reconocida.');
    const next = Number(page || 1) + 1;
    const hasNextPage = doc.select('.pagination a, .anime__pagination a').some(a => {
      const href = a.attr('href');
      return new RegExp('[?&]p=' + next + '(?:&|$)').test(href);
    });
    return { list: list, hasNextPage: hasNextPage };
  }

  async getDetail(url) {
    const slug = this.path(url).slug, link = 'https://jkanime.net/' + slug + '/';
    const doc = new Document(await this.html('/' + slug + '/'));
    const name = doc.selectFirst('.anime_info h3').text.trim();
    const id = doc.selectFirst('#guardar-anime').attr('data-anime');
    const token = doc.selectFirst('meta[name="csrf-token"]').attr('content');
    if (!name || !/^\d+$/.test(id) || !token) throw new Error('JKAnime: no se pudo leer la ficha o su listado de episodios.');
    // Metadata may say 0 for ongoing shows. Only use the actual AJAX episode list.
    const first = await this.episodePage(id, 1, token, link);
    let episodes = first.data.slice();
    // At most two concurrent requests, only while opening an individual detail.
    for (let page = 2; page <= first.last_page; page += 2) {
      const batch = [this.episodePage(id, page, token, link)];
      if (page + 1 <= first.last_page) batch.push(this.episodePage(id, page + 1, token, link));
      for (const result of await Promise.all(batch)) episodes = episodes.concat(result.data);
    }
    const episodeSeen = new Set();
    const chapters = episodes.map(ep => {
      const number = Number(ep.number);
      if (!Number.isFinite(number) || number < 0) throw new Error('JKAnime: número de episodio inválido.');
      return { name: 'Episodio ' + number, url: link + number + '/' };
    }).filter(ep => { if (episodeSeen.has(ep.url)) return false; episodeSeen.add(ep.url); return true; })
      .sort((a, b) => Number(this.path(b.url, true).episode) - Number(this.path(a.url, true).episode));
    const genres = [], genreSeen = new Set();
    for (const a of doc.select('.anime_data a[href*="/genero/"]')) {
      const genre = a.text.trim();
      if (genre && !genreSeen.has(genre)) { genreSeen.add(genre); genres.push(genre); }
    }
    const state = doc.selectFirst('.enemision').text.toLowerCase();
    return { name: name, link: link, imageUrl: this.seriesCover(doc.selectFirst('.anime_pic img').attr('src')),
      description: doc.selectFirst('.anime_info p').text.trim(), genre: genres,
      status: /concluido|finalizado/.test(state) ? 1 : /emisi[oó]n/.test(state) ? 0 : 5, chapters: chapters };
  }

  async episodePage(id, page, token, referer) {
    const headers = Object.assign(this.siteHeaders(referer), {
      'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json'
    });
    const response = await this.client.post('https://jkanime.net/ajax/episodes/' + id + '/' + page, headers, '_token=' + encodeURIComponent(token));
    this.rememberCookies(response);
    if (response.statusCode !== 200) throw new Error('JKAnime: episodios HTTP ' + response.statusCode + '.');
    let result;
    try { result = JSON.parse(response.body); } catch (_) { throw new Error('JKAnime: episodios no devolvió JSON.'); }
    if (!Array.isArray(result.data) || result.current_page !== page || !Number.isInteger(result.last_page) || result.last_page < page || result.last_page > 200) {
      throw new Error('JKAnime: paginación de episodios inválida.');
    }
    return result;
  }

  decodeRemote(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) return '';
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let bits = 0, buffer = 0, out = '';
    for (const c of value.replace(/=+$/, '')) {
      buffer = (buffer << 6) | alphabet.indexOf(c); bits += 6;
      if (bits >= 8) { bits -= 8; out += String.fromCharCode((buffer >> bits) & 255); }
    }
    return out.trim();
  }

  async getVideoList(url) {
    const path = this.path(url, true);
    const servers = this.jsonVariable(await this.html('/' + path.slug + '/' + path.episode + '/'), 'servers');
    if (!Array.isArray(servers)) throw new Error('JKAnime: servidores inválidos.');
    const videos = [], seen = new Set();
    for (const server of servers) {
      const remote = this.decodeRemote(server.remote);
      let extracted = [];
      try {
        if (/^https:\/\/(?:www\.)?voe\.sx\//i.test(remote) && typeof voeExtractor === 'function') extracted = await voeExtractor(remote, 'Voe');
        else if (/^https:\/\/(?:www\.)?mp4upload\.com\//i.test(remote) && typeof mp4UploadExtractor === 'function') extracted = await mp4UploadExtractor(remote, this.getHeaders(), 'MP4Upload ', '');
        else if (/^https:\/\/(?:www\.)?(?:hgcloud\.to|streamwish\.to)\//i.test(remote) && typeof streamWishExtractor === 'function') extracted = await streamWishExtractor(remote, 'Streamwish ');
        else if (/^https:\/\/(?:www\.)?streamtape\.com\//i.test(remote) && typeof streamTapeExtractor === 'function') extracted = await streamTapeExtractor(remote, 'Streamtape');
      } catch (_) { console.log('JKAnime: falló un extractor; se intenta el siguiente.'); }
      if (!Array.isArray(extracted)) continue;
      for (const video of extracted) {
        if (!video || typeof video.url !== 'string' || !/^https?:\/\//i.test(video.url) || video.url === remote || seen.has(video.url)) continue;
        seen.add(video.url);
        videos.push(Object.assign({}, video, { originalUrl: remote, quality: (video.quality || server.server || 'Video') + ' · idioma ' + server.lang }));
      }
    }
    if (!videos.length) throw new Error('JKAnime: ningún extractor obtuvo video. Los reproductores internos y otros servidores todavía no están implementados.');
    return videos;
  }

  async getPageList() { throw new Error('JKAnime es una fuente de anime.'); }
}
