const _yamlParam = new URLSearchParams(location.search).get('yaml');
const dataUrl = (_yamlParam && /^[\w\-. ]+\.ya?ml$/i.test(_yamlParam))
  ? _yamlParam
  : 'test conference.yaml';
const cardContainer = document.getElementById('card-container');
const hintPanel = document.getElementById('hint-panel');
const screenTitle = document.getElementById('screen-title');
const discoverTab = document.getElementById('tab-discover');
const interestingTab = document.getElementById('tab-interesting');
const verzichtbarTab = document.getElementById('tab-verzichtbar');
const tabsNav = document.querySelector('.tabs');
const clearSelection = document.getElementById('clear-selection');
const settingsBtn = document.getElementById('settings-btn');
const settingsMenu = document.getElementById('settings-menu');
const cardModal = document.getElementById('card-modal');

let events = [];
let deckEvents = [];
let festivalTitle = 'test conference';
let selectedEvents = new Map();
let viewMode = 'discover';
let isAnimating = false;
let hintTimeoutId = null;
let currentModalEvent = null;
let modalJustClosed = false;

function parseYaml(raw) {
  const parsed = jsyaml.load(raw);
  festivalTitle = parsed.Veranstaltung?.name || parsed.Veranstaltung?.titel || festivalTitle;
  const all = [];

  (parsed.programm || []).forEach(item => {
    const rawDatetime = item.zeitpunkt instanceof Date ? item.zeitpunkt : new Date(item.zeitpunkt);
    if (!item.zeitpunkt || isNaN(rawDatetime.getTime())) return;
    const allDay = rawDatetime.getUTCHours() === 0 && rawDatetime.getUTCMinutes() === 0 &&
      rawDatetime.getUTCSeconds() === 0 && rawDatetime.getUTCMilliseconds() === 0;
    const datetime = rawDatetime;

    const date = new Date(datetime.getFullYear(), datetime.getMonth(), datetime.getDate());
    const uhrzeit = allDay ? '' : datetime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const wochentag = datetime.toLocaleDateString('de-DE', { weekday: 'long' });
    const descriptionFromCategories = item.kategorien ? item.kategorien.join(' · ') : '';
    const beschreibung = item.beschreibung || descriptionFromCategories || item.ort || '';
    const duration = item.dauer || null;
    let endTime = null;
    let durationMinutes = null;
    if (duration) {
      const minutes = parseInt(duration.toString().match(/(\d+)/)?.[1], 10);
      if (!Number.isNaN(minutes)) {
        durationMinutes = minutes;
        const end = new Date(datetime.getTime() + minutes * 60 * 1000);
        endTime = end.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      }
    }

    all.push({
      datetime,
      date,
      uhrzeit,
      wochentag,
      allDay,
      titel: item.titel || item.name || '',
      sprecher: Array.isArray(item.sprecher) ? item.sprecher.filter(Boolean) : [],
      ort: item.ort || '',
      kategorien: item.kategorien || [],
      beschreibung,
      dauer: allDay ? null : duration,
      durationMinutes: allDay ? null : durationMinutes,
      endTime: allDay ? null : endTime,
      id: `${item.zeitpunkt}-${item.titel}`.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '')
    });
  });

  all.sort((a, b) => a.datetime - b.datetime);
  return all;
}

function formatTimeLabel(event) {
  if (event.allDay) return `${event.wochentag} · ganztägig`;
  return `${event.wochentag} · ${event.uhrzeit}`;
}

const _debugParam = new URLSearchParams(location.search).get('debug');
const _now = () => {
  if (_debugParam === null) return new Date();
  const t = new Date(_debugParam);
  return isNaN(t.getTime()) ? new Date(0) : t;
};

function isCurrentOrFuture(event) {
  if (event.allDay) return true;
  if (_debugParam !== null && isNaN(new Date(_debugParam).getTime())) return true;
  const durationMs = (event.durationMinutes ?? 60) * 60 * 1000;
  const end = new Date(event.datetime.getTime() + durationMs);
  return end >= _now();
}

function setHeaderTitle() {
  screenTitle.textContent = festivalTitle || 'perspectives';
}

function showHintPanel() {
  if (!hintPanel) return;
  hintPanel.classList.remove('hidden');
  window.clearTimeout(hintTimeoutId);
  hintTimeoutId = window.setTimeout(() => {
    hintPanel.classList.add('hidden');
  }, 2500);
}

