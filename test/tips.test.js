import { describe, it, expect } from 'vitest';
import BASE from '../src/data/tables.js';
import { moveText, abilityText, normName } from '../src/ui/tips.js';
import abilityTexts from '../src/data/ability-text.json';
import species from '../src/data/species.json';
import nds from '../src/data/nds.json';
import unbound from '../src/data/unbound.json';

const ctx = game => ({ game, T: BASE });

describe('Descrições de golpes e habilidades', () => {
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
