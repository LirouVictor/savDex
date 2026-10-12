#!/usr/bin/env node
// Gera src/data/tourteams/<formato>.json: EQUIPES DE TORNEIO para o montador (src/builder/reference.js), cada uma com o
// resultado e a prova.
//
// Fonte: os tópicos de torneios encerrados do fórum do Smogon (título com "Won by X") e os replays da final no Pokémon
// Showdown (replay.pokemonshowdown.com/<id>.json, o registro público da partida). O replay é a prova: a pré-visualização
// das equipes mostra os 6 Pokémon de cada jogador e o fim da partida diz quem venceu. Para cada tópico:
//   1. os replays postados no tópico, só dos formatos Singles da Gen 9 que o app usa;
//   2. o campeão é o do título; a final é a série entre ele e o adversário do replay mais recente dele no tópico (os
//      replays da mesma dupla até 4 dias antes); o tópico só conta se o campeão venceu a maioria dos jogos dessa série
//      (senão os replays postados não são a final, ou o nome não bate);
//   3. a equipe de cada jogador em cada jogo da final (6 espécies da pré-visualização; mesma equipe em vários jogos conta
//      uma vez): campeão ("champion") e finalista ("finalist").
// Como nas equipes de exemplo, só vai para o app o que é DERIVADO: as espécies (com a forma que apareceu e se
// megaevoluiu) e, de cada Pokémon, os papéis pelas regras do app (strategies.js), o campo que põe ou aproveita e os tipos
// dos golpes de dano, tudo a partir do que APARECEU nos jogos da final (golpes usados, item e habilidade revelados): um
// Pokémon que não entrou ou não usou um golpe fica sem os papéis dele (`partial: true`). Nada do set é copiado.
// Times de equipes (World Cup, Premier League…), drafts e formatos sem pré-visualização ficam de fora.
//
// Uso: npm run tourteams   (precisa de rede: www.smogon.com e replay.pokemonshowdown.com; o resultado é versionado)
// As páginas e os replays baixados ficam em node_modules/.cache/tourteams (repetir o comando não baixa de novo os replays).

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { member, hash, toId } from './refteam-member.mjs';
import { parseLog, seenSet } from './showdown-log.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/data/tourteams');
const CACHE = path.join(ROOT, 'node_modules/.cache/tourteams');
const FORUM = 'https://www.smogon.com/forums';
// Formatos (os mesmos das equipes de exemplo do Quetzal)
const FORMATS = {
  gen9nationaldex: 'Gen 9 National Dex', gen9nationaldexubers: 'Gen 9 National Dex Ubers', gen9ou: 'Gen 9 OU',
  gen9uu: 'Gen 9 UU', gen9ru: 'Gen 9 RU', gen9nu: 'Gen 9 NU', gen9pu: 'Gen 9 PU',
};
// Subfóruns de torneios (individuais) e quantas páginas da lista de tópicos ler em cada
const FORUMS = [
  ['official-smogon-tournament.463', 4], ['smogon-tour.49', 12], ['smogon-masters.864', 3], ['smogon-grand-slam.208', 4],
  ['official-ladder-tournament.465', 3], ['smogon-metagames-circuits.474', 6], ['other-circuits.473', 6],
  ['unofficial-tournaments.666', 6], ['circuit-tournaments.351', 3],
];
const SERIES_DAYS = 4;
const SKIP_TITLE = /\b(draft|team tour|randbats|random battle|vgc|doubles|monotype|little cup|\blc\b)/i;
// Tópicos de gerações antigas (RBY … SS) pelo título: nenhum replay deles é da Gen 9, e os torneios semanais têm muitas páginas
const OLD_GEN = /(^|[\s[(])(rby|gsc|adv|dpp|bw|b2w2|oras|xy|sm|usum|ss|swsh|gen ?[1-8])\b/i;

const UA = 'savDex tourteams importer (dados derivados; https://github.com/LirouVictor/savDex)';
// Com proxy (HTTPS_PROXY), pelo curl, que o respeita (o fetch do Node 22 não); sem proxy, pelo fetch
const run = promisify(execFile);
async function download(url) {
  if (process.env.HTTPS_PROXY || process.env.https_proxy) {
    const { stdout } = await run('curl', ['-sS', '-L', '--max-time', '40', '-A', UA, '-w', '\n%{http_code}', url], { maxBuffer: 64 << 20 });
    const i = stdout.lastIndexOf('\n');
    return { status: +stdout.slice(i + 1), body: stdout.slice(0, i) };
  }
  const r = await fetch(url, { headers: { 'user-agent': UA } });
  return { status: r.status, body: await r.text() };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, { cache = null, tries = 4 } = {}) {
  if (cache) { try { return await readFile(cache, 'utf8'); } catch { /* baixa */ } }
  for (let attempt = 1; ; attempt++) {
    try {
      await sleep(250);
      const { status, body } = await download(url);
      if (status === 404) return null;
      if (status !== 200) throw new Error(`${status} ${url}`);
      if (cache) await writeFile(cache, body);
      return body;
    } catch (e) {
      if (attempt >= tries) throw e;
      await sleep(2000 * attempt);
    }
  }
}
const unescape = s => s.replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** Tópicos com "Won by X" no título: { url, title, winner }. */
async function threads() {
  const out = new Map();
  for (const [f, pages] of FORUMS) {
    for (let p = 1; p <= pages; p++) {
      const html = await get(`${FORUM}/forums/${f}/${p > 1 ? `page-${p}` : ''}`);
      if (!html) break;
      let n = 0;
      for (const m of html.matchAll(/<div class="structItem-title">([\s\S]*?)<\/div>/g)) {
        for (const a of m[1].matchAll(/<a href="(\/forums\/threads\/[^"]+\.\d+\/)"[^>]*>([^<]+)<\/a>/g)) {
          const title = unescape(a[2]).trim();
          const won = /won by:?\s*([^\])]+?)\s*[\])]?\s*$/i.exec(title);
          n++;
          if (!won || SKIP_TITLE.test(title) || OLD_GEN.test(title)) continue;
          const winner = won[1].replace(/[\])].*$/, '').trim();
          if (/^team\b/i.test(winner) || /^nobody$/i.test(winner)) continue;
          out.set(a[1], { url: `https://www.smogon.com${a[1]}`, title, winner });
        }
      }
      if (!n) break;
    }
  }
  return [...out.values()];
}