function showCardModal(event, cardEl) {
  if (!cardModal) return;
  currentModalEvent = event;

  if (cardEl) {
    const rect = cardEl.getBoundingClientRect();
    cardModal.style.transformOrigin =
      `${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px`;
  }

  const timeLabel = formatTimeLabel(event);
  const durationSuffix = event.endTime ? ` – ${event.endTime}` : (event.dauer ? ` · ${event.dauer}` : '');
  const selection = selectedEvents.get(event.id);
  const star = selection?.level === 'Highlight' ? '<span class="event-star">★</span>' : '';

  cardModal.innerHTML = `
    <div class="swipe-label"></div>
    <div class="event-top">
      <div class="event-time">${timeLabel}${durationSuffix}</div>
      <span class="event-ort">${event.ort}</span>
    </div>
    <h2 class="event-title">${event.titel}</h2>
    ${star}
    <p class="card-modal-description">${event.beschreibung || ''}</p>
  `;

  cardModal.classList.add('active');
}

function closeCardModal() {
  if (!cardModal) return;
  cardModal.classList.remove('active');
  modalJustClosed = true;
  setTimeout(() => { modalJustClosed = false; }, 400);
}

function expandCard(card) {
  const rect = card.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  const sx = rect.width / vw, sy = rect.height / vh;
  const tx = rect.left + rect.width / 2 - vw / 2;
  const ty = rect.top  + rect.height / 2 - vh / 2;

  card.dataset.expanded      = '1';
  card.dataset.origTransform = card.style.transform;
  card.dataset.origLeft      = rect.left;
  card.dataset.origTop       = rect.top;
  card.dataset.origWidth     = rect.width;
  card.dataset.origHeight    = rect.height;

  // Jump to full-screen immediately, but use transform to make it look like the card
  card.style.position     = 'fixed';
  card.style.inset        = '0';
  card.style.width        = '100vw';
  card.style.height       = '100vh';
  card.style.transform    = `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`;
  card.style.borderRadius = '1.5rem';
  card.style.margin       = '0';
  card.style.transition   = 'none';

  card.getBoundingClientRect(); // force reflow

  card.classList.add('card-expanded');
  card.style.transition  = 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1), border-radius 0.3s ease-out';
  card.style.transform   = 'none';
  card.style.borderRadius = '0';

  setTimeout(() => {
    card.style.transition = '';
  }, 360);
}

function collapseCard(card) {
  const origTransform = card.dataset.origTransform || '';
  const vw = window.innerWidth, vh = window.innerHeight;
  const sx = parseFloat(card.dataset.origWidth)  / vw;
  const sy = parseFloat(card.dataset.origHeight) / vh;
  const tx = parseFloat(card.dataset.origLeft) + parseFloat(card.dataset.origWidth)  / 2 - vw / 2;
  const ty = parseFloat(card.dataset.origTop)  + parseFloat(card.dataset.origHeight) / 2 - vh / 2;

  card.classList.remove('card-expanded');

  card.style.transition   = 'transform 0.3s ease-in, border-radius 0.3s ease-in';
  card.style.transform    = `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`;
  card.style.borderRadius = '1.5rem';

  setTimeout(() => {
    // Snap to final CSS state without animation
    card.style.transition   = 'none';
    card.style.transform    = origTransform;
    card.style.position     = '';
    card.style.inset        = '';
    card.style.width        = '';
    card.style.height       = '';
    card.style.margin       = '';
    card.style.borderRadius = '';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      card.style.transition = '';
      delete card.dataset.expanded;
      delete card.dataset.origTransform;
      delete card.dataset.origTop;
      delete card.dataset.origLeft;
      delete card.dataset.origWidth;
      delete card.dataset.origHeight;
    }));
  }, 310);
}

function buildCards() {
  cardContainer.innerHTML = '';
  cardContainer.classList.toggle('list-mode', viewMode !== 'discover');

  if (viewMode === 'discover') {
    buildDeck();
  } else if (viewMode === 'verzichtbar') {
    buildVerzichtbarList();
  } else {
    buildSelectionList();
  }

  setHeaderTitle();
  if (clearSelection) clearSelection.disabled = selectedEvents.size === 0;
}

