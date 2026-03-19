// TradeWatch — Alerts
// createAlert, renderAlerts, checkAlerts, history, sound


// ═══════════════════════════════════════════════
// ALERTS
// ═══════════════════════════════════════════════
// ── Toggle zone vs single price UI ───────────────
function onConditionChange() {
  const condition = document.getElementById('alert-condition').value;
  const isZone = condition === 'zone';
  const isTap  = condition === 'tap';
  document.getElementById('alert-single-row').style.display = isZone ? 'none' : '';
  document.getElementById('alert-zone-row').style.display   = isZone ? '' : 'none';
  document.getElementById('alert-tap-row').style.display    = isTap  ? '' : 'none';
  // Re-fill with current price for the newly selected condition type
  refreshSelectedAssetPanel();
}

async function createAlert() {
  userTypingInForm = false; // clear flag on submit
  if (editingAlertId) return saveEditedAlert();

  if (!selectedAsset) return showToast('No Asset', 'Tap any asset from the Hot List or Watchlist first.', 'error');

  const assetId    = selectedAsset.id;
  const condition  = document.getElementById('alert-condition').value;
  const timeframe  = document.getElementById('alert-timeframe').value;
  const isZone  = condition === 'zone';
  const isTap   = condition === 'tap';

  let targetPrice = 0, zoneLow = 0, zoneHigh = 0, note = '', repeatInterval = 0, tapTolerance = 0.2;

  if (isZone) {
    zoneLow  = parseFloat(document.getElementById('alert-zone-low').value);
    zoneHigh = parseFloat(document.getElementById('alert-zone-high').value);
    note     = document.getElementById('alert-note-zone').value.trim();
    repeatInterval = parseInt(document.getElementById('alert-repeat').value) || 0;
    if (isNaN(zoneLow) || isNaN(zoneHigh) || zoneLow <= 0 || zoneHigh <= 0)
      return showToast('Invalid Zone', 'Enter valid zone low and high prices.', 'error');
    if (zoneLow >= zoneHigh)
      return showToast('Invalid Zone', 'Zone low must be less than zone high.', 'error');
    targetPrice = zoneLow;
  } else if (isTap) {
    targetPrice = parseFloat(document.getElementById('alert-price').value);
    note        = document.getElementById('alert-note').value.trim();
    if (isNaN(targetPrice) || targetPrice <= 0)
      return showToast('Invalid Price', 'Enter a valid target price.', 'error');
    const tolSel = document.getElementById('alert-tap-tolerance').value;
    tapTolerance = tolSel === 'custom'
      ? parseFloat(document.getElementById('alert-tap-custom').value) || 0.2
      : parseFloat(tolSel);
  } else {
    targetPrice = parseFloat(document.getElementById('alert-price').value);
    note        = document.getElementById('alert-note').value.trim();
    if (isNaN(targetPrice) || targetPrice <= 0)
      return showToast('Invalid Price', 'Enter a valid target price.', 'error');
  }

  // ── Duplicate check ───────────────────────────────
  const duplicate = alerts.find(a => {
    if (a.assetId !== assetId || a.status === 'triggered') return false;
    if (isZone && a.condition === 'zone')
      return a.zoneLow === zoneLow && a.zoneHigh === zoneHigh;
    if (!isZone && a.condition === condition)
      return a.targetPrice === targetPrice;
    return false;
  });
  if (duplicate) {
    const label = isZone
      ? `a zone alert (${formatPrice(zoneLow, assetId)}–${formatPrice(zoneHigh, assetId)})`
      : `a ${condition} alert at ${formatPrice(targetPrice, assetId)}`;
    return showToast('Duplicate Alert', `You already have ${label} for ${selectedAsset.symbol}.`, 'error');
  }

  const assetInfo    = selectedAsset;
  const currentPrice = priceData[assetId]?.price || 0;

  const newAlert = {
    id: 'temp_' + alertIdCounter++,
    assetId,
    symbol:          assetInfo.symbol,
    name:            assetInfo.name,
    condition,
    targetPrice,
    zoneLow:         isZone     ? zoneLow      : null,
    zoneHigh:        isZone     ? zoneHigh     : null,
    tapTolerance:    isTap      ? tapTolerance : null,

    timeframe:       timeframe || null,
    repeatInterval,
    note,
    sound:           selectedAlertSound,
    status:          'active',
    createdAt:       new Date().toLocaleTimeString(),
    currentPriceWhenCreated: currentPrice,
  };

  alerts.push(newAlert);

  try {
    const saved = await saveAlert(newAlert);
    const idx = alerts.findIndex(a => a.id === newAlert.id);
    if (idx !== -1 && saved?.id) alerts[idx].id = saved.id;
  } catch(e) {
    console.warn('createAlert: DB save failed', e);
  }

  // Reset form
  document.getElementById('alert-price').value            = '';
  document.getElementById('alert-zone-low').value         = '';
  document.getElementById('alert-zone-high').value        = '';
  document.getElementById('alert-note').value             = '';
  document.getElementById('alert-note-zone').value        = '';

  document.getElementById('alert-timeframe').value        = '';
  document.getElementById('alert-repeat').value           = '0';
  document.getElementById('alert-tap-tolerance').value    = '0.2';


  delete document.getElementById('alert-price').dataset.userEdited;
  delete document.getElementById('alert-zone-low').dataset.userEdited;
  delete document.getElementById('alert-zone-high').dataset.userEdited;

  const tfLabel = timeframe ? ` · ${timeframe}` : '';
  if (isZone) {
    showToast('Zone Alert Created', `${assetInfo.symbol} zone ${formatPrice(zoneLow, assetId)}–${formatPrice(zoneHigh, assetId)}${tfLabel} is now active.`, 'success');
  } else if (isTap) {
    showToast('Tap Alert Created', `${assetInfo.symbol} tap at ${formatPrice(targetPrice, assetId)} (±${tapTolerance}%)${tfLabel} is now active.`, 'success');
  } else {
    showToast('Alert Created', `${assetInfo.symbol} ${condition} ${formatPrice(targetPrice, assetId)}${tfLabel} is now active.`, 'success');
  }

  if (telegramEnabled) {
    sendTelegram(tgCreatedMessage(assetInfo.symbol, condition, targetPrice, assetId, note, timeframe, zoneLow, zoneHigh, repeatInterval, tapTolerance));
  }

  renderAlerts();
  renderWatchlist();
  if (isMobileLayout()) {
    switchAlertTab('active');
    mobileTab('alerts');
  }
}

