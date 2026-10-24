// Reading a company's website into knowledge. Same site only (the start page's host), robots.txt obeyed (our group, else
// '*'; longest rule wins, Allow on a tie; an unreadable robots.txt reads nothing), at most maxPages pages, a timeout per
// page and for the whole read, HTML and plain text only, 2 MB a page. Every address is resolved once and refused if it is
// on a private network (the socket connects to the vetted address), redirects are followed only within the site.
// VP_FETCH_ALLOW_PRIVATE=1 lets tests and the dev server read a local fixture site; never set it in production.
import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { isPrivateAddress } from './webhooks.ts';

export const UA_TOKEN = 'VyaktiBot';
const UA = `${UA_TOKEN}/1.0 (reads a business's own website for its call assistant; obeys robots.txt)`;
export const SITE_LIMITS = { maxPages: 25, defaultPages: 10, pageMs: 8_000, totalMs: 45_000, maxBytes: 2_000_000 };
const allowPrivate = () => process.env.VP_FETCH_ALLOW_PRIVATE === '1';

export interface SitePage { url: string; title: string; text: string }
export interface Skipped { url: string; reason: string }
export interface CrawlResult { start: string; pages: SitePage[]; skipped: Skipped[]; robots: 'found' | 'none'; stoppedBy: 'done' | 'page_cap' | 'time' }

export class SiteError extends Error {}

export function siteUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(/^[a-z]+:\/\//i.test(raw.trim()) ? raw.trim() : 'https://' + raw.trim()); } catch { throw new SiteError('that is not a web address'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new SiteError('only http and https addresses can be read');
  if (u.username || u.password) throw new SiteError('the address must not carry a user name or password');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!allowPrivate() && (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || (isIP(host) && isPrivateAddress(host))))
    throw new SiteError('that address is on a private network; give the public website address');
  u.hash = '';
  return u;
}

async function vet(u: URL): Promise<{ address: string; family: 4 | 6 }> {
  const host = u.hostname.replace(/^\[|\]$/g, '');
  let addrs: { address: string; family: number }[];
  try { addrs = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true }); } catch { throw new SiteError(`${host} could not be found`); }
  if (!addrs.length) throw new SiteError(`${host} could not be found`);
  if (!allowPrivate() && addrs.some(a => isPrivateAddress(a.address))) throw new SiteError(`${host} points to a private network, so it was not read`);
  return { address: addrs[0].address, family: addrs[0].family as 4 | 6 };
}

interface Got { status: number; type: string; body: string; location?: string }

function get(u: URL, ip: { address: string; family: 4 | 6 }, ms: number, maxBytes: number): Promise<Got> {
  return new Promise((resolve, reject) => {
    const req = (u.protocol === 'https:' ? httpsRequest : httpRequest)(u, {
      method: 'GET', headers: { 'user-agent': UA, accept: 'text/html, text/plain;q=0.9' }, signal: AbortSignal.timeout(ms),
      lookup: ((_h: string, o: { all?: boolean }, cb: (...a: unknown[]) => void) => (o?.all ? cb(null, [{ address: ip.address, family: ip.family }]) : cb(null, ip.address, ip.family))) as never,
    }, res => {
      const type = String(res.headers['content-type'] ?? '').toLowerCase();
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400) { res.resume(); return resolve({ status, type, body: '', location: res.headers.location }); }
      const chunks: Buffer[] = []; let n = 0;
      res.on('data', (c: Buffer) => { n += c.length; if (n > maxBytes) { req.destroy(new SiteError('larger than 2 MB')); return; } chunks.push(c); });
      res.on('end', () => resolve({ status, type, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.on('error', e => reject(e instanceof SiteError ? e : (e as Error).name === 'TimeoutError' || /abort/i.test((e as Error).message) ? new SiteError('did not answer in time') : new SiteError('could not be reached')));
    req.end();
  });
}

/** GET within the site, following up to three same-site redirects (each address vetted again). */
async function fetchPage(start: URL, ms: number): Promise<{ url: URL; got: Got }> {
  let u = start;
  for (let hop = 0; hop < 4; hop++) {
    const got = await get(u, await vet(u), ms, SITE_LIMITS.maxBytes);
    if (!got.location) return { url: u, got };
    const next = new URL(got.location, u);
    if (next.host !== start.host) throw new SiteError(`redirects off the site (to ${next.host})`);
    u = next;
  }
  throw new SiteError('redirects too many times');
}

// ------------------------------------------------------------------------------------------------ robots.txt

interface Rule { allow: boolean; path: string }

/** Rules for our user agent from a robots.txt: the group naming us, else the '*' group (RFC 9309). */
export function robotsRules(txt: string, agent = UA_TOKEN): Rule[] {
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let cur: { agents: string[]; rules: Rule[] } | null = null, lastWasAgent = false;
  for (const line of txt.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z-]+)\s*:\s*(.*?)\s*(#.*)?$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2];
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase()); lastWasAgent = true;
    } else if ((key === 'allow' || key === 'disallow') && cur) {
      lastWasAgent = false;
      if (val) cur.rules.push({ allow: key === 'allow', path: val });
    } else lastWasAgent = false;
  }
  const me = groups.filter(g => g.agents.some(a => a !== '*' && agent.toLowerCase().startsWith(a)));
  return (me.length ? me : groups.filter(g => g.agents.includes('*'))).flatMap(g => g.rules);
}

const ruleRe = (p: string) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));

