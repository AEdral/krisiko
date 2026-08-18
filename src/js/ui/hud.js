import {
  RELICS,
  EVENTS,
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
} from '../engine/game.js';
import { isValidClassicSet, CLASSIC_HAND_LIMIT } from '../data/classic-cards.js';

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
      const open = ui.expandedOpponentId === id;
      const dead = !alive.has(id);
      return `<article class="opp-card${open ? ' is-open' : ''}${dead ? ' is-out' : ''}" data-opp-id="${id}" style="--opp:${ai.color}">
        <div class="opp-summary">
          <div class="who">
            <strong style="color:${ai.color}">${escapeHtml(ai.name)}${dead ? ' · fuori' : ''}</strong>
            <span class="pill" style="box-shadow:inset 0 0 0 1px ${ai.color}">${countOwned(state, id)} / 42</span>
          </div>
          <div class="stat-row">
            <div class="stat-chip"><span class="k">Armate</span><span class="v">${countArmies(state, id)}</span></div>
            <div class="stat-chip"><span class="k">Bonus</span><span class="v">+${getContinentBonus(state, id)}</span></div>
          </div>
          <div class="relic-mini">
            <div class="name">${state.vanillaMode ? 'Modalità classico' : `Reliquia: ${escapeHtml(relic?.name || '—')}`}</div>
          </div>
          <div class="opp-expand-hint">Clic per dettagli ▾</div>
        </div>
        <div class="opp-details">
          <div class="opp-details-inner">
            ${
              state.vanillaMode
                ? `<div class="relic-mini"><div class="desc">Carte territorio tradizionali, niente reliquie Krisiko.</div></div>`
                : `<div class="relic-mini">
              <div class="desc">${escapeHtml(relic?.description || '')}</div>
            </div>`
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

  const ev = state.activeEventId ? EVENTS[state.activeEventId] : null;
  els.eventBlock.innerHTML = `
    <h2>Evento globale</h2>
    ${
      state.vanillaMode
        ? `<p class="line" style="color:var(--muted)">Non disponibile in modalità classico</p>`
        : ev
        ? `<p class="line"><strong>${escapeHtml(ev.name)}</strong></p>
           <p class="line" style="color:var(--muted);font-size:0.75rem">${escapeHtml(ev.description)}</p>`
        : `<p class="line" style="color:var(--muted)">Nessuno (dal round 2)</p>`
    }
  `;

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
  renderHandCastBar(els.handCastBar, state, human, ui);
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
      ? `<div class="stack-combat-hint stack-combat-active">Carte Combat/Instant verdi in mano · dadi al centro</div>`
      : '';

  const passBtn =
    state.responseWindow &&
    !state.pendingCast &&
    me &&
    !(state.responseWindow.passedPlayerIds || []).includes(me.id)
      ? `<button type="button" class="btn btn-ghost stack-pass-btn" data-pass-stack>OK per me</button>`
      : '';

  el.innerHTML = `
    <h2>Stack</h2>
    ${
      state.responseWindow
        ? `<div class="stack-timer${paused ? ' is-paused' : ''}">${paused ? '⏸' : '⏱'} ${sec}s</div>`
        : `<div class="stack-timer">—</div>`
    }
    ${banner}
    <div class="stack-entries">${entries}</div>
    ${combatStackHint}
    ${passBtn}
  `;

  el.querySelector('[data-pass-stack]')?.addEventListener('click', () => ui.onPassStack?.());
}

function renderHandCastBar(el, state, human, ui) {
  if (!el) return;
  const pc = state.pendingCast;
  if (!pc || pc.playerId !== human.id || pc.hidden) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  const card = getCard(pc.cardId);
  el.classList.remove('hidden');
  const needDie = pc.needsDiePick && pc.targets?.dieIndex == null;
  const dieHint = needDie ? ' — seleziona un dado al centro' : '';
  el.innerHTML = `
    <div class="hand-cast-text">Confermi <strong>${escapeHtml(card?.name || 'carta')}</strong>?${dieHint}</div>
    <div class="hand-cast-actions">
      <button type="button" class="btn" data-cast-confirm ${needDie ? 'disabled' : ''}>Conferma lancio</button>
      <button type="button" class="btn btn-ghost" data-cast-cancel>Annulla</button>
    </div>
  `;
  el.querySelector('[data-cast-confirm]')?.addEventListener('click', () => {
    if (!needDie) ui.onCastConfirm?.();
  });
  el.querySelector('[data-cast-cancel]')?.addEventListener('click', () => ui.onCastCancel?.());
}

function renderHand(el, state, human, ui) {
  el.innerHTML = '';
  if (state.phase === 'setup') {
    el.innerHTML = `<div class="hand-empty">Schieramento: clicca i tuoi territori</div>`;
    return;
  }
  if (!human.hand.length) {
    el.innerHTML = `<div class="hand-empty">${state.vanillaMode ? 'Nessuna carta territorio' : 'Nessuna carta'}</div>`;
    return;
  }
  human.hand.forEach((cardId, index) => {
    const classic = state.vanillaMode || isClassicCardId(cardId);
    const card = classic ? getClassicCard(cardId) : getCard(cardId);
    if (!card) return;
    const selected = state.vanillaMode
      ? (ui.classicCardSelection || []).includes(index)
      : ui.selectedCardIndex === index;
    const inWindow = !classic && !!state.responseWindow && !state.pendingCast;
    const playable = !classic && canStartCast(state, human.id, card);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'card' +
      (classic ? ' classic' : '') +
      (selected ? ' selected' : '') +
      (playable ? ' playable' : '');
    if (classic) {
      btn.innerHTML = `
        <div class="ctype classic-symbol">${card.emoji}</div>
        <div class="cname">${escapeHtml(card.symbolName)}</div>
        <div class="cdesc">${escapeHtml(card.name)}</div>
      `;
    } else {
      btn.innerHTML = `
        <div class="ctype">${escapeHtml(card.timing || card.type || '')}${card.rarity ? ` · ${card.rarity}` : ''}</div>
        <div class="cname">${escapeHtml(card.name)}</div>
        ${card.territoryName ? `<div class="cterr">${escapeHtml(card.territoryName)}</div>` : ''}
        <div class="cdesc">${escapeHtml(card.description)}</div>
      `;
    }
    btn.addEventListener('click', () => ui.onCardClick?.(index, card));
    el.appendChild(btn);
  });
}

function renderLog(el, state) {
  const recent = state.log
    .filter((e) => e.type !== 'cast')
    .slice(-40)
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

  if (state.pendingChoice && me.id === state.pendingChoice.actorId) {
    renderChoicePicker(el, state, ui);
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

  if (state.pendingBastion && me.id === state.pendingBastion.defenderId) {
    const hint = document.createElement('p');
    hint.className = 'line';
    hint.style.margin = '0';
    hint.textContent = 'Sei sotto attacco! Usare Bastione (+1 al dado di difesa più alto)?';
    el.appendChild(hint);
    const yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'btn';
    yes.textContent = 'Sì, Bastione';
    yes.addEventListener('click', () => ui.onBastionChoice?.(true));
    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'btn btn-ghost';
    no.textContent = 'No';
    no.addEventListener('click', () => ui.onBastionChoice?.(false));
    el.appendChild(yes);
    el.appendChild(no);
    return;
  }

  if (!myTurn) {
    if (!state.vanillaMode && state.responseWindow && !state.pendingCast) {
      const passed = state.responseWindow.passedPlayerIds || [];
      if (!passed.includes(me.id)) {
        const ok = document.createElement('button');
        ok.type = 'button';
        ok.className = 'btn btn-ghost';
        ok.textContent = 'OK per me';
        ok.addEventListener('click', () => ui.onPassStack?.());
        el.appendChild(ok);
      }
      const hint = document.createElement('p');
      hint.className = 'line';
      hint.style.margin = '0';
      hint.textContent = 'Finestra stack: clicca una carta Instant/Combat in mano per rispondere.';
      el.appendChild(hint);
    }
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

  if (
    !state.vanillaMode &&
    state.responseWindow &&
    !state.pendingCast &&
    !(state.responseWindow.passedPlayerIds || []).includes(me.id)
  ) {
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'btn btn-ghost';
    ok.textContent = 'OK per me';
    ok.addEventListener('click', () => ui.onPassStack?.());
    el.appendChild(ok);
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

function renderChoicePicker(el, state, ui) {
  const pc = state.pendingChoice;
  if (!pc) return;

  const hint = document.createElement('p');
  hint.className = 'line choice-prompt';
  hint.style.margin = '0';
  hint.textContent = pc.prompt;
  el.appendChild(hint);

  if (pc.kind === 'scry') {
    if (pc.items?.length) {
      const item = pc.items[0];
      const preview = document.createElement('div');
      preview.className = 'choice-card-preview';
      preview.innerHTML = `<strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.description)}</span>`;
      el.appendChild(preview);
    }
    const row = document.createElement('div');
    row.className = 'choice-actions';
    const drawBtn = document.createElement('button');
    drawBtn.type = 'button';
    drawBtn.className = 'btn';
    drawBtn.textContent = 'Pesca';
    drawBtn.addEventListener('click', () => ui.onResolveChoice?.({ scryAction: 'draw' }));
    const bottomBtn = document.createElement('button');
    bottomBtn.type = 'button';
    bottomBtn.className = 'btn btn-ghost';
    bottomBtn.textContent = 'Metti in fondo';
    bottomBtn.addEventListener('click', () => ui.onResolveChoice?.({ scryAction: 'bottom' }));
    row.appendChild(drawBtn);
    row.appendChild(bottomBtn);
    el.appendChild(row);
  }

  if (pc.step === 'confirm' && (pc.kind === 'turncoat' || pc.kind === 'double_mandate')) {
    for (const item of pc.items) {
      const box = document.createElement('div');
      box.className = 'choice-mission-preview';
      box.innerHTML = `<strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.description)}</span>`;
      el.appendChild(box);
    }
    const row = document.createElement('div');
    row.className = 'choice-actions';
    const yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'btn';
    yes.textContent = pc.kind === 'turncoat' ? 'Scambia' : 'Sostituisci';
    yes.addEventListener('click', () => ui.onResolveChoice?.({ confirm: true }));
    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'btn btn-ghost';
    no.textContent = pc.kind === 'turncoat' ? 'Passa' : 'Rifiuta';
    no.addEventListener('click', () => ui.onResolveChoice?.({ confirm: false }));
    row.appendChild(yes);
    row.appendChild(no);
    el.appendChild(row);
    return;
  }

  const list = document.createElement('div');
  list.className = 'choice-list';

  for (const item of pc.items) {
    if (item.type === 'mission') continue;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-ghost choice-item-btn';
    const selected = pc.kind === 'surveil' && pc.maxPick > 1 && pc.picked?.includes(item.id);

    if (item.type === 'player') {
      const extra = item.handCount != null ? ` (${item.handCount} carte)` : '';
      btn.innerHTML = `<strong>${escapeHtml(item.name)}</strong>${extra ? `<span>${escapeHtml(extra)}</span>` : ''}`;
      btn.addEventListener('click', () => ui.onResolveChoice?.({ targetPlayerId: item.id }));
    } else if (item.type === 'relic') {
      btn.innerHTML = `<strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.description)}</span>`;
      btn.addEventListener('click', () => ui.onResolveChoice?.({ relicId: item.id }));
    } else if (item.type === 'card') {
      const meta = [item.timing, item.rarity].filter(Boolean).join(' · ');
      btn.innerHTML = `<strong>${escapeHtml(item.name)}</strong>${meta ? `<em>${escapeHtml(meta)}</em>` : ''}<span>${escapeHtml(item.description)}</span>`;
      if (selected) btn.classList.add('is-selected');
      btn.addEventListener('click', () => ui.onResolveChoice?.({ cardId: item.id }));
    }

    list.appendChild(btn);
  }

  if (list.childNodes.length) el.appendChild(list);

  if (pc.kind === 'surveil' && pc.maxPick > 1) {
    const picked = pc.picked?.length || 0;
    const sub = document.createElement('p');
    sub.className = 'line';
    sub.style.margin = '0.35rem 0 0';
    sub.textContent = `Selezionate ${picked}/${pc.maxPick} — clicca Conferma quando pronto.`;
    el.appendChild(sub);
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'btn';
    ok.disabled = picked === 0;
    ok.textContent = 'Conferma';
    ok.addEventListener('click', () => ui.onResolveChoice?.({ confirm: true }));
    el.appendChild(ok);
  }
}