function deleteAlert(id) {
  const alert = alerts.find(a => a.id === id);
  if (!alert) return;

  const isZone  = alert.condition === 'zone';
  const label   = isZone
    ? `${alert.symbol} zone ${formatPrice(alert.zoneLow, alert.assetId)}–${formatPrice(alert.zoneHigh, alert.assetId)}`
    : `${alert.symbol} ${alert.condition} ${formatPrice(alert.targetPrice, alert.assetId)}`;
  const tf      = alert.timeframe ? ` · ${alert.timeframe}` : '';

  showConfirm(
    'Delete Alert',
    `Remove <b>${label}${tf}</b>?<br><small style="opacity:0.65;font-size:0.75rem">This cannot be undone.</small>`,
    () => {
      deleteAlertFromDB(id);
      alerts = alerts.filter(a => a.id !== id);
      renderAlerts();
      renderWatchlist();
      showToast('Alert Deleted', `${alert.symbol} alert removed.`, 'success');
    }
  );
}

// ── Generic confirmation modal ────────────────────
function showConfirm(title, bodyHtml, onConfirm) {
  // Remove any existing confirm modal
  const existing = document.getElementById('confirm-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'confirm-modal';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:99998;
    background:rgba(0,0,0,0.6);
    display:flex;align-items:center;justify-content:center;
    padding:24px;backdrop-filter:blur(4px);
  `;
  overlay.innerHTML = `
    <div style="
      background:var(--surface);
      border:1px solid var(--border);
      border-radius:14px;
      padding:24px 22px;
      max-width:320px;width:100%;
      box-shadow:0 8px 40px rgba(0,0,0,0.5);
    ">
      <div style="font-family:var(--mono);font-size:0.65rem;letter-spacing:0.1em;color:var(--muted);margin-bottom:8px;">${title.toUpperCase()}</div>
      <div style="font-size:0.9rem;line-height:1.5;margin-bottom:22px;">${bodyHtml}</div>
      <div style="display:flex;gap:10px;">
        <button id="confirm-cancel" style="
          flex:1;padding:12px;border-radius:8px;
          background:transparent;border:1px solid var(--border);
          color:var(--muted);font-family:var(--mono);font-size:0.7rem;
          letter-spacing:0.08em;cursor:pointer;
        ">CANCEL</button>
        <button id="confirm-ok" style="
          flex:1;padding:12px;border-radius:8px;
          background:rgba(255,61,90,0.15);border:1px solid rgba(255,61,90,0.4);
          color:var(--red);font-family:var(--mono);font-size:0.7rem;
          letter-spacing:0.08em;cursor:pointer;font-weight:700;
        ">DELETE</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#confirm-cancel').onclick = () => overlay.remove();
  overlay.querySelector('#confirm-ok').onclick     = () => { overlay.remove(); onConfirm(); };
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

function toggleAlert(id) {
  const a = alerts.find(a => a.id === id);
  if (!a) return;
  if (a.status === 'active') a.status = 'paused';
  else if (a.status === 'paused') a.status = 'active';
  updateAlert(id, { status: a.status });
  renderAlerts();
}

function dismissAlert(id) {
  const alert = alerts.find(a => a.id === id);
  if (!alert) return;
  // Save to history in DB
  saveAlertToHistory(alert);
  // Add to local history array
  alertHistory.unshift({
    id: Date.now() + Math.random(),
    symbol: alert.symbol,
    assetId: alert.assetId,
    condition: alert.condition,
    targetPrice: alert.targetPrice,
    triggeredAt: Date.now(),
    triggeredPrice: alert.triggeredPrice,
    note: alert.note || '',
  });
  saveAlertHistory();
  // Remove from active alerts
  deleteAlertFromDB(id);
  alerts = alerts.filter(a => a.id !== id);
  renderAlerts();
  renderWatchlist();
  if (lwCurrentAsset) drawAlertLines(lwCurrentAsset.id);
}

// ── Alert condition SVG icons ─────────────────────────
// Used in badge labels and detail lines throughout the alert card UI.
const ALERT_ICONS = {
  above:     `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="display:inline-block;vertical-align:middle;margin-right:3px"><polyline points="1,7 5,3 9,7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  below:     `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="display:inline-block;vertical-align:middle;margin-right:3px"><polyline points="1,3 5,7 9,3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  zone:      `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="display:inline-block;vertical-align:middle;margin-right:3px"><rect x="1" y="3" width="8" height="4" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/><line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" stroke-width="0.8" stroke-dasharray="1.5 1.5"/></svg>`,
  tap:       `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="display:inline-block;vertical-align:middle;margin-right:3px"><circle cx="5" cy="5" r="3.5" stroke="currentColor" stroke-width="1.5"/><circle cx="5" cy="5" r="1" fill="currentColor"/></svg>`,
  paused:    `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="display:inline-block;vertical-align:middle;margin-right:3px"><rect x="1.5" y="1" width="2.5" height="8" rx="1" fill="currentColor" opacity="0.7"/><rect x="6" y="1" width="2.5" height="8" rx="1" fill="currentColor" opacity="0.7"/></svg>`,
  triggered: `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="display:inline-block;vertical-align:middle;margin-right:3px"><polyline points="1,5 3.5,7.5 9,2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  inzone:    `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="display:inline-block;vertical-align:middle;margin-right:3px"><rect x="1" y="3" width="8" height="4" rx="1" stroke="currentColor" stroke-width="1.5" fill="currentColor" fill-opacity="0.2"/><circle cx="5" cy="5" r="1.2" fill="currentColor"/></svg>`,
  near:      `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="display:inline-block;vertical-align:middle;margin-right:3px"><circle cx="5" cy="5" r="4" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 1.5"/><circle cx="5" cy="5" r="1.5" fill="currentColor" opacity="0.8"/></svg>`,
  active:    `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="display:inline-block;vertical-align:middle;margin-right:3px"><circle cx="5" cy="5" r="3" stroke="currentColor" stroke-width="1.5"/><circle cx="5" cy="5" r="1" fill="currentColor"/></svg>`,
};

// ── Button SVG icons for alert actions ───────────────────────────────────────
const SVG_DELETE  = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="display:inline-block;vertical-align:middle;margin-right:4px"><line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const SVG_DISMISS = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="display:inline-block;vertical-align:middle;margin-right:4px"><polyline points="1,5 3.5,7.5 9,2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SVG_RESUME  = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="display:inline-block;vertical-align:middle;margin-right:4px"><polygon points="1,1 9,5 1,9" fill="currentColor"/></svg>';
const SVG_PAUSE   = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="display:inline-block;vertical-align:middle;margin-right:4px"><rect x="1.5" y="1" width="2.5" height="8" rx="1" fill="currentColor"/><rect x="6" y="1" width="2.5" height="8" rx="1" fill="currentColor"/></svg>';

function renderAlerts() {
  const container = document.getElementById('alerts-list');
  const active = alerts.filter(a => a.status === 'active').length;
  document.getElementById('alert-count').textContent = alerts.length;
  document.getElementById('activeCount').textContent = active;
  document.getElementById('triggeredCount').textContent = triggeredToday;

  if (alerts.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="icon"><svg width="48" height="48" viewBox="0 0 48 48" fill="none"><path d="M24 6C16.27 6 10 12.27 10 20v13L6 37h36l-4-4V20C38 12.27 31.73 6 24 6z" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" fill="none" opacity="0.4"/><path d="M19 38c0 2.76 2.24 5 5 5s5-2.24 5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.4"/></svg></div><p>No alerts yet.<br>Select an asset and set a<br>price target to get started.</p></div>`;
    return;
  }

  container.innerHTML = '';
  [...alerts].reverse().forEach(alert => {
    const div = document.createElement('div');
    const isTriggered = alert.status === 'triggered';
    const dir = alert.triggeredDirection || alert.condition;

    if (isTriggered) {
      div.className = `alert-item triggered-${dir}`;
    } else {
      div.className = `alert-item active-alert`;
    }

    let badgeClass, badgeLabel;
    const isRepeatingZone  = alert.condition === 'zone' && (alert.repeatInterval || 0) > 0;
    const zoneInProgress   = isRepeatingZone && alert.zoneTriggeredOnce;
    // Check if price is currently inside the zone (live data)
    const currentLivePrice = priceData[alert.assetId]?.price || 0;
    const isCurrentlyInZone = alert.condition === 'zone' && currentLivePrice > 0
      && currentLivePrice >= alert.zoneLow && currentLivePrice <= alert.zoneHigh;

    if (isTriggered) {
      if (alert.condition === 'zone')      { badgeClass = 'badge-triggered-below'; badgeLabel = `${ALERT_ICONS.zone}TRIGGERED`; }
      else if (alert.condition === 'tap')  { badgeClass = 'badge-triggered-above'; badgeLabel = `${ALERT_ICONS.triggered}TAPPED`; }
      else                                 { badgeClass = `badge-triggered-${dir}`; badgeLabel = dir === 'above' ? `${ALERT_ICONS.above}TRIGGERED` : `${ALERT_ICONS.below}TRIGGERED`; }
    } else if (zoneInProgress && isCurrentlyInZone) {
      // Has fired before AND price is still inside
      badgeClass = 'badge-zone-active'; badgeLabel = `${ALERT_ICONS.inzone}IN ZONE`;
    } else if (zoneInProgress && !isCurrentlyInZone) {
      // Has fired before BUT price has since left — waiting for re-entry
      badgeClass = 'badge-zone-exited'; badgeLabel = `${ALERT_ICONS.zone}EXITED`;
    } else if (alert.status === 'paused') {
      badgeClass = 'badge-inactive'; badgeLabel = `${ALERT_ICONS.paused}PAUSED`;
    } else {
      badgeClass = 'badge-active'; badgeLabel = `${ALERT_ICONS.active}ACTIVE`;
    }

    const triggeredLine = isTriggered
      ? `<span style="color:${dir === 'above' || alert.condition === 'tap' ? 'var(--green)' : 'var(--red)'}">
           Hit ${formatPrice(alert.triggeredPrice, alert.assetId)} at ${formatTriggeredAt(alert.triggeredAt)}
         </span><br>`
      : (zoneInProgress && isCurrentlyInZone)
        ? `<span style="color:var(--accent);font-size:0.78rem;">Price inside zone · alerting every ${alert.repeatInterval}m</span><br>`
      : (zoneInProgress && !isCurrentlyInZone)
        ? `<span style="color:var(--red);font-size:0.78rem;">Price exited zone · watching for re-entry</span><br>`
      : '';

    // Detail line — all condition types
    let detailLine;
    if (alert.condition === 'zone') {
      detailLine = `<strong>${ALERT_ICONS.zone}ZONE</strong> ${formatPrice(alert.zoneLow, alert.assetId)} – ${formatPrice(alert.zoneHigh, alert.assetId)}${alert.timeframe ? ` <span style="opacity:0.6;font-size:0.75em">· ${alert.timeframe}</span>` : ''}${alert.repeatInterval ? ` <span style="opacity:0.6;font-size:0.75em">· every ${alert.repeatInterval}m</span>` : ''}`;
    } else if (alert.condition === 'tap') {
      detailLine = `<strong>${ALERT_ICONS.tap}TAP LEVEL</strong> ${formatPrice(alert.targetPrice, alert.assetId)} <span style="opacity:0.6;font-size:0.75em">· ±${alert.tapTolerance}% tolerance</span>${alert.timeframe ? ` <span style="opacity:0.6;font-size:0.75em">· ${alert.timeframe}</span>` : ''}`;

    } else {
      detailLine = `<strong>${alert.condition === 'above' ? ALERT_ICONS.above + 'ABOVE' : ALERT_ICONS.below + 'BELOW'}</strong> ${formatPrice(alert.targetPrice, alert.assetId)}${alert.timeframe ? ` <span style="opacity:0.6;font-size:0.75em">· ${alert.timeframe}</span>` : ''}`;
    }

    const isRepeat      = (alert.condition === 'zone' || alert.condition === 'tap') && (alert.repeatInterval || 0) > 0;
    const hasEverFired  = !!alert.zoneTriggeredOnce || !!alert.tapTriggeredOnce || alert.status === 'triggered';
    const SVG_EDIT    = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="display:inline-block;vertical-align:middle;margin-right:4px"><path d="M1 7.5L2.5 9 8 3.5 6.5 2 1 7.5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="none"/><line x1="5.5" y1="2.5" x2="7.5" y2="4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
    const btnDelete     = `<button class="alert-action-btn delete" onclick="deleteAlert('${alert.id}')">${SVG_DELETE}DELETE</button>`;
    const btnDismiss    = `<button class="alert-action-btn dismiss" onclick="dismissAlert('${alert.id}')">${SVG_DISMISS}DISMISS</button>`;
    const btnEdit       = `<button class="alert-action-btn toggle" onclick="editAlert('${alert.id}')" title="Edit alert">${SVG_EDIT}EDIT</button>`;
    const btnPause      = alert.status === 'paused'
      ? `<button class="alert-action-btn toggle" onclick="toggleAlert('${alert.id}')">${SVG_RESUME}RESUME</button>`
      : `<button class="alert-action-btn toggle" onclick="toggleAlert('${alert.id}')">${SVG_PAUSE}PAUSE</button>`;

    // Triggered/repeating-fired: DISMISS + DELETE only
    // Active/paused: EDIT + PAUSE/RESUME + DELETE
    const actions = isTriggered || (isRepeat && hasEverFired)
      ? btnDismiss + btnDelete
      : btnEdit + btnPause + btnDelete;

        div.innerHTML = `
      <div class="alert-header-row">
        <div class="alert-symbol">${alert.symbol}</div>
        <div class="alert-badge ${badgeClass}">${badgeLabel}</div>
      </div>
      <div class="alert-detail">
        ${detailLine}<br>
        ${triggeredLine}
        ${alert.note ? `<em style="color:var(--muted)">"${alert.note}"</em><br>` : ''}
        Set at ${alert.createdAt}
      </div>
      <div class="alert-actions">${actions}</div>`;
    container.appendChild(div);
  });

  // Update mobile alert badge dot — only for active (waiting) alerts
  const dot = document.getElementById('alert-dot');
  if (dot) dot.classList.toggle('show', alerts.some(a => a.status === 'active'));

  // Refresh alert lines on the chart for the currently viewed asset
  if (lwCurrentAsset) drawAlertLines(lwCurrentAsset.id);
}

// ═══════════════════════════════════════════════
// ALERT HISTORY — persistence + rendering
// ═══════════════════════════════════════════════
async function saveAlertHistory() {
  // Always keep localStorage as fast local cache
  try { localStorage.setItem('tw_alert_history', JSON.stringify(alertHistory)); } catch(e) {}
}
async function initAlertHistory() {
  // Try DB first, fall back to localStorage
  const dbHistory = await loadAlertHistoryFromDB();
  if (dbHistory !== null) {
    alertHistory = dbHistory;
  } else {
    try {
      const raw = localStorage.getItem('tw_alert_history');
      if (raw) alertHistory = JSON.parse(raw);
    } catch(e) {}
  }
}

function clearAlertHistory() {
  const btn = document.querySelector('.hist-clear-btn');
  if (!btn) return;
  if (btn.classList.contains('confirming')) {
    alertHistory = [];
    saveAlertHistory();
    clearAlertHistoryFromDB(); // also clear from DB
    renderHistory();
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="display:inline-block;vertical-align:middle;margin-right:5px"><polyline points="1,3 11,3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M2.5 3l.7 7h5.6l.7-7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/><polyline points="4.5,3 4.5,1.5 7.5,1.5 7.5,3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>Clear History`;
    btn.classList.remove('confirming');
  } else {
    btn.textContent = 'Tap again to confirm';
    btn.classList.add('confirming');
    setTimeout(() => {
      if (btn.classList.contains('confirming')) {
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="display:inline-block;vertical-align:middle;margin-right:5px"><polyline points="1,3 11,3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M2.5 3l.7 7h5.6l.7-7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/><polyline points="4.5,3 4.5,1.5 7.5,1.5 7.5,3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>Clear History`;
        btn.classList.remove('confirming');
      }
    }, 3000);
  }
}

