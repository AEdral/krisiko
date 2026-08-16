import {
  RELICS,
  EVENTS,
  CARDS,
  MISSIONS,
  handLimit,
  getContinentBonus,
  getContinentStatus,
  getAlivePlayerIds,
} from '../engine/game.js';

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

function opponentsHtml(state, ui) {
  const human = Object.values(state.players).find((p) => p.isHuman);
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
            <div class="name">Reliquia: ${escapeHtml(relic.name)}</div>
          </div>
          <div class="opp-expand-hint">Clic per dettagli ▾</div>
        </div>
        <div class="opp-details">
          <div class="opp-details-inner">
            <div class="relic-mini">
              <div class="desc">${escapeHtml(relic.description)}</div>
            </div>
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

export function renderHud(els, state, ui) {
  const pid = state.currentPlayerId;
  const player = state.players[pid];
  const human = Object.values(state.players).find((p) => p.isHuman);
  const mission = missionText(state, human);
  const relic = RELICS[human.relicId];

  const setupHint =
    state.phase === 'setup'
      ? `<span class="pill turn">Schieramento: ${state.players[pid].setupRemaining} rimaste</span>`
      : '';

  els.topMeta.innerHTML = `
    <span class="pill">${state.phase === 'setup' ? 'Setup' : `Round ${state.round}`}</span>
    <span class="pill ${player.isHuman ? 'turn' : ''}" style="box-shadow:inset 0 0 0 1px ${player.color}">Turno: ${escapeHtml(player.name)}</span>
    <span class="pill">Fase: ${phaseLabel(state.phase)}</span>
    ${state.phase === 'reinforce' && player.isHuman ? `<span class="pill turn">Rinforzi: ${state.reinforcementsRemaining}</span>` : ''}
    ${setupHint}
  `;

  els.opponentPanel.innerHTML = opponentsHtml(state, ui);
  els.opponentPanel.classList.toggle('is-open', !!ui.expandedOpponentId);
  els.opponentPanel.title = '';

  const ev = state.activeEventId ? EVENTS[state.activeEventId] : null;
  els.eventBlock.innerHTML = `
    <h2>Evento globale</h2>
    ${
      ev
        ? `<p class="line"><strong>${escapeHtml(ev.name)}</strong></p>
           <p class="line" style="color:var(--muted);font-size:0.75rem">${escapeHtml(ev.description)}</p>`
        : `<p class="line" style="color:var(--muted)">Nessuno (dal round 2)</p>`
    }
  `;

  els.playerRelic.innerHTML = `
    <div class="tray-label">Reliquia</div>
    <div class="rname">${escapeHtml(relic.name)}</div>
    <div class="rdesc">${escapeHtml(relic.description)}</div>
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
      <div class="dm"><span class="k">Carte</span><span class="v">${human.hand.length}/${handLimit(state, human.id)}</span></div>
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
  renderLog(els.log, state);
}

function renderHand(el, state, human, ui) {
  el.innerHTML = '';
  if (state.phase === 'setup') {
    el.innerHTML = `<div class="hand-empty">Schieramento: clicca i tuoi territori</div>`;
    return;
  }
  if (!human.hand.length) {
    el.innerHTML = `<div class="hand-empty">Nessuna carta</div>`;
    return;
  }
  human.hand.forEach((cardId, index) => {
    const card = CARDS[cardId];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'card' + (ui.selectedCardIndex === index ? ' selected' : '');
    btn.innerHTML = `
      <div class="ctype">${card.type}</div>
      <div class="cname">${escapeHtml(card.name)}</div>
      <div class="cdesc">${escapeHtml(card.description)}</div>
    `;
    btn.addEventListener('click', () => ui.onCardClick?.(index, card));
    el.appendChild(btn);
  });
}

function renderLog(el, state) {
  const recent = state.log.slice(-40).reverse();
  el.innerHTML = recent
    .map((e) => `<div class="entry ${e.type || ''}">${escapeHtml(e.message)}</div>`)
    .join('');
}

export function renderActions(el, state, ui) {
  el.innerHTML = '';
  const pid = state.currentPlayerId;
  if (state.phase === 'game_over') return;

  if (state.pendingInvasion) {
    const hint = document.createElement('p');
    hint.className = 'line';
    hint.style.margin = '0';
    hint.textContent = 'Scegli quante armate spostare nella zona conquistata.';
    el.appendChild(hint);
    return;
  }

  if (state.phase === 'setup') {
    const hint = document.createElement('p');
    hint.className = 'line';
    hint.style.margin = '0';
    hint.textContent = state.players[pid].isHuman
      ? `Schiera 1 armata (${state.players[pid].setupRemaining} rimaste).`
      : `${state.players[pid].name} sta schierando…`;
    el.appendChild(hint);
    return;
  }

  if (!state.players[pid]?.isHuman) return;

  if (state.pendingDrawAfterDiscard) {
    const hint = document.createElement('p');
    hint.className = 'line';
    hint.style.margin = '0';
    hint.textContent = 'Mano piena: scarta una carta.';
    el.appendChild(hint);
    return;
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
  end.disabled = state.phase === 'reinforce' && state.reinforcementsRemaining > 0;
  end.addEventListener('click', () => ui.onEndPhase?.());
  el.appendChild(end);

  if (state.phase === 'attack' && ui.selectedCardIndex != null) {
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'btn btn-ghost';
    clear.textContent = 'Annulla carta combat';
    clear.addEventListener('click', () => ui.onClearCombatCard?.());
    el.appendChild(clear);
  }
}
