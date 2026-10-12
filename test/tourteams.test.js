// Equipes de finais de torneio (tools/build-tourteams.mjs, src/data/tourteams): a leitura do replay e as tabelas geradas.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { parseLog, seenSet } from '../tools/showdown-log.mjs';
import { member } from '../tools/refteam-member.mjs';

const LOG = `|player|p1|Alice|1|
|player|p2|Bob|2|
|poke|p1|Pelipper, M|
|poke|p1|Zamazenta-*|
|poke|p1|Charizard, F|
|poke|p1|Barraskewda, F|
|poke|p1|Kingambit, M|
|poke|p1|Clefable, F|
|poke|p2|Gholdengo|
|poke|p2|Great Tusk|
|poke|p2|Kyurem|
|poke|p2|Dragapult, M|
|poke|p2|Ting-Lu|
|poke|p2|Rotom-Wash|
|teampreview
|switch|p1a: Bird|Pelipper, M|100/100
|switch|p2a: Gholdengo|Gholdengo|100/100
|-weather|RainDance|[from] ability: Drizzle|[of] p1a: Bird
|move|p1a: Bird|U-turn|p2a: Gholdengo
|switch|p1a: Zamazenta|Zamazenta-Crowned|100/100
|move|p2a: Gholdengo|Trick|p1a: Zamazenta
|-item|p1a: Zamazenta|Choice Scarf|[from] move: Trick
|-item|p2a: Gholdengo|Rusted Shield|[from] move: Trick
|switch|p1a: Charizard|Charizard, F|100/100
|detailschange|p1a: Charizard|Charizard-Mega-Y, F
|-mega|p1a: Charizard|Charizard|Charizardite Y
|-zpower|p1a: Charizard
|move|p1a: Charizard|Inferno Overdrive|p2a: Gholdengo
|switch|p1a: Barraskewda|Barraskewda, F|100/100
|move|p1a: Barraskewda|Liquidation|p2a: Gholdengo
|-enditem|p1a: Barraskewda|Choice Band|[from] move: Knock Off|[of] p2a: Gholdengo
|-heal|p1a: Barraskewda|60/100|[from] item: Leftovers
|move|p1a: Barraskewda|Sleep Talk|p1a: Barraskewda
|move|p1a: Barraskewda|Flip Turn|p2a: Gholdengo|[from]Sleep Talk
|switch|p1a: Kingambit|Kingambit, M|100/100
|-activate|p1a: Kingambit|ability: Supreme Overlord
|move|p1a: Kingambit|Sucker Punch|p2a: Gholdengo
|win|Alice`;

describe('leitura do replay (showdown-log.mjs)', () => {
  const { side, winner } = parseLog(LOG);
  const mon = sp => [...side.p1.mons.values()].find(x => x.species === sp);
  it('as 6 espécies da pré-visualização, com a forma que apareceu na partida', () => {
    expect(winner).toBe('Alice');
    expect(side.p1.name).toBe('Alice');
    expect(side.p1.preview).toHaveLength(6);
    expect([...side.p1.mons.values()].map(x => x.species).sort()).toEqual(['Barraskewda', 'Charizard', 'Clefable', 'Kingambit', 'Pelipper', 'Zamazenta-Crowned']);
    expect(mon('Clefable').seen).toBe(false);
  });
  it('golpes usados (sem os chamados por outro golpe nem o Z), item e habilidade revelados (sem os trocados por Trick)', () => {
    expect(mon('Pelipper').ability).toBe('Drizzle');
    expect([...mon('Pelipper').moves]).toEqual(['U-turn']);
    expect(mon('Zamazenta-Crowned').item).toBe(null); // o Choice Scarf chegou pelo Trick
    expect(mon('Charizard').item).toBe('Charizardite Y');
    expect(mon('Charizard').mega).toBe('Charizard-Mega-Y');
    expect(mon('Charizard').moves.size).toBe(0);
    expect(mon('Barraskewda').item).toBe('Choice Band'); // o primeiro revelado (o Leftovers depois do Knock Off não é dele)
    expect([...mon('Barraskewda').moves]).toEqual(['Liquidation', 'Sleep Talk']);
    expect(mon('Kingambit').ability).toBe('Supreme Overlord');
  });
  it('o set do que apareceu vira só dados derivados (papéis, campo, tipos)', () => {
    const p = member(seenSet(mon('Pelipper')), new Set());
    expect(p.r).toContain('pivot');
    expect(p.set).toEqual(['chuva']);
    const c = member(seenSet(mon('Charizard')), new Set());
    expect(c.s).toBe('Charizard');
    expect(c.mega).toBe('Mega-Y');
  });
});

describe('tabelas de torneio (src/data/tourteams)', () => {
  const dir = 'src/data/tourteams';
  const files = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json')) : [];
  it('cada equipe tem resultado com o replay da final como prova; só dados derivados', () => {
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const tb = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
      expect(tb.kind).toBe('tournament');
      expect(tb.mode).toBe('singles');
      expect(tb.gen).toBe(9);
      const ids = new Set(tb.teams.map(t => t.id));
      expect(ids.size).toBe(tb.teams.length);
      for (const r of tb.results) {
        expect(ids.has(r.team)).toBe(true);
        expect(r.url).toMatch(/^https:\/\/replay\.pokemonshowdown\.com\/[a-z0-9-]+$/);
        expect(r.thread).toMatch(/^https:\/\/www\.smogon\.com\/forums\/threads\//);
        expect(['champion', 'finalist']).toContain(r.placement);
        expect(r.series).toMatch(/^\d+-\d+$/);
        expect(r.verification).toBe('verified');
      }
      for (const t of tb.teams) {
        expect(tb.results.some(r => r.team === t.id)).toBe(true);
        expect(t.members).toHaveLength(6);
        for (const m of t.members) for (const k of Object.keys(m)) expect(['s', 'mega', 'r', 'set', 'auto', 'use', 'at', 'dmg', 'cat', 'hidden']).toContain(k);
      }
    }
  });
});
