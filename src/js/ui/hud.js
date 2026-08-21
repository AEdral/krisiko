import {
  RELICS,
  EVENTS,
  EVENT_IDS,
  RELIC_IDS,
  CARDS,
  getCard,
  MISSIONS,
  handLimit,
  getContinentBonus,
  getContinentStatus,
  getAlivePlayerIds,
  getClassicCard,
  isClassicCardId,
  canEndPhaseNow,
  windowRemainingMs,
  canStartCast,
  TERRITORIES,
  getActiveEvents,
} from '../engine/game.js';
import { isValidClassicSet, CLASSIC_HAND_LIMIT } from '../data/classic-cards.js';
import { territorySilhouetteHtml } from './map.js';

function countOwned(state, pid) {
  return Object.values(state.territories).filter((t) => t.owner === pid).length;
}

function countArmies(state, pid) {
  return Object.values(state.territories)
    .filter((t) => t.owner === pid)
    .reduce((s, t) => s + t.armies, 0);
}

function phaseLabel(phase) {
  const map = {
    setup: 'Schieramento',
    reinforce: 'Rinforzi',
    attack: 'Attacco',
    fortify: 'Spostamento',
    game_over: 'Fine partita',
  };
  return map[phase] || phase;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function continentPiesHtml(state, focusPid) {
  const short = { na: 'NA', sa: 'SA', eu: 'EU', af: 'AF', as: 'AS', oc: 'OC' };
  const order = state.playerOrder || Object.keys(state.players);

  return `<div class="cont-pies">${getContinentStatus(state, focusPid)
    .map((c) => {
      const label = short[c.id] || c.id.toUpperCase();
      let acc = 0;
      const parts = [];
      for (const pid of order) {
        const n = c.byOwner[pid] || 0;
        if (n <= 0) continue;
        const start = (acc / c.total) * 100;
        acc += n;
        const end = (acc / c.total) * 100;
        parts.push(`${state.players[pid].color} ${start}% ${end}%`);
      }
      if (!parts.length) parts.push('rgba(255,255,255,0.12) 0% 100%');
      const gradient = `conic-gradient(${parts.join(', ')})`;

      const tipBits = order.map((pid) => {
        const n = c.byOwner[pid] || 0;
        return `${state.players[pid].name} ${n}/${c.total}`;
      });
      const tip = `${c.name} (${label}): ${tipBits.join(' · ')}${c.complete ? ` · bonus +${c.bonus}` : ''}`;

      return `<div class="cont-pie-wrap${c.complete ? ' ok' : ''}" title="${escapeHtml(tip)}">
        <div class="cont-pie" style="background:${gradient}"></div>
        <span class="cont-pie-label">${label}</span>
        <span class="cont-pie-count">${c.owned}/${c.total}</span>
      </div>`;
    })
    .join('')}</div>`;
}

function missionText(state, player) {
  const mission = MISSIONS[player.missionId];
  if (!mission) return { name: '—', description: '' };
  let description = mission.description;
  if (player.missionId === 'eliminate_enemy' && player.missionTargetId) {
    const target = state.players[player.missionTargetId];
    description = `Elimina ${target?.name ?? 'un avversario'} (conquista tutti i suoi territori).`;
  }
  return { name: mission.name, description };
}

function localPlayer(state, ui) {
  const me = ui.localPlayerId || Object.values(state.players).find((p) => p.isHuman)?.id;
  return me ? state.players[me] : null;
}

function opponentsHtml(state, ui) {
  const human = localPlayer(state, ui);
  if (!human) return '';
  const others = (state.playerOrder || Object.keys(state.players)).filter((id) => id !== human.id);
  const alive = new Set(getAlivePlayerIds(state));
  const rows = others
    .map((id) => {
      const ai = state.players[id];
      const relic = RELICS[ai.relicId];
      const extras = (ai.extraRelicIds || [])
        .map((rid) => RELICS[rid])
        .filter(Boolean);
      const open = ui.expandedOpponentId === id;
      const dead = !alive.has(id);
      const relicShort = state.vanillaMode ? 'Classico' : relic?.name || '—';
      return `<article class="opp-card${open ? ' is-open' : ''}${dead ? ' is-out' : ''}" data-opp-id="${id}" style="--opp:${ai.color}">
        <div class="opp-summary">
          <div class="who">
            <strong style="color:${ai.color}">${escapeHtml(ai.name)}${dead ? ' · fuori' : ''}</strong>
            <span class="opp-relic-one" title="Reliquia">${escapeHtml(relicShort)}</span>
            <span class="pill opp-terr-pill" style="box-shadow:inset 0 0 0 1px ${ai.color}">${countOwned(state, id)}/42</span>
          </div>
        </div>
        <div class="opp-details">
          <div class="opp-details-inner">
            <div class="stat-row">
              <div class="stat-chip"><span class="k">Armate</span><span class="v">${countArmies(state, id)}</span></div>
              <div class="stat-chip"><span class="k">Bonus</span><span class="v">+${getContinentBonus(state, id)}</span></div>
              <div class="stat-chip"><span class="k">Carte</span><span class="v">${ai.hand.length}</span></div>
            </div>
            ${
              state.vanillaMode
                ? `<div class="relic-mini"><div class="desc">Carte territorio tradizionali, niente reliquie Krisiko.</div></div>`
                : `<div class="relic-mini">
              <div class="name">${escapeHtml(relic?.name || '—')}</div>
              <div class="desc">${escapeHtml(relic?.description || '')}</div>
            </div>
            ${extras
              .map(
                (extra) => `<div class="relic-mini">
              <div class="name">${escapeHtml(extra.name)}</div>
              <div class="desc">${escapeHtml(extra.description || '')}</div>
            </div>`,
              )
              .join('')}`
            }
            <div class="relic-mini">
              <div class="name">Obiettivo: segreto</div>
            </div>
            ${continentPiesHtml(state, id)}
            <div class="hand-backs" title="Carte in mano">
              ${ai.hand.map(() => '<div class="card-back"></div>').join('') || '<span style="color:var(--muted);font-size:0.75rem">0 carte</span>'}
            </div>
          </div>
        </div>
      </article>`;
    })
    .join('');
  const title = others.length === 1 ? 'Avversario' : 'Avversari';
  return `<div class="opponents-head">${escapeHtml(title)}</div>${rows}`;
}

export function renderHud(els, state, ui, nowMs = Date.now()) {
  const pid = state.currentPlayerId;
  const player = state.players[pid];
  const human = localPlayer(state, ui);
  if (!human) return;
  const mission = missionText(state, human);
  const relic = RELICS[human.relicId];
  const myTurn = pid === human.id;

  const setupHint =
    state.phase === 'setup'
      ? `<span class="pill turn">Schieramento: ${state.players[pid].setupRemaining} rimaste</span>`
      : '';

  els.topMeta.innerHTML = `
    <span class="pill">${state.phase === 'setup' ? 'Setup' : `Round ${state.round}`}</span>
    <span class="pill ${myTurn ? 'turn' : ''}" style="box-shadow:inset 0 0 0 1px ${player.color}">Turno: ${escapeHtml(player.name)}</span>
    <span class="pill">Fase: ${phaseLabel(state.phase)}</span>
    ${state.phase === 'reinforce' && myTurn ? `<span class="pill turn">Rinforzi: ${state.reinforcementsRemaining}</span>` : ''}
    ${setupHint}
  `;

  els.opponentPanel.innerHTML = opponentsHtml(state, ui);
  els.opponentPanel.classList.toggle('is-open', !!ui.expandedOpponentId);
  els.opponentPanel.title = '';

  const evList = getActiveEvents(state);
  els.eventBlock.innerHTML = `
    <h2>${evList.length > 1 ? 'Eventi globali' : 'Evento globale'}</h2>
    ${
      state.vanillaMode
        ? `<p class="line" style="color:var(--muted)">Non disponibile in modalità classico</p>`
        : evList.length
        ? evList
            .map(
              (ev) => `<p class="line"><strong>${escapeHtml(ev.name)}</strong></p>
           <p class="line" style="color:var(--muted);font-size:0.75rem">${escapeHtml(ev.description)}</p>`,
            )
            .join('')
        : `<p class="line" style="color:var(--muted)">Nessuno (dal round 2)</p>`
    }
  `;

  renderSandboxPanel(els, state, human, ui);

  els.playerRelic.innerHTML = `
    <div class="tray-label">Reliquia</div>
    <div class="rname">${escapeHtml(relic?.name || '—')}</div>
    <div class="rdesc">${escapeHtml(relic?.description || '')}</div>
    ${
      (human.extraRelicIds || [])
        .map((rid) => {
          const extra = RELICS[rid];
          return extra
            ? `<div class="relic-extra">
                <div class="rname">${escapeHtml(extra.name)}</div>
                <div class="rdesc">${escapeHtml(extra.description)}</div>
              </div>`
            : '';
        })
        .join('')
    }
  `;

  els.playerMission.innerHTML = `
    <div class="mission-collapsed" aria-hidden="${ui.missionExpanded ? 'true' : 'false'}">
      <div class="mission-eye" title="Mostra obiettivo" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      </div>
      <div class="tray-label">Obiettivo</div>
    </div>
    <div class="mission-body">
      <div class="tray-label">Obiettivo</div>
      <div class="rname">${escapeHtml(mission.name)}</div>
      <div class="rdesc">${escapeHtml(mission.description)}</div>
    </div>
  `;
  els.playerMission.classList.toggle('is-open', !!ui.missionExpanded);
  els.playerMission.title = ui.missionExpanded ? 'Clic per nascondere' : 'Clic per rivelare';
  els.playerTray?.classList.toggle('mission-open', !!ui.missionExpanded);

  els.playerStats.innerHTML = `
    <div class="dash-metrics${state.phase === 'setup' ? ' cols-5' : ''}">
      <div class="dm"><span class="k">Territori</span><span class="v">${countOwned(state, human.id)}/42</span></div>
      <div class="dm"><span class="k">Armate</span><span class="v">${countArmies(state, human.id)}</span></div>
      <div class="dm"><span class="k">Bonus</span><span class="v">+${getContinentBonus(state, human.id)}</span></div>
      ${
        state.vanillaMode
          ? `<div class="dm"><span class="k">Carte</span><span class="v">${human.hand.length}/${CLASSIC_HAND_LIMIT}</span></div>`
          : `<div class="dm"><span class="k">Carte</span><span class="v">${human.hand.length}/${handLimit(state, human.id)}</span></div>`
      }
      ${
        state.phase === 'setup'
          ? `<div class="dm"><span class="k">Schiera</span><span class="v">${human.setupRemaining}</span></div>`
          : ''
      }
    </div>
    <div class="tray-label cont-title">Continenti</div>
    ${continentPiesHtml(state, human.id)}
  `;

  renderHand(els.hand, state, human, ui);
  renderSandboxKit(els.sandboxKit, state, human, ui);
  const handToggle = document.getElementById('hand-fold-toggle');
  if (handToggle) {
    const n = human.hand?.length || 0;
    const kitN = state.sandboxMode ? human.sandboxKit?.length || 0 : 0;
    handToggle.textContent = kitN ? `Mano (${n}) · kit ${kitN}` : `Mano (${n})`;
  }
  renderChoiceOverlay(els, state, human, ui);
  renderLog(els.log, state);
  renderStackPanel(els.stackPanel, state, ui, nowMs);
}

export function renderStackPanel(el, state, ui, nowMs = Date.now()) {
  if (!el) return;
  const me = localPlayer(state, ui);
  const layout = el.closest('.layout');
  if (state.vanillaMode || state.phase === 'setup' || state.phase === 'game_over') {
    el.classList.add('hidden');
    layout?.classList.remove('has-stack');
    el.innerHTML = '';
    return;
  }

  el.classList.remove('hidden');
  layout?.classList.add('has-stack');

  const stack = state.stack || [];
  const rem = state.responseWindow ? windowRemainingMs(state, nowMs) : 0;
  const sec = Math.ceil(rem / 1000);
  const paused = !!state.responseWindow?.paused || !!state.pendingCast;
  const windowLabel =
    state.responseWindow?.kind === 'combat'
      ? 'Combattimento'
      : state.responseWindow?.kind === 'combat_counter'
        ? 'Counter combat'
        : state.responseWindow?.kind === 'action_response'
          ? 'Risposta'
          : 'In attesa';

  let banner = '';
  if (state.pendingCast) {
    const pc = state.pendingCast;
    const name = state.players[pc.playerId]?.name || pc.playerId;
    const isCaster = me?.id === pc.playerId;
    const hidden = pc.hidden || !isCaster;
    if (hidden) {
      banner = `<div class="stack-banner">${escapeHtml(name)} sta lanciando una carta…</div>`;
    } else {
      const card = getCard(pc.cardId);
      banner = `<div class="stack-banner">Tu stai lanciando ${escapeHtml(card?.name || '…')}</div>`;
    }
  } else if (state.responseWindow) {
    const passed = state.responseWindow.passedPlayerIds || [];
    const passHint =
      me && passed.includes(me.id)
        ? ' · hai passato'
        : me
          ? ' · OK se non fai nulla'
          : '';
    banner = `<div class="stack-banner">${windowLabel}${paused ? ' (in pausa)' : ''}${passHint}</div>`;
  } else {
    banner = `<div class="stack-banner">Nessuna finestra aperta</div>`;
  }

  const entries = stack.length
    ? stack
        .map((entry, i) => {
          const card = getCard(entry.cardId);
          const who = state.players[entry.playerId]?.name || entry.playerId;
          const top = i === stack.length - 1 ? ' is-top' : '';
          const kind = entry.kind || card?.timing || '';
          const isCombat = kind === 'combat';
          const ctx = state.combatContext;
          let role = '';
          if (isCombat && ctx) {
            if (entry.playerId === ctx.attackerId) role = ' · attaccante';
            else if (entry.playerId === ctx.defenderId) role = ' · difensore';
          }
          return `<div class="stack-entry${top}${isCombat ? ' is-combat' : ''}">
            <span class="skind">${escapeHtml(kind)}${escapeHtml(role)}</span>
            <strong>${escapeHtml(card?.name || entry.cardId)}</strong>
            <span>${escapeHtml(who)}</span>
          </div>`;
        })
        .join('')
    : '<div class="stack-empty">Vuoto — le carte lanciate appaiono qui</div>';

  const combatStackHint =
    state.responseWindow?.kind === 'combat'
      ? `<div class="stack-combat-hint stack-combat-active">Solo chi perde truppe: combat dal pannello centrale</div>`
      : state.responseWindow?.kind === 'combat_counter'
        ? `<div class="stack-combat-hint stack-combat-active">Rispondi dal pannello centrale</div>`
        : '';

  el.innerHTML = `
    <h2>Stack</h2>
    ${
      state.responseWindow
        ? `<div class="stack-timer${paused ? ' is-paused' : ''}">${paused ? '⏸' : '⏱'} ${sec}s · ${escapeHtml(windowLabel)}</div>`
        : `<div class="stack-timer">—</div>`
    }
    ${banner}
    <div class="stack-entries">${entries}</div>
    ${combatStackHint}
  `;
}

function choiceSessionKey(state, me, ui) {
  if (!me) return null;
  if (state.pendingChoice && me.id === state.pendingChoice.actorId) {
    const pc = state.pendingChoice;
    return `pc:${pc.kind}:${pc.step || ''}:${pc.prompt || ''}`;
  }
  if (state.pendingBastion && me.id === state.pendingBastion.defenderId) {
    return `bastion:${state.pendingBastion.defenderId}`;
  }
  if (state.pendingCast && me.id === state.pendingCast.playerId && !state.pendingCast.hidden) {
    return `cast:${state.pendingCast.cardId}:${state.pendingCast.targets?.dieIndex ?? 'x'}`;
  }
  if (me.id === state.currentPlayerId && ui?.mode && String(ui.mode).startsWith('card_')) {
    return `target:${ui.mode}:${ui.selectedCardIndex ?? ''}:${ui.selectedKitIndex ?? ''}:${ui.marchFrom || ''}`;
  }
  if (me.id === state.currentPlayerId && state.phase === 'fortify' && ui?.selectedId) {
    return `fortify_sel:${ui.selectedId}`;
  }
  if (
    !state.vanillaMode &&
    state.responseWindow &&
    !state.pendingCast &&
    !(state.responseWindow.passedPlayerIds || []).includes(me.id)
  ) {
    const top = state.stack?.[state.stack.length - 1];
    return `rw:${state.responseWindow.kind}:${top?.cardId || ''}:${top?.id || ''}:${state.combatContext?.attLossPreview ?? ''}:${state.combatContext?.defLossPreview ?? ''}`;
  }
  return null;
}

function collectPlayableResponseCards(state, me) {
  const out = [];
  const hand = me.hand || [];
  hand.forEach((cardId, index) => {
    const card = getCard(cardId);
    if (!card) return;
    if (!canStartCast(state, me.id, card)) return;
    if (card.timing !== 'instant' && card.timing !== 'combat') return;
    out.push({ card, fromKit: false, index });
  });
  if (state.sandboxMode && me.sandboxKit?.length) {
    me.sandboxKit.forEach((cardId, index) => {
      const card = getCard(cardId);
      if (!card) return;
      if (!canStartCast(state, me.id, card)) return;
      if (card.timing !== 'instant' && card.timing !== 'combat') return;
      out.push({ card, fromKit: true, index });
    });
  }
  return out;
}

function ensureChoicePick(ui, key) {
  if (ui._choiceSessionKey !== key) {
    ui._choiceSessionKey = key;
    ui.choicePick = null;
  }
}

export function renderChoiceOverlay(els, state, human, ui) {
  const root = els.choiceOverlay;
  if (!root) return;

  const me = human;
  const key = choiceSessionKey(state, me, ui);
  const titleEl = els.choiceTitle;
  const subEl = els.choiceSubtitle;
  const optsEl = els.choiceOptions;
  const footEl = els.choiceFooter;
  if (!titleEl || !optsEl || !footEl) return;

  if (!key) {
    root.classList.add('hidden');
    root.classList.remove('is-die-wait', 'is-dock');
    titleEl.textContent = '';
    if (subEl) subEl.textContent = '';
    optsEl.innerHTML = '';
    footEl.innerHTML = '';
    ui._choiceSessionKey = null;
    ui.choicePick = null;
    return;
  }

  ensureChoicePick(ui, key);
  root.classList.remove('hidden');

  const setDock = (dock, dieWait = false) => {
    root.classList.toggle('is-dock', !!dock);
    root.classList.toggle('is-die-wait', !!dieWait);
  };

  optsEl.innerHTML = '';
  footEl.innerHTML = '';
  if (subEl) subEl.textContent = '';

  const addOpt = ({ html, selected, onClick }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `choice-opt${selected ? ' is-selected' : ''}`;
    btn.innerHTML = html;
    btn.addEventListener('click', () => onClick?.());
    optsEl.appendChild(btn);
    return btn;
  };

  const addFooter = ({ label, primary, disabled, onClick }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = primary ? 'btn' : 'btn btn-ghost';
    btn.textContent = label;
    btn.disabled = !!disabled;
    btn.addEventListener('click', () => {
      if (!btn.disabled) onClick?.();
    });
    footEl.appendChild(btn);
    return btn;
  };

  // —— Cast confirm ——
  if (state.pendingCast && me.id === state.pendingCast.playerId && !state.pendingCast.hidden) {
    const pc = state.pendingCast;
    const card = getCard(pc.cardId);
    const needDie = pc.needsDiePick && pc.targets?.dieIndex == null;
    setDock(true, needDie);
    titleEl.textContent = 'Conferma lancio';
    if (subEl) {
      subEl.textContent = needDie
        ? `Clicca un dado al centro per lanciare ${card?.name || 'la carta'}.`
        : `Vuoi lanciare ${card?.name || 'questa carta'}?`;
    }
    if (!needDie) {
      addOpt({
        html: `<strong>${escapeHtml(card?.name || 'Carta')}</strong><span>${escapeHtml(card?.description || 'Conferma il lancio')}</span>`,
        onClick: () => ui.onCastConfirm?.(),
      });
    } else {
      addOpt({
        html: `<strong>Annulla</strong><span>Non lanciare ${escapeHtml(card?.name || 'la carta')}</span>`,
        onClick: () => ui.onCastCancel?.(),
      });
    }
    addFooter({
      label: 'Annulla',
      onClick: () => ui.onCastCancel?.(),
    });
    if (!needDie) {
      addFooter({
        label: 'Conferma',
        primary: true,
        onClick: () => ui.onCastConfirm?.(),
      });
    }
    return;
  }
  root.classList.remove('is-die-wait');

  // —— Bastione ——
  if (state.pendingBastion && me.id === state.pendingBastion.defenderId) {
    setDock(true);
    titleEl.textContent = 'Bastione';
    if (subEl) subEl.textContent = 'Sei sotto attacco. Usare Bastione (+1 al dado di difesa più alto)?';
    addOpt({
      html: '<strong>Sì, Bastione</strong><span>+1 al dado di difesa più alto</span>',
      onClick: () => ui.onBastionChoice?.(true),
    });
    addOpt({
      html: '<strong>No</strong><span>Difendi senza Bastione</span>',
      onClick: () => ui.onBastionChoice?.(false),
    });
    return;
  }

  // —— Targeting carta (reclute, isolamento, …) ——
  if (
    me.id === state.currentPlayerId &&
    ui?.mode &&
    String(ui.mode).startsWith('card_') &&
    !(state.pendingChoice && me.id === state.pendingChoice.actorId)
  ) {
    setDock(true);
    const labels = {
      card_recruit: ['Reclutamento', 'Clicca un tuo territorio per +2 armate.'],
      card_supplies: ['Approvvigionamenti', 'Clicca un tuo territorio per +4 armate.'],
      card_isolation: ['Isolamento', 'Clicca un territorio da bloccare.'],
      card_betrayal: ['Tradimento', 'Clicca un territorio nemico con 1 armata.'],
      card_teleport: [
        'Teletrasporto',
        ui.marchFrom ? 'Clicca la destinazione.' : 'Clicca il territorio di partenza.',
      ],
      card_forced_march: [
        'Marcia',
        ui.marchFrom ? 'Clicca la destinazione adiacente.' : 'Clicca il territorio di partenza.',
      ],
    };
    const [title, hint] = labels[ui.mode] || ['Seleziona', 'Scegli un bersaglio sulla mappa.'];
    titleEl.textContent = title;
    if (subEl) subEl.textContent = hint;
    addOpt({
      html: '<strong>Annulla</strong><span>Annulla la carta e torna alla mano</span>',
      onClick: () => ui.onCancelTargeting?.(),
    });
    return;
  }

  // —— Spostamento: origine selezionata ——
  if (
    me.id === state.currentPlayerId &&
    state.phase === 'fortify' &&
    ui?.selectedId &&
    !(state.pendingChoice && me.id === state.pendingChoice.actorId)
  ) {
    setDock(true);
    const tid = ui.selectedId;
    const name = TERRITORIES[tid]?.name || tid;
    titleEl.textContent = 'Spostamento';
    if (subEl) subEl.textContent = `Da ${name}: clicca la destinazione, oppure annulla.`;
    addOpt({
      html: '<strong>Annulla</strong><span>Deseleziona il territorio di partenza</span>',
      onClick: () => ui.onCancelTargeting?.(),
    });
    return;
  }

  // —— Finestra risposta / combat (Instant + OK) ——
  // pendingChoice ha priorità: non sovrascrivere quel modal.
  if (
    !state.vanillaMode &&
    state.responseWindow &&
    !state.pendingCast &&
    !(state.pendingChoice && me.id === state.pendingChoice.actorId) &&
    !(state.responseWindow.passedPlayerIds || []).includes(me.id)
  ) {
    setDock(true);
    const kind = state.responseWindow.kind;
    const playable = collectPlayableResponseCards(state, me);
    const rem = Math.ceil(windowRemainingMs(state, Date.now()) / 1000);
    const title =
      kind === 'combat'
        ? 'Combattimento'
        : kind === 'combat_counter'
          ? 'Rispondi allo stack'
          : 'Rispondi';
    titleEl.textContent = title;
    if (subEl) {
      subEl.textContent =
        playable.length > 0
          ? `Hai ${rem}s · clicca una carta o passa`
          : `Hai ${rem}s · passa se non fai nulla`;
    }
    for (const entry of playable) {
      const meta = [entry.card.timing, entry.fromKit ? 'kit' : null].filter(Boolean).join(' · ');
      addOpt({
        html: `<strong>${escapeHtml(entry.card.name)}</strong>${meta ? `<em>${escapeHtml(meta)}</em>` : ''}<span>${escapeHtml(entry.card.description || '')}</span>`,
        onClick: () =>
          ui.onStartCast?.({
            fromKit: entry.fromKit,
            handIndex: entry.fromKit ? undefined : entry.index,
            kitIndex: entry.fromKit ? entry.index : undefined,
          }),
      });
    }
    addOpt({
      html: '<strong>OK per me</strong><span>Non rispondo in questa finestra</span>',
      onClick: () => ui.onPassStack?.(),
    });
    return;
  }

  // —— pendingChoice (modal centrale) ——
  setDock(false);
  const pc = state.pendingChoice;
  if (!pc || me.id !== pc.actorId) {
    root.classList.add('hidden');
    root.classList.remove('is-dock', 'is-die-wait');
    return;
  }

  titleEl.textContent = choiceTitleFor(pc);
  if (subEl) subEl.textContent = pc.prompt || '';

  if (pc.kind === 'scry') {
    if (pc.items?.length) {
      const item = pc.items[0];
      const preview = document.createElement('div');
      preview.className = 'choice-opt';
      preview.style.cursor = 'default';
      preview.innerHTML = `<strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.description)}</span>`;
      optsEl.appendChild(preview);
    }
    addOpt({
      html: '<strong>Pesca</strong><span>Aggiungi la carta alla mano</span>',
      onClick: () => ui.onResolveChoice?.({ scryAction: 'draw' }),
    });
    addOpt({
      html: '<strong>Metti in fondo</strong><span>La carta torna in fondo al mazzo</span>',
      onClick: () => ui.onResolveChoice?.({ scryAction: 'bottom' }),
    });
    return;
  }

  if (pc.step === 'confirm' && (pc.kind === 'turncoat' || pc.kind === 'double_mandate')) {
    for (const item of pc.items || []) {
      const box = document.createElement('div');
      box.className = 'choice-opt';
      box.style.cursor = 'default';
      box.innerHTML = `<strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.description)}</span>`;
      optsEl.appendChild(box);
    }
    const yesLabel = pc.kind === 'turncoat' ? 'Scambia' : 'Sostituisci';
    const noLabel = pc.kind === 'turncoat' ? 'Passa' : 'Rifiuta';
    addOpt({
      html: `<strong>${yesLabel}</strong>`,
      onClick: () => ui.onResolveChoice?.({ confirm: true }),
    });
    addOpt({
      html: `<strong>${noLabel}</strong>`,
      onClick: () => ui.onResolveChoice?.({ confirm: false }),
    });
    return;
  }

  const multiSurveil = pc.kind === 'surveil' && pc.maxPick > 1;
  for (const item of pc.items || []) {
    if (item.type === 'mission') continue;

    let html;
    let selected = false;

    if (item.type === 'player') {
      const extra = item.handCount != null ? `${item.handCount} carte` : '';
      html = `<strong>${escapeHtml(item.name)}</strong>${extra ? `<span>${escapeHtml(extra)}</span>` : ''}`;
    } else if (item.type === 'relic') {
      html = `<strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.description)}</span>`;
    } else if (item.type === 'card') {
      const meta = [item.timing, item.rarity].filter(Boolean).join(' · ');
      html = `<strong>${escapeHtml(item.name)}</strong>${meta ? `<em>${escapeHtml(meta)}</em>` : ''}<span>${escapeHtml(item.description)}</span>`;
      if (multiSurveil) selected = !!pc.picked?.includes(item.id);
    } else {
      continue;
    }

    addOpt({
      html,
      selected,
      onClick: () => {
        if (multiSurveil && item.type === 'card') {
          ui.onResolveChoice?.({ cardId: item.id });
          return;
        }
        if (item.type === 'player') ui.onResolveChoice?.({ targetPlayerId: item.id });
        else if (item.type === 'relic') ui.onResolveChoice?.({ relicId: item.id });
        else if (item.type === 'card') ui.onResolveChoice?.({ cardId: item.id });
      },
    });
  }

  if (multiSurveil) {
    const picked = pc.picked?.length || 0;
    if (subEl) {
      subEl.textContent = `${pc.prompt || ''} — selezionate ${picked}/${pc.maxPick}`;
    }
    addFooter({
      label: 'Conferma',
      primary: true,
      disabled: picked === 0,
      onClick: () => ui.onResolveChoice?.({ confirm: true }),
    });
  }
}

function choiceTitleFor(pc) {
  switch (pc.kind) {
    case 'arcana':
      return 'Arcana';
    case 'surveil':
      return 'Preveggenza';
    case 'scry':
      return 'Veggente';
    case 'steal':
      return 'Furto';
    case 'sabotage':
      return 'Sabotaggio';
    case 'omniscience':
      return 'Onniscienza';
    case 'turncoat':
      return 'Voltagabbana';
    case 'double_mandate':
      return 'Doppio mandato';
    default:
      return 'Scelta';
  }
}

function renderSandboxPanel(els, state, human, ui) {
  const root = els.sandboxFloat;
  if (!root) return;
  if (!state.sandboxMode || state.vanillaMode) {
    root.classList.add('hidden');
    return;
  }
  root.classList.remove('hidden');

  const expanded = ui.sandboxExpanded !== false;
  root.classList.toggle('is-collapsed', !expanded);
  const toggle = els.sandboxFloatToggle;
  if (toggle) {
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }

  const ownedIds = [human.relicId, ...(human.extraRelicIds || [])].filter(Boolean);
  const owned = new Set(ownedIds);
  const activeIds = state.activeEventIds?.length
    ? [...state.activeEventIds]
    : state.activeEventId
      ? [state.activeEventId]
      : [];
  const active = new Set(activeIds);

  const summary = els.sandboxFloatSummary;
  if (summary) {
    const bits = [
      ...ownedIds.map((id) => {
        const r = RELICS[id];
        return r
          ? `<span class="sandbox-chip is-on" title="${escapeHtml(r.description)}">${escapeHtml(r.name)}</span>`
          : '';
      }),
      ...activeIds.map((id) => {
        const e = EVENTS[id];
        return e
          ? `<span class="sandbox-chip is-on" title="${escapeHtml(e.description)}">${escapeHtml(e.name)}</span>`
          : '';
      }),
    ].filter(Boolean);
    summary.innerHTML = bits.length
      ? bits.join('')
      : '<span class="sandbox-float-empty">Nessuna opzione attiva</span>';
  }

  const body = els.sandboxFloatBody;
  if (!body) return;

  if (!expanded) {
    body.innerHTML = '';
    return;
  }

  const relicBtns = RELIC_IDS.map((id) => {
    const r = RELICS[id];
    const on = owned.has(id);
    return `<button type="button" class="sandbox-chip${on ? ' is-on' : ''}" data-sandbox-relic="${id}" title="${escapeHtml(r.description)}">${escapeHtml(r.name)}</button>`;
  }).join('');

  const eventBtns = EVENT_IDS.map((id) => {
    const e = EVENTS[id];
    const on = active.has(id);
    return `<button type="button" class="sandbox-chip${on ? ' is-on' : ''}" data-sandbox-event="${id}" title="${escapeHtml(e.description)}">${escapeHtml(e.name)}</button>`;
  }).join('');

  body.innerHTML = `
    <p class="sandbox-hint">Clicca per aggiungere/rimuovere</p>
    <div class="sandbox-section-label">Reliquie</div>
    <div class="sandbox-chips">${relicBtns}</div>
    <div class="sandbox-section-label">Eventi</div>
    <div class="sandbox-chips">${eventBtns}</div>
  `;

  body.querySelectorAll('[data-sandbox-relic]').forEach((btn) => {
    btn.addEventListener('click', () => ui.onSandboxToggleRelic?.(btn.getAttribute('data-sandbox-relic')));
  });
  body.querySelectorAll('[data-sandbox-event]').forEach((btn) => {
    btn.addEventListener('click', () => ui.onSandboxToggleEvent?.(btn.getAttribute('data-sandbox-event')));
  });
}

function rarityLabel(rarity) {
  switch (rarity) {
    case 'common':
      return 'Comune';
    case 'rare':
      return 'Rara';
    case 'epic':
      return 'Epica';
    case 'jolly':
      return 'Jolly';
    default:
      return rarity || '';
  }
}

function timingLabel(timing) {
  switch (timing) {
    case 'action':
      return 'Azione';
    case 'combat':
      return 'Combat';
    case 'instant':
      return 'Instant';
    default:
      return timing || '';
  }
}

function krisikoCardInnerHtml(card) {
  const rarity = card.rarity || 'common';
  const sil = card.territoryId ? territorySilhouetteHtml(card.territoryId) : '';
  return `
    ${sil}
    <div class="card-inner">
      <div class="crarity">${escapeHtml(rarityLabel(rarity))}</div>
      <div class="ctiming">${escapeHtml(timingLabel(card.timing || card.type))}</div>
      <div class="cname">${escapeHtml(card.name)}</div>
      ${card.territoryName ? `<div class="cterr">${escapeHtml(card.territoryName)}</div>` : ''}
      <div class="cdesc">${escapeHtml(card.description || '')}</div>
    </div>
  `;
}

function classicCardInnerHtml(card) {
  const tid = card.id;
  const sil = tid ? territorySilhouetteHtml(tid) : '';
  return `
    ${sil}
    <div class="card-inner">
      <div class="ctype classic-symbol">${card.emoji}</div>
      <div class="cname">${escapeHtml(card.symbolName)}</div>
      <div class="cdesc">${escapeHtml(card.name)}</div>
    </div>
  `;
}

let cardZoomHideTimer = null;

function getCardZoomEls() {
  return {
    root: document.getElementById('card-zoom'),
    face: document.getElementById('card-zoom-face'),
  };
}

function hideCardZoom() {
  const { root } = getCardZoomEls();
  if (!root) return;
  root.classList.remove('is-visible');
  root.classList.add('hidden');
  root.setAttribute('aria-hidden', 'true');
}

/** Chiude zoom carta + highlight rider sulla mappa. */
export function clearCardHover(ui) {
  if (cardZoomHideTimer) {
    clearTimeout(cardZoomHideTimer);
    cardZoomHideTimer = null;
  }
  hideCardZoom();
  if (ui?.hoverRiderTerritoryId) ui.onHoverRider?.(null);
  else ui?.onHoverRider?.(null);
}

function showCardZoom(anchorEl, html, className) {
  const { root, face } = getCardZoomEls();
  if (!root || !face || !anchorEl) return;
  if (cardZoomHideTimer) {
    clearTimeout(cardZoomHideTimer);
    cardZoomHideTimer = null;
  }
  face.className = `card card-zoom-face ${className || ''}`.trim();
  face.innerHTML = html;
  root.classList.remove('hidden');
  root.setAttribute('aria-hidden', 'false');

  const pad = 12;
  const rect = anchorEl.getBoundingClientRect();
  root.style.left = '0px';
  root.style.top = '0px';
  const zw = root.offsetWidth || 240;
  const zh = root.offsetHeight || 320;
  let left = rect.left + rect.width / 2 - zw / 2;
  let top = rect.top - zh - 14;
  if (top < pad) top = rect.bottom + 12;
  left = Math.max(pad, Math.min(left, window.innerWidth - zw - pad));
  top = Math.max(pad, Math.min(top, window.innerHeight - zh - pad));
  root.style.left = `${left}px`;
  root.style.top = `${top}px`;
  requestAnimationFrame(() => root.classList.add('is-visible'));
}

function bindCardZoom(btn, html, className, riderTerritoryId, ui) {
  btn.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'touch') return;
    showCardZoom(btn, html, className);
    ui?.onHoverRider?.(riderTerritoryId || null);
  });
  btn.addEventListener('pointerleave', () => {
    cardZoomHideTimer = setTimeout(() => {
      hideCardZoom();
      ui?.onHoverRider?.(null);
    }, 80);
  });
  btn.addEventListener('pointerdown', () => {
    clearCardHover(ui);
  });
  btn.addEventListener('focus', () => {
    showCardZoom(btn, html, className);
    ui?.onHoverRider?.(riderTerritoryId || null);
  });
  btn.addEventListener('blur', () => {
    cardZoomHideTimer = setTimeout(() => {
      hideCardZoom();
      ui?.onHoverRider?.(null);
    }, 80);
  });
}

