// Equipes salvas: a equipe atual ou uma montada pela IA, guardadas por save (IndexedDB, só neste aparelho).
// Cada membro é guardado como uma "foto" do Pokémon com o que o histórico usa para reconhecê-lo depois
// (PID + OT, ou no Quetzal IVs, natureza, habilidade, bola, shiny e gênero): ao abrir uma versão mais nova
// do save, o app acha onde cada um está agora, mesmo depois de evoluir ou mudar de caixa.

import { matchMons } from '../history/diff.js';
import { showdownTeam, allMons } from '../export.js';

/** Equipes guardadas por save (acima disso, o app pede para apagar uma). */
export const TEAM_MAX = 20;
export const NAME_MAX = 40;

/** Só os dados necessários para mostrar o membro e reconhecê-lo em outra versão do save. */
export function snapshot(m) {
  const sp = m.species;
  return {
    location: m.location, boxIndex: m.boxIndex ?? null, slot: m.slot, where: m.where,
    speciesId: m.speciesId, exp: m.exp ?? null, level: m.level ?? null,
    species: { name: sp.name, form: sp.form || null, types: [...sp.types], spriteId: sp.spriteId ?? null, hasIcon: !!sp.hasIcon },
    nickname: m.nickname, hasNickname: !!m.hasNickname, shiny: !!m.shiny,
    gender: m.gender ? { symbol: m.gender.symbol || '', name: m.gender.name } : null,
    ivs: m.ivs ? { ...m.ivs } : null,
    nature: m.nature ? { name: m.nature.name } : null,
    ability: m.ability ? { num: m.ability.num, name: m.ability.name } : null,
    ball: m.ball ? { id: m.ball.id } : null,
    ...(m.pid !== undefined ? { pid: m.pid } : {}),
    ...(m.ot ? { ot: { tid: m.ot.tid, sid: m.ot.sid } } : {}),
    item: m.item ? { id: m.item.id, name: m.item.name } : null,
    moves: m.moves.map(mv => ({ id: mv.id, name: mv.name })),
    showdown: showdownTeam([m]).trim(),
  };
}

/** @param {{ saveKey: string, name: string, source: 'party'|'ai' }} info */
export function newTeam(mons, { saveKey, name, source }) {
  return { saveKey, name: cleanName(name), source, createdAt: Date.now(), members: mons.slice(0, 6).map(snapshot) };
}

export const cleanName = s => String(s || '').trim().replace(/\s+/g, ' ').slice(0, NAME_MAX);

/** Mesmos Pokémon, no mesmo lugar e com a mesma exp (para não salvar a mesma equipe duas vezes). */
export const teamSig = team => team.members.map(m => [m.location, m.boxIndex, m.slot, m.speciesId, m.exp].join(',')).sort().join(';');

/**
 * Onde está cada membro no save aberto agora.
 * @returns {Array<{ saved: object, now: object|null }>} now = o Pokémon no save (null se não foi achado)
 */
export function locateTeam(team, data) {
  const quetzal = !!(data.game && data.game.id === 'quetzal');
  const { pairs } = matchMons(team.members, allMons(data), quetzal);
  const found = new Map(pairs);
  return team.members.map(saved => ({ saved, now: found.get(saved) || null }));
}

/** Texto Showdown da equipe: os achados como estão agora; os que sumiram, como foram salvos. */
export function teamShowdown(located) {
  return located.map(x => (x.now ? showdownTeam([x.now]).trim() : x.saved.showdown)).join('\n\n') + '\n';
}