function buildDeck() {
  const activeEvents = deckEvents.filter(isCurrentOrFuture);
  if (activeEvents.length === 0) {
    cardContainer.innerHTML = '<div class="loading">Keine weiteren Veranstaltungen.</div>';
    return;
  }

  const visibleCards = activeEvents.slice(0, 2);
  visibleCards.forEach((event, index) => {
    const card = createCard(event, visibleCards, index, true);
    cardContainer.appendChild(card);
  });
}

function createBreakRow(gapMinutes) {
  const el = document.createElement('div');
  el.className = 'break-row';
  const h = Math.floor(gapMinutes / 60);
  const m = gapMinutes % 60;
  const label = h > 0 ? (m > 0 ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
  el.innerHTML = `<span>${label} Pause</span><span>🛋️</span>`;
  return el;
}

function floorToDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function eventsOverlap(a, b) {
  const aEnd = a.datetime.getTime() + (a.durationMinutes ?? 60) * 60000;
  const bEnd = b.datetime.getTime() + (b.durationMinutes ?? 60) * 60000;
  return a.datetime.getTime() < bEnd && b.datetime.getTime() < aEnd;
}

function computeConflicts(selections) {
  const status = new Map();
  selections.forEach(s => status.set(s.event.id, 'normal'));

  for (let i = 0; i < selections.length; i++) {
    if (selections[i].event.allDay) continue;
    for (let j = i + 1; j < selections.length; j++) {
      if (selections[j].event.allDay) continue;
      const a = selections[i], b = selections[j];
      if (!eventsOverlap(a.event, b.event)) continue;

      if (a.level === b.level) {
        if (status.get(b.event.id) === 'normal') status.set(b.event.id, 'conflict');
      } else {
        const loserId = a.level === 'Interessant' ? a.event.id : b.event.id;
        if (status.get(loserId) === 'normal') status.set(loserId, 'yielding');
      }
    }
  }
  return status;
}

function buildSelectionList() {
  const filteredSelections = Array.from(selectedEvents.values())
    .filter(sel => sel.level === 'Interessant' || sel.level === 'Highlight');

  if (filteredSelections.length === 0) {
    cardContainer.innerHTML = '<div class="loading">Noch keine markierten Veranstaltungen.</div>';
    return;
  }

  filteredSelections.sort((a, b) => {
    const aDayStart = floorToDay(a.event.datetime);
    const bDayStart = floorToDay(b.event.datetime);
    if (aDayStart !== bDayStart) return aDayStart - bDayStart;
    if (a.event.allDay && !b.event.allDay) return -1;
    if (!a.event.allDay && b.event.allDay) return 1;
    const dt = a.event.datetime - b.event.datetime;
    if (dt !== 0) return dt;
    if (a.level === 'Highlight' && b.level !== 'Highlight') return -1;
    if (b.level === 'Highlight' && a.level !== 'Highlight') return 1;
    return 0;
  });

  const conflicts = computeConflicts(filteredSelections);

  for (let i = 0; i < filteredSelections.length; i++) {
    const selection = filteredSelections[i];

    if (i > 0) {
      const prev = filteredSelections[i - 1];
      if (!prev.event.allDay && !selection.event.allDay &&
          floorToDay(prev.event.datetime) === floorToDay(selection.event.datetime)) {
        const prevEnd = prev.event.datetime.getTime() + (prev.event.durationMinutes ?? 60) * 60000;
        const gapMin = Math.round((selection.event.datetime.getTime() - prevEnd) / 60000);
        if (gapMin > 0) cardContainer.appendChild(createBreakRow(gapMin));
      }
    }

    const card = createCard(selection.event, [], 0, false);
    card.classList.add('stack-list');
    const status = conflicts.get(selection.event.id);
    if (status === 'conflict') {
      card.classList.add('card-conflict');
      const timeEl = card.querySelector('.event-time');
      if (timeEl) timeEl.insertAdjacentHTML('afterbegin', '<span class="conflict-icon">⚡</span>');
    }
    if (status === 'yielding') card.classList.add('card-yielding');
    cardContainer.appendChild(card);
  }
}

function buildVerzichtbarList() {
  const filteredSelections = Array.from(selectedEvents.values())
    .filter(sel => sel.level === 'Verzichtbar');

  if (filteredSelections.length === 0) {
    cardContainer.innerHTML = '<div class="loading">Keine verzichtbaren Veranstaltungen.</div>';
    return;
  }

  filteredSelections.sort((a, b) => {
    const aDayStart = floorToDay(a.event.datetime);
    const bDayStart = floorToDay(b.event.datetime);
    if (aDayStart !== bDayStart) return aDayStart - bDayStart;
    if (a.event.allDay && !b.event.allDay) return -1;
    if (!a.event.allDay && b.event.allDay) return 1;
    return a.event.datetime - b.event.datetime;
  });

  // No break rows, no conflict highlighting — plain list in standard color.
  for (const selection of filteredSelections) {
    const card = createCard(selection.event, [], 0, false);
    card.classList.add('stack-list');
    cardContainer.appendChild(card);
  }
}

function createCard(event, visibleList, stackIndex, isDeck) {
  const card = document.createElement('article');
  card.className = 'event-card';
  if (isDeck) card.classList.add('deck-card');
  card.dataset.id = event.id;

  const timeLabel = formatTimeLabel(event);
  const durationSuffix = event.endTime ? ` – ${event.endTime}` : (event.dauer ? ` · ${event.dauer}` : '');
  const description = event.beschreibung || event.ort;
  const selection = selectedEvents.get(event.id);
  const isHighlight = selection?.level === 'Highlight';
  const star = isHighlight ? '<span class="event-star">★</span>' : '';

  card.innerHTML = `
    <div class="event-top">
      <div class="event-time">${timeLabel}${durationSuffix}</div>
      <span class="event-ort">${event.ort}</span>
      ${star}
    </div>
    <h2 class="event-title">${event.titel}</h2>
    ${event.sprecher.length ? `<p class="event-sprecher">${event.sprecher.join(' · ')}</p>` : ''}
    <p class="event-description">${description}</p>
  `;

  const swipeLabel = document.createElement('div');
  swipeLabel.className = 'swipe-label';
  card.appendChild(swipeLabel);

  if (isDeck) {
    if (selection) card.classList.add('selected');
    if (isHighlight) card.classList.add('superliked');
  }

  if (isDeck) {
    if (stackIndex > 0) card.style.transform = `scale(${1 - stackIndex * 0.07})`;
    card.style.zIndex = `${100 - stackIndex}`;
  } else {
    card.style.position = 'relative';
    card.classList.add('list-collapsed');
  }

  if (isDeck) {
    attachSwipeHandlers(card, event);
  } else {
    // In the "Verzichtbar" list a swipe to the right re-marks the event as
    // "Interessant"; in the "Interessant" list a swipe to the left marks it
    // "Verzichtbar". swipeDir is +1 for right, -1 for left.
    const isVerzichtbarList = viewMode === 'verzichtbar';
    const swipeDir = isVerzichtbarList ? 1 : -1;
    const swipeAction = isVerzichtbarList ? 'Interessant' : 'Verzichtbar';
    const swipeLabelClass = isVerzichtbarList ? 'interessant' : 'verzichtbar';
    const swipeLabelText = isVerzichtbarList ? '♥ Interessant' : 'Verzichtbar';

    let longPressTimer = null;
    let longPressed = false;
    let swiping = false;
    let modeSet = false;
    let startX = 0, startY = 0, hThresh = 0;

    card.addEventListener('pointerdown', e => {
      startX = e.clientX;
      startY = e.clientY;
      hThresh = card.getBoundingClientRect().width / 3;
      longPressed = false;
      swiping = false;
      modeSet = false;
      longPressTimer = setTimeout(() => {
        // Long-press toggles Highlight only in the "Interessant" list.
        if (isVerzichtbarList) return;
        longPressed = true;
        const current = selectedEvents.get(event.id);
        if (!current) return;
        markSelection(event, current.level === 'Highlight' ? 'Interessant' : 'Highlight');
        buildCards();
      }, 500);
    });

    card.addEventListener('pointermove', e => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!modeSet && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        modeSet = true;
        clearTimeout(longPressTimer);
        longPressTimer = null;
        if (Math.abs(dx) > Math.abs(dy)) {
          swiping = true;
          card.setPointerCapture(e.pointerId);
        }
      }
      if (!swiping) return;
      const swipeLabel = card.querySelector('.swipe-label');
      if (dx * swipeDir > 0) {
        card.style.transition = 'none';
        card.style.transform = `translateX(${dx}px)`;
        card.style.opacity = String(Math.max(0, 1 - Math.abs(dx) / (hThresh * 3)));
        if (swipeLabel) {
          swipeLabel.className = `swipe-label ${swipeLabelClass}`;
          swipeLabel.textContent = swipeLabelText;
          swipeLabel.style.opacity = String(Math.min(1, Math.abs(dx) / hThresh));
        }
      } else {
        card.style.transform = '';
        card.style.opacity = '';
        if (swipeLabel) swipeLabel.style.opacity = '0';
      }
    });

    card.addEventListener('pointerup', e => {
      clearTimeout(longPressTimer);
      longPressTimer = null;
      if (!swiping) return;
      swiping = false;
      const dx = e.clientX - startX;
      if (dx * swipeDir > hThresh) {
        card.style.transition = 'transform 0.3s ease-in, opacity 0.3s ease-out';
        card.style.transform = `translateX(${swipeDir * 150}vw)`;
        card.style.opacity = '0';
        setTimeout(() => { markSelection(event, swipeAction); buildCards(); }, 300);
      } else {
        const swipeLabel = card.querySelector('.swipe-label');
        if (swipeLabel) swipeLabel.style.opacity = '0';
        card.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
        card.style.transform = '';
        card.style.opacity = '';
        setTimeout(() => { card.style.transition = ''; }, 300);
      }
    });

    card.addEventListener('pointercancel', () => {
      clearTimeout(longPressTimer);
      longPressTimer = null;
      if (!swiping) return;
      swiping = false;
      card.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
      card.style.transform = '';
      card.style.opacity = '';
      setTimeout(() => { card.style.transition = ''; }, 300);
    });

    card.addEventListener('click', () => {
      if (longPressed) return;
      card.classList.toggle('list-collapsed');
    });
  }
  return card;
}