function renderSandboxKit(el, state, human, ui) {
  if (!el) return;
  const kit = human.sandboxKit || [];
  if (!state.sandboxMode || !kit.length) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  el.classList.remove('hidden');
  el.innerHTML = '';
  const label = document.createElement('div');
  label.className = 'tray-label';
  label.textContent = 'Kit sandbox (tutte le carte)';
  el.appendChild(label);
  const row = document.createElement('div');
  row.className = 'hand sandbox-kit-row';
  kit.forEach((cardId, index) => {
    const card = getCard(cardId);
    if (!card) return;
    const selected = ui.selectedKitIndex === index;
    const playable = canStartCast(state, human.id, card);
    const rarity = card.rarity || 'common';
    const cls =
      `card rarity-${rarity}` +
      (selected ? ' selected' : '') +
      (playable ? ' playable' : '');
    const html = krisikoCardInnerHtml(card);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = cls;
    btn.innerHTML = html;
    btn.addEventListener('click', () => ui.onKitCardClick?.(index, card));
    bindCardZoom(btn, html, `rarity-${rarity}`, card.territoryId || null, ui);
    row.appendChild(btn);
  });
  el.appendChild(row);
}

function renderHand(el, state, human, ui) {
  el.innerHTML = '';
  if (state.phase === 'setup') {
    el.innerHTML = `<div class="hand-empty">Schieramento: clicca i tuoi territori</div>`;
    return;
  }
  if (!human.hand.length) {
    el.innerHTML = `<div class="hand-empty">${
      state.sandboxMode
        ? 'Mano pesca vuota — usa il kit sopra'
        : state.vanillaMode
          ? 'Nessuna carta territorio'
          : 'Nessuna carta'
    }</div>`;
    return;
  }
  human.hand.forEach((cardId, index) => {
    const classic = state.vanillaMode || isClassicCardId(cardId);
    const card = classic ? getClassicCard(cardId) : getCard(cardId);
    if (!card) return;
    const selected = state.vanillaMode
      ? (ui.classicCardSelection || []).includes(index)
      : ui.selectedCardIndex === index;
    const playable = !classic && canStartCast(state, human.id, card);
    const rarity = classic ? null : card.rarity || 'common';
    const cls =
      'card' +
      (classic ? ' classic' : ` rarity-${rarity}`) +
      (selected ? ' selected' : '') +
      (playable ? ' playable' : '') +
      (!classic && !playable && !state.vanillaMode ? ' dimmed' : '');
    const html = classic ? classicCardInnerHtml(card) : krisikoCardInnerHtml(card);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = cls;
    btn.innerHTML = html;
    btn.addEventListener('click', () => ui.onCardClick?.(index, card));
    const riderId = classic ? card.id : card.territoryId || null;
    bindCardZoom(btn, html, classic ? 'classic' : `rarity-${rarity}`, riderId, ui);
    el.appendChild(btn);
  });
}