let currentAlertTab = 'active';
function switchAlertTab(tab) {
  currentAlertTab = tab;
  document.getElementById('alerts-list').style.display    = tab === 'active'  ? '' : 'none';
  document.getElementById('alerts-history').style.display = tab === 'history' ? '' : 'none';
  document.getElementById('atab-active').classList.toggle('active',  tab === 'active');
  document.getElementById('atab-history').classList.toggle('active', tab === 'history');
  if (tab === 'history') renderHistory();
}

function setHistoryFilter(f) {
  alertHistoryFilter = f;
  ['7d','30d','3m','custom'].forEach(k => {
    document.getElementById('hf-' + k).classList.toggle('active', k === f);
  });
  document.getElementById('hf-custom-row').classList.toggle('show', f === 'custom');
  if (f !== 'custom') renderHistory();
}

function applyCustomHistoryFilter() {
  const from = document.getElementById('hf-from').value;
  const to   = document.getElementById('hf-to').value;
  if (!from || !to) return;
  historyCustomFrom = new Date(from);
  historyCustomTo   = new Date(to); historyCustomTo.setHours(23,59,59,999);
  renderHistory();
}

function getHistoryWindowMs() {
  const now = Date.now();
  if (alertHistoryFilter === '7d')     return [now - 7  * 864e5, now];
  if (alertHistoryFilter === '30d')    return [now - 30 * 864e5, now];
  if (alertHistoryFilter === '3m')     return [now - 91 * 864e5, now];
  if (alertHistoryFilter === 'custom' && historyCustomFrom && historyCustomTo)
    return [historyCustomFrom.getTime(), historyCustomTo.getTime()];
  return [now - 7 * 864e5, now];
}