function attachSwipeHandlers(card, event) {
  const isDeck = true;
  let startX = 0;
  let startY = 0;
  let startTransform = '';
  let hThresh = 0;
  let vThresh = 0;
  let dragging = false;
  let tapTimer = null;
  let tapCount = 0;

  const swipeLabel = card.querySelector('.swipe-label');

  function updateDragVisuals(deltaX, deltaY) {
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    let direction = null;
    let progress = 0;

    if (absX > absY && absX > 10) {
      direction = deltaX > 0 ? 'right' : 'left';
      progress = Math.min(1, absX / hThresh);
      card.style.transform = `translateX(${deltaX}px)`;
    } else if (absY > absX && absY > 10) {
      if (!verticalModeSet) {
        verticalModeSet = true;
        const desc = card.querySelector('.event-description');
        if (desc) {
          const maxScroll = Math.max(0, desc.scrollHeight - desc.clientHeight);
          verticalScrollMode = deltaY < 0
            ? desc.scrollTop < maxScroll - 1   // finger up: can still scroll down?
            : desc.scrollTop > 1;              // finger down: can still scroll up?
        }
      }
      if (verticalScrollMode) {
        const desc = card.querySelector('.event-description');
        if (desc) desc.scrollTop = descScrollStart - deltaY;
      } else {
        direction = deltaY < 0 ? 'up' : 'down';
        progress = Math.min(1, absY / vThresh);
        card.style.transform = `translateY(${deltaY}px)`;
      }
    }

    if (swipeLabel) {
      if (direction === 'right') {
        swipeLabel.className = 'swipe-label interessant';
        swipeLabel.textContent = '♥ Interessant';
        swipeLabel.style.opacity = progress;
      } else if (direction === 'left') {
        swipeLabel.className = 'swipe-label verzichtbar';
        swipeLabel.textContent = 'Verzichtbar';
        swipeLabel.style.opacity = progress;
      } else if (direction === 'up') {
        swipeLabel.className = 'swipe-label highlight';
        swipeLabel.textContent = '★ Highlight';
        swipeLabel.style.opacity = progress;
      } else {
        swipeLabel.style.opacity = 0;
      }
    }

    if (isDeck) {
      const deckCards = [...cardContainer.querySelectorAll('.deck-card')];
      const myIndex = deckCards.indexOf(card);
      deckCards.forEach((c, i) => {
        if (i <= myIndex) return;
        const rel = i - myIndex;
        const scale = Math.min(1, 1 - rel * 0.07 + 0.07 * progress);
        c.style.transform = `scale(${scale})`;
      });
    }
  }

  function advanceNextCards() {
    if (!isDeck) return;
    const deckCards = [...cardContainer.querySelectorAll('.deck-card')];
    const myIndex = deckCards.indexOf(card);
    deckCards.forEach((c, i) => {
      if (i <= myIndex) return;
      const rel = i - myIndex;
      c.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)';
      c.style.transform = rel === 1 ? 'none' : `scale(${1 - (rel - 1) * 0.07})`;
      setTimeout(() => { c.style.transition = ''; }, 350);
    });
  }

  function resetNextCards() {
    if (!isDeck) return;
    const deckCards = [...cardContainer.querySelectorAll('.deck-card')];
    const myIndex = deckCards.indexOf(card);
    deckCards.forEach((c, i) => {
      if (i <= myIndex) return;
      const rel = i - myIndex;
      c.style.transition = 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)';
      c.style.transform = `scale(${1 - rel * 0.07})`;
      setTimeout(() => { c.style.transition = ''; }, 450);
    });
  }

  let descScrollStart = 0;
  let verticalScrollMode = false;
  let verticalModeSet = false;

  card.addEventListener('pointerdown', e => {
    if (isAnimating) return;
    startX = e.clientX;
    startY = e.clientY;
    startTransform = card.style.transform;
    hThresh = card.dataset.expanded ? 70 : card.getBoundingClientRect().width / 3;
    vThresh = window.innerHeight / 3;
    dragging = true;
    const desc = card.querySelector('.event-description');
    descScrollStart = desc ? desc.scrollTop : 0;
    verticalScrollMode = false;
    verticalModeSet = false;
    if (isDeck) card.setPointerCapture(e.pointerId);
  });

  card.addEventListener('pointermove', e => {
    if (!dragging) return;
    updateDragVisuals(e.clientX - startX, e.clientY - startY);
  });

  card.addEventListener('pointercancel', () => {
    if (!dragging) return;
    dragging = false;
    if (swipeLabel) swipeLabel.style.opacity = 0;
    card.style.transform = startTransform;
    if (!card.dataset.expanded) resetNextCards();
  });

  card.addEventListener('pointerup', e => {
    if (!dragging) return;
    dragging = false;
    if (isDeck) card.releasePointerCapture(e.pointerId);

    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (swipeLabel) swipeLabel.style.opacity = 0;

    let action = null;
    if (absX > absY && absX > hThresh) {
      action = deltaX > 0 ? 'Interessant' : 'Verzichtbar';
    } else if (!verticalScrollMode && absY > absX && absY > vThresh) {
      action = deltaY < 0 ? 'Highlight' : 'Zurücksetzen';
    }

    if (!action) {
      card.style.transition = 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)';
      card.style.transform = startTransform;
      setTimeout(() => { card.style.transition = ''; }, 450);
      resetNextCards();
      return;
    }

    isAnimating = true;
    advanceNextCards();

    const flyX = action === 'Interessant' ? window.innerWidth * 1.5
               : action === 'Verzichtbar' ? -window.innerWidth * 1.5 : 0;
    const flyY = action === 'Highlight' ? -window.innerHeight * 1.5
               : action === 'Zurücksetzen' ? window.innerHeight * 1.5 : 0;

    card.style.transition = 'transform 0.35s cubic-bezier(0.4, 0, 1, 1), opacity 0.3s ease-out';
    card.style.transform = `translateX(${flyX}px) translateY(${flyY}px)`;
    card.style.opacity = '0';

    setTimeout(() => {
      handleDeckAction(event, action);
      isAnimating = false;
      buildCards();
    }, 350);
  });

  card.addEventListener('click', e => {
    if (modalJustClosed) return;

    if (card.dataset.expanded) {
      collapseCard(card);
      return;
    }

    tapCount += 1;
    if (tapCount === 1) {
      tapTimer = setTimeout(() => {
        if (isDeck) expandCard(card);
        tapCount = 0;
      }, 250);
    } else if (tapCount === 2) {
      clearTimeout(tapTimer);
      tapCount = 0;
      if (!isAnimating) {
        markSelection(event, 'Highlight');
        card.style.transition = 'transform 0.35s cubic-bezier(0.68, -0.55, 0.265, 1.55), opacity 0.35s ease-out';
        card.style.transform = 'scale(1.05) translateY(-20px)';
        card.style.opacity = '0';
        setTimeout(() => {
          isAnimating = false;
          buildCards();
        }, 350);
      }
    }
  });
}