function renderLog(el, state) {
  const recent = state.log
    .filter((e) => e.type !== 'cast')
    .slice(-80)
    .reverse();
  el.innerHTML = recent
    .map((e) => `<div class="entry ${e.type || ''}">${escapeHtml(e.message)}</div>`)
    .join('');
}

export function renderActions(el, state, ui) {
  el.innerHTML = '';
  const pid = state.currentPlayerId;
  const me = localPlayer(state, ui);
  if (!me) return;
  const myTurn = pid === me.id;
  if (state.phase === 'game_over') return;

  // Choice / Bastion / cast confirm → choice overlay (not here)

  if (state.pendingChoice && me.id === state.pendingChoice.actorId) {
    return;
  }

  if (state.pendingBastion && me.id === state.pendingBastion.defenderId) {
    return;
  }

  if (state.pendingInvasion) {
    const hint = document.createElement('p');
    hint.className = 'line';
    hint.style.margin = '0';
    hint.textContent = myTurn
      ? 'Scegli quante armate spostare nella zona conquistata.'
      : `${state.players[pid].name} sta spostando le armate…`;
    el.appendChild(hint);
    return;
  }

  if (state.phase === 'setup') {
    const hint = document.createElement('p');
    hint.className = 'line';
    hint.style.margin = '0';
    hint.textContent = myTurn
      ? `Schiera 1 armata (${state.players[pid].setupRemaining} rimaste).`
      : `${state.players[pid].name} sta schierando…`;
    el.appendChild(hint);
    return;
  }

  if (!myTurn) {
    return;
  }

  if (state.pendingRecycle) {
    const hint = document.createElement('p');
    hint.className = 'line';
    hint.style.margin = '0';
    hint.textContent = 'Riciclaggio: clicca una carta da scambiare con il mazzo, o passa.';
    el.appendChild(hint);
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'btn btn-ghost';
    skip.textContent = 'Passa';
    skip.addEventListener('click', () => ui.onSkipRecycle?.());
    el.appendChild(skip);
  }

  if (state.pendingDrawAfterDiscard) {
    const hint = document.createElement('p');
    hint.className = 'line';
    hint.style.margin = '0';
    hint.textContent = 'Mano piena: scarta una carta.';
    el.appendChild(hint);
    return;
  }

  if (state.vanillaMode && state.pendingClassicDraw) {
    const hint = document.createElement('p');
    hint.className = 'line';
    hint.style.margin = '0';
    hint.textContent = 'Mano piena: scambia un set di 3 carte per pescare quella vinta.';
    el.appendChild(hint);
  }

  if (
    state.vanillaMode &&
    state.phase === 'reinforce' &&
    (ui.classicCardSelection?.length === 3)
  ) {
    const valid = isValidClassicSet(
      state.players[pid].hand,
      ui.classicCardSelection,
    );
    const trade = document.createElement('button');
    trade.type = 'button';
    trade.className = 'btn';
    trade.disabled = !valid;
    trade.textContent = valid ? 'Scambia set' : 'Set non valido';
    trade.addEventListener('click', () => ui.onTradeClassic?.());
    el.appendChild(trade);
  }

  const end = document.createElement('button');
  end.type = 'button';
  end.className = 'btn';
  end.textContent =
    state.phase === 'reinforce'
      ? state.reinforcementsRemaining > 0
        ? `Piazza ancora ${state.reinforcementsRemaining}`
        : 'Fine rinforzi'
      : state.phase === 'attack'
        ? 'Fine attacchi'
        : 'Fine turno';
  end.disabled =
    (state.phase === 'reinforce' && state.reinforcementsRemaining > 0) || !canEndPhaseNow(state);
  end.addEventListener('click', () => ui.onEndPhase?.());
  el.appendChild(end);
}
