// Funções de IA (carregadas sob demanda, só quando o usuário toca num botão do assistente).
// Em duas etapas: prepareAi monta exatamente o que vai ser enviado (para o usuário ver e confirmar);
// sendAi envia e desenha a resposta.

import { provider } from './providers.js';
import { refOf, freeAbilityMode, systemPrompt, localizedSchema, ANALYSIS_SCHEMA, BUILD_SCHEMA, REFINE_SCHEMA, REVIEW_SCHEMA, REVIEW_STRAT_SCHEMA, analysisPrompt, buildPrompt, refinePrompt, reviewPrompt, buildPool, strategyLines, checkAnalysis, checkBuild, checkRefine, checkStrategies } from './prompt.js';
import { analysisView, buildView, confirmView } from './view.js';
import { repairTeam } from './repair.js';
import { t } from '../i18n.js';

/**
 * Monta o pedido sem enviar nada.
 * @param {'analyze'|'build'|'review'} kind review = comentário sobre a equipe montada pelo app (`team`, `plan`, `roles` e as
 *   linhas do "ideal × o que você tem", `ideal`)
 * @param {{ all: object[], T: object, game?: object, note?: string, dex?: object, free?: boolean, team?: object[], plan?: string, roles?: Map }} ctx
 *   dex = golpes por nível (dex.json), opcional; free = modo livre (habilidade trocável por item, nos jogos em que o item existe)
 */
export function prepareAi(kind, { all, T, game = null, note = '', dex = null, free = false, team = null, plan = '', roles = new Map(), ideal = [], idealMons = [], strategies = null, check = null }) {
  const P = provider();
  const system = systemPrompt(game);
  const mode = free ? freeAbilityMode(game) : null;
  const prompt = kind === 'analyze' ? analysisPrompt(all, T, note, P.maxCandidates, { dex, game, free: mode })
    : kind === 'review' ? reviewPrompt(all, T, team, note, P.maxCandidates, { dex, game, free: mode, plan, roles, ideal, idealMons, strategies: check ? { lines: strategies || [], known: check.known } : null })
      : buildPrompt(all, T, note, P.maxCandidates, { free: mode });
  const lines = prompt.split('\n');
  const refs = lines.filter(l => /^(E\d|C\d+-\d+) \|/.test(l)).length;
  const counts = kind === 'review' ? {
    party: team.length,
    pc: refs - team.length,
    pcTotal: all.length - team.length,
  } : {
    party: lines.filter(l => /^E\d \|/.test(l)).length,
    pc: lines.filter(l => /^C\d+-\d+ \|/.test(l)).length,
    pcTotal: all.filter(m => m.location !== 'party').length,
  };
  Object.assign(counts, {
    learn: lines.some(l => /^(E\d|C\d+-\d+): /.test(l)), // golpes por nível da equipe (análise do Quetzal/Unbound)
    hints: kind === 'build' && strategyLines(buildPool(all, P.maxCandidates, mode), mode, T).length > 0, // clima/terreno/Trick Room
    free: !!mode,
    ideal: kind === 'review' && ideal.length > 0, // ideal do competitivo × o que o jogador tem (contas do app)
    strategies: kind === 'review' && !!check, // estratégias do app (Quetzal): a IA propõe e o app confere
  });
  // dex fica no preparo para o app conferir os golpes citados na resposta (na montagem, não vai no pedido)
  // Montagem do Quetzal/Unbound: a segunda etapa leva os golpes por nível dos 6 escolhidos
  counts.learn2 = kind === 'build' && !!dex && !!game && ['quetzal', 'unbound', 'soulgold'].includes(game.id);
  const schema = kind === 'analyze' ? ANALYSIS_SCHEMA : kind === 'review' ? (check ? REVIEW_STRAT_SCHEMA : REVIEW_SCHEMA) : BUILD_SCHEMA;
  return { kind, P, system, prompt, schema: localizedSchema(schema), all, T, dex, game, note: note.trim(), counts, free: mode, team, check };
}

/** HTML da janela de confirmação ("o que vai ser enviado"). */
export function confirmHtml(prep) {
  return confirmView(prep);
}