export function robotsAllows(rules: Rule[], pathAndQuery: string): boolean {
  let best: Rule | null = null;
  for (const r of rules) {
    if (!ruleRe(r.path).test(pathAndQuery)) continue;
    const len = r.path.replace(/\*|\$$/g, '').length;
    const bestLen = best ? best.path.replace(/\*|\$$/g, '').length : -1;
    if (len > bestLen || (len === bestLen && r.allow)) best = r;
  }
  return !best || best.allow;
}

// ------------------------------------------------------------------------------------------------ HTML

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…', rupee: '₹' };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
  e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()] ?? m);

/** A page's title, readable text (main content when marked), and same-site links. */
export function readHtml(html: string, base: URL): { title: string; text: string; links: URL[] } {
  const title = decode((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').replace(/\s+/g, ' ').trim());
  const links: URL[] = [];
  for (const m of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const href = decode(m[2] ?? m[3] ?? m[4] ?? '');
    if (/^(mailto|tel|javascript|data):/i.test(href)) continue;
    try {
      const u = new URL(href, base); u.hash = '';
      if (u.host === base.host && /^https?:$/.test(u.protocol) && !/\.(pdf|jpe?g|png|gif|svg|webp|zip|docx?|xlsx?|pptx?|mp[34]|css|js|ico|xml|json)$/i.test(u.pathname)) links.push(u);
    } catch { /* a broken link is skipped */ }
  }
  let body = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|noscript|svg|template|head|iframe)\b[\s\S]*?<\/\1>/gi, ' ');
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(body)?.[1];
  if (main && main.replace(/<[^>]+>/g, '').trim().length > 200) body = main;
  else body = body.replace(/<(nav|footer)\b[\s\S]*?<\/\1>/gi, ' ');
  const text = decode(body.replace(/<br\s*\/?>/gi, '\n').replace(/<\/?(p|div|section|article|li|ul|ol|h[1-6]|tr|table|header|blockquote|dd|dt)\b[^>]*>/gi, '\n\n').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { title, text, links };
}

// ------------------------------------------------------------------------------------------------ crawl

export async function crawl(startRaw: string, o: { maxPages?: number; pageMs?: number; totalMs?: number } = {}): Promise<CrawlResult> {
  const start = siteUrl(startRaw);
  const maxPages = Math.min(o.maxPages ?? SITE_LIMITS.defaultPages, SITE_LIMITS.maxPages);
  const pageMs = o.pageMs ?? SITE_LIMITS.pageMs, deadline = Date.now() + (o.totalMs ?? SITE_LIMITS.totalMs);
  const skipped: Skipped[] = [];
  // robots.txt: missing (4xx) allows everything; unreadable (5xx, timeout) reads nothing.
  let rules: Rule[] = [], robots: CrawlResult['robots'] = 'none';
  try {
    const r = await fetchPage(new URL('/robots.txt', start), pageMs);
    if (r.got.status >= 500) throw new SiteError(`its robots.txt answered ${r.got.status}`);
    if (r.got.status === 200) { rules = robotsRules(r.got.body); robots = 'found'; }
  } catch (e) {
    throw new SiteError(`the site's robots.txt could not be read (${(e as Error).message}), so nothing was read; try again later`);
  }
  const queue: URL[] = [start], seen = new Set<string>([start.href]);
  const pages: SitePage[] = [];
  let stoppedBy: CrawlResult['stoppedBy'] = 'done';
  while (queue.length) {
    if (pages.length >= maxPages) { stoppedBy = 'page_cap'; break; }
    if (Date.now() > deadline) { stoppedBy = 'time'; break; }
    const u = queue.shift()!;
    if (!robotsAllows(rules, u.pathname + u.search)) { skipped.push({ url: u.href, reason: 'the site asks robots not to read it' }); continue; }
    try {
      const { url, got } = await fetchPage(u, Math.min(pageMs, Math.max(1, deadline - Date.now())));
      if (got.status !== 200) { skipped.push({ url: u.href, reason: `answered ${got.status}` }); continue; }
      const html = got.type.includes('html'), plain = got.type.startsWith('text/plain');
      if (!html && !plain) { skipped.push({ url: u.href, reason: 'not a web page' }); continue; }
      const page = html ? readHtml(got.body, url) : { title: url.pathname, text: got.body.trim(), links: [] };
      if (page.text.length >= 40) pages.push({ url: url.href, title: page.title || url.pathname, text: page.text });
      else skipped.push({ url: u.href, reason: 'no readable text' });
      for (const l of page.links) if (!seen.has(l.href) && seen.size < 500) { seen.add(l.href); queue.push(l); }
    } catch (e) {
      skipped.push({ url: u.href, reason: e instanceof SiteError ? e.message : 'could not be read' });
    }
  }
  return { start: start.href, pages, skipped, robots, stoppedBy };
}
