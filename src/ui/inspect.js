// Hover/click inspection: decode and display a star's identity.
//  - lit stars: full settings decoded from their seedKey (seed, star count,
//    resources, mode, fog) + power and engineer count
//  - candidates: seed + the address it would have under the current settings
// Click pins the tooltip so values can be copied; click again to unpin.

import { state } from '../state.js';
import { clusterString, resourceLabel, modeLabel } from '../address.js';
import { nearestEligible } from '../match/matcher.js';

const NO_USED = new Uint8Array(0); // matcher treats missing flags as unused

export function createInspect({ dom, camera, overlay, planePoint }) {
  const tip = document.getElementById('tooltip');
  const d2 = new Float64Array(1);
  let pinned = false;
  let downX = 0, downY = 0;

  function fmtPower(caps) {
    if (caps >= 1e12) return (caps / 1e12).toFixed(2) + ' TW';
    if (caps >= 1e9) return (caps / 1e9).toFixed(2) + ' GW';
    if (caps >= 1e6) return (caps / 1e6).toFixed(2) + ' MW';
    return Math.round(caps).toLocaleString() + ' W';
  }

  function litHtml(oi) {
    const o = state.occupied;
    const d = o.decoded[oi];
    return (
      `<div class="tip-title lit">LIT CLUSTER</div>` +
      `<div class="tip-addr">${d.address}</div>` +
      `<table>` +
      `<tr><td>seed</td><td>${String(d.seed).padStart(8, '0')}</td></tr>` +
      `<tr><td>stars</td><td>${d.starCount}</td></tr>` +
      `<tr><td>resources</td><td>${resourceLabel(d.resourceMultiplier)}</td></tr>` +
      `<tr><td>mode</td><td>${modeLabel(d.mode)}</td></tr>` +
      (d.mode === 'combat' ? `<tr><td>fog</td><td>${d.fogDifficulty.toFixed(1)}</td></tr>` : '') +
      `<tr><td>power</td><td>${fmtPower(o.caps[oi])}</td></tr>` +
      `<tr><td>engineers</td><td>${o.engineers[oi]}</td></tr>` +
      `</table>`
    );
  }

  function candidateHtml(i) {
    const ds = state.dataset;
    const seed = ds.seeds[i];
    return (
      `<div class="tip-title">CANDIDATE SEED</div>` +
      `<div class="tip-addr">${clusterString(seed, state.settings)}</div>` +
      `<table>` +
      `<tr><td>seed</td><td>${String(seed).padStart(8, '0')}</td></tr>` +
      `<tr><td>pos</td><td>${ds.x[i].toFixed(1)}, ${ds.y[i].toFixed(1)}, ${ds.z[i].toFixed(1)}</td></tr>` +
      `</table>` +
      `<div class="tip-note">address assumes the current settings panel</div>`
    );
  }

  function show(html, clientX, clientY) {
    tip.innerHTML = html + (pinned ? '<div class="tip-note">pinned — click to release</div>' : '');
    tip.hidden = false;
    const pad = 14;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = clientX + pad, y = clientY + pad;
    if (x + w > window.innerWidth - 4) x = clientX - w - pad;
    if (y + h > window.innerHeight - 4) y = clientY - h - pad;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }

  function hide() {
    tip.hidden = true;
  }

  // returns the html for whatever is under the cursor, or null
  function probe(e) {
    if (!state.view.inspect) return null;
    const rect = dom.getBoundingClientRect();
    const oi = overlay.pick(state.occupied, camera, rect, e.clientX, e.clientY);
    if (oi >= 0) return litHtml(oi);
    if (state.dataset && state.tool === 'browse') {
      const p = planePoint(e.clientX, e.clientY);
      if (p) {
        const i = nearestEligible(
          state.dataset.grid, state.dataset.x, state.dataset.y, state.dataset.z,
          p.x, p.z, Infinity, NO_USED, d2
        );
        if (i >= 0 && Math.sqrt(d2[0]) < 6) return candidateHtml(i);
      }
    }
    return null;
  }

  dom.addEventListener('pointermove', (e) => {
    if (pinned) return;
    if (!state.view.inspect) { hide(); return; }
    const html = probe(e);
    if (html) show(html, e.clientX, e.clientY);
    else hide();
  });

  dom.addEventListener('pointerdown', (e) => {
    downX = e.clientX;
    downY = e.clientY;
  });
  dom.addEventListener('pointerup', (e) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
    if (e.button !== 0 || state.tool !== 'browse' || !state.view.inspect) return;
    if (pinned) {
      pinned = false;
      hide();
      return;
    }
    const html = probe(e);
    if (html) {
      pinned = true;
      show(html, e.clientX, e.clientY);
    }
  });

  return { hide };
}