const isLite = m => /lite/i.test(m || '');
/** Membros que o app contou já evoluídos (conserto da equipe): referência → a forma evoluída. */
const evolvedRefs = team => new Map(team.filter(m => m && m.evolvedFrom).map(m => [refOf(m), m]));

/**
 * Envia o pedido preparado e devolve a tela do resultado.
 * A montagem tem duas etapas: a IA escolhe os 6; depois, um segundo pedido curto só com essa equipe e as contas
 * do app sobre ela escreve os pontos e as dicas. Se a segunda falhar, ficam os da primeira.
 * @param {object} prep resultado de prepareAi
 * @param {{ onStep?: (step: number) => void }} [opts] avisa quando começa a segunda etapa (para a tela de espera)
 */
export async function sendAi(prep, { onStep = () => {} } = {}) {
  const { kind, P, system, prompt, schema, all, T, dex, game, note, free = null } = prep;
  const byRef = new Map(all.map(m => [refOf(m), m]));
  const first = await P.generateJSON({ system, prompt, schema });
  const models = [first.model];
  const lite = [first].filter(x => x.fallback && isLite(x.model)).map(x => x.model);
  // Por que veio de um Lite: cota do dia (Gemini) ou sobrecarga
  let liteWhy = first.fallback === 'quota' ? 'quota' : 'overload';
  if (kind === 'analyze') {
    return { html: analysisView(checkAnalysis(first.data, byRef), byRef, `${P.service} (${first.model})`, { dex, T, lite, liteWhy }), byRef, team: null };
  }
  if (kind === 'review') {
    // Nos textos, a equipe como o app contou (forma evoluída, megapedra a dar); o toque abre o Pokémon real (byRef)
    const shown = new Map(byRef);
    for (const m of prep.team) shown.set(refOf(m), m);
    const r = checkAnalysis(first.data, shown, new Set(prep.team.map(refOf)));
    // Estratégias que a IA propôs (Quetzal): o app confere cada peça antes de mostrar
    if (prep.check) r.estrategias = checkStrategies(first.data.estrategias, prep.check);
    return { html: analysisView(r, shown, `${P.service} (${first.model})`, { dex, T, lite, liteWhy, review: true }), byRef, team: null };
  }
  const r = checkBuild(first.data, byRef);
  let team = r.membros.map(x => byRef.get(x.ref));
  // O app conserta o que dá para medir: tipo acertando 3+ membros em cheio (troca até 2, mexendo o mínimo)
  const fix = team.length ? repairTeam(team, buildPool(all, P.maxCandidates, free), T, { note, free }) : null;
  if (fix) {
    team = fix.team;
    for (const s of fix.swaps) {
      const x = r.membros.find(m => m.ref === refOf(s.out));
      Object.assign(x, { ref: refOf(s.in), papel: t('troca do app'), motivo: t('Entrou no lugar de {ref}: resiste aos tipos que acertavam muitos membros.', { ref: refOf(s.out) })
        + (s.in.evolvedFrom ? ' ' + t('Evolua {from} para {to}: a conta é com a forma evoluída.', { from: s.in.evolvedFrom.species.name, to: s.in.species.name }) : '') });
    }
    r.fix = fix;
  }
  let refine = null;
  if (team.length) {
    onStep(2);
    refine = { prompt: refinePrompt(team, T, note, { dex, game, swaps: fix ? fix.swaps : [], free }), ok: false };
    try {
      const second = await P.generateJSON({ system, prompt: refine.prompt, schema: localizedSchema(REFINE_SCHEMA) });
      const texts = checkRefine(second.data);
      if (texts) { Object.assign(r, texts); refine.ok = true; }
      if (second.model !== first.model) models.push(second.model);
      if (second.fallback && isLite(second.model) && !lite.includes(second.model)) lite.push(second.model);
      if (second.fallback === 'quota') liteWhy = 'quota';
    } catch (e) {
      console.warn(e); // fica com os pontos e dicas da primeira etapa
    }
  }
  return { html: buildView(r, byRef, `${P.service} (${models.join(' + ')})`, T, { dex, refine, lite, liteWhy, evolved: evolvedRefs(team) }), byRef, team, name: r.nome };
}

/** Prepara e envia direto (sem confirmação). */
export async function runAi(kind, ctx) {
  return sendAi(prepareAi(kind, ctx));
}
