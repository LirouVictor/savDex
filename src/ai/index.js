// Funções de IA (carregadas sob demanda, só quando o usuário toca num botão do assistente).
// Em duas etapas: prepareAi monta exatamente o que vai ser enviado (para o usuário ver e confirmar);
// sendAi envia e desenha a resposta.

import { provider } from './providers.js';
import { refOf, systemPrompt, localizedSchema, ANALYSIS_SCHEMA, BUILD_SCHEMA, REFINE_SCHEMA, analysisPrompt, buildPrompt, refinePrompt, buildPool, strategyLines, checkAnalysis, checkBuild, checkRefine } from './prompt.js';
import { analysisView, buildView, confirmView } from './view.js';

/**
 * Monta o pedido sem enviar nada.
 * @param {'analyze'|'build'} kind
 * @param {{ all: object[], T: object, game?: object, note?: string, dex?: object }} ctx dex = golpes por nível (dex.json), opcional
 */
export function prepareAi(kind, { all, T, game = null, note = '', dex = null }) {
  const P = provider();
  const system = systemPrompt(game);
  const prompt = kind === 'analyze' ? analysisPrompt(all, T, note, P.maxCandidates, { dex, game }) : buildPrompt(all, T, note, P.maxCandidates);
  const lines = prompt.split('\n');
  const counts = {
    party: lines.filter(l => /^E\d \|/.test(l)).length,
    pc: lines.filter(l => /^C\d+-\d+ \|/.test(l)).length,
    pcTotal: all.filter(m => m.location !== 'party').length,
    learn: lines.some(l => /^E\d: /.test(l)), // golpes por nível da equipe (análise do Quetzal/Unbound)
    hints: kind === 'build' && strategyLines(buildPool(all, P.maxCandidates)).length > 0, // clima/terreno/Trick Room
  };
  // dex fica no preparo para o app conferir os golpes citados na resposta (na montagem, não vai no pedido)
  // Montagem do Quetzal/Unbound: a segunda etapa leva os golpes por nível dos 6 escolhidos
  counts.learn2 = kind === 'build' && !!dex && !!game && ['quetzal', 'unbound'].includes(game.id);
  return { kind, P, system, prompt, schema: localizedSchema(kind === 'analyze' ? ANALYSIS_SCHEMA : BUILD_SCHEMA), all, T, dex, game, note: note.trim(), counts };
}

/** HTML da janela de confirmação ("o que vai ser enviado"). */
export function confirmHtml(prep) {
  return confirmView(prep);
}

const isLite = m => /lite/i.test(m || '');

/**
 * Envia o pedido preparado e devolve a tela do resultado.
 * A montagem tem duas etapas: a IA escolhe os 6; depois, um segundo pedido curto só com essa equipe e as contas
 * do app sobre ela escreve os pontos e as dicas. Se a segunda falhar, ficam os da primeira.
 * @param {object} prep resultado de prepareAi
 * @param {{ onStep?: (step: number) => void }} [opts] avisa quando começa a segunda etapa (para a tela de espera)
 */
export async function sendAi(prep, { onStep = () => {} } = {}) {
  const { kind, P, system, prompt, schema, all, T, dex, game, note } = prep;
  const byRef = new Map(all.map(m => [refOf(m), m]));
  const first = await P.generateJSON({ system, prompt, schema });
  const models = [first.model];
  const lite = [first].filter(x => x.fallback && isLite(x.model)).map(x => x.model);
  if (kind === 'analyze') {
    return { html: analysisView(checkAnalysis(first.data, byRef), byRef, `${P.service} (${first.model})`, { dex, T, lite }), byRef, team: null };
  }
  const r = checkBuild(first.data, byRef);
  const team = r.membros.map(x => byRef.get(x.ref));
  let refine = null;
  if (team.length) {
    onStep(2);
    refine = { prompt: refinePrompt(team, T, note, { dex, game }), ok: false };
    try {
      const second = await P.generateJSON({ system, prompt: refine.prompt, schema: localizedSchema(REFINE_SCHEMA) });
      const texts = checkRefine(second.data);
      if (texts) { Object.assign(r, texts); refine.ok = true; }
      if (second.model !== first.model) models.push(second.model);
      if (second.fallback && isLite(second.model) && !lite.includes(second.model)) lite.push(second.model);
    } catch (e) {
      console.warn(e); // fica com os pontos e dicas da primeira etapa
    }
  }
  return { html: buildView(r, byRef, `${P.service} (${models.join(' + ')})`, T, { dex, refine, lite }), byRef, team };
}

/** Prepara e envia direto (sem confirmação). */
export async function runAi(kind, ctx) {
  return sendAi(prepareAi(kind, ctx));
}
