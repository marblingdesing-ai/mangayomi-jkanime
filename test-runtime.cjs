// Test adapter only: emulate Mangayomi's Document interface with Cheerio.
const vm = require('node:vm');
const fs = require('node:fs');
const cheerio = require('cheerio');
class Element {
  constructor($, node) { this.$ = $; this.node = node; }
  get text() { return this.node.text(); }
  attr(name) { return this.node.attr(name) || ''; }
  selectFirst(selector) { return new Element(this.$, this.node.find(selector).first()); }
  select(selector) { return this.node.find(selector).toArray().map(e => new Element(this.$, this.$(e))); }
}
class Document extends Element {
  constructor(html) { const $ = cheerio.load(html); super($, $.root()); }
}
function create(get, extras = {}) {
  const calls = [], clientOptions = [];
  const context = vm.createContext({ console, Document, ...extras,
    MProvider: class { get source() { return {}; } },
    Client: class {
      constructor(options) { clientOptions.push(options); }
      async get(url, headers) { calls.push(url); return get(url, headers, 'GET'); }
      async post(url, headers, body) { calls.push(url); return get(url, headers, 'POST', body); }
    }
  });
  const ext = vm.runInContext(fs.readFileSync(__dirname + '/jkanime.js', 'utf8') + '\nnew DefaultExtension()', context);
  return { ext, calls, clientOptions };
}
module.exports = { create };