/** Os ids dos replays postados no tópico (todas as páginas). */
async function threadReplays(url) {
  const ids = new Set();
  const key = url.replace(/^.*\/threads\//, '').replace(/[^a-z0-9.-]/gi, '_');
  const first = await get(url, { cache: path.join(CACHE, `t-${key}1.html`) });
  if (!first) return ids;
  const last = Math.max(1, ...[...first.matchAll(/page-(\d+)"/g)].map(m => +m[1]));
  const pages = [first];
  for (let p = 2; p <= Math.min(last, 15); p++) pages.push(await get(`${url}page-${p}`, { cache: path.join(CACHE, `t-${key}${p}.html`) }));
  for (const html of pages) {
    if (!html) continue;
    for (const m of html.matchAll(/replay\.pokemonshowdown\.com\/([a-z0-9]+-[a-z0-9]+-\d+(?:-[a-z0-9]+pw)?)/g)) ids.add(m[1]);
  }
  return ids;
}

async function replay(id) {
  const body = await get(`https://replay.pokemonshowdown.com/${id}.json`, { cache: path.join(CACHE, `${id}.json`) });
  if (!body) return null;
  try { return JSON.parse(body); } catch { return null; }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await mkdir(CACHE, { recursive: true });
  const retrieved = new Date().toISOString().slice(0, 10);
  const list = await threads();
  console.log(`${list.length} tópicos com "Won by"`);
  const byFormat = Object.fromEntries(Object.keys(FORMATS).map(f => [f, { teams: new Map(), results: [] }]));
  const unknown = new Set();
  const report = { used: 0, noReplays: 0, noWinner: 0, notFinal: 0 };
  for (const th of list) {
    const ids = [...await threadReplays(th.url)].filter(id => Object.keys(FORMATS).some(f => id.includes(`-${f}-`) || id.startsWith(`${f}-`)));
    if (!ids.length) { report.noReplays++; continue; }
    const games = [];
    for (const id of ids) {
      const r = await replay(id);
      if (!r || !FORMATS[r.formatid] || !r.log || !r.log.includes('|poke|')) continue;
      games.push({ id, r, ...parseLog(r.log) });
    }
    const w = toId(th.winner);
    const mine = games.filter(g => g.r.players.some(p => toId(p) === w));
    if (!mine.length) { report.noWinner++; continue; }
    const lastGame = mine.reduce((a, b) => (b.r.uploadtime > a.r.uploadtime ? b : a));
    const opp = lastGame.r.players.find(p => toId(p) !== w);
    const series = mine.filter(g => g.r.players.some(p => toId(p) === toId(opp)) && lastGame.r.uploadtime - g.r.uploadtime <= SERIES_DAYS * 86400);
    const wins = series.filter(g => toId(g.winner) === w).length;
    if (wins * 2 <= series.length) { report.notFinal++; continue; }
    report.used++;
    const event = th.title.replace(/\s*[[(]?\s*won by.*$/i, '').replace(/\s*[-:–]\s*$/, '').trim();
    const score = `${wins}-${series.length - wins}`;
    for (const g of series.sort((a, b) => a.r.uploadtime - b.r.uploadtime)) {
      const fmt = g.r.formatid;
      const date = new Date(g.r.uploadtime * 1000).toISOString().slice(0, 10);
      for (const p of ['p1', 'p2']) {
        const s = g.side[p];
        if (s.preview.length !== 6) continue;
        const player = s.name;
        const placement = toId(player) === w ? 'champion' : 'finalist';
        const key = [...s.mons.values()].map(x => x.species.replace(/-\*$/, '')).sort().join('|') + '|' + toId(player) + '|' + event;
        const id = `${fmt}-t${hash(key)}`;
        const store = byFormat[fmt];
        let team = store.teams.get(id);
        if (!team) {
          team = { id, name: event, author: player, verification: 'verified', partial: true, recs: [] };
          store.teams.set(id, team);
        }
        team.recs.push([...s.mons.values()]);
        const won = toId(g.winner) === toId(player);
        const prev = store.results.find(x => x.team === id);
        if (prev) { prev.games++; if (won) prev.won++; continue; }
        store.results.push({ team: id, player, event, date, placement, series: placement === 'champion' ? score : score.split('-').reverse().join('-'),
          games: 1, won: won ? 1 : 0, url: `https://replay.pokemonshowdown.com/${g.id}`, thread: th.url, verification: 'verified' });
      }
    }
  }
  console.log(report);
  for (const [fmt, store] of Object.entries(byFormat)) {
    const teams = [...store.teams.values()].map(t => {
      // Junta o que apareceu em todos os jogos com a mesma equipe
      const merged = new Map();
      for (const recs of t.recs) for (const r of recs) {
        const k = r.species.replace(/-\*$/, '');
        const m = merged.get(k) || { species: k, moves: new Set(), item: null, ability: null, mega: null, seen: false };
        m.seen = m.seen || r.seen;
        for (const mv of r.moves) m.moves.add(mv);
        m.item = m.item || r.item; m.ability = m.ability || r.ability; m.mega = m.mega || r.mega;
        merged.set(k, m);
      }
      // `hidden`: não entrou em nenhum jogo da final (nada revelado)
      const members = [...merged.values()].map(r => (r.seen ? member(seenSet(r), unknown) : { ...member(seenSet(r), unknown), hidden: true }));
      return { id: t.id, name: t.name, author: t.author, verification: t.verification, partial: true, members };
    });
    const out = {
      format: fmt, name: FORMATS[fmt], gen: 9, mode: 'singles', kind: 'tournament',
      source: {
        name: 'Smogon tournaments (finals replays on Pokémon Showdown)', list: `${FORUM}/forums/tournaments.34/`, retrieved,
        license: 'replays públicos do Pokémon Showdown; aqui só espécies e dados derivados pelo app',
      },
      teams,
      results: store.results.sort((a, b) => (a.date < b.date ? 1 : -1)),
    };
    await writeFile(path.join(OUT, `${fmt}.json`), JSON.stringify(out, null, 1).replace(/\n\s+(?=[\]}"\d-])/g, m => (m.length > 4 ? ' ' : m)) + '\n');
    console.log(`${fmt}: ${teams.length} equipes (${out.results.filter(r => r.placement === 'champion').length} do campeão)`);
  }
  if (unknown.size) console.log(`golpes desconhecidos: ${[...unknown].join(', ')}`);
}

main().catch(e => { console.error(e); process.exit(1); });