function handleDeckAction(event, action) {
  const eventInDeck = deckEvents.find(e => e.id === event.id);
  if (action === 'Interessant' || action === 'Verzichtbar' || action === 'Highlight') {
    markSelection(event, action === 'Highlight' ? 'Highlight' : action);
    deckEvents = deckEvents.filter(e => e.id !== event.id);
  } else if (action === 'Zurücksetzen') {
    selectedEvents.delete(event.id);
    deckEvents = deckEvents.filter(e => e.id !== event.id);
    deckEvents.push(event);
  }
}


function saveSelections() {
  const data = Array.from(selectedEvents.entries()).map(([id, sel]) => ({ id, level: sel.level }));
  try { localStorage.setItem('veproplan-selections', JSON.stringify(data)); } catch {}
}

function restoreSelections() {
  try {
    const raw = localStorage.getItem('veproplan-selections');
    if (!raw) return;
    const saved = JSON.parse(raw);
    const byId = new Map(events.map(e => [e.id, e]));
    saved.forEach(({ id, level }) => {
      const event = byId.get(id);
      if (event) selectedEvents.set(id, { level, event });
    });
  } catch {}
}

function markSelection(event, level) {
  selectedEvents.set(event.id, { level, event });
  if (clearSelection) clearSelection.disabled = selectedEvents.size === 0;
  saveSelections();
}