function renderHistory() {
  const container = document.getElementById('history-list');
  if (!container) return;

  const [fromMs, toMs] = getHistoryWindowMs();
  const filtered = alertHistory.filter(h => h.triggeredAt >= fromMs && h.triggeredAt <= toMs);

  if (filtered.length === 0) {
    container.innerHTML = `<div class="hist-empty">No triggered alerts<br>in this time period.</div>`;
    return;
  }

  // Build summary counts
  const aboveCount = filtered.filter(h => h.condition === 'above').length;
  const belowCount = filtered.filter(h => h.condition === 'below').length;

  // Group by assetId
  const groups = {};
  filtered.forEach(h => {
    if (!groups[h.assetId]) groups[h.assetId] = { symbol: h.symbol, entries: [] };
    groups[h.assetId].entries.push(h);
  });
  // Sort each group newest first
  Object.values(groups).forEach(g => g.entries.sort((a,b) => b.triggeredAt - a.triggeredAt));
  // Sort groups by most recent trigger
  const sortedGroups = Object.entries(groups).sort((a,b) =>
    b[1].entries[0].triggeredAt - a[1].entries[0].triggeredAt
  );

  let html = `<div class="hist-summary">
    <div>${filtered.length} trigger${filtered.length !== 1 ? 's' : ''}</div>
    <div>${ALERT_ICONS.above}Above: <span>${aboveCount}</span></div>
    <div>${ALERT_ICONS.below}Below: <span>${belowCount}</span></div>
  </div>`;

  sortedGroups.forEach(([assetId, group]) => {
    const isOpen = historyExpandedAsset === assetId;
    const lastTrigger = new Date(group.entries[0].triggeredAt).toLocaleDateString();
    html += `
      <div class="hist-asset-group">
        <div class="hist-asset-header" onclick="toggleHistoryGroup('${assetId}')">
          <div class="hist-asset-name">${group.symbol}</div>
          <div class="hist-asset-meta">
            <span class="hist-count">${group.entries.length} alert${group.entries.length !== 1 ? 's' : ''}</span>
            <span style="font-family:var(--mono);font-size:0.6rem;color:var(--muted)">${lastTrigger}</span>
            <svg class="hist-chevron${isOpen ? ' open' : ''}" width="12" height="12" viewBox="0 0 12 12" fill="none">
              <polyline points="2,4 6,8 10,4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        </div>
        <div class="hist-entries${isOpen ? ' open' : ''}">
          ${group.entries.map(h => {
            const ts = new Date(h.triggeredAt);
            const dateStr = ts.toLocaleDateString(undefined, { month:'short', day:'numeric' });
            const timeStr = ts.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' });
            return `
            <div class="hist-entry">
              <div class="hist-entry-left">
                <span class="hist-entry-dir hist-dir-${h.condition}">${h.condition === 'above' ? ALERT_ICONS.above + 'ABOVE' : h.condition === 'below' ? ALERT_ICONS.below + 'BELOW' : h.condition === 'zone' ? ALERT_ICONS.zone + 'ZONE' : ALERT_ICONS.tap + 'TAP'}</span>
                <span class="hist-entry-price">Target: ${formatPrice(h.targetPrice, h.assetId)}</span>
                ${h.note ? `<span class="hist-entry-note">"${h.note}"</span>` : ''}
              </div>
              <div class="hist-entry-right">
                <div class="hist-triggered-price">${formatPrice(h.triggeredPrice, h.assetId)}</div>
                <div>${dateStr}</div>
                <div>${timeStr}</div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
  });

  container.innerHTML = html;
}

