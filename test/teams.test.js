import { describe as suite, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { loadSave } from '../src/parser/load.js';
import { mediumSlow } from '../src/parser/describe.js';
import { saveKey } from '../src/history/diff.js';
import { newTeam, snapshot, locateTeam, teamSig, teamShowdown, cleanName, NAME_MAX } from '../src/teams/teams.js';
import { teamsWin } from '../src/teams/view.js';
import { makeSave } from './helpers/make-save.js';
import { makeGen3Save } from './helpers/make-gen3.js';
import T from '../src/data/tables.js';
import G from '../src/data/gen3.json';
import Q from '../src/data/quetzal.json';

const trainer = { name: 'ASH', tid: 111, sid: 222 };
const load = o => loadSave(makeSave({ trainer, ...o }), T, G).data;
const ivs = n => [n, n, n, n, n, n];
const TACKLE = 33, EMBER = 52, SCRATCH = 10;
const all = d => [...d.party, ...d.pc.boxes.flatMap(b => b.slots)];
// Uma "ida e volta" pelo IndexedDB (structured clone ~ JSON para estes dados)
const stored = team => ({ ...JSON.parse(JSON.stringify(team)), id: 7 });

// Antes: Charmander (C1-1), Pikachu (C1-2) e Eevee (C1-3) salvos como equipe
const before = load({
  pc: {
    0: { species: 4, exp: mediumSlow(10), ivs: ivs(10), nature: 3, moves: [[SCRATCH, 35]] },
    1: { species: 25, exp: mediumSlow(20), ivs: ivs(20), nature: 5, moves: [[TACKLE, 35]] },
    2: { species: 133, exp: mediumSlow(5), ivs: ivs(5), nature: 1, moves: [[TACKLE, 35]] },
  },
});
// Depois: Charmander virou Charmeleon e foi para a caixa 2; Pikachu saiu; Eevee continua no lugar
const after = load({
  pc: {
    31: { species: 5, exp: mediumSlow(16), ivs: ivs(10), nature: 3, moves: [[SCRATCH, 35], [EMBER, 25]] },
    2: { species: 133, exp: mediumSlow(7), ivs: ivs(5), nature: 1, moves: [[TACKLE, 35]] },
    4: { species: 1, exp: mediumSlow(5), ivs: ivs(7), nature: 2, moves: [[TACKLE, 35]] },
  },
});

suite('equipes salvas', () => {
  const team = stored(newTeam(all(before), { saveKey: saveKey(before), name: '  Minha   equipe ', source: 'ai' }));

  it('guarda só uma foto pequena de cada membro, com o nome limpo', () => {
    expect(team.name).toBe('Minha equipe');
    expect(team.members).toHaveLength(3);
    const s = team.members[0];
    expect(s).toMatchObject({ speciesId: 4, location: 'pc', boxIndex: 0, slot: 1, species: { name: 'Charmander', types: ['fire'] } });
    expect(s.showdown).toMatch(/^Charmander/);
    expect(s.showdown).toContain('- Scratch');
    expect(JSON.stringify(team).length).toBeLessThan(3000);
    expect(cleanName('x'.repeat(100))).toHaveLength(NAME_MAX);
  });

  it('acha cada membro no save mais novo: evoluiu e mudou de caixa, continua no lugar, saiu', () => {
    const loc = locateTeam(team, after);
    expect(loc.map(x => x.now && x.now.species.name)).toEqual(['Charmeleon', null, 'Eevee']);
    expect(loc[0].now).toMatchObject({ boxIndex: 1, slot: 2 });
    // No mesmo save, todos ficam onde estavam
    expect(locateTeam(team, before).map(x => x.now === all(before)[team.members.indexOf(x.saved)])).toEqual([true, true, true]);
  });

  it('Showdown: os achados como estão agora; quem saiu, como foi salvo', () => {
    const txt = teamShowdown(locateTeam(team, after));
    expect(txt).toMatch(/^Charmeleon/);
    expect(txt).toContain('- Ember');
    expect(txt).toContain('Pikachu');
  });

  it('a mesma equipe salva duas vezes é reconhecida', () => {
    const again = newTeam([...all(before)].reverse(), { saveKey: 'x', name: 'b', source: 'party' });
    expect(teamSig(again)).toBe(teamSig(team));
    expect(teamSig(newTeam(all(after), { saveKey: 'x', name: 'c', source: 'party' }))).not.toBe(teamSig(team));
  });

  it('Gen 3 oficial: acha pelo PID e OT, mesmo depois de evoluir e ir para o PC', () => {
    const otId = (222 << 16) | 111;
    const g = (pc, party = []) => loadSave(makeGen3Save({ game: 'emerald', trainer, party, pc }), T, G).data;
    const a = g({ 0: { pid: 1234, otId, species: 280, exp: 1000 }, 1: { pid: 99, otId, species: 25, exp: 500 } }); // Torchic, Pikachu
    const tm = stored(newTeam(all(a), { saveKey: saveKey(a), name: 'E', source: 'party' }));
    expect(tm.members[0].pid).toBe(1234);
    const b = g({ 5: { pid: 1234, otId, species: 281, exp: 5000 }, 6: { pid: 98, otId, species: 25, exp: 500 } }); // Combusken; outro Pikachu
    expect(locateTeam(tm, b).map(x => x.now && x.now.species.name)).toEqual(['Combusken', null]);
  });

  it('janela: onde cada um está, quem saiu, ações', () => {
    const loc = locateTeam(team, after);
    const html = teamsWin([team], [loc], T, 7);
    expect(html).toContain('Equipes salvas');
    expect(html).toContain('1 de 20');
    expect(html).toContain('evoluiu de Charmander');
    expect(html).toContain('BOX2, posição 2');
    expect(html).toContain('não está mais no save');
    expect(html).toContain('1 fora do save');
    expect(html).toContain('montada pela IA');
    expect(html).toContain('data-team-mon="0:0"');
    expect(html).not.toContain('data-team-mon="0:1"');
    expect(html).toMatch(/data-team="7" open/);
    expect(snapshot(all(before)[0]).moves).toEqual([{ id: SCRATCH, name: 'Scratch' }]);
  });
});

// Saves reais (opcionais): Lucario e Basculegion levados da equipe para a BOX1 (posições 21 e 23);
// Haunter levado do PC para a equipe
const REF = 'fixtures/PokemonQuetzalPtBrAlpha9v0.sav', PC = 'fixtures/PokemonQuetzalPtBrAlpha9v0-pc.sav';
const H60 = 'fixtures/quetzal-60h.sav', HAUNTER = 'fixtures/quetzal-60h-haunter.sav';
const real = f => loadSave(readFileSync(f), T, G, null, null, Q).data;
suite.skipIf(!existsSync(REF) || !existsSync(PC))('equipes salvas com os saves reais do Quetzal', () => {
  it('a equipe salva é achada depois de dois membros irem para o PC', () => {
    const a = real(REF), b = real(PC);
    const tm = stored(newTeam(a.party, { saveKey: saveKey(a), name: 'x', source: 'party' }));
    const loc = locateTeam(tm, b);
    expect(loc.every(x => x.now)).toBe(true);
    const moved = loc.filter(x => x.now.location !== 'party').map(x => [x.now.species.name, x.now.boxIndex, x.now.slot]);
    expect(moved).toEqual(expect.arrayContaining([['Lucario', 0, 21], ['Basculegion', 0, 23]]));
  });
  it.skipIf(!existsSync(H60) || !existsSync(HAUNTER))('um membro do PC é achado depois de ir para a equipe', () => {
    const a = real(H60), b = real(HAUNTER);
    const haunter = all(a).find(m => m.location !== 'party' && m.species.name === 'Haunter');
    const tm = stored(newTeam([haunter], { saveKey: saveKey(a), name: 'x', source: 'ai' }));
    expect(locateTeam(tm, b)[0].now).toMatchObject({ location: 'party', species: { name: 'Haunter' } });
  });
});