function updateTabButtons() {
  discoverTab.classList.toggle('active', viewMode === 'discover');
  interestingTab.classList.toggle('active', viewMode === 'interesting');
  verzichtbarTab.classList.toggle('active', viewMode === 'verzichtbar');
  if (tabsNav) tabsNav.dataset.mode = viewMode;
}

function bindControls() {
  discoverTab.addEventListener('click', () => {
    viewMode = 'discover';
    updateTabButtons();
    buildCards();
  });

  interestingTab.addEventListener('click', () => {
    viewMode = 'interesting';
    updateTabButtons();
    buildCards();
  });

  verzichtbarTab.addEventListener('click', () => {
    viewMode = 'verzichtbar';
    updateTabButtons();
    buildCards();
  });

  if (settingsBtn && settingsMenu) {
    settingsBtn.addEventListener('click', e => {
      e.stopPropagation();
      settingsMenu.classList.toggle('hidden');
    });
    document.addEventListener('click', () => settingsMenu.classList.add('hidden'));
  }

  if (clearSelection) {
    clearSelection.addEventListener('click', () => {
      if (settingsMenu) settingsMenu.classList.add('hidden');
      selectedEvents.clear();
      deckEvents = [...events];
      clearSelection.disabled = true;
      saveSelections();
      buildCards();
    });
  }

  // Modal gestures:
  // - Pointer events handle horizontal swipes + tap (touch-action:pan-y prevents pointercancel for horizontal)
  // - Touch events handle vertical overscroll (at scroll boundary)
  if (cardModal) {
    // Pointer: horizontal swipe + tap
    let pStart = null, scrollAtStart = 0;
    const getLabel = () => cardModal.querySelector('.swipe-label');
    cardModal.addEventListener('pointerdown', e => {
      pStart = { x: e.clientX, y: e.clientY };
      scrollAtStart = cardModal.scrollTop;
    });
    cardModal.addEventListener('pointermove', e => {
      if (!pStart) return;
      const dx = e.clientX - pStart.x;
      const absDx = Math.abs(dx), absDy = Math.abs(e.clientY - pStart.y);
      const label = getLabel();
      if (!label) return;
      if (absDx > absDy && absDx > 10) {
        const progress = Math.min(1, absDx / (window.innerWidth / 3));
        label.className = dx > 0 ? 'swipe-label interessant' : 'swipe-label verzichtbar';
        label.textContent = dx > 0 ? '♥ Interessant' : 'Verzichtbar';
        label.style.opacity = progress;
      } else {
        label.style.opacity = 0;
      }
    });
    cardModal.addEventListener('pointercancel', () => {
      pStart = null;
      const label = getLabel(); if (label) label.style.opacity = 0;
    });
    cardModal.addEventListener('pointerup', e => {
      if (!pStart) return;
      const dx = e.clientX - pStart.x, dy = e.clientY - pStart.y;
      pStart = null;
      const label = getLabel(); if (label) label.style.opacity = 0;
      const absDx = Math.abs(dx), absDy = Math.abs(dy);
      if (absDx > absDy && absDx > window.innerWidth / 3) {
        closeCardModal();
        if (currentModalEvent) { handleDeckAction(currentModalEvent, dx > 0 ? 'Interessant' : 'Verzichtbar'); buildCards(); }
      } else if (absDx < 15 && absDy < 15) {
        closeCardModal();
      }
    });

    // Touch: vertical overscroll at boundary → swipe action
    let tStart = null, tScrollStart = 0;
    cardModal.addEventListener('touchstart', e => {
      tStart = e.touches[0].clientY;
      tScrollStart = cardModal.scrollTop;
    }, { passive: false });
    cardModal.addEventListener('touchmove', e => {
      if (tStart === null) return;
      const dy = e.touches[0].clientY - tStart;
      const scrollable = cardModal.scrollHeight > cardModal.clientHeight + 2;
      const atTop    = tScrollStart === 0;
      const atBottom = tScrollStart + cardModal.clientHeight >= cardModal.scrollHeight - 2;
      if (!scrollable || (dy < 0 && atBottom) || (dy > 0 && atTop)) {
        e.preventDefault();
      }
    }, { passive: false });
    cardModal.addEventListener('touchend', e => {
      if (tStart === null) return;
      const dy = e.changedTouches[0].clientY - tStart;
      const scrollT0 = tScrollStart;
      tStart = null;
      if (Math.abs(dy) > window.innerHeight / 3) {
        const scrollable = cardModal.scrollHeight > cardModal.clientHeight + 2;
        const atBottom = scrollT0 + cardModal.clientHeight >= cardModal.scrollHeight - 2;
        const atTop    = scrollT0 === 0;
        if (!scrollable || (dy < 0 && atBottom) || (dy > 0 && atTop)) {
          closeCardModal();
          if (currentModalEvent) { handleDeckAction(currentModalEvent, dy < 0 ? 'Highlight' : 'Zurücksetzen'); buildCards(); }
        }
      }
    });
    cardModal.addEventListener('touchcancel', () => { tStart = null; });
  }
}

