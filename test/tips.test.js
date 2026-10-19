import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setLang } from '../src/i18n.js';
import BASE from '../src/data/tables.js';
import { moveText, abilityText, normName } from '../src/ui/tips.js';
import abilityTexts from '../src/data/ability-text.json';
import abilityPt from '../src/data/ability-text-pt.json';
import movePt from '../src/data/move-text-pt.json';
import species from '../src/data/species.json';
import nds from '../src/data/nds.json';
import unbound from '../src/data/unbound.json';

const ctx = game => ({ game, T: BASE });

describe('Descrições de golpes e habilidades (interface em inglês)', () => {
  beforeAll(() => setLang('en'));
  afterAll(() => setLang('pt'));
  it('habilidades do expansion para os hacks, pelo nome', async () => {
    expect((await abilityText('Lightning Rod', ctx('quetzal'))).text).toMatch(/Electr/);
    expect((await abilityText('Stench', ctx('quetzal'))).text).toMatch(/flinch/i);
    expect((await abilityText('Inexistente', ctx('quetzal'))).text).toBeNull();
  });

  it('jogos oficiais mostram o texto da época', async () => {
    const g3 = await abilityText('Lightning Rod', ctx('emerald'));
    expect(g3.text).toBe('Draws electrical moves.');
    expect(g3.note).toMatch(/Emerald/);
    expect((await moveText(1, ctx('emerald'))).text).toMatch(/Pounds/);
    // Golpe de geração mais nova: texto do expansion, sem a nota da época
    const later = await moveText(500, ctx('emerald'));
    expect(later.text).toBeTruthy();
    expect(later.note).toBeNull();
  });

  it('Unbound e SoulGold avisam que o texto é do expansion', async () => {
    expect((await abilityText('Drizzle', ctx('unbound'))).note).toMatch(/expansion/);
    expect((await moveText(33, ctx('unbound'))).note).toMatch(/expansion/);
    expect((await moveText(33, ctx('quetzal'))).note).toBeNull();
  });

  it('todas as habilidades da Dex Nacional, do DS e do Unbound têm descrição', () => {
    const miss = names => [...new Set(names.filter(n => n && !abilityTexts[normName(n)]))];
    expect(miss(species.abilityNames)).toEqual([]);
    expect(miss(Object.values(nds.abilities).flat().filter(x => typeof x === 'string'))).toEqual([]);
    expect(miss(unbound.abilities.filter(x => typeof x === 'string'))).toEqual(['Portal Power']);
  });
});

describe('Descrições em português (tradução do Quetzal)', () => {
  it('golpes e habilidades com o texto em português; os nomes continuam em inglês', async () => {
    const burn = await moveText(645, ctx('quetzal')); // Burn Up
    expect(burn.text).toMatch(/perde o tipo Fogo/);
    expect(burn.note).toBeNull();
    expect((await abilityText('Drizzle', ctx('quetzal'))).text).toMatch(/Chuva/);
    expect((await abilityText('Levitate', ctx('quetzal'))).text).toMatch(/Spikes/);
  });

  it('fora do Quetzal, a nota diz de onde é o texto; nos oficiais, com o da época', async () => {
    expect((await abilityText('Drizzle', ctx('unbound'))).note).toMatch(/Quetzal/);
    const g3 = await abilityText('Lightning Rod', ctx('emerald'));
    expect(g3.text).toMatch(/Elétric/i);
    expect(g3.note).toMatch(/Emerald: Draws electrical moves\./);
    // O 848 do Quetzal (Nihil Light) não é o 848 do app
    expect((await moveText(848, ctx('emerald'))).text).not.toBe(movePt[848]);
  });

  it('todas as habilidades da Dex Nacional têm texto em português', () => {
    const miss = [...new Set(species.abilityNames.filter(n => n && !abilityPt[normName(n)]))];
    expect(miss).toEqual([]);
    expect(movePt.slice(1).every(Boolean)).toBe(true);
  });
});