function toggleHistoryGroup(assetId) {
  historyExpandedAsset = historyExpandedAsset === assetId ? null : assetId;
  renderHistory();
}
// ── Market hours helpers (client-side mirror of Edge Function logic) ──────────
function isForexOpen(now) {
  const day = now.getUTCDay(), hour = now.getUTCHours();
  if (day === 6) return false;
  if (day === 0 && hour < 21) return false;
  return true;
}
function isStockOpen(now) {
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return false;
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  return mins >= 870 && mins < 1260;
}
function isMarketOpenForAsset(assetId, now) {
  const asset = ASSET_BY_ID.get(assetId);
  if (!asset) return true; // unknown asset — don't block

  // Synthetics category (all Deriv synthetic indices) trade 24/7
  if (asset.cat === 'synthetics') return true;

  // Crypto — always open
  if (asset.cat === 'crypto') return true;

  // Unavailable assets — no live price, don't trigger alerts on them
  if (asset.sources?.[0] === 'unavailable') return false;

  // Indices via Deriv (US500, UK100 etc) — Deriv runs extended hours / near 24/7
  if (asset.cat === 'indices' && asset.derivSym) return true;

  // Indices via OANDA only — follow exchange hours (treat as stock hours)
  if (asset.cat === 'indices' && asset.oandaSym) return isStockOpen(now);

  // Commodities and Forex — follow forex hours (Sun 21:00 UTC → Fri 22:00 UTC)
  if (asset.cat === 'commodities' || asset.cat === 'forex') return isForexOpen(now);

  // Stocks — US market hours (Mon–Fri 09:30–16:00 ET = 13:30–20:00 UTC)
  return isStockOpen(now);
}

