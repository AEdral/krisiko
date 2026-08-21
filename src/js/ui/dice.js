import { TERRITORIES } from '../data/map.js';

const FACES = {
  1: '⚀',
  2: '⚁',
  3: '⚂',
  4: '⚃',
  5: '⚄',
  6: '⚅',
};

function diceHtml(values, kind, opts = {}) {
  const { selectable = false, selectedIndex = null, flash = null } = opts;
  // Ordine L→R = indici 0..n (dopo sort: più alto a sinistra).
  return (values || [])
    .map((d, i) => {
      const sel = selectable && selectedIndex === i ? ' is-selected' : '';
      const isFlash = !!(flash && flash.side === kind && flash.index === i);
      const flashCls = isFlash ? ' is-flash' : '';
      const face = FACES[d] || d;
      const change =
        isFlash && flash.from != null && flash.to != null
          ? `<span class="die-change">${flash.from}→${flash.to}</span>`
          : '';
      if (selectable) {
        return `<button type="button" class="die ${kind}${sel}${flashCls}" data-die-index="${i}" aria-label="Dado ${d}">${face}${change}</button>`;
      }
      return `<span class="die ${kind}${flashCls}">${face}${change}</span>`;
    })
    .join('');
}

/**
 * Live combat overlay: centered dice, does not block hand/stack.
 */
export function syncLiveCombatDice(els, state, ui = {}) {
  const overlay = els.diceOverlay;
  if (!overlay) return;

  const ctx = state?.combatContext;
  if (!ctx || state.vanillaMode) {
    if (overlay.classList.contains('is-live')) {
      overlay.classList.add('hidden');
      overlay.classList.remove('is-live');
      overlay.onclick = null;
      overlay.querySelector('.dice-hint')?.classList.remove('hidden');
    }
    return;
  }

  const meId = ui.localPlayerId || Object.values(state.players || {}).find((p) => p.isHuman)?.id;
  const pc = state.pendingCast;
  const pickingDie = pc?.playerId === meId && pc.needsDiePick && !pc.hidden;
  const pickSide = pickingDie ? (pc.playerId === ctx.attackerId ? 'att' : 'def') : null;
  const selectedIndex = pickingDie ? pc.targets?.dieIndex ?? null : null;
  const flash = ctx.dieFlash && Date.now() - (ctx.dieFlash.at || 0) < 4000 ? ctx.dieFlash : null;

  const fromName = TERRITORIES[ctx.from]?.name || ctx.from;
  const toName = TERRITORIES[ctx.to]?.name || ctx.to;

  overlay.classList.remove('hidden');
  overlay.classList.add('is-live');
  overlay.onclick = null;
  overlay.querySelector('.dice-hint')?.classList.add('hidden');

  els.diceTitle.textContent = `${fromName} → ${toName}`;
  els.diceAtt.innerHTML = diceHtml(ctx.rawAttDice, 'att', {
    selectable: pickSide === 'att',
    selectedIndex: pickSide === 'att' ? selectedIndex : null,
    flash,
  });
  els.diceDef.innerHTML = diceHtml(ctx.rawDefDice, 'def', {
    selectable: pickSide === 'def',
    selectedIndex: pickSide === 'def' ? selectedIndex : null,
    flash,
  });

  if (pickingDie) {
    els.diceResult.textContent = 'Clicca un dado (1 click) per applicarlo';
  } else if (flash) {
    els.diceResult.textContent = `${flash.cardName || 'Carta'}: ${flash.from} → ${flash.to}`;
  } else if (state.responseWindow?.kind === 'combat_counter') {
    els.diceResult.textContent = 'Combat in stack — Negare ora o attendi il risultato';
  } else {
    const a = ctx.attLossPreview;
    const d = ctx.defLossPreview;
    els.diceResult.textContent =
      a != null
        ? `Previsto: Att −${a} · Dif −${d} · solo chi perde può usare combat`
        : 'Finestra aperta — carte verdi in mano';
  }

  overlay.querySelectorAll('[data-die-index]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      ui.onSelectCastDie?.(Number(btn.getAttribute('data-die-index')));
    });
  });
}

/**
 * Show attack dice overlay. Returns a Promise that resolves when dismissed / timed out.
 */
export function showBattleDice(els, battle, opts = {}) {
  if (!battle || !els.diceOverlay) return Promise.resolve();

  const holdMs = opts.holdMs ?? 1600;
  const fromName = TERRITORIES[battle.from]?.name || battle.from;
  const toName = TERRITORIES[battle.to]?.name || battle.to;

  els.diceOverlay.classList.remove('hidden', 'is-live');
  els.diceOverlay.querySelector('.dice-hint')?.classList.remove('hidden');
  els.diceTitle.textContent = `${fromName} → ${toName}`;
  els.diceAtt.innerHTML = battle.attDice
    .map((d) => `<span class="die att rolling">${FACES[d] || d}</span>`)
    .join('');
  els.diceDef.innerHTML = battle.defDice
    .map((d) => `<span class="die def rolling">${FACES[d] || d}</span>`)
    .join('');

  let result = '';
  if (battle.conquered) result = 'Territorio conquistato!';
  else result = `Att −${battle.attLoss ?? 0} · Dif −${battle.defLoss ?? 0}`;
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

export function hideBattleDice(els) {
  els.diceOverlay?.classList.add('hidden');
  els.diceOverlay?.classList.remove('is-live');
}
