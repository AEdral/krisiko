import { TERRITORIES } from '../data/map.js';

const FACES = {
  1: '⚀',
  2: '⚁',
  3: '⚂',
  4: '⚃',
  5: '⚄',
  6: '⚅',
};

/**
 * Show attack dice overlay. Returns a Promise that resolves when dismissed / timed out.
 */
export function showBattleDice(els, battle, opts = {}) {
  if (!battle || !els.diceOverlay) return Promise.resolve();

  const holdMs = opts.holdMs ?? 1600;
  const fromName = TERRITORIES[battle.from]?.name || battle.from;
  const toName = TERRITORIES[battle.to]?.name || battle.to;

  els.diceOverlay.classList.remove('hidden');
  els.diceTitle.textContent = `${fromName} → ${toName}`;
  els.diceAtt.innerHTML = battle.attDice
    .map((d) => `<span class="die att rolling">${FACES[d] || d}</span>`)
    .join('');
  els.diceDef.innerHTML = battle.defDice
    .map((d) => `<span class="die def rolling">${FACES[d] || d}</span>`)
    .join('');

  let result = '';
  if (battle.conquered) result = 'Territorio conquistato!';
  else result = `Att −${battle.attLoss} · Dif −${battle.defLoss}`;
  if (battle.card) result += ` · carta usata`;
  els.diceResult.textContent = result;

  return new Promise((resolve) => {
    const done = () => {
      els.diceOverlay.classList.add('hidden');
      els.diceOverlay.onclick = null;
      resolve();
    };
    els.diceOverlay.onclick = done;
    setTimeout(done, holdMs);
  });
}