function checkAlerts() {
  const now = Date.now();
  const nowDate = new Date(now);
  alerts.forEach(alert => {
    if (alert.status !== 'active') return;

    // Don't fire on stale weekend/after-hours prices
    if (!isMarketOpenForAsset(alert.assetId, nowDate)) return;

    const currentPrice = priceData[alert.assetId]?.price || prices[alert.assetId];
    if (!currentPrice) return;

    const isZone      = alert.condition === 'zone';
    const isTap       = alert.condition === 'tap';
    let fired = false;

    if (isZone) {
      const inZone = currentPrice >= alert.zoneLow && currentPrice <= alert.zoneHigh;
      if (!inZone) {
        // Price left the zone — reset so it can fire again on re-entry
        if (alert.zoneTriggeredOnce) {
          alert.zoneTriggeredOnce = false;
          updateAlert(alert.id, { last_triggered_at: null });
        }
        return;
      }
      const repeatMs = (alert.repeatInterval || 0) * 60 * 1000;
      const lastFired = alert.lastTriggeredAt || 0;
      if (repeatMs === 0) {
        if (alert.zoneTriggeredOnce) return;
        alert.zoneTriggeredOnce = true;
        alert.status = 'triggered';
      } else {
        if (now - lastFired < repeatMs) return;
        alert.lastTriggeredAt = now;
        alert.zoneTriggeredOnce = true;
        // Persist so badge survives reload
        updateAlert(alert.id, { last_triggered_at: new Date().toISOString() });
      }
      fired = true;
    } else if (isTap) {
      const tol = (alert.tapTolerance || 0.2) / 100;
      const withinRange = Math.abs(currentPrice - alert.targetPrice) / alert.targetPrice <= tol;
      if (!withinRange) { alert.tapTriggeredOnce = false; return; }
      if (alert.tapTriggeredOnce) return;
      alert.tapTriggeredOnce = true;
      alert.status = 'triggered';
      fired = true;
    } else {
      fired =
        (alert.condition === 'above' && currentPrice >= alert.targetPrice) ||
        (alert.condition === 'below' && currentPrice <= alert.targetPrice);
      if (!fired) return;
      alert.status = 'triggered';
    }

    alert.triggeredDirection = alert.condition;
    alert.triggeredAt    = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    alert.triggeredPrice = currentPrice;
    triggeredToday++;

    if (!isZone || (alert.repeatInterval || 0) === 0) {
      updateAlert(alert.id, {
        status:          'triggered',
        triggered_at:    new Date().toISOString(),
        triggered_price: currentPrice,
        triggered_direction: alert.condition,
      });
    }

    const tfLabel = alert.timeframe ? ` [${alert.timeframe}]` : '';
    let msg;
    if (isZone) {
      msg = `Entered zone ${formatPrice(alert.zoneLow, alert.assetId)}–${formatPrice(alert.zoneHigh, alert.assetId)}${tfLabel} | Current price: ${formatPrice(currentPrice, alert.assetId)}`;
    } else if (isTap) {
      msg = `Tapped ${formatPrice(alert.targetPrice, alert.assetId)} (±${alert.tapTolerance}%)${tfLabel} | Current: ${formatPrice(currentPrice, alert.assetId)}`;
    } else {
      msg = `${alert.condition === 'above' ? 'Rose above' : 'Fell below'} ${formatPrice(alert.targetPrice, alert.assetId)}${tfLabel} | Current: ${formatPrice(currentPrice, alert.assetId)}`;
    }

    showToast(`ALERT TRIGGERED — ${alert.symbol}`, msg, 'alert');
    playAlertSound(alert.sound || selectedAlertSound);
    const isRepeating = isZone && (alert.repeatInterval || 0) > 0;
    if (telegramEnabled && !isRepeating) {
      sendTelegram(tgAlertMessage('trigger', alert.symbol, alert.condition,
        alert.targetPrice, currentPrice, alert.assetId,
        alert.note, alert.timeframe, alert.zoneLow, alert.zoneHigh,
        alert.repeatInterval, alert.tapTolerance));
    }
    renderAlerts();
  });
}

// ═══════════════════════════════════════════════
// SOUND ENGINE (Web Audio API — no external files)