function applyAppConfig(parsed) {
  const config = parsed?.Veranstaltung || {};
  const name = config.name || config.titel || 'Programm';
  const themeColor = config.theme_color || '#340f52';
  const bgColor = config.background_color || '#100718';
  const iconSrc = config.icon || 'icon.svg';
  const iconType = /\.svg$/i.test(iconSrc) ? 'image/svg+xml'
    : /\.png$/i.test(iconSrc) ? 'image/png' : 'image/png';
  const iconUrl = /^https?:\/\//.test(iconSrc)
    ? iconSrc : new URL(iconSrc, location.href).href;

  document.title = name;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.content = themeColor;
  document.querySelectorAll('link[rel="icon"]').forEach(link => {
    link.href = iconUrl;
    link.type = iconType;
    link.removeAttribute('sizes');
  });

  const manifest = {
    name, short_name: name,
    start_url: location.href,
    display: 'standalone',
    background_color: bgColor,
    theme_color: themeColor,
    icons: [
      { src: iconUrl, sizes: '192x192', type: iconType },
      { src: iconUrl, sizes: '512x512', type: iconType }
    ]
  };
  const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
  const link = document.querySelector('link[rel="manifest"]');
  if (link) {
    if (link._blobUrl) URL.revokeObjectURL(link._blobUrl);
    link._blobUrl = URL.createObjectURL(blob);
    link.href = link._blobUrl;
  }
}

async function loadYaml() {
  try {
    const response = await fetch(dataUrl);
    const raw = await response.text();
    const parsed = jsyaml.load(raw);
    applyAppConfig(parsed);
    events = parseYaml(raw).filter(isCurrentOrFuture);
    restoreSelections();
    deckEvents = events.filter(e => !selectedEvents.has(e.id));
    buildCards();
  } catch (err) {
    cardContainer.innerHTML = '<div class="loading">Fehler beim Laden der Daten.</div>';
    console.error(err);
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(console.error);
  });
}

bindControls();
loadYaml();
