// ==UserScript==
// @name         Dodatki by Papiesz
// @namespace    margonem-zmieniacz-grafik
// @version      2.49.4
// @description  Dodatki by Papiesz – zbiór dodatków do nowego interfejsu Margonem: Zmieniacz grafik przedmiotów i Minutnik respawnów (E2, Heros, Tytan).
// @homepageURL  https://github.com/dyppsykrolem-dev/PapieszHub
// @updateURL    https://raw.githubusercontent.com/dyppsykrolem-dev/PapieszHub/main/dodatki-by-papiesz.user.js
// @downloadURL  https://raw.githubusercontent.com/dyppsykrolem-dev/PapieszHub/main/dodatki-by-papiesz.user.js
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PGNpcmNsZSBjeD0iMzIiIGN5PSIzMiIgcj0iMzAiIGZpbGw9IiNmN2Q0NGMiIHN0cm9rZT0iI2I4OTAxZSIgc3Ryb2tlLXdpZHRoPSIzIi8+PGNpcmNsZSBjeD0iMzIiIGN5PSIzMiIgcj0iMjQiIGZpbGw9IiNmZmY4ZGMiLz48ZyBmaWxsPSIjYjg5MDFlIj48cmVjdCB4PSIyOSIgeT0iOSIgd2lkdGg9IjYiIGhlaWdodD0iMzQiIHJ4PSIxIi8+PHJlY3QgeD0iMjIiIHk9IjE1IiB3aWR0aD0iMjAiIGhlaWdodD0iNSIgcng9IjEiLz48cmVjdCB4PSIxOSIgeT0iMjQiIHdpZHRoPSIyNiIgaGVpZ2h0PSI1IiByeD0iMSIvPjxyZWN0IHg9IjE2IiB5PSIzMyIgd2lkdGg9IjMyIiBoZWlnaHQ9IjUiIHJ4PSIxIi8+PC9nPjx0ZXh0IHg9IjMyIiB5PSI1NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsLHNhbnMtc2VyaWYiIGZvbnQtd2VpZ2h0PSJib2xkIiBmb250LXNpemU9IjEzIiBmaWxsPSIjN2E1YTBhIj4yMTM3PC90ZXh0Pjwvc3ZnPg==
// @match        *://*.margonem.pl/*
// @match        *://*.margonem.com/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      margolab.pl
// @connect      margoworld.pl
// @connect      www.margoworld.pl
// ==/UserScript==

/*
 * Jak używać:
 *   1. Kliknij 🖼 (lewy dolny róg) → „Wybierz przedmiot” → kliknij przedmiot w ekwipunku.
 *   2. Wklej link do obrazka (https://… lub data:image/…), wybierz zakres reguły i kliknij „Zastosuj”.
 *   3. Reguły zapisują się w przeglądarce i działają po odświeżeniu.
 *
 * v1.1 – zmiana sposobu podmiany:
 *   Skrypt znajduje element z ikoną przedmiotu (canvas / obrazek / tło-obrazek wewnątrz przedmiotu),
 *   ukrywa go i wstawia nową grafikę dokładnie w to samo miejsce, w tej samej warstwie.
 *   Ramka przedmiotu (tło samego elementu lub osobne elementy nad ikoną) zostaje nietknięta.
 *
 * Ograniczenia:
 *   - Zmiana jest czysto wizualna i lokalna – inni gracze widzą oryginalną grafikę.
 *   - Podmieniane są przedmioty rysowane jako elementy strony (torba, ekwipunek, sklepy, okna).
 *     Przedmioty leżące na mapie rysuje gra na canvasie – tych skrypt nie zmieni.
 *   - Link musi wskazywać bezpośrednio na obrazek, a serwer obrazka musi pozwalać na jego
 *     wyświetlanie na innych stronach (część hostingów blokuje „hotlinking”).
 */
(function () {
  'use strict';

  const RULES_KEY = 'gi_rules_v1';
  // Nowa instalacja: wszystkie dodatki wyłączone (włączasz je w panelu). Kto już używał skryptu, ma je włączone jak dotąd.
  try {
    if (!localStorage.getItem('gi_init_v1')) {
      const fresh = !Object.keys(localStorage).some(k => k.indexOf('gi_') === 0);
      ['gi_on_v1', 'gi_resp_on_v1', 'gi_drops_on_v1', 'gi_relog_on_v1', 'gi_flame_on_v1'].forEach(k => { if (localStorage.getItem(k) === null) localStorage.setItem(k, fresh ? '0' : '1'); });
      localStorage.setItem('gi_init_v1', '1');
    }
  } catch (e) { /* brak dostępu do localStorage */ }
  const ON_KEY = 'gi_on_v1';
  const SCOPES = { name: 'wszystkie o tej nazwie', icon: 'wszystkie o tej grafice', id: 'tylko ten egzemplarz' };

  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); kids.forEach(k => n.append(k)); return n; };
  const safe = (fn, fb) => { try { const r = fn(); return r === undefined ? fb : r; } catch (e) { return fb; } };
  const log = (...a) => console.log('%c[Zmieniacz grafik]', 'color:#4fc3f7;font-weight:bold', ...a);
  // Przy @grant innym niż „none” skrypt działa w piaskownicy – obiekty gry bierzemy z prawdziwego okna strony.
  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

  // ───────────── Dane / zapis ─────────────
  let rules = [];
  try { rules = JSON.parse(localStorage.getItem(RULES_KEY) || '[]'); if (!Array.isArray(rules)) rules = []; } catch (e) { rules = []; }
  let enabled = localStorage.getItem(ON_KEY) !== '0';
  const RESP_ON_KEY = 'gi_resp_on_v1';
  let respEnabled = (() => { try { return localStorage.getItem(RESP_ON_KEY) !== '0'; } catch (e) { return true; } })();
  let onCbRef = null; // pole wyboru „włączone” w widoku zmieniacza (synchronizowane z przełącznikiem w menu)
  const saveRules = () => { try { localStorage.setItem(RULES_KEY, JSON.stringify(rules)); } catch (e) { setStatus('Nie udało się zapisać (pełna pamięć przeglądarki?).'); } };

  // Tylko zwykłe obrazki: http(s) lub data:image. Żadnych javascript: itp.
  function cleanUrl(s) {
    s = String(s || '').trim();
    try { const u = new URL(s); if (u.protocol === 'https:' || u.protocol === 'http:') return u.href; } catch (e) { /* może data: */ }
    return /^data:image\/(png|gif|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(s) ? s : null;
  }

  // ───────────── Odczyt danych przedmiotu z gry ─────────────
  const ID_RE = /item-id-(\d+)/;
  const itemNodeOf = t => (t && t.closest) ? t.closest('[class*="item-id-"]') : null;
  const idOf = node => { const c = typeof node.className === 'string' ? node.className : ''; const m = ID_RE.exec(c); return m ? m[1] : null; };

  function itemData(id) {
    const it = safe(() => W.Engine.items, null);
    if (!it) return null;
    let r = safe(() => it.getItemById && it.getItemById(id), null);
    if (!r) { const src = it.items || it.allItems || it.itemsData || it.fetchedItems; if (src) r = src[id]; }
    if (!r) {
      const all = safe(() => it.getAllItems && it.getAllItems(), null);
      if (all) r = (Array.isArray(all) ? all : Object.values(all)).find(x => String((x && x.d ? x.d : x).id) === String(id));
    }
    return r ? (r.d || r) : null;
  }

  // ───────────── Znajdowanie ikony wewnątrz przedmiotu ─────────────
  const bgUrlOf = (node, pseudo) => {
    const bg = getComputedStyle(node, pseudo || null).backgroundImage;
    const m = /url\(["']?(.*?)["']?\)/.exec(bg || '');
    return m ? m[1] : '';
  };
  const isOurs = t => (t.id && t.id.startsWith('gi-')) || t.classList.contains('gi-overlay');
  const area = t => { const r = t.getBoundingClientRect(); return r.width * r.height; };

  // Ikona = element z klasą „canvas-icon” / „icon” (tak jest w NI: canvas.icon.canvas-icon).
  // Awaryjnie: największy canvas/img/tło-obrazek, ale z pominięciem elementów, które są
  // ramką, poświatą lub znacznikiem (highlight, notice, frame, overlay, ...).
  const NOT_ICON = /highlight|notice|frame|overlay|border|amount|badge|stack/i;
  const clsOf = t => (typeof t.className === 'string' ? t.className : '');
  function findIcon(node) {
    const kids = [...node.querySelectorAll('*')].filter(t => !isOurs(t) && area(t) > 4);
    const byClass = kids.find(t => /(^|\s)(canvas-icon|icon)(\s|$)/.test(clsOf(t)));
    if (byClass) return byClass;
    const pool = kids.filter(t => !NOT_ICON.test(clsOf(t)) && (t.tagName === 'CANVAS' || t.tagName === 'IMG' || bgUrlOf(t)));
    pool.sort((a, b) => area(b) - area(a));
    return pool[0] || null;
  }

  // Sprzątanie po wersji 1.0: ta ustawiała tło-obrazek inline na elementach przedmiotu
  // (m.in. na poświacie/ramce). Usuwamy tylko style z adresem obrazka z naszych reguł.
  function cleanOldInline() {
    if (!rules.length) return;
    const urls = rules.map(r => r.url);
    document.querySelectorAll('[class*="item-id-"] *').forEach(t => {
      const bg = t.style && t.style.backgroundImage;
      if (bg && urls.some(u => bg.includes(u))) {
        ['background-image', 'background-size', 'background-position', 'background-repeat'].forEach(p => t.style.removeProperty(p));
      }
    });
  }

  function iconKeyOf(node, icon) {
    icon = icon || findIcon(node);
    if (!icon) return bgUrlOf(node) || '';
    if (icon.tagName === 'IMG') return icon.getAttribute('src') || '';
    if (icon.tagName === 'CANVAS') return '';
    return bgUrlOf(icon);
  }

  // ───────────── Podmiana: nakładka w miejscu ikony ─────────────
  const overlays = new Map(); // node -> { img, icon, hid, madeRelative }

  function placeOverlay(st, node, url) {
    const { img, icon } = st;
    if (img.getAttribute('src') !== url) img.setAttribute('src', url);
    if (icon) {
      // ta sama warstwa i ten sam układ, co oryginalna ikona
      if (img.previousSibling !== icon) icon.after(img);
      img.style.cssText =
        `position:absolute;left:${icon.offsetLeft}px;top:${icon.offsetTop}px;` +
        `width:${icon.offsetWidth}px;height:${icon.offsetHeight}px;` +
        'object-fit:contain;pointer-events:none;margin:0;padding:0;border:0;';
      if (!st.hid) { st.prevVis = icon.style.visibility; icon.style.setProperty('visibility', 'hidden', 'important'); st.hid = true; }
    } else {
      // awaryjnie: ikony nie wykryto osobno – mała nakładka z marginesem, by nie przykryć ramki
      if (img.parentNode !== node) node.append(img);
      if (getComputedStyle(node).position === 'static' && !st.madeRelative) { node.style.position = 'relative'; st.madeRelative = true; }
      img.style.cssText = 'position:absolute;left:3px;top:3px;right:3px;bottom:3px;width:calc(100% - 6px);height:calc(100% - 6px);object-fit:contain;pointer-events:none;';
    }
  }

  function removeOverlay(node) {
    const st = overlays.get(node);
    if (!st) return;
    st.img.remove();
    if (st.icon && st.hid) { if (st.prevVis) st.icon.style.visibility = st.prevVis; else st.icon.style.removeProperty('visibility'); }
    if (st.madeRelative) node.style.position = '';
    overlays.delete(node);
  }

  function ruleFor(node, icon) {
    const id = idOf(node);
    const data = id ? itemData(id) : null;
    const key = (data && data.icon) || iconKeyOf(node, icon);
    return rules.find(r =>
      (r.scope === 'id' && id && String(r.key) === String(id)) ||
      (r.scope === 'name' && data && data.name === r.key) ||
      (r.scope === 'icon' && key && (r.key === key || key.endsWith(r.key) || r.key.endsWith(key)))
    ) || null;
  }

  function sweep() {
    cleanOldInline();
    const live = new Set();
    if (enabled && rules.length) {
      document.querySelectorAll('[class*="item-id-"]').forEach(node => {
        if (isOurs(node)) return;
        let st = overlays.get(node);
        // ikonę szukamy od nowa tylko gdy jej nie znamy lub zniknęła z DOM
        let icon = st && st.icon && node.contains(st.icon) ? st.icon : findIcon(node);
        const r = ruleFor(node, st && st.icon ? null : icon);
        if (!r) return;
        if (!st) { st = { img: el('img', { className: 'gi-overlay', draggable: false }), icon: null }; overlays.set(node, st); }
        if (st.icon !== icon) { // ikona się zmieniła – oddaj starą
          if (st.icon && st.hid) st.icon.style.removeProperty('visibility');
          st.hid = false; st.icon = icon;
        }
        placeOverlay(st, node, r.url);
        live.add(node);
      });
    }
    [...overlays.keys()].forEach(node => { if (!live.has(node) || !node.isConnected) removeOverlay(node); });
  }

  // ───────────── Struktura przedmiotu (do diagnostyki) ─────────────
  function describeTree(node, depth, out) {
    const cs = getComputedStyle(node), r = node.getBoundingClientRect();
    const cls = typeof node.className === 'string' && node.className.trim() ? '.' + node.className.trim().split(/\s+/).join('.') : '';
    const bg = bgUrlOf(node);
    out.push('  '.repeat(depth) + node.tagName.toLowerCase() + cls + ` ${Math.round(r.width)}x${Math.round(r.height)}` +
      ` pos=${cs.position} z=${cs.zIndex}` + (bg ? ` bg=${bg.slice(0, 90)}` : '') +
      (node.tagName === 'IMG' ? ` src=${(node.getAttribute('src') || '').slice(0, 90)}` : ''));
    ['::before', '::after'].forEach(p => {
      const pbg = bgUrlOf(node, p);
      if (pbg) out.push('  '.repeat(depth + 1) + p + ` bg=${pbg.slice(0, 90)}`);
    });
    if (depth < 4) [...node.children].forEach(c => { if (!isOurs(c)) describeTree(c, depth + 1, out); });
    return out;
  }

  // ───────────── Wybór przedmiotu ─────────────
  let picking = false, hl = null, sel = null, selNode = null;
  const clearHl = () => { if (hl) { hl.style.outline = ''; hl = null; } };

  function stopPick() {
    picking = false; clearHl();
    if (pickBtn) pickBtn.textContent = '🎯 Wybierz przedmiot';
  }

  ['mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'touchstart', 'touchend'].forEach(ev => document.addEventListener(ev, e => {
    if (!picking) return;
    if (e.target.closest && e.target.closest('#gi-panel, #gi-btn')) return;
    e.preventDefault(); e.stopPropagation();
    if (ev !== 'click') return;
    const node = itemNodeOf(e.target);
    if (!node) { setStatus('To nie wygląda na przedmiot – spróbuj kliknąć wprost na ikonę.'); return; }
    selectItem(node);
    stopPick();
  }, true));

  document.addEventListener('mouseover', e => {
    if (!picking) return;
    clearHl();
    const node = itemNodeOf(e.target);
    if (node) { node.style.outline = '2px dashed #4fc3f7'; hl = node; }
  }, true);

  function selectItem(node) {
    const id = idOf(node);
    const data = id ? itemData(id) : null;
    selNode = node;
    sel = { id, name: data && data.name, icon: (data && data.icon) || iconKeyOf(node) };
    log('wybrano', sel, 'dane z gry:', data);
    selBox.textContent = `Wybrano: ${sel.name || '(nazwa nieznana)'}  [id ${sel.id || '?'}]\nIkona: ${sel.icon || '(nie wykryto)'}`;
    if (!sel.name && scopeSel) scopeSel.value = 'id';
    setStatus('Wklej link do obrazka i kliknij „Zastosuj”.');
  }

  // ───────────── Dodatek: Drop z potworów (dane z margolab.pl) ─────────────
  // Jak to działa: MargoLab nie ma wyszukiwarki po nazwie, ale ma listy potworów (24 na stronę)
  // posortowane rosnąco po poziomie, w kategoriach wg rangi (/monsters, /monsters/heroes, …).
  // Znając poziom i rangę potwora z gry, szukamy jego strony metodą połówkową (kilka zapytań),
  // a potem pobieramy /npcs/{id} i czytamy linki do przedmiotów (/items/{id}).
  const ML = 'https://margolab.pl';
  const CATS = [
    { v: '', t: 'Zwykły', path: '/monsters' },
    { v: 'elite-i', t: 'Elita I', path: '/monsters/elite-i' },
    { v: 'elite-ii', t: 'Elita II', path: '/monsters/elite-ii' },
    { v: 'elite-iii', t: 'Elita III', path: '/monsters/elite-iii' },
    { v: 'heroes', t: 'Heros', path: '/monsters/heroes' },
    { v: 'giants', t: 'Kolos', path: '/monsters/giants' },
    { v: 'titans', t: 'Tytan', path: '/monsters/titans' }
  ];
  const catByWt = wt => wt >= 100 ? 'titans' : wt >= 80 ? 'heroes' : wt >= 30 ? 'elite-iii' : wt >= 20 ? 'elite-ii' : wt >= 1 ? 'elite-i' : '';

  const DROP_KEY = 'gi_drop_v1', DROP_TTL = 7 * 24 * 3600 * 1000;
  let dropCache = {};
  try { dropCache = JSON.parse(localStorage.getItem(DROP_KEY) || '{}') || {}; } catch (e) { dropCache = {}; }
  const saveDropCache = () => { try { localStorage.setItem(DROP_KEY, JSON.stringify(dropCache)); } catch (e) { dropCache = {}; } };

  // GM_xmlhttpRequest omija blokadę CORS (strona margonem.pl → margolab.pl); bez niego próbujemy zwykłego fetch.
  function httpGet(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          method: 'GET', url, timeout: 15000,
          onload: r => (r.status >= 200 && r.status < 300) ? resolve(r.responseText) : reject(new Error('HTTP ' + r.status)),
          onerror: () => reject(new Error('błąd sieci albo brak zgody Tampermonkey na połączenie z tym serwisem')),
          ontimeout: () => reject(new Error('przekroczono czas oczekiwania'))
        });
      } else {
        fetch(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }).then(resolve, reject);
      }
    });
  }

  const normName = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

  // ── Źródło 2: MargoWorld (margoworld.pl) ──
  // Lista: /npc?name=…&minLvl=…&maxLvl=…&wt=&type=1 (type=1 = „Potworki”), wyniki: /npc/view/{id}/{slug}
  // Strona potwora: grupy łupów (/item/view/{id}/{slug}), czas respawnu.
  const MW = 'https://www.margoworld.pl';

  async function mwSearch(name, lvl) {
    const url = `${MW}/npc?name=${encodeURIComponent(name)}&minLvl=${lvl || ''}&maxLvl=${lvl || ''}&wt=&type=1`;
    const doc = new DOMParser().parseFromString(await httpGet(url), 'text/html');
    const items = [], seen = new Set();
    doc.querySelectorAll('a[href*="/npc/view/"]').forEach(a => {
      const m = /\/npc\/view\/(\d+)\/?([^\/?#]*)/.exec(a.getAttribute('href') || '');
      const text = (a.textContent || '').replace(/\s+/g, ' ').trim();
      const lm = /^(.*?)\s*\((\d+)\s*lvl\)/i.exec(text);
      if (!m || !lm || seen.has(m[1])) return;
      seen.add(m[1]);
      const row = a.closest('tr');
      const rt = row ? String(row.textContent || '').toLowerCase() : '';
      const rk = row ? [/tytan/, /kolos/, /heros/, /elita iii/, /elita ii/, /elita/, /zwykł\w*/].map(r => r.exec(rt)).find(Boolean) : null;
      items.push({ exact: normName(lm[1]) === normName(name) && (!lvl || Number(lm[2]) === lvl), id: m[1], name: lm[1].trim(), lvl: Number(lm[2]), rank: rk ? rk[0] : '', url: `${MW}/npc/view/${m[1]}/${m[2]}` });
    });
    const want = normName(name);
    let matches = items.filter(i => normName(i.name) === want && (!lvl || i.lvl === lvl));
    if (!matches.length) matches = items.filter(i => normName(i.name) === want);
    if (!matches.length) matches = items.filter(i => normName(i.name).includes(want) || want.includes(normName(i.name)));
    if (!matches.length && items.length === 1) matches = items;
    return { items, matches };
  }

  function parseMwNpc(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const body = ((doc.body && doc.body.textContent) || '').replace(/\s+/g, ' ');
    let rm = /Czas respawnu\s*:?\s*([\d\shmin:\-–]+?)\s*(?=[A-ZĄĆĘŁŃÓŚŹŻ])/.exec(body);
    if (!rm || !parseDur(rm[1])) rm = /(?:respawn\w*|odradza\w*|odrodz\w*)[^\d]{0,25}((?:\d+\s*(?:h|godz\w*|min\w*|m|sek\w*|s)\b\.?\s*){1,3}|\d{1,2}:\d{2}(?::\d{2})?)/i.exec(body);
    const groups = [], seen = new Set();
    let current = '';
    doc.querySelectorAll('h2,h3,h4,h5,h6,a[href*="/item/view/"]').forEach(n => {
      if (/^H[2-6]$/.test(n.tagName)) { current = (n.textContent || '').replace(/\s+/g, ' ').trim(); return; }
      const m = /\/item\/view\/(\d+)\/?([^\/?#]*)/.exec(n.getAttribute('href') || '');
      if (!m || seen.has(m[1])) return;
      const img = n.querySelector('img');
      const name = ((n.textContent || '').trim() || n.getAttribute('title') || (img && img.alt) || m[2].replace(/-/g, ' ')).replace(/\s+/g, ' ').trim();
      if (!name) return;
      seen.add(m[1]);
      let g = groups.find(x => x.title === current);
      if (!g) { g = { title: current, items: [] }; groups.push(g); }
      g.items.push({ id: m[1], slug: m[2], name });
    });
    const h1 = doc.querySelector('h1');
    const title = h1 ? (h1.textContent || '').replace(/\s*\(\d+\s*lvl\)\s*/i, ' ').replace(/\s+/g, ' ').trim() : '';
    return { title, respawn: rm ? rm[1].trim() : '', groups };
  }

  async function mwNpc(m) {
    const key = 'mw' + m.id, c = dropCache[key];
    if (c && Date.now() - c.t < DROP_TTL) return c.data;
    const data = parseMwNpc(await httpGet(m.url));
    if (data.groups.some(g => g.items.length)) { dropCache[key] = { t: Date.now(), data }; saveDropCache(); }
    return data;
  }


  // ───────────── Dodatek: Respawny potworów ─────────────
  // Skrypt obserwuje elity/herosów/tytanów na mapie, na której jesteś. Gdy potwór zniknie z mapy
  // (i nie wróci przez kilka sekund), uznaje go za zabitego, uruchamia odliczanie i zgaduje zabójcę:
  // gracza (albo Ciebie), który był najbliżej potwora w ostatnich ~90 s. To HEURYSTYKA – gra nie
  // udostępnia dodatkom informacji „kto zabił”, więc przy tłumie przy elicie wynik bywa błędny.
  // Czas respawnu: wcześniej zmierzony przez skrypt → MargoWorld → wpisany ręcznie.
  const RESP_KEY = 'gi_resp_v1', LEARN_KEY = 'gi_resp_learn_v1', RCFG_KEY = 'gi_resp_cfg_v1';
  const readLS = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } };
  const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* pełna pamięć */ } };

  function parseDur(text) {
    const t = String(text || '').toLowerCase();
    let s = 0, hit = false, m;
    if ((m = /(\d+)\s*(?:h|godz)/.exec(t))) { s += Number(m[1]) * 3600; hit = true; }
    if ((m = /(\d+)\s*(?:min|m\b)/.exec(t))) { s += Number(m[1]) * 60; hit = true; }
    if ((m = /(\d+)\s*(?:sek|s\b)/.exec(t))) { s += Number(m[1]); hit = true; }
    if (hit) return s;
    if ((m = /(\d+):(\d{2})(?::(\d{2}))?/.exec(t))) return m[3] ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : Number(m[1]) * 3600 + Number(m[2]) * 60;
    return 0;
  }
  const pad2 = n => String(n).padStart(2, '0');
  const fmtClock = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600); return (h ? h + ':' + pad2(Math.floor(s / 60) % 60) : pad2(Math.floor(s / 60))) + ':' + pad2(s % 60); };
  const fmtDur = s => { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return (h ? h + ' h ' : '') + (m || !h ? m + ' min' : '').trim(); };
  const rankOf = wt => { const c = CATS.find(x => x.v === catByWt(wt)); return c ? c.t : 'Potwór'; };
  const RANK_COLORS = { titans: '#e74c3c', heroes: '#e67e22', 'elite-iii': '#9b59b6', 'elite-ii': '#3498db', 'elite-i': '#2ecc71' };
  const npcType = wt => ({ color: RANK_COLORS[catByWt(wt)] || '#bdc3c7' });
  // Skrót rangi do okna respawnów: [E] [E2] [E3] [H] [T] [K] (z wt albo z nazwy rangi, np. z MargoWorld).
  const RANK_TAG_COLORS = { E: '#8bc34a', E2: '#ff9800', E3: '#ba68c8', H: '#c39bff', T: '#ef5350', K: '#4fc3f7', '☠': '#b0bec5' };
  const TAG_BY_CAT = { titans: 'T', heroes: 'H', 'elite-iii': 'E3', 'elite-ii': 'E2', 'elite-i': 'E' };
  function rankTag(e) {
    if (e.kind === 'death') return '☠';
    const r = String(e.rank || '').toLowerCase();
    if (/kolos/.test(r)) return 'K';
    if (/tytan/.test(r)) return 'T';
    if (/heros/.test(r)) return 'H';
    if (/elita iii/.test(r)) return 'E3';
    if (/elita ii/.test(r)) return 'E2';
    if (/elita/.test(r)) return 'E';
    return TAG_BY_CAT[catByWt(e.wt || 0)] || '';
  }
  const rankColor = tag => RANK_TAG_COLORS[tag] || '#cfd8dc';
  const tidyRank = s => { const t = String(s || '').trim(); return t.charAt(0).toUpperCase() + t.slice(1).replace(/\s(i{1,3})$/i, x => x.toUpperCase()); };

  let respAudio = null;
  function respBeep(freq, dur) {
    try {
      respAudio = respAudio || new (window.AudioContext || window.webkitAudioContext)();
      const o = respAudio.createOscillator(), g = respAudio.createGain();
      o.frequency.value = freq; g.gain.value = 0.08;
      o.connect(g); g.connect(respAudio.destination);
      o.start(); o.stop(respAudio.currentTime + dur);
    } catch (e) { /* brak audio */ }
  }

  // Krótkie dźwięki generowane w przeglądarce (bez plików): przypominajka, że zaczyna się respawn
  const FIRE_SOUNDS = [['none', 'Brak dźwięku'], ['ding', 'Ding (krótki)'], ['chime', 'Dzwoneczki (3 tony w górę)'], ['bell', 'Dzwon'], ['alarm', 'Alarm (dwutonowy)'], ['ping2', 'Podwójny ping'], ['fanfare', 'Fanfara'], ['crackle', 'Trzask palącego się drewna']];
  function playFireSound(kind, vol) {
    if (!kind || kind === 'none') return;
    try {
      respAudio = respAudio || new (window.AudioContext || window.webkitAudioContext)();
      const ctx = respAudio; if (ctx.state === 'suspended') ctx.resume();
      const master = ctx.createGain(); master.gain.value = Math.min(1, Math.max(0.02, Number(vol) || 0.5)) * 0.35; master.connect(ctx.destination);
      const tone = (f, t0, d, type, v) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + t0;
        o.type = type || 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v || 1, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + d + 0.02);
      };
      if (kind === 'ding') tone(988, 0, 0.45, 'sine');
      else if (kind === 'chime') [[659, 0], [784, 0.13], [988, 0.26]].forEach(([f, t]) => tone(f, t, 0.5, 'sine'));
      else if (kind === 'bell') { tone(523, 0, 1.3, 'sine'); tone(1046, 0, 0.9, 'sine', 0.5); tone(1568, 0, 0.6, 'sine', 0.25); }
      else if (kind === 'alarm') [0, 0.22, 0.44, 0.66].forEach((t, i) => tone(i % 2 ? 620 : 880, t, 0.2, 'square', 0.6));
      else if (kind === 'ping2') [0, 0.18].forEach(t => tone(1319, t, 0.16, 'triangle'));
      else if (kind === 'crackle') {
        const sr = ctx.sampleRate, len = Math.floor(sr * 1.3), buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 14; }   // szum „brązowy” = niski szum ognia
        const rum = ctx.createBufferSource(); rum.buffer = buf;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
        const rg = ctx.createGain(); const t0 = ctx.currentTime;
        rg.gain.setValueAtTime(0.0001, t0); rg.gain.exponentialRampToValueAtTime(0.5, t0 + 0.12); rg.gain.setValueAtTime(0.5, t0 + 0.7); rg.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);
        rum.connect(lp); lp.connect(rg); rg.connect(master); rum.start(t0);
        for (let i = 0; i < 16; i++) {                                                                                         // trzaski: krótkie impulsy szumu o losowej głośności i barwie
          const at = t0 + 0.03 + Math.random() * 1.0, dur = 0.004 + Math.random() * 0.02;
          const nb = ctx.createBuffer(1, Math.floor(sr * dur) + 1, sr), nd = nb.getChannelData(0);
          for (let j = 0; j < nd.length; j++) nd[j] = (Math.random() * 2 - 1) * (1 - j / nd.length);
          const src = ctx.createBufferSource(); src.buffer = nb;
          const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200 + Math.random() * 3800; bp.Q.value = 0.8;
          const g = ctx.createGain(); g.gain.value = 0.25 + Math.random() * 0.9;
          src.connect(bp); bp.connect(g); g.connect(master); src.start(at);
        }
      }
      else if (kind === 'fanfare') [[392, 0, 0.18], [523, 0.16, 0.18], [659, 0.32, 0.5]].forEach(([f, t, d]) => tone(f, t, d, 'triangle'));
    } catch (e) { /* brak audio */ }
  }

  // Adres obrazka outfitu: surowa ścieżka z gry + CFG.opath (jeśli jest). Diagnostyka pokazuje, co wyszło.
  function outfitUrl(icon) {
    if (!icon || typeof icon !== 'string') return '';
    if (/^(https?:)?\/\//i.test(icon)) return cleanUrl(icon.startsWith('//') ? 'https:' + icon : icon) || '';
    const base = String(safe(() => W.CFG.a_opath || W.CFG.opath, '') || '');
    try {
      const full = base ? new URL(base.replace(/\/+$/, '') + '/' + icon.replace(/^\/+/, ''), location.origin).href : new URL(icon, location.origin).href;
      return cleanUrl(full) || '';
    } catch (e) { return ''; }
  }
  // Adresy obrazków, które gra faktycznie pobrała (Resource Timing) – najpewniejsze źródło prawdziwej ścieżki.
  const resSeen = [];
  try {
    performance.setResourceTimingBufferSize(5000);
    const add = list => list.forEach(r => { if (/\.(png|gif|jpe?g|webp)(\?|$)/i.test(r.name)) resSeen.push(r.name); });
    add(performance.getEntriesByType('resource'));
    new PerformanceObserver(l => { add(l.getEntries()); if (resSeen.length > 6000) resSeen.splice(0, 2000); }).observe({ type: 'resource', buffered: false });
  } catch (e) { /* brak Resource Timing */ }
  function perfUrl(icon) {
    if (!icon || typeof icon !== 'string') return '';
    const clean = icon.split('?')[0].replace(/^\/+/, '');
    const base = clean.split('/').pop();
    if (!base) return '';
    let hit = '';
    for (let i = resSeen.length - 1; i >= 0; i--) {
      const u = resSeen[i].split('?')[0];
      if (u.endsWith('/' + clean)) return resSeen[i];
      if (!hit && u.endsWith('/' + base)) hit = resSeen[i];
    }
    return hit;
  }
  function outfitUrls(icon) {
    if (!icon || typeof icon !== 'string') return [];
    const pf = perfUrl(icon);
    if (pf) return [pf].concat(outfitUrls0(icon));
    return outfitUrls0(icon);
  }
  function outfitUrls0(icon) {
    if (!icon || typeof icon !== 'string') return [];
    if (/^(https?:)?\/\//i.test(icon)) return [cleanUrl(icon.startsWith('//') ? 'https:' + icon : icon)].filter(Boolean);
    const bases = [safe(() => W.CFG.a_opath, ''), safe(() => W.CFG.opath, ''), '/obrazki/postacie/', ''].filter((x, i, ar) => x !== undefined && ar.indexOf(x) === i);
    const out = [];
    bases.forEach(base => {
      try { const u = cleanUrl(new URL((base ? String(base).replace(/\/+$/, '') + '/' : '') + icon.replace(/^\/+/, ''), location.origin).href); if (u && !out.includes(u)) out.push(u); } catch (e) { /* pomiń */ }
    });
    return out;
  }
  // Grafika potwora (zwykły obrazek, nie arkusz): ścieżka z gry + CFG.npath (jeśli jest)
  function npcUrls(icon) {
    if (!icon || typeof icon !== 'string') return [];
    const pf = perfUrl(icon);
    return (pf ? [pf] : []).concat(npcUrls0(icon));
  }
  function npcUrls0(icon) {
    if (!icon || typeof icon !== 'string') return [];
    if (/^(https?:)?\/\//i.test(icon)) return [cleanUrl(icon.startsWith('//') ? 'https:' + icon : icon)].filter(Boolean);
    const bases = [safe(() => W.CFG.a_npath, ''), safe(() => W.CFG.npath, ''), safe(() => String(W.CFG.opath || '').replace(/\/(?:postacie|outfit\w*|hero\w*)\/?$/i, '/npc/'), ''), '/obrazki/npc/', ''].filter((x, i, ar) => x !== undefined && ar.indexOf(x) === i);
    const out = [];
    bases.forEach(base => {
      try { const u = cleanUrl(new URL((base ? String(base).replace(/\/+$/, '') + '/' : '') + icon.replace(/^\/+/, ''), location.origin).href); if (u && !out.includes(u)) out.push(u); } catch (e) { /* pomiń */ }
    });
    return out;
  }
  function makeNpcPic(icon, tag, bw, bh, onOk) {
    const box = el('div');
    box.style.cssText = `width:${bw}px;height:${bh}px;flex:none;background:#000;border:1px solid #333;border-radius:3px;overflow:hidden;text-align:center;line-height:${bh - 2}px;color:#607d8b;font-size:${Math.round(bh / 2.5)}px;box-sizing:border-box`;
    box.textContent = tag || '?';
    const urls = [].concat(icon).reduce((acc, ic) => acc.concat(npcUrls(ic)), []);
    const tryNext = () => {
      const url = urls.shift();
      if (!url) return;
      const im = new Image();
      im.onload = () => {
        im.style.cssText = 'max-width:100%;max-height:100%;display:block;margin:auto;image-rendering:pixelated';
        box.textContent = ''; box.style.display = 'flex'; box.style.alignItems = 'center'; box.style.justifyContent = 'center'; box.append(im);
        if (onOk) onOk(url);
      };
      im.onerror = tryNext;
      im.src = url;
    };
    tryNext();
    return box;
  }
  // Pierwsza klatka arkusza outfitu (zwykle 4 kolumny × 4 rzędy; mniejsze obrazki traktujemy jako pojedynczą klatkę).
  function makeOutfit(icon, bw, bh, onOk) {
    bw = bw || 36; bh = bh || 48;
    const box = el('div');
    box.style.cssText = `width:${bw}px;height:${bh}px;flex:none;background:#000;border:1px solid #333;border-radius:3px;overflow:hidden;text-align:center;line-height:${bh - 2}px;color:#607d8b;font-size:${Math.round(bh / 3)}px;box-sizing:border-box`;
    const urls = [].concat(icon).reduce((acc, ic) => acc.concat(outfitUrls(ic)), []).filter((u, i, ar) => ar.indexOf(u) === i);
    if (!urls.length) { box.textContent = '?'; return box; }
    const tryNext = () => {
      const url = urls.shift();
      if (!url) { box.textContent = '?'; return; }
      const im = new Image();
      im.onload = () => {
        const cols = im.naturalWidth >= 96 ? 4 : 1, rows = im.naturalHeight >= 140 ? 4 : 1;
        const fw = im.naturalWidth / cols, fh = im.naturalHeight / rows;
        if (!fw || !fh) { tryNext(); return; }
        const s = Math.min((bw - 4) / fw, (bh - 4) / fh);
        const inner = el('div');
        inner.style.cssText = `width:${fw * s}px;height:${fh * s}px;margin:${(bh - 2 - fh * s) / 2}px auto 0;` +
          `background:url("${url.replace(/"/g, '%22')}") 0 0/${im.naturalWidth * s}px ${im.naturalHeight * s}px no-repeat;image-rendering:pixelated`;
        box.textContent = ''; box.style.lineHeight = 'normal'; box.append(inner);
        if (onOk) onOk(url);
      };
      im.onerror = tryNext;
      im.src = url;
    };
    tryNext();
    return box;
  }

  function buildRespView() {
    let entries = readLS(RESP_KEY, []);
    if (!Array.isArray(entries)) entries = [];
    let learn = readLS(LEARN_KEY, {});
    if (!learn || typeof learn !== 'object') learn = {};
    const cfg = Object.assign({ sound: true, desktop: false, warn: 60, deathSec: 60, death: true, fire: true, fireSec: 15, fireSound: 'chime', fireVol: 0.5, fireBlueH: true, autoH: true, alwaysSelf: true, minimal: false, askRelog: false, askSec: 0, swOpener: '', tags: { E2: true, H: true, T: true } }, readLS(RCFG_KEY, {}));
    const STYLE_TAGS = [['E2', 'Elita II'], ['H', 'Heros'], ['T', 'Tytan'], ['E', 'Elita'], ['☠', 'Odrodzenie postaci']];
    const DEF_GLOW = { H: 8 };
    if (!cfg.styles || typeof cfg.styles !== 'object') cfg.styles = {};
    const styleOf = tag => { const x = cfg.styles[tag] || {}; return { c: x.c || RANK_TAG_COLORS[tag] || '#cfd8dc', g: x.g !== undefined ? x.g : (DEF_GLOW[tag] || 0) }; };
    const LINGER = 45; // tyle sekund licznik zostaje na liście po dojściu do 00:00
    const tagOn = t => !!(cfg.tags && cfg.tags[t]);
    entries.forEach(e => { e.watched = false; if (!e.minAt) { e.mmN = 0; e.mmTry = 0; } if (e.minAt && !['H', 'T'].includes(rankTag(e))) { delete e.minAt; delete e.maxAt; e._gs = undefined; } }); // Min/Max tylko dla herosów i tytanów; // po przeładowaniu strony nie obserwowaliśmy ciągłości – nie uczymy się z tych liczników
    const saveE = () => writeLS(RESP_KEY, entries.slice(-80));
    // po przeładowaniu: usuń stare wpisy śmierci i wpisy rang, których już nie śledzimy
    entries = entries.filter(e => e.kind !== 'death' && (!rankTag(e) || tagOn(rankTag(e))));
    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const st = { mapId: null, mapName: '', alive: new Map(), miss: new Map(), near: new Map(), settle: 0, dead: false, deathSyncAt: 0 };
    let lastKillDbg = null;
    const evLog = [];
    const ev = (what, n) => { evLog.push(new Date().toLocaleTimeString() + ' ' + what + ' ' + (n && (n.nick || n.name) || '')); if (evLog.length > 25) evLog.shift(); };

    const lkey = e => normName(e.name) + '|' + normName(e.map);
    const learned = e => { const a = learn[lkey(e)]; return (a && a.length) ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0; };
    const learnAdd = (e, sec) => { const k = lkey(e); learn[k] = (learn[k] || []).concat(sec).slice(-5); writeLS(LEARN_KEY, learn); };
    const remaining = (e, now) => e.respawnSec ? Math.ceil((e.killedAt + e.respawnSec * 1000 - now) / 1000) : Infinity;

    function alertEntry(e, text) {
      e.alerted = true; saveE();
      if (cfg.sound) respBeep(1000, 0.35);
      if (cfg.desktop && 'Notification' in window && Notification.permission === 'granted') { try { new Notification('Margonem – respawn', { body: text }); } catch (err) { /* ignoruj */ } }
      log('respawn:', text);
    }

    // ── obserwacja mapy ──
    function elitesNow() {
      const raw = safe(() => W.Engine.npcs.check(), null);
      if (!raw) return null;
      const m = new Map();
      Object.values(raw).map(n => (n && n.d) ? n.d : n).forEach(n => {
        if (n && n.nick && typeof n.x === 'number' && n.wt >= 1) m.set(n.nick + '|' + (n.lvl || 0), n);
      });
      return m;
    }
    function playersNow() {
      const h = safe(() => W.Engine.hero.d, null);
      const raw = safe(() => W.Engine.others.check(), null) || safe(() => W.Engine.others.list, null) || {};
      const arr = Object.values(raw).map(o => (o && o.d) ? o.d : o)
        .filter(o => o && o.nick && typeof o.x === 'number')
        .map(o => ({ nick: o.nick, x: o.x, y: o.y, lvl: o.lvl, icon: o.icon || o.img || o.outfit || '', self: false }));
      if (h && h.nick && typeof h.x === 'number') arr.push({ nick: h.nick, x: h.x, y: h.y, lvl: h.lvl, icon: h.img || h.icon || h.outfit || '', self: true });
      return arr;
    }

    function pickKiller(key, now) {
      if (cfg.alwaysSelf) { const hh = safe(() => W.Engine.hero.d, null); if (hh && hh.nick) { lastKillDbg = { key, alwaysSelf: true, hero: hh.nick }; return { nick: hh.nick, dist: 0, t: now, icon: hh.img || hh.icon || '', self: true, fallback: true }; } }
      const hist = st.near.get(key);
      const arr = hist ? [...hist.entries()].filter(([, v]) => now - v.t <= 90000).map(([nick, v]) => Object.assign({ nick }, v)) : [];
      // liczy się, kto był przy potworze tuż przed jego zniknięciem (ostatnie ~4 s), a nie ktoś, kto stał obok minutę wcześniej
      const recent = arr.filter(a => now - a.t <= 4500);
      const pool = (recent.length ? recent : arr).slice();
      arr.length = 0; arr.push(...pool);
      arr.sort((a, b) => a.dist - b.dist || b.t - a.t);
      if (!arr.length) { const hh = safe(() => W.Engine.hero.d, null); if (hh && hh.nick) arr.push({ nick: hh.nick, dist: 0, t: now, icon: hh.img || hh.icon || '', self: true, fallback: true }); }
      lastKillDbg = { key, candidates: arr.map(a => ({ nick: a.nick, dist: a.dist, ageSec: Math.round((now - a.t) / 1000), self: a.self, icon: a.icon, iconUrl: outfitUrl(a.icon) })) };
      return arr[0] || null;
    }

    async function enrich(e) {
      e.enrichAt = Date.now();
      try {
        const r = await mwSearch(e.name, e.lvl);
        const m = r.matches[0];
        if (!m) { e.mwNote = `MargoWorld: nie znaleziono „${e.name}” (${r.items.length} wyników)`; saveE(); render(); return; }
        if (m.rank) {
          e.rank = tidyRank(m.rank);
          // MargoWorld wie lepiej niż moje zgadywanie z pola wt: odrzuć rangi, których nie śledzimy
          const tg = /zwykł/i.test(m.rank) ? 'zwykły' : rankTag(e);
          if (m.exact && e.kind !== 'death' && e.wt && !tagOn(tg)) { ev('usunięty: ranga ' + tg + ' wyłączona', e); entries = entries.filter(x => x.id !== e.id); saveE(); render(); return; }
        }
        const d = await mwNpc(m);
        if (!d.respawn) e.mwNote = 'MargoWorld: strona potwora bez czasu respawnu';
        else if (!parseDur(d.respawn)) e.mwNote = 'MargoWorld: nie rozumiem czasu „' + d.respawn + '”';
        else e.mwNote = '';
        if (d.respawn) {
          e.respText = d.respawn;
          if (!e.respawnSec) { const s = parseDur(d.respawn); if (s) { e.respawnSec = s; e.respSrc = 'MargoWorld'; } }
        }
        saveE(); render();
      } catch (err) { e.mwNote = 'MargoWorld: ' + (err && err.message || err); saveE(); render(); log('respawny – MargoWorld:', err); }
    }

    // nowe zabicie = poprzedni licznik tego potwora (już po 00:00) jest nieaktualny
    function dropExpiredSame(name, now) {
      const before = entries.length;
      entries = entries.filter(x => x.kind === 'death' || normName(x.name) !== normName(name) || remaining(x, now) > 0);
      return entries.length !== before;
    }
    function onKill(n, key, now) {
      dropExpiredSame(n.nick, now);
      ev('zabity wt=' + n.wt, n);
      const k = pickKiller(key, now);
      const same = entries.find(e => e.kind !== 'death' && !e.hidden && normName(e.name) === normName(n.nick) && now - e.killedAt < 150000);
      if (same) { // okno gry zdążyło już dodać ten licznik – dopisz tylko zabójcę i dane potwora
        if (k && !(same.killer && same.killer.nick)) same.killer = { nick: k.nick, icon: k.icon || '', self: !!k.self, dist: k.dist };
        same.lvl = n.lvl || same.lvl; same.npcIcon = n.icon || n.img || same.npcIcon; same.map = same.map || st.mapName; same.watched = false;
        saveE(); render(); return;
      }
      const e = {
        id: uid(), name: n.nick, lvl: n.lvl || 0, wt: n.wt || 0, rank: rankOf(n.wt || 0), map: st.mapName,
        killedAt: now, npcIcon: n.icon || n.img || '', respawnSec: 0, respSrc: '', respText: '', watched: true, warned: false, alerted: false,
        killer: k ? { nick: k.nick, icon: k.icon || '', self: !!k.self, dist: k.dist } : null
      };
      const l = learned(e);
      if (l) { e.respawnSec = l; e.respSrc = 'zmierzony'; }
      entries.push(e); saveE(); render();
      enrich(e);
    }

    function onAppear(n, now) {
      let changed = false;
      entries = entries.filter(e => {
        if (e.kind === 'death' || normName(e.name) !== normName(n.nick)) return true;
        if (e.lvl && n.lvl && e.lvl !== n.lvl) return true;
        if (e.map && st.mapName && e.map !== st.mapName) return true;
        changed = true;
        const age = now - e.killedAt;
        if (age < 90000) { ev('wrócił <90 s – fałszywy alarm', n); return false; }                              // fałszywy alarm (np. potwór chwilowo zniknął w walce)
        if (e.watched) learnAdd(e, Math.round(age / 1000));         // zmierzony czas respawnu (tylko przy ciągłej obserwacji)
        if (!e.alerted) alertEntry(e, `${e.name} odrodził się (${e.map})!`);
        return false;
      });
      if (changed) { saveE(); render(); }
    }

    // ── śmierć własnej postaci: odliczanie do odrodzenia (wykrywanie „na ślepo”, bo nie znam pól NI – patrz Diagnostyka) ──
    function readDeathState() {
      const E = safe(() => W.Engine, null) || {};
      const h = safe(() => E.hero.d, null) || {};
      let dead = false;
      if (E.dead === true || E.hero && E.hero.dead === true || h.dead === true) dead = true;
      const hp = [h.hp, safe(() => h.warrior_stats.hp, undefined)].find(v => typeof v === 'number');
      if (hp !== undefined && hp <= 0) dead = true;
      // czas z wbudowanego okienka/odliczania (jeśli jest w DOM): szukamy mm:ss lub hh:mm:ss w elementach o „śmiertelnych” klasach
      let sec = 0;
      const nodes = document.querySelectorAll('[class*="dead" i],[class*="death" i],[class*="revive" i],[class*="respawn" i],[class*="resurrect" i],[id*="dead" i],[id*="death" i],[id*="revive" i]');
      for (const n of nodes) {
        if (n.closest('#gi-resp-win,#gi-panel,.elite-timer-wnd,.elite-time')) continue;
        if (n.offsetParent === null && getComputedStyle(n).position !== 'fixed') continue;
        const mt = (n.innerText || '').match(/(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?!\d)/);
        if (mt) { sec = (Number(mt[1] || 0)) * 3600 + Number(mt[2]) * 60 + Number(mt[3]); dead = true; break; }
        if (n.offsetParent !== null && /martw|zgin|odrodz|wskrzes/i.test(n.innerText || '')) dead = true;
      }
      return { dead, sec, hp, domHits: nodes.length };
    }
    let deathDbg = null;
    function checkDeath() {
      if (cfg.death === false) return;
      const h = safe(() => W.Engine.hero.d, null);
      if (!h || !h.nick) return;
      const now = Date.now();
      const s = readDeathState();
      deathDbg = { at: new Date(now).toISOString(), state: s, heroKeys: Object.keys(h).slice(0, 60) };
      const cur = entries.find(e => e.kind === 'death' && !e.ended);
      if (s.dead && !cur) {
        const sec = s.sec || cfg.deathSec || 60;
        entries.push({
          id: uid(), kind: 'death', name: h.nick, lvl: h.lvl || 0, wt: 0, rank: '', map: st.mapName || safe(() => W.Engine.map.d.name, ''),
          killedAt: now, respawnSec: sec, respSrc: s.sec ? 'zegar gry' : 'domyślny', respText: '', watched: false, warned: true, alerted: true,
          killer: { nick: h.nick, icon: h.img || h.icon || h.outfit || '', self: true, dist: 0 }
        });
        st.dead = true; st.deathSyncAt = now; saveE(); render();
      } else if (s.dead && cur) {
        if (s.sec) { // dostrój do zegara gry (może się różnić o sekundę)
          const want = Math.round((now - cur.killedAt) / 1000) + s.sec;
          if (Math.abs(want - cur.respawnSec) > 1) { cur.respawnSec = want; cur.respSrc = 'zegar gry'; saveE(); }
        }
      } else if (!s.dead && cur) { // postać wstała wcześniej niż przewidywaliśmy (np. wskrzeszenie) – licznik kończy się teraz
        cur.ended = true;
        const el0 = Math.round((now - cur.killedAt) / 1000);
        if (remaining(cur, now) > 0) cur.respawnSec = Math.max(1, el0);
        saveE(); render();
      }
      st.dead = s.dead;
    }

    // ── odczyt wbudowanego minutnika gry (DOM): szukamy krótkiego tekstu z nazwą potwora i czasem ──
    const TIMER_SEL = '[class*="timer" i],[class*="respawn" i],[class*="countdown" i],[class*="cooldown" i],[class*="boss" i],[class*="spawn" i],[id*="timer" i],[id*="respawn" i],[id*="boss" i]';
    const TIME_RE = /(?:(\d{1,3}):)?(\d{1,2}):(\d{2})(?!\d)/;
    function bgUrl(n) {
      const m = /url\(["']?([^"')]+)["']?\)/.exec(getComputedStyle(n).backgroundImage || '');
      return m ? m[1] : '';
    }
    // Okno „Minutnik” wbudowane w grę (.elite-timer-wnd): wiersze „[E2] Nazwa 00:02:43”. To najpewniejsze źródło czasu.
    const TAG_RANK = { E: 'Elita', E2: 'Elita II', E3: 'Elita III', H: 'Heros', T: 'Tytan', K: 'Kolos' };
    const TAG_WT = { E: 5, E2: 25, E3: 35, H: 85, T: 100, K: 120 };
    function readGameTimerRows() {
      const wnd = document.querySelector('.elite-timer-wnd');
      if (!wnd) return null;
      const rowRe = /^(?:\[([A-Z0-9]{1,3})\]\s*)?(.+?)\s+(?:(\d{1,3}):)?(\d{1,2}):(\d{2})$/;
      const hits = [];
      wnd.querySelectorAll('*').forEach(n => {
        const t = (n.innerText || n.textContent || '').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 90 || (t.match(/\d{1,2}:\d{2}/g) || []).length !== 1) return;
        const m = rowRe.exec(t);
        if (m) hits.push({ n, tag: m[1] || '', name: m[2].trim(), sec: Number(m[3] || 0) * 3600 + Number(m[4]) * 60 + Number(m[5]) });
      });
      // zostaw najgłębsze elementy (bez zagnieżdżonych trafień)
      const rows = hits.filter(h => !hits.some(o => o !== h && h.n.contains(o.n)));
      rows.forEach(r => {
        r.img = '';
        for (const c of [r.n, ...r.n.querySelectorAll('*'), r.n.parentElement]) {
          if (!c) continue;
          if (c.tagName === 'IMG' && c.src) { r.img = c.src; break; }
          const bg = bgUrl(c); if (bg && /\/npc\//i.test(bg)) { r.img = bg; break; }
        }
      });
      return rows;
    }
    // nazwa → ikona potwora: pamięć (zapisywana między sesjami) + przeszukanie szablonów NPC w silniku gry
    const ICON_KEY = 'gi_npcicon_v1';
    let iconCache = readLS(ICON_KEY, {});
    if (!iconCache || typeof iconCache !== 'object') iconCache = {};
    let iconCacheDirty = false;
    function rememberIcons(list) {
      list.forEach(n => {
        const ic = n && (n.icon || n.img);
        if (n && n.nick && typeof ic === 'string' && ic && iconCache[normName(n.nick)] !== ic) { iconCache[normName(n.nick)] = ic; iconCacheDirty = true; }
      });
      if (iconCacheDirty) { const k = Object.keys(iconCache); if (k.length > 1500) k.slice(0, 300).forEach(x => delete iconCache[x]); writeLS(ICON_KEY, iconCache); iconCacheDirty = false; }
    }
    function searchEngineIcon(name) {
      const want = normName(name);
      const roots = ['npcTplManager', 'npcIconManager', 'npcs', 'fakeNpcs'].map(k => safe(() => W.Engine[k], null)).filter(Boolean);
      const seen = new Set(); let budget = 6000;
      const walk = (o, depth) => {
        if (!o || typeof o !== 'object' || seen.has(o) || budget-- <= 0 || depth > 4) return '';
        seen.add(o);
        const nm = o.nick || o.name;
        const ic = o.icon || o.img;
        if (typeof nm === 'string' && typeof ic === 'string' && ic && /\.(gif|png)$/i.test(ic) && normName(nm) === want) return ic;
        for (const k of Object.keys(o)) { let v; try { v = o[k]; } catch (e) { continue; } if (v && typeof v === 'object') { const r = walk(v, depth + 1); if (r) return r; } }
        return '';
      };
      for (const r of roots) { const x = walk(r, 0); if (x) return x; }
      return '';
    }
    function rememberFromNpcs() {
      const raw = safe(() => W.Engine.npcs.check(), null);
      if (raw) rememberIcons(Object.values(raw).map(x => (x && x.d) ? x.d : x).filter(Boolean));
    }
    function npcIconByName(name) {
      rememberFromNpcs();
      const c = iconCache[normName(name)];
      if (c) return c;
      const f = searchEngineIcon(name);
      if (f) { iconCache[normName(name)] = f; writeLS(ICON_KEY, iconCache); }
      return f;
    }
    let gameRowsDbg = null;
    // Okno gry pokazuje w dymku wiersza „Min: … Max: …” (od min. czasu heros MOŻE się pojawić, po max MUSI). Czytamy to raz na potwora.
    let mmBusy = false, lastMM = null;
    const MM_RE = /(\d{1,2})\.(\d{1,2})\.(\d{4}),?\s+(\d{1,2}):(\d{2}):(\d{2})/;
    const mmTime = x => { const m = MM_RE.exec(x || ''); return m ? new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]).getTime() : 0; };
    function applyMM(e, t) {
      const mi = /Min:\s*([^M]*)/.exec(t), ma = /Max:\s*(.*)/.exec(t);
      const a = mi ? mmTime(mi[1]) : 0, b = ma ? mmTime(ma[1]) : 0;
      if (!(a && b && b >= a)) return false;
      e.minAt = a; e.maxAt = b; e.respawnSec = (a - e.killedAt) / 1000; e.respSrc = 'zegar gry'; e.alerted = false; e.warned = false; saveE(); render(); updateTimers();
      ev('odczytano min/max respawnu', { name: e.name, min: new Date(a).toLocaleTimeString(), max: new Date(b).toLocaleTimeString() });
      return true;
    }
    // Treść dymka każdego elementu z atrybutem tip-id gra trzyma w TIPS.allTips[id] – odczyt bez najeżdżania.
    function tipTextOf(node) {
      const cands = [node, node.closest('[tip-id]'), ...node.querySelectorAll('[tip-id]'), node.parentElement && node.parentElement.closest('[tip-id]')].filter(Boolean);
      for (const c of cands) {
        const id = c.getAttribute && c.getAttribute('tip-id');
        if (!id) continue;
        let v = safe(() => W.TIPS.allTips[id], null);
        if (typeof v === 'function') v = safe(() => v(), null);
        if (v && typeof v === 'object' && v.textContent === undefined) v = JSON.stringify(v);
        if (v) { try { const d = new DOMParser().parseFromString('<div>' + (typeof v === 'string' ? v : v.outerHTML || '') + '</div>', 'text/html'); return { id, text: d.body.textContent || '' }; } catch (err) { return { id, text: String(v) }; } }
      }
      return { id: null, text: '' };
    }
    function allTipsEntries() { const T = safe(() => W.TIPS.allTips, null); return T && typeof T === 'object' ? Object.keys(T).map(k => [k, safe(() => T[k], null)]) : []; }
    function htmlText(v) { if (typeof v === 'function') v = safe(() => v(), null); if (!v) return ''; if (typeof v !== 'string') v = v.outerHTML || JSON.stringify(v); try { return new DOMParser().parseFromString('<div>' + v + '</div>', 'text/html').body.textContent || ''; } catch (err) { return String(v); } }
    function searchAllTips(name) {
      const want = normName(name); let best = null;
      for (const [k, v] of allTipsEntries()) { const t = htmlText(v); if (/Min:/.test(t) && MM_RE.test(t) && normName(t).includes(want)) best = { id: k, text: t, viaSearch: true }; }
      return best;
    }
    function readMinMax(e, node) {
      if (!node || !node.isConnected) return;
      let direct = tipTextOf(node);
      if (!MM_RE.test(direct.text)) { // zapas: poszukaj w TIPS.allTips dymka, który zawiera nazwę potwora i „Min:”
        const found = searchAllTips(e.name);
        if (found) direct = found;
      }
      lastMM = { name: e.name, nodeCls: String(node.className).slice(0, 60), tipId: direct.id, directText: direct.text.replace(/\s+/g, ' ').slice(0, 200), tipsKeys: safe(() => Object.keys(W.TIPS.allTips).length, null) };
      if (direct.text && applyMM(e, direct.text)) { lastMM.ok = 'direct'; return; }
      if (mmBusy) return;
      mmBusy = true;
      const added = [];
      const mo = new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) added.push(n); })));
      mo.observe(document.body, { childList: true, subtree: true });
      const r = node.getBoundingClientRect();
      const fire = (T, t) => node.dispatchEvent(new T(t, { bubbles: true, cancelable: true, clientX: r.left + 4, clientY: r.top + 4 }));
      ['pointerover', 'pointerenter'].forEach(t => fire(PointerEvent, t)); ['mouseover', 'mouseenter', 'mousemove'].forEach(t => fire(MouseEvent, t));
      try { const jq = W.jQuery || W.$; if (typeof jq === 'function') jq(node).trigger('mouseenter').trigger('mouseover').trigger('mousemove'); } catch (err) { /* brak jQuery */ }
      setTimeout(() => {
        try {
          mo.disconnect();
          const re = /(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/;
          const tm = x => { const m = re.exec(x); return m ? new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]).getTime() : 0; };
          const texts = [...added, ...document.querySelectorAll('[class*="tip" i]')].filter(n => !n.closest('.gi-float,#gi-panel')).map(n => n.textContent || '');
          const t = texts.find(x => /Min:/.test(x) && /Max:/.test(x) && normName(x).includes(normName(e.name)));
          lastMM.hoverFound = !!t; lastMM.addedCls = added.slice(0, 6).map(n => String(n.className).slice(0, 40));
          if (t && applyMM(e, t)) lastMM.ok = 'hover';
        } catch (err) { /* brak dymka */ }
        ['mouseout', 'mouseleave'].forEach(t => fire(MouseEvent, t)); ['pointerout', 'pointerleave'].forEach(t => fire(PointerEvent, t));
        mmBusy = false;
      }, 450);
    }
    let gameOpen = false;
    const DISM_KEY = 'gi_resp_dismissed_v1';
    const dismissed = new Map(Object.entries(readLS(DISM_KEY, {}) || {}).filter(([, v]) => v && Date.now() - v.at < 12 * 3600 * 1000)); // pamiętane także po odświeżeniu strony
    const saveDism = () => writeLS(DISM_KEY, Object.fromEntries(dismissed));
    // usunięte ręcznie: nie dodawaj ich ponownie z okna gry, dopóki ten sam wiersz tam wisi (nowe zabicie = wyższy czas)
    function syncFromGame() {
      rememberFromNpcs();
      const rows = readGameTimerRows();
      gameOpen = !!rows;
      try { gameHint.style.display = gameOpen ? 'none' : ''; } catch (e) { /* widok jeszcze nie zbudowany */ }
      gameRowsDbg = rows && rows.map(r => ({ tag: r.tag, name: r.name, sec: r.sec, img: r.img }));
      const now = Date.now();
      let ch = false;
      entries.forEach(e => { const ic = e.npcIcon; if (ic && e.name && iconCache[normName(e.name)] !== ic) { iconCache[normName(e.name)] = ic; iconCacheDirty = true; } });
      if (iconCacheDirty) { writeLS(ICON_KEY, iconCache); iconCacheDirty = false; }
      entries.forEach(e => { if (!e.hidden && e.kind !== 'death' && !e.npcIcon && now - (e.iconTry || 0) > 15000) { e.iconTry = now; const ic = npcIconByName(e.name); if (ic) { e.npcIcon = ic; ch = true; } } });
      if (!rows) { if (ch) { saveE(); render(); } return; }
      const seenNames = new Set(rows.map(r => normName(r.name)));
      if (rows.length) { let dch = false; dismissed.forEach((v, k) => { if (seenNames.has(k)) v.miss = 0; else { v.miss = (v.miss || 0) + 1; if (v.miss > 40) { dismissed.delete(k); dch = true; } } }); if (dch) saveDism(); }
      // wiersz zniknął z okna gry (usunięty tam ręcznie) – usuń też u nas (tylko gdy okno gry jest otwarte i do respawnu zostało sporo czasu)
      entries.forEach(e => {
        if (e.kind === 'death' || e.hidden || !e.respSrc || e.respSrc !== 'zegar gry') { e._gm = 0; return; }
        if (seenNames.has(normName(e.name))) { e._gm = 0; return; }
        e._gm = (e._gm || 0) + 1;
        if (e._gm > 15 && remaining(e, now) > 8 && now - e.killedAt > 4000) { entries = entries.filter(x => x.id !== e.id); ch = true; ev('usunięty: zniknął z okna gry', e); }
      });
      rows.forEach(r => {
        if (r.sec <= 0 || !r.tag || !tagOn(r.tag)) return;
        const dm = dismissed.get(normName(r.name));
        if (dm) { const ref = (dm.sec == null || dm.sec < 0) ? 1e9 : dm.sec; if (r.sec > ref + 3) { dismissed.delete(normName(r.name)); saveDism(); } else { if (dm.sec == null || dm.sec < 0 || r.sec < dm.sec) { dm.sec = r.sec; saveDism(); } return; } }
        const e = entries.find(x => x.kind !== 'death' && !x.hidden && normName(x.name) === normName(r.name) && (remaining(x, now) > 0 || (x.maxAt && now < x.maxAt)));
        if (e) {
          if (e.respSrc === 'ręczny') return;
          // Synchronizacja fazy z zegarem gry: gdy liczba sekund w oknie gry zmieni się (np. 42 → 41), przestawiamy nasz koniec
          // odliczania tak, aby nasz licznik zmienił się w tej samej chwili (a nie z opóźnieniem do 1 s).
          if ((r.tag === 'H' || r.tag === 'T') && !e.minAt && (e.mmN || 0) < 4 && now - (e.mmTry || 0) > 15000) { e.mmTry = now; e.mmN = (e.mmN || 0) + 1; readMinMax(e, r.n); }
          if (!e.minAt && e._gs !== r.sec) {
            const nrs = (now + r.sec * 1000 - e.killedAt) / 1000;
            const big = Math.abs(nrs - (e.respawnSec || 0)) > 2 || e.respSrc !== 'zegar gry';
            e.respawnSec = nrs; e._gs = r.sec; e.respSrc = 'zegar gry';
            if (big) { e.warned = false; e.alerted = false; ch = true; }
          }
          if (!e.npcImg && r.img) { e.npcImg = r.img; ch = true; }
          if (!e.npcIcon) { const ic = npcIconByName(e.name); if (ic) { e.npcIcon = ic; ch = true; } }
          if (e.respSrc === 'zegar gry' && !e.learnedFromGame) { e.learnedFromGame = true; }
          return;
        }
        // nowy licznik z okna gry (potwór ubity przez kogoś / w innym miejscu / jeszcze niewykryty przez skrypt)
        dropExpiredSame(r.name, now);
        // jeśli potwór jest na naszej mapie (właśnie zniknął), zgadnij zabójcę od razu
        let kk = null;
        st.alive.forEach((nn, key) => { if (!kk && normName(nn.nick) === normName(r.name)) kk = pickKiller(key, now); });
        entries.push({
          id: uid(), name: r.name, lvl: 0, wt: TAG_WT[r.tag] || 0, rank: TAG_RANK[r.tag] || '', map: '',
          killedAt: now, respawnSec: r.sec, respSrc: 'zegar gry', respText: '', watched: false, warned: false, alerted: false,
          npcIcon: npcIconByName(r.name), npcImg: r.img, npcOk: (entries.find(x => normName(x.name) === normName(r.name) && x.npcOk) || {}).npcOk || '', fromGame: true, killer: kk ? { nick: kk.nick, icon: kk.icon || '', self: !!kk.self, dist: kk.dist } : null
        });
        ev('dodany z okna gry', r);
        ch = true;
      });
      if (ch) { saveE(); render(); }
    }

    function tick() {
      try { syncFromGame(); } catch (err) { log('zegar gry:', err); }
      try { checkDeath(); } catch (err) { log('śmierć:', err); }
      const m = safe(() => W.Engine.map.d, null), h = safe(() => W.Engine.hero.d, null);
      const skipWhy = !m ? 'brak mapy' : !h ? 'brak postaci' : typeof h.x !== 'number' ? 'postać bez pozycji (walka?)' : '';
      if (skipWhy) { if (st.skipWhy !== skipWhy) ev('pomijam odczyt: ' + skipWhy); st.skipWhy = skipWhy; return; }
      const cur = elitesNow();
      if (!cur) { if (st.skipWhy !== 'npcs') ev('Engine.npcs niedostępne (walka?)'); st.skipWhy = 'npcs'; return; }
      st.skipWhy = '';
      const now = Date.now();
      if (st.mapId !== m.id) { // nowa mapa: zaczynamy od zera, kilka sekund nie wykrywamy zabójstw
        let changed = false;
        entries.forEach(e => { if (e.map === st.mapName && e.watched) { e.watched = false; changed = true; } });
        if (changed) saveE();
        st.mapId = m.id; st.mapName = m.name; st.alive = new Map(); st.miss = new Map(); st.near = new Map(); st.settle = now + 2000;
      }
      cur.forEach((n, key) => { if (!st.alive.has(key)) onAppear(n, now); st.miss.delete(key); st.alive.set(key, n); });
      st.alive.forEach((n, key) => {
        if (cur.has(key)) return;
        if (now < st.settle) { st.alive.delete(key); ev('zniknął w czasie ustawiania mapy (pominięty)', n); return; }
        const c = (st.miss.get(key) || 0) + 1;
        if (c >= 3) { st.alive.delete(key); st.miss.delete(key); onKill(n, key, now); } else st.miss.set(key, c);
      });
      // historia graczy w pobliżu żywych elit (do zgadywania zabójcy)
      const pl = playersNow();
      cur.forEach((n, key) => {
        let hist = st.near.get(key);
        pl.forEach(p => {
          const d = Math.max(Math.abs(p.x - n.x), Math.abs(p.y - n.y));
          if (d > 14) return;
          if (!hist) { hist = new Map(); st.near.set(key, hist); }
          hist.set(p.nick, { t: now, dist: d, icon: p.icon, self: p.self });
        });
        if (hist) hist.forEach((v, nick) => { if (now - v.t > 90000) hist.delete(nick); });
      });
    }

    const SND_KEY = 'gi_resp_snd_v1';
    const sndDone = (() => { const o = readLS(SND_KEY, {}) || {}, out = {}; Object.keys(o).forEach(k => { if (Date.now() - o[k] < 6 * 3600 * 1000) out[k] = o[k]; }); return out; })();
    const saveSnd = () => writeLS(SND_KEY, sndDone);
    function checkTimers() {
      const now = Date.now();
      // 45 s po 00:00 wiersz znika (potwory zostają ukryte do 30 min, żeby dało się jeszcze zmierzyć czas respawnu)
      const before = entries.length;
      let hid = false;
      entries = entries.filter(e => {
        const rem = remaining(e, now);
        if (rem === Infinity) return true;
        if (e.kind === 'death') return rem > -LINGER;
        if (e.maxAt && now < e.maxAt) return true; // okno respawnu jeszcze trwa
        if (rem <= -1800) return false;
        if (rem <= -LINGER && !e.hidden) { e.hidden = true; hid = true; }
        return true;
      });
      if (hid || entries.length !== before) { saveE(); render(); }
      entries.forEach(e => { if (!e.respawnSec && !e.hidden && e.kind !== 'death' && now - (e.enrichAt || 0) > 120000) enrich(e); });
      entries.forEach(e => {
        const rem = remaining(e, now);
        if (rem === Infinity || e.hidden) return;
        // dźwięk przy zapaleniu się ognia (ostatnie sekundy przed respawnem)
        if (cfg.fire && cfg.fireSound && cfg.fireSound !== 'none' && e.kind !== 'death') {
          if (rem <= (cfg.fireSec || 15) && rem > -3) {
            // jeden dźwięk na jeden respawn: pamiętamy (w localStorage) docelową godzinę, więc odświeżenie strony, zmiana mapy ani przelogowanie go nie powtórzą
            const target = now + rem * 1000, nk = normName(e.name);
            const prev = sndDone[nk];
            if (!e.fireSnd && !(prev && Math.abs(prev - target) < 150000)) { sndDone[nk] = target; saveSnd(); playFireSound(cfg.fireSound, cfg.fireVol); }
            e.fireSnd = true;
          }
        }
        if (cfg.askRelog && e.kind !== 'death' && rankTag(e) === 'E2' && rem <= (cfg.fireSec || 15) && rem > -300 && e.askFor !== e.killedAt) {
          // „wykonane” zaznaczamy dopiero po pokazaniu okienka – jeśli teraz nie ma sensu (ta sama postać / nieznany zabójca), spróbujemy ponownie w kolejnych sekundach
          const shown = showAsk(e);
          if (shown) { e.askFor = e.killedAt; saveE(); }
        }
        if (rem <= 0 && !e.alerted) alertEntry(e, `${e.name} (${e.map}) powinien się już odrodzić.`);
        else if (rem > 0 && cfg.warn > 0 && rem <= cfg.warn && !e.warned) {
          e.warned = true; saveE();
          if (cfg.sound) respBeep(700, 0.2);
        }
      });
    }

    // ── przełączanie na postać (dwuklik w wiersz): szukamy w oknie gry klikalnego wpisu z nickiem postaci ──
    const toastEl = el('div', { className: 'gi-rtoast' });
    let toastT = 0;
    const toast = msg => { toastEl.textContent = msg; clearTimeout(toastT); toastT = setTimeout(() => { toastEl.textContent = ''; }, 6000); };
    function findCharNodes(nick) {
      const want = normName(nick), out = [];
      document.querySelectorAll('body *').forEach(n => {
        if (n.closest('#gi-resp-win,#gi-panel,.gi-float') || n.children.length > 3) return;
        const t = normName(n.textContent);
        const ti = normName(n.getAttribute && (n.getAttribute('title') || n.getAttribute('data-nick') || n.getAttribute('data-name')));
        if ((t === want || ti === want || (t.includes(want) && t.length <= want.length + 25)) && (n.offsetParent !== null || getComputedStyle(n).position === 'fixed')) out.push(n);
      });
      return out.filter(n => !out.some(o => o !== n && n.contains(o))); // najgłębsze elementy
    }
    // miniatury postaci (np. pasek z outfitami z innego dodatku) – rozpoznajemy po pliku outfitu
    function findByIcon(icon) {
      const base = String(icon || '').split('?')[0].split('/').pop();
      if (!base) return [];
      const out = [];
      document.querySelectorAll('img,canvas,div,span,li,a,button').forEach(n => {
        if (n.closest('#gi-resp-win,#gi-panel,.gi-float')) return;
        const r = n.getBoundingClientRect();
        if (r.width < 8 || r.height < 8 || r.width > 400 || r.height > 400) return;
        let hit = false;
        if (n.tagName === 'IMG') hit = (n.currentSrc || n.src || '').split('?')[0].endsWith('/' + base) || (n.getAttribute('src') || '').split('?')[0].endsWith(base);
        else { const bg = getComputedStyle(n).backgroundImage || ''; hit = bg !== 'none' && bg.includes(base); }
        if (hit) out.push(n);
      });
      return out.filter(n => !out.some(o => o !== n && n.contains(o)));
    }
    function findByText(re) {
      return [...document.querySelectorAll('button,a,div,span,li')].filter(n => !n.closest('#gi-resp-win,#gi-panel,.gi-float') && n.children.length <= 2 && re.test((n.textContent || '').trim()) && (n.textContent || '').trim().length < 40 && n.offsetParent !== null);
    }
    const clickTarget = n => n.closest('[class*="char" i],[class*="account" i],[class*="login" i],[class*="select" i],a,button') || n;
    const findChar = (nick, icon) => { const a = findCharNodes(nick); return a.length ? a : findByIcon(icon); };
    // okienko „Respi … – przelogować?” (przelogowanie dopiero po kliknięciu)
    const askDbg = {};
    function showAsk(e, test) {
      let host = document.getElementById('gi-ask');
      if (!host) {
        host = el('div', { id: 'gi-ask', title: 'Przeciągnij, aby przesunąć' });
        document.body.append(host);
        const pos = readLS('gi_ask_pos_v1', null);
        const put = (x, y) => { x = Math.min(Math.max(0, x), window.innerWidth - 60); y = Math.min(Math.max(0, y), window.innerHeight - 40); host.style.left = x + 'px'; host.style.top = y + 'px'; host.style.transform = 'none'; return { x, y }; };
        if (pos && typeof pos.x === 'number') put(pos.x, pos.y);
        let dg = null;
        host.addEventListener('pointerdown', ev => { if (ev.button !== 0 || ev.target.closest('button')) return; const r = host.getBoundingClientRect(); dg = { dx: ev.clientX - r.left, dy: ev.clientY - r.top, id: ev.pointerId }; try { host.setPointerCapture(ev.pointerId); } catch (err) { /* brak */ } ev.preventDefault(); });
        host.addEventListener('pointermove', ev => { if (!dg || ev.pointerId !== dg.id) return; dg.pos = put(ev.clientX - dg.dx, ev.clientY - dg.dy); });
        const endDg = () => { if (dg && dg.pos) writeLS('gi_ask_pos_v1', dg.pos); dg = null; };
        host.addEventListener('pointerup', endDg); host.addEventListener('pointercancel', endDg);
      }
      const me = safe(() => W.Engine.hero.d.nick, '');
      const k = e.killer && e.killer.self && e.killer.nick ? e.killer.nick : '';
      const canSw = !!k && normName(k) !== normName(me);
      askDbg[normName(e.name)] = { at: new Date().toLocaleTimeString(), killer: k || (e.killer ? e.killer.nick + ' (nie Twoja)' : 'brak'), hero: me, wynik: canSw ? 'pokazane' : (k ? 'ta sama postać – pomijam' : 'nieznany zabójca – pomijam') };
      if (!canSw && !test) return false; // już na właściwej postaci albo nie wiadomo, kto zabił – bez komunikatu
      const tag = rankTag(e);
      const card = el('div', { className: 'gi-askc' });
      const close = () => { clearTimeout(tm); card.remove(); };
      const tm = setTimeout(close, 90000);
      const btns = el('div', { className: 'gi-askb' });
      if (canSw) {
        const go = el('button', { textContent: 'Przeloguj na ' + k });
        go.addEventListener('click', () => { close(); switchToCharacter(k, e.killer.icon); });
        btns.append(go);
      }
      const no = el('button', { textContent: canSw ? 'Nie' : 'OK' });
      no.addEventListener('click', close);
      btns.append(no);
      card.append(
        el('div', { className: 'gi-askt', textContent: `Respi ${tag ? '[' + tag + '] ' : ''}${e.name}${e.map ? ' (' + e.map + ')' : ''}` }),
        el('div', { className: 'gi-asks', textContent: canSw ? `Przelogować na ${k}?` : (k ? 'Jesteś już na właściwej postaci.' : 'Nie wiem, kto to zabił – przelogowanie niedostępne.') }),
        btns);
      host.append(card);
      return true;
    }
    async function switchToCharacter(nick, icon) {
      const cur = safe(() => W.Engine.hero.d.nick, '');
      const curImg = String(safe(() => W.Engine.hero.d.img, '') || '').split('?')[0].split('/').pop();
      if (normName(cur) === normName(nick) || (icon && curImg && String(icon).split('?')[0].split('/').pop() === curImg && normName(cur) === normName(nick))) { toast('To już ta postać (' + nick + ').'); return; }
      if (relogApi) { const r = await relogApi.switchByNickOrIcon(nick, icon); if (r === true) return; if (r === false) { toast('Nie można przełączyć (postać aktywna lub zablokowana).'); return; } }
      let nodes = findChar(nick, icon);
      if (!nodes.length && cfg.swOpener) {
        const op = safe(() => document.querySelector(cfg.swOpener), null);
        if (op) {
          toast('Otwieram okno przelogowania…');
          op.click();
          for (let i = 0; i < 10 && !nodes.length; i++) { await new Promise(r => setTimeout(r, 300)); nodes = findChar(nick, icon); }
        } else toast('Nie widzę zapisanego przycisku – wskaż go ponownie w ⚙.');
      }
      if (!nodes.length) {
        // spróbuj otworzyć wbudowaną listę postaci
        const openers = findByText(/zmie[ńn]\s+postać|wybór postaci|wybierz postać|lista postaci|przełącz postać/i);
        if (openers.length) {
          toast('Otwieram listę postaci…');
          clickTarget(openers[0]).click();
          for (let i = 0; i < 6 && !nodes.length; i++) { await new Promise(r => setTimeout(r, 400)); nodes = findChar(nick, icon); }
        }
      }
      if (!nodes.length) { toast('Nie znalazłem postaci „' + nick + '” (ani jej miniatury) w oknie gry. Otwórz w grze listę postaci i zrób dwuklik jeszcze raz (albo wyślij mi Diagnostykę z otwartą listą).'); return; }
      clickTarget(nodes[0]).click();
    }

    // ── interfejs (minimalistyczny: jedna linia na potwora, czas po prawej, „+” na dole) ──
    const listBox = el('div');
    let rowEls = new Map();
    const fmtHMS = s => { s = Math.max(0, Math.round(s)); return pad2(Math.floor(s / 3600)) + ':' + pad2(Math.floor(s / 60) % 60) + ':' + pad2(s % 60); };
    const killerText = e => e.killer ? (e.killer.self ? e.killer.nick + ' (Ty)' : e.killer.nick) : '';

    const TABS = [['all', 'All', ''], ['E2', 'E2', 'E2'], ['H', 'Heros', 'H'], ['T', 'Tytan', 'T']];
    if (!TABS.some(t => t[0] === cfg.tab)) cfg.tab = 'all';
    const tabOk = e => cfg.tab === 'all' || rankTag(e) === cfg.tab;
    const vis = () => entries.filter(e => !e.hidden && tabOk(e));
    const tabBtns = new Map();
    const tabsBox = el('div', { className: 'gi-rtabs' });
    TABS.forEach(([k, label, tag]) => {
      const b = el('div', { className: 'gi-rtab', textContent: label });
      if (tag) b.style.setProperty('--tc', styleOf(tag).c);
      b.addEventListener('click', () => { cfg.tab = k; writeLS(RCFG_KEY, cfg); paintTabs(); render(); updateTimers(); });
      tabBtns.set(k, b); tabsBox.append(b);
    });
    function paintTabs() {
      TABS.forEach(([k, label, tag]) => {
        const b = tabBtns.get(k);
        const n = entries.filter(e => !e.hidden && (k === 'all' || rankTag(e) === k)).length;
        b.textContent = label + ' (' + n + ')';
        b.classList.toggle('on', cfg.tab === k);
        if (tag) b.style.setProperty('--tc', styleOf(tag).c);
      });
    }
    // najkrótszy czas do respawnu na górze; nieznane czasy na końcu (Infinity - Infinity dawało NaN)
    const byRem = now => (a, b) => { const x = remaining(a, now), y = remaining(b, now); return x === y ? a.killedAt - b.killedAt : (x < y ? -1 : 1); };
    function render() {
      rowEls = new Map();
      paintTabs();
      if (!vis().length) {
        listBox.replaceChildren(el('div', { className: 'gi-rempty', textContent: cfg.tab === 'all' ? 'Brak liczników – pojawią się po zabiciu elity lub herosa na Twojej mapie. Możesz też dodać własny przyciskiem „+”.' : 'Brak liczników w tej zakładce.' }));
        return;
      }
      const now = Date.now();
      listBox.replaceChildren(...vis().sort(byRem(now)).map(e => {
        const tag = rankTag(e);
        const kt = killerText(e);
        const row = el('div', { className: 'gi-rrow' });
        const sty = styleOf(tag);
        row.style.setProperty('--c', sty.c);
        if (sty.g > 0) { row.classList.add('gi-glow'); row.style.setProperty('--g', sty.g + 'px'); }
        if (e.killer && e.killer.self && e.killer.nick) row.dataset.sw = '1';
        row.title = `${e.name}${e.lvl ? ' (' + e.lvl + ' lvl)' : ''}${e.rank ? ' · ' + e.rank : ''}${e.map ? ' · ' + e.map : ''}\n` +
          (e.respawnSec ? `Respawn: ${fmtDur(e.respawnSec)} (${e.respSrc || 'ręcznie'})` : 'Czas respawnu nieznany – prawy klik na czasie, aby ustawić' + (e.mwNote ? '\n' + e.mwNote : '')) + (e.killer && e.killer.self ? `\nDwuklik: przełącz na postać ${e.killer.nick}` : '') +
          (kt ? `\nUbił (przypuszczalnie): ${kt}` : '\nNie ustalono, kto zabił');

        const outfit = makeOutfit(e.killer ? [e.killer.iconUrl, e.killer.icon] : '', 24, 32, url => { if (e.killer && e.killer.iconUrl !== url) { e.killer.iconUrl = url; saveE(); } });
        const pic = makeNpcPic(e.kind === 'death' ? '' : [e.npcOk, e.npcIcon, e.npcImg], e.kind === 'death' ? '☠' : '', 32, 32, url => { if (e.npcOk !== url) { e.npcOk = url; saveE(); } });
        const info = el('div', { className: 'gi-rinfo' }, el('div', { className: 'gi-rname', textContent: e.kind === 'death' ? '[☠] Odrodzenie' : (tag ? `[${tag}] ` : '') + e.name }));
        if (kt) info.append(el('div', { className: 'gi-rnick', textContent: kt }));

        const timer = el('div', { className: 'gi-rtime', title: 'Prawy klik: ustaw czas respawnu (minuty)' }, el('div', { className: 'gi-rt1', textContent: '…' }), el('div', { className: 'gi-rt2' }));
        timer.addEventListener('contextmenu', ev => {
          ev.preventDefault();
          const v = window.prompt('Czas respawnu w minutach (np. 90):', e.respawnSec ? String(Math.round(e.respawnSec / 60)) : '');
          const min = Number(String(v || '').replace(',', '.'));
          if (!(min > 0)) return;
          e.respawnSec = Math.round(min * 60); e.respSrc = 'ręczny'; e.warned = false; e.alerted = false;
          saveE(); render(); updateTimers();
        });
        const del = el('div', { className: 'gi-rdel', textContent: '×', title: 'Usuń licznik' });
        del.addEventListener('click', () => { dismissed.set(normName(e.name), { sec: -1, at: Date.now() }); saveDism(); entries = entries.filter(x => x.id !== e.id); saveE(); render(); });

        // prawy klik na outfit = „to ja zabiłem” (przypisz bieżącą postać jako zabójcę)
        outfit.title = 'Prawy klik: przypisz moją aktualną postać jako zabójcę';
        outfit.addEventListener('contextmenu', ev => {
          ev.preventDefault();
          const h = safe(() => W.Engine.hero.d, null);
          if (!h || !h.nick) return;
          e.killer = { nick: h.nick, icon: h.img || h.icon || '', self: true, dist: 0 };
          saveE(); render(); updateTimers();
          toast('Zabójca: ' + h.nick + ' (Ty).');
        });
        row.addEventListener('dblclick', ev => {
          if (ev.target.closest('.gi-rdel')) return;
          if (e.killer && e.killer.self && e.killer.nick) switchToCharacter(e.killer.nick, e.killer.icon);
          else toast(e.killer ? 'Dwuklik przełącza tylko na twoje postacie (oznaczone „(Ty)”).' : 'Nie wiem, kto to zabił. Zalogowany na właściwej postaci kliknij prawym na pustym outfitcie, aby ją przypisać.');
        });
        const fl = el('div', { className: 'gi-flames' });
        for (let i = 0; i < 9; i++) { const f = el('span'); f.style.left = (i * 11.5 - 2) + '%'; f.style.animationDelay = (-(i * 0.17) % 0.9).toFixed(2) + 's'; f.style.animationDuration = (0.55 + (i % 3) * 0.17).toFixed(2) + 's'; fl.append(f); }
        row.append(fl, pic, info, timer, outfit, del);
        rowEls.set(e.id, { row, timer });
        return row;
      }));
    }

    function updateTimers() {
      const now = Date.now();
      rowEls.forEach(({ row, timer }, id) => {
        const e = entries.find(x => x.id === id);
        if (!e) return;
        const rem = remaining(e, now);
        const est = !gameOpen && rem !== Infinity && rem > 0 && e.respSrc !== 'zegar gry' && e.respSrc !== 'ręczny';
        const t1 = timer.firstChild, t2 = timer.lastChild;
        const hasMM = !!(e.minAt && e.maxAt && e.kind !== 'death' && ['H', 'T'].includes(rankTag(e)));
        const inWin = hasMM && rem <= 0 && now < e.maxAt;
        row.classList.toggle('gi-win', inWin);
        if (rem === Infinity) { t1.textContent = '--:--:--'; t2.textContent = ''; row.classList.remove('gi-exp'); }
        else if (hasMM && now < e.maxAt) {
          const toMax = fmtHMS(Math.ceil((e.maxAt - now) / 1000));
          timer.title = 'Min: ' + new Date(e.minAt).toLocaleString() + '\nMax: ' + new Date(e.maxAt).toLocaleString();
          if (now < e.minAt) { t1.textContent = 'min: ' + fmtHMS(Math.ceil((e.minAt - now) / 1000)); t2.textContent = 'max: ' + toMax; row.classList.toggle('gi-exp', false); }
          else { t1.textContent = 'max: ' + toMax; t2.textContent = ''; row.classList.remove('gi-exp'); }
        }
        else { t1.textContent = (est ? '~' : '') + fmtHMS(rem); t2.textContent = ''; timer.title = est ? 'Czas szacunkowy – otwórz Minutnik w grze, aby go poprawić' : 'Prawy klik: ustaw czas respawnu (minuty)'; row.classList.toggle('gi-exp', rem <= 0); }
        const onFire = !!cfg.fire && e.kind !== 'death' && rem !== Infinity && rem <= (cfg.fireSec || 15);
        row.classList.toggle('gi-fire', onFire);
        row.classList.toggle('gi-fblue', (onFire || inWin) && cfg.fireBlueH !== false && rankTag(e) === 'H');
        if (inWin) row.classList.add('gi-fire');
      });
      // trzymaj kolejność wg czasu (najpierw te, które już się odrodziły) bez przebudowy wierszy
      const want = vis().sort(byRem(now)).map(e => rowEls.get(e.id) && rowEls.get(e.id).row).filter(Boolean);
      const cur = [...listBox.children];
      if (want.length === cur.length && want.some((r, i) => r !== cur[i])) want.forEach(r => listBox.append(r));
    }

    // dodawanie ręczne (formularz pod przyciskiem „+”)
    const nameIn = isolate(el('input', { type: 'text', placeholder: 'Nazwa potwora' }));
    nameIn.style.cssText = 'width:120px';
    const lvlIn = isolate(el('input', { type: 'number', min: 1, placeholder: 'lvl' }));
    lvlIn.style.cssText = 'width:44px';
    const minIn = isolate(el('input', { type: 'number', min: 1, placeholder: 'min' }));
    minIn.style.cssText = 'width:52px';
    const note = el('div', { style: 'flex-basis:100%;color:#ffd54f;font-size:11px' });
    const addBtn = el('button', { textContent: 'OK' });
    addBtn.addEventListener('click', () => {
      const name = nameIn.value.trim();
      if (!name) { note.textContent = 'Wpisz nazwę potwora.'; return; }
      const min = Number(minIn.value) || 0;
      const e = {
        id: uid(), name, lvl: Number(lvlIn.value) || 0, wt: 0, rank: '', map: st.mapName || safe(() => W.Engine.map.d.name, ''),
        killedAt: Date.now(), respawnSec: min > 0 ? Math.round(min * 60) : 0, respSrc: min > 0 ? 'ręczny' : '', respText: '',
        watched: false, warned: false, alerted: false, killer: null
      };
      if (!e.respawnSec) { const l = learned(e); if (l) { e.respawnSec = l; e.respSrc = 'zmierzony'; } }
      entries.push(e); saveE(); render(); updateTimers();
      nameIn.value = ''; lvlIn.value = ''; minIn.value = ''; note.textContent = '';
      addForm.style.display = 'none';
      enrich(e); // dociągnij rangę (i czas respawnu, jeśli go nie podano) z MargoWorld
    });
    const addForm = el('div', { className: 'gi-rform' }, nameIn, lvlIn, minIn, addBtn, note);
    addForm.style.display = 'none';
    const plusBtn = el('button', { className: 'gi-add', textContent: '+', title: 'Dodaj licznik ręcznie' });
    plusBtn.addEventListener('click', () => {
      const open = addForm.style.display === 'none';
      addForm.style.display = open ? 'flex' : 'none';
      if (open) nameIn.focus();
    });

    // ustawienia (pod kółkiem ⚙ w nagłówku okna)
    const chk = (key, label, onChange) => {
      const cb = el('input', { type: 'checkbox', checked: !!cfg[key] });
      cb.addEventListener('change', () => { cfg[key] = cb.checked; writeLS(RCFG_KEY, cfg); if (onChange) onChange(cb.checked); });
      return el('label', { style: 'display:block' }, cb, ' ' + label);
    };
    const warnIn = isolate(el('input', { type: 'number', min: 0, value: cfg.warn }));
    warnIn.style.cssText = 'width:52px';
    warnIn.addEventListener('change', () => { cfg.warn = Math.max(0, Number(warnIn.value) || 0); writeLS(RCFG_KEY, cfg); });
    const deathIn = isolate(el('input', { type: 'number', min: 1, value: cfg.deathSec }));
    deathIn.style.cssText = 'width:52px';
    deathIn.addEventListener('change', () => { cfg.deathSec = Math.max(1, Number(deathIn.value) || 60); writeLS(RCFG_KEY, cfg); });
    const fireSel = isolate(el('select', {}));
    FIRE_SOUNDS.forEach(([v, l]) => fireSel.append(el('option', { value: v, textContent: l, selected: cfg.fireSound === v })));
    fireSel.addEventListener('change', () => { cfg.fireSound = fireSel.value; writeLS(RCFG_KEY, cfg); playFireSound(cfg.fireSound, cfg.fireVol); });
    const fireVol = isolate(el('input', { type: 'range', min: 0.05, max: 1, step: 0.05, value: cfg.fireVol }));
    fireVol.style.cssText = 'width:110px;vertical-align:middle';
    fireVol.addEventListener('change', () => { cfg.fireVol = Number(fireVol.value); writeLS(RCFG_KEY, cfg); playFireSound(cfg.fireSound, cfg.fireVol); });
    const fireTest = el('button', { textContent: '▶ Odtwórz' });
    fireTest.addEventListener('click', () => playFireSound(cfg.fireSound, cfg.fireVol));
    const mmBtn = el('button', { textContent: 'Odczytaj ponownie Min/Max respawnu', title: 'Wymusza ponowny odczyt Min/Max z okna Minutnika gry dla wszystkich widocznych wierszy (okno gry musi być otwarte)' });
    mmBtn.addEventListener('click', () => { entries.forEach(e => { e.mmN = 0; e.mmTry = 0; delete e.minAt; delete e.maxAt; }); saveE(); });
    const clearBtn = el('button', { textContent: 'Wyczyść liczniki' });
    clearBtn.addEventListener('click', () => { entries = []; saveE(); render(); });
    const forgetBtn = el('button', { textContent: 'Zapomnij zmierzone czasy' });
    forgetBtn.addEventListener('click', () => { learn = {}; writeLS(LEARN_KEY, learn); });
    const fillBtn = el('button', { textContent: 'Pobierz brakujące czasy (MargoWorld)' });
    fillBtn.addEventListener('click', () => { entries.filter(e => !e.respawnSec).forEach(enrich); });
    const deathCb = el('input', { type: 'checkbox', checked: cfg.death !== false });
    deathCb.addEventListener('change', () => {
      cfg.death = deathCb.checked; writeLS(RCFG_KEY, cfg);
      if (!cfg.death) { entries = entries.filter(e => e.kind !== 'death'); saveE(); render(); }
    });
    const fireCb = el('input', { type: 'checkbox', checked: !!cfg.fire });
    fireCb.addEventListener('change', () => { cfg.fire = fireCb.checked; writeLS(RCFG_KEY, cfg); updateTimers(); });
    const askTest = el('button', { textContent: 'Pokaż przykład' });
    askTest.addEventListener('click', () => { const ex = entries.find(x => x.killer && x.killer.self && x.kind !== 'death') || entries[0] || { name: 'Przykładowy potwór', killer: null }; showAsk(ex, true); });
    const fireIn = isolate(el('input', { type: 'number', min: 1, max: 600, value: cfg.fireSec || 15 }));
    fireIn.style.cssText = 'width:48px';
    fireIn.addEventListener('change', () => { cfg.fireSec = Math.max(1, Number(fireIn.value) || 15); writeLS(RCFG_KEY, cfg); updateTimers(); });
    const swInfo = el('div', { style: 'color:#9ccc65;font-size:10px;word-break:break-all' });
    const paintSw = () => { swInfo.textContent = cfg.swOpener ? 'Zapisany przycisk: ' + cfg.swOpener : 'Nie wskazano przycisku (próbuję znaleźć listę postaci sam).'; };
    paintSw();
    const cssPath = n => {
      const parts = [];
      for (let c = n; c && c.nodeType === 1 && c !== document.body && parts.length < 4; c = c.parentElement) {
        if (c.id && !/^\d/.test(c.id)) { parts.unshift('#' + CSS.escape(c.id)); break; }
        const cls = [...c.classList].filter(x => !/^\d|hover|active|selected|focus/i.test(x)).slice(0, 2).map(x => '.' + CSS.escape(x)).join('');
        let part = c.tagName.toLowerCase() + cls;
        const sib = c.parentElement ? [...c.parentElement.children].filter(x => x.tagName === c.tagName) : [];
        if (sib.length > 1) part += ':nth-of-type(' + (sib.indexOf(c) + 1) + ')';
        parts.unshift(part);
      }
      return parts.join(' > ');
    };
    const pickBtn = el('button', { textContent: 'Wskaż przycisk' });
    pickBtn.addEventListener('click', () => {
      toast('Kliknij teraz w grze przycisk, który otwiera okno przelogowania…');
      const h = ev => {
        if (ev.target.closest('.gi-float,#gi-panel')) return;
        document.removeEventListener('click', h, true);
        const t = ev.target.closest('button,a,[role=button]') || ev.target;
        cfg.swOpener = cssPath(t); writeLS(RCFG_KEY, cfg); paintSw();
        toast('Zapisano przycisk przelogowania.');
      };
      setTimeout(() => document.addEventListener('click', h, true), 50);
    });
    const clearSwBtn = el('button', { textContent: 'Wyczyść' });
    clearSwBtn.addEventListener('click', () => { cfg.swOpener = ''; writeLS(RCFG_KEY, cfg); paintSw(); });
    const resetPosBtn = el('button', { textContent: 'Resetuj pozycję okna' });
    resetPosBtn.addEventListener('click', () => { if (view.resetPos) view.resetPos(); });

    const prim = o => { const r = {}; Object.keys(o || {}).forEach(k => { const v = o[k]; if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) r[k] = typeof v === 'string' ? v.slice(0, 80) : v; }); return r; };
    const diagBox = isolate(el('textarea', { rows: 6, readOnly: true, placeholder: 'Kliknij „Diagnostyka respawnów”.' }));
    diagBox.style.fontSize = '10px';
    const diagBtn = el('button', { textContent: 'Diagnostyka respawnów' });
    diagBtn.addEventListener('click', () => {
      const raw = safe(() => W.Engine.others.check(), null) || safe(() => W.Engine.others.list, null) || {};
      const oth = Object.values(raw).slice(0, 2).map(o => prim((o && o.d) ? o.d : o));
      const cfgPaths = {};
      Object.keys(safe(() => W.CFG, {}) || {}).filter(k => /path|cdn|url/i.test(k)).forEach(k => { cfgPaths[k] = String(W.CFG[k]).slice(0, 100); });
      const out = {
        map: safe(() => ({ id: W.Engine.map.d.id, name: W.Engine.map.d.name }), null),
        hero: prim(safe(() => W.Engine.hero.d, {})),
        elitesNow: [...(elitesNow() || new Map()).values()].slice(0, 5).map(prim),
        othersApi: { hasOthers: !!safe(() => W.Engine.others, null), keys: safe(() => Object.keys(W.Engine.others), []) },
        othersSample: oth,
        cfgPaths,
        lastKill: lastKillDbg, askRelog: askDbg,
        events: evLog.slice(),
        charSwitch: { engineKeys: safe(() => Object.keys(W.Engine).filter(k => /char|login|acc|switch|relog|user/i.test(k)), []), nodes: [...document.querySelectorAll('[class*="char" i],[class*="account" i],[id*="char" i]')].filter(n => !n.closest('#gi-resp-win,#gi-panel')).slice(0, 12).map(n => ({ tag: n.tagName, cls: String(n.className || '').slice(0, 60), text: (n.innerText || '').replace(/\s+/g, ' ').slice(0, 80) })) },
        iconCacheSize: Object.keys(iconCache).length,
        npcTplSample: safe(() => { const t = W.Engine.npcTplManager; return { keys: Object.keys(t).slice(0, 25), sample: prim(Object.values(t).find(v => v && typeof v === 'object') || {}) }; }, null),
        npcIconManagerKeys: safe(() => Object.keys(W.Engine.npcIconManager).slice(0, 25), []),
        gameTimerRows: gameRowsDbg, minMaxRead: lastMM,
        mmProbe: (() => { const all = allTipsEntries(); return { allTipsCount: all.length, withMin: all.map(([k, v]) => [k, htmlText(v).replace(/\s+/g, ' ')]).filter(x => /Min:/.test(x[1])).slice(0, 4).map(x => x[0] + ': ' + x[1].slice(0, 160)), sample: all.slice(-3).map(([k, v]) => k + ': ' + htmlText(v).replace(/\s+/g, ' ').slice(0, 100)), rowNodes: [...document.querySelectorAll('.elite-timer-wnd [tip-id]')].slice(0, 4).map(n => n.getAttribute('tip-id') + ' ' + String(n.className).slice(0, 40)), rowTipAttrs: [...document.querySelectorAll('.elite-timer-wnd *')].filter(n => [...n.attributes].some(a => /tip/i.test(a.name))).slice(0, 4).map(n => n.tagName + ' ' + [...n.attributes].map(a => a.name + '=' + a.value.slice(0, 20)).join(' ')), htmlSample: (document.querySelector('.elite-timer-wnd') || { outerHTML: '' }).outerHTML.slice(0, 700) }; })(), entriesMM: entries.slice(-6).map(e => ({ name: e.name, minAt: e.minAt, maxAt: e.maxAt, tries: e.mmN })),
        engineDead: { type: typeof safe(() => W.Engine.dead, undefined), val: String(safe(() => W.Engine.dead, undefined)).slice(0, 60) },
        deadController: prim(safe(() => W.Engine.deadController, {})), deadControllerKeys: safe(() => Object.keys(W.Engine.deadController).slice(0, 40), []),
        heroesRespManagerKeys: safe(() => Object.keys(W.Engine.heroesRespManager).slice(0, 40), []),
        interfaceTimerManagerKeys: safe(() => Object.keys(W.Engine.interfaceTimerManager).slice(0, 40), []),
        death: (checkDeath(), deathDbg),
        heroPic: (() => { const hd = safe(() => W.Engine.hero.d, {}) || {}; const f = {}; ['img', 'icon', 'outfit', 'look', 'gender', 'prof'].forEach(k => { if (hd[k] !== undefined) f[k] = String(hd[k]).slice(0, 120); }); const ic = hd.img || hd.icon || hd.outfit || ''; return { fields: f, urls: outfitUrls(ic), perfHit: perfUrl(ic), opath: safe(() => W.CFG.opath, null), npath: safe(() => W.CFG.npath, null) }; })(),
        engineKeys: safe(() => Object.keys(W.Engine).filter(k => /tim|resp|dead|npc|hero|boss|clock/i.test(k)), []),
        gameTimerNodes: [...document.querySelectorAll(TIMER_SEL)].filter(n => !n.closest('#gi-resp-win,#gi-panel,.gi-float')).slice(0, 12).map(n => ({ tag: n.tagName, cls: String(n.className || '').slice(0, 70), id: n.id, text: (n.innerText || '').replace(/\s+/g, ' ').slice(0, 100) })),
        perfSample: resSeen.slice(-6), npcPicUrls: [...(elitesNow() || new Map()).values()].slice(0, 3).map(n => ({ nick: n.nick, icon: n.icon, tried: npcUrls(n.icon) })),
        entriesDbg: entries.slice(-6).map(e => ({ name: e.name, npcIcon: e.npcIcon, respawnSec: e.respawnSec, src: e.respSrc, mw: e.mwNote })),
        heroFull: prim(safe(() => W.Engine.hero.d, {})),
        learned: learn
      };
      diagBox.value = JSON.stringify(out, null, 1);
      diagBox.select();
      if (navigator.clipboard) navigator.clipboard.writeText(diagBox.value).catch(() => {});
    });

    const diagSec = el('details');
    diagSec.append(el('summary', { textContent: 'Diagnostyka' }), diagBtn, diagBox);
    const settingsBox = setTabs([
      ['Wizualne', [
        chk('minimal', 'Minimalistyczny minutnik: tylko napisy (bez grafik potworów i outfitów, bez ramek wierszy)', () => { if (view.onCfg) view.onCfg(); }),
        chk('fireBlueH', 'Herosi: niebieski ogień zamiast czerwonego przy zbliżaniu się do minimalnego respawnu', () => { render(); updateTimers(); }),
        el('div', { style: 'margin-top:4px' }, fireCb, ' Ogień i czerwona ramka, gdy do respawnu zostaje ≤ ', fireIn, ' s'),
      el('div', { style: 'margin-top:6px;font-weight:bold' }, 'Kolory i poświata'),
        ...STYLE_TAGS.map(([t, lb]) => {
          const cur = styleOf(t);
          const ci = el('input', { type: 'color', value: cur.c });
          const gi = isolate(el('input', { type: 'range', min: 0, max: 24, step: 1, value: cur.g }));
          gi.style.cssText = 'width:80px;vertical-align:middle';
          const gv = el('span', { textContent: cur.g, style: 'display:inline-block;width:18px;text-align:right' });
          const rb = el('button', { textContent: '↺', title: 'Przywróć domyślne', style: 'padding:0 5px' });
          const save = () => { cfg.styles[t] = { c: ci.value, g: Number(gi.value) }; writeLS(RCFG_KEY, cfg); render(); updateTimers(); };
          ci.addEventListener('input', save);
          gi.addEventListener('input', () => { gv.textContent = gi.value; save(); });
          rb.addEventListener('click', () => { delete cfg.styles[t]; writeLS(RCFG_KEY, cfg); const d = styleOf(t); ci.value = d.c; gi.value = d.g; gv.textContent = d.g; render(); updateTimers(); });
          const sw = el('span', { textContent: `[${t}] ${lb}`, style: `display:inline-block;min-width:104px;color:${RANK_TAG_COLORS[t] || '#ddd'}` });
          return el('div', { style: 'display:flex;align-items:center;gap:6px;margin:2px 0' }, sw, ci, el('span', { textContent: 'poświata', style: 'color:#888;font-size:10px' }), gi, gv, rb);
        })
      ]],
      ['Funkcje', [
        el('div', { textContent: 'WYMAGA: włączonego i widocznego minutnika z gry. Schowaj go pod tym oknem, a czasy będą dokładne.', style: 'color:#ffd54f;margin-bottom:4px' }),
        el('div', { textContent: 'Licznik powstaje, gdy elita, heros lub tytan zniknie z Twojej mapy. Zabójca to przypuszczenie: gracz najbliżej potwora.', style: 'color:#888;margin-bottom:4px' }),
        chk('alwaysSelf', 'Zawsze zapisuj moją (aktualną) postać jako zabójcę – dwuklik przełącza na nią także przy biciu w grupie'),
      el('div', { style: 'margin-top:4px' }, 'Śledź rangi: ', ...[['E2', 'E2'], ['H', 'Heros'], ['T', 'Tytan'], ['E', 'Elita']].map(([t, lb]) => {
        const cb = el('input', { type: 'checkbox', checked: tagOn(t) });
        cb.addEventListener('change', () => {
          cfg.tags = Object.assign({}, cfg.tags, { [t]: cb.checked }); writeLS(RCFG_KEY, cfg);
          if (!cb.checked) { entries = entries.filter(e => e.kind === 'death' || rankTag(e) !== t); saveE(); }
          render();
        });
        return el('label', { style: 'margin-right:6px;white-space:nowrap' }, cb, ' ' + lb);
      })),
        el('div', {}, deathCb, ' Pokazuj odrodzenie mojej postaci'),
        el('div', {}, 'Odrodzenie postaci, gdy gra nie poda czasu: ', deathIn, ' s'),
        el('div', { style: 'margin:4px 0' }, 'Dźwięk przy zapaleniu się ognia (raz na respawn): ', fireSel, ' ', fireTest, el('div', {}, 'Głośność: ', fireVol)),
        chk('askRelog', 'Pokaż okienko „Respi … – przelogować?” tylko dla E2 (przelogowanie dopiero po kliknięciu)'),
        el('div', { style: 'color:#888;font-size:10px' }, 'Okienko pojawia się w tej samej chwili co ogień (ustawiasz to w Wizualne: „Ogień i czerwona ramka, gdy do respawnu zostaje ≤ … s”). ', askTest),
        chk('sound', 'Dźwięk'),
        chk('desktop', 'Powiadomienia systemowe', on => { if (on && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission(); }),
        el('div', {}, 'Ostrzeż na ', warnIn, ' s przed respawnem (0 = wyłączone)'),
      el('div', { style: 'margin-top:6px;font-weight:bold;color:#ddd' }, 'Przelogowanie (dwuklik na wierszu)'),
      el('div', { style: 'color:#888;font-size:10px' }, 'Jeśli używasz okna przelogowania z innego dodatku: kliknij „Wskaż przycisk” i potem w grze kliknij przycisk, który to okno otwiera.'),
      el('div', {}, pickBtn, ' ', clearSwBtn), swInfo,
        el('div', {}, mmBtn), el('div', {}, clearBtn, ' ', forgetBtn), el('div', {}, fillBtn),
        diagSec
      ]],
      ['Okno', [
        chk('autoH', 'Wysokość okna dopasowuje się do liczby potworów (szerokość ustawiasz ręcznie)', () => { if (view.onCfg) view.onCfg(); }),
        el('div', {}, resetPosBtn)
      ]]
    ]);
    const gearBtn = el('button', { textContent: '⚙', title: 'Ustawienia (osobne okno)' });
    gearBtn.addEventListener('click', () => { if (view.openSettings) view.openSettings(); });

    const gameHint = el('div', { className: 'gi-ghint', textContent: 'Aby czasy były dokładne, otwórz minutnik z gry i zostaw go widocznego – najlepiej schowany pod tym oknem. Bez niego czasy są tylko szacowane (~).' });
    gameHint.style.cssText = 'display:none;margin:4px 0;padding:4px 6px;font-size:10px;color:#ffd54f;border:1px dashed #8a7430;border-radius:3px';
    const view = el('div', {}, tabsBox, gameHint, listBox, toastEl, plusBtn, addForm);
    view.settingsBox = settingsBox;
    view.cfg = cfg;
    view.gearBtn = gearBtn; // okno wstawia go do swojego nagłówka

    render(); updateTimers();
    let lastTick = 0;
    setInterval(() => { // 4× na sekundę: synchronizacja z zegarem gry i odświeżenie liczników (żeby nie było opóźnienia względem okna gry)
      if (!respEnabled) return;
      const t = Date.now();
      try {
        if (t - lastTick >= 950) { lastTick = t; tick(); checkTimers(); }
        else syncFromGame();
      } catch (err) { log('respawny – błąd', err); }
      if (view.offsetParent !== null) updateTimers();
    }, 100);
    return view;
  }


  // ───────────── Dodatek: Ostatnie dropy ─────────────
  // Pozioma ramka: z lewej 9 slotów na ostatnie przedmioty heroiczne, z prawej 3 sloty na ostatnie legendarne.
  // „Drop” = nowy przedmiot, który pojawił się w torbie postaci (po drodze mogą trafić się też zakupy/wymiany).
  // Dane są osobne dla każdej postaci (klucz z id postaci).
  const DROPS_ON_KEY = 'gi_drops_on_v1';
  let dropsEnabled = (() => { try { return localStorage.getItem(DROPS_ON_KEY) !== '0'; } catch (e) { return true; } })();
  const DR_COL = { her: '#4fc3f7', uni: '#ffd54f', leg: '#ff9800' };
  const DR_CFG_KEY = 'gi_drops_cfg_v1';

  function itemUrls(icon) {
    if (!icon || typeof icon !== 'string') return [];
    const pf = perfUrl(icon);
    const out = pf ? [pf] : [];
    if (/^(https?:)?\/\//i.test(icon)) { const u = cleanUrl(icon.startsWith('//') ? 'https:' + icon : icon); if (u) out.push(u); return out; }
    [safe(() => W.CFG.a_ipath, ''), safe(() => W.CFG.ipath, ''), '/obrazki/itemy/'].filter(Boolean).forEach(base => {
      try { const u = cleanUrl(new URL(String(base).replace(/\/+$/, '') + '/' + icon.replace(/^\/+/, ''), location.origin).href); if (u && !out.includes(u)) out.push(u); } catch (e) { /* pomiń */ }
    });
    return out;
  }
  function allItemsList() {
    const it = safe(() => W.Engine.items, null);
    if (!it) return [];
    const unwrap = x => (x && x.d) ? x.d : x;
    const asList = src => { if (!src || typeof src !== 'object') return null; const a = Array.isArray(src) ? src : Object.values(src); const f = a.map(unwrap).filter(x => x && typeof x === 'object' && x.id != null); return f.length ? f : null; };
    for (const k of ['items', 'allItems', 'itemsData', 'fetchedItems']) { const r = safe(() => asList(it[k]), null); if (r) return r; }
    const g = safe(() => it.getAllItems && it.getAllItems(), null);
    const rg = asList(g); if (rg) return rg;
    for (const k of Object.keys(it)) { const r = safe(() => asList(it[k]), null); if (r && r.length > 2 && r.some(x => x.name || x.icon)) return r; }
    return [];
  }
  function rarityOfItem(d) {
    const txt = [d.stat, d.rarity, d.rar, d.quality].filter(v => v != null).join(' ').toLowerCase();
    if (/legendary|legend|legendarny/.test(txt)) return 'leg';
    if (/heroic|heroiczn/.test(txt)) return 'her';
    if (/unique|unikat/.test(txt)) return 'uni';
    const node = document.querySelector('[class*="item-id-' + d.id + '"]');
    const hl = node && node.querySelector('[class*="t-"]');
    const cls = hl ? clsOf(hl) : '';
    if (/\bt-leg\w*/.test(cls)) return 'leg';
    if (/\bt-her\w*/.test(cls)) return 'her';
    if (/\bt-uni\w*/.test(cls)) return 'uni';
    return '';
  }
  function buildDropsView() {
    let hid = 0, dst = null;
    const keyFor = id => 'gi_drops_v2_' + id; // v2: zapis od wersji czytającej okno łupów (stare, błędne wpisy z torby pominięte)
    const loadFor = id => {
      const v = readLS(keyFor(id), null);
      if (!v || typeof v !== 'object') return { known: [], left: [], leg: [] };
      const left = Array.isArray(v.left) ? v.left : (v.her || []).map(x => Object.assign({ r: 'her' }, x)); // migracja ze starego zapisu
      return { known: v.known || [], left, leg: v.leg || [] };
    };
    const saveD = () => { if (dst && hid) writeLS(keyFor(hid), { known: dst.known.slice(-800), left: dst.left, leg: dst.leg }); };
    const startAt = Date.now();
    let dcfg = Object.assign({ her: true, uni: false, n: 9 }, readLS(DR_CFG_KEY, {}));
    dcfg.n = Math.min(9, Math.max(3, Number(dcfg.n) || 9));

    const statusEl = el('div', { style: 'color:#78909c;font-size:10px;padding:0 4px 3px' });
    const view = el('div', { className: 'gi-drops' });
    const STAT_PL = { lvl: 'Wymagany poziom', dmg: 'Atak fizyczny', ac: 'Pancerz', hp: 'Życie', mana: 'Mana', resfire: 'Odp. na ogień', reslight: 'Odp. na błyskawice', resfrost: 'Odp. na zimno', resmanaburn: 'Odp. na spalenie many', absorb: 'Absorpcja fizyczna', absorbm: 'Absorpcja magiczna', crit: 'Cios krytyczny', critmval: 'Siła kryt. magicznego', critval: 'Siła ciosu kryt.', evade: 'Unik', blok: 'Blok', pierce: 'Przebicie', slow: 'Spowolnienie', sa: 'Szybkość ataku', heal: 'Leczenie', manabon: 'Mana', energybon: 'Energia', str: 'Siła', agi: 'Zwinność', int: 'Intelekt', acdmg: 'Pancerz/atak', rarity: 'Rzadkość', legbon: 'Bonus legendy', opis: 'Opis', reqp: 'Profesja' };
    let tipEl = null;
    function hideTip() { if (tipEl) { tipEl.remove(); tipEl = null; } }
    function moveTip(ev) { if (!tipEl) return; const bb = tipEl.getBoundingClientRect(); const w = Math.max(tipEl.offsetWidth, bb.width), h = Math.max(tipEl.offsetHeight, bb.height, tipEl.scrollHeight); let x = ev.clientX + 14, y = ev.clientY + 14; if (x + w > innerWidth - 4) x = ev.clientX - w - 14; if (y + h > innerHeight - 4) y = ev.clientY - h - 10 >= 4 ? ev.clientY - h - 10 : Math.max(4, innerHeight - h - 4); tipEl.style.left = Math.max(4, x) + 'px'; tipEl.style.top = y + 'px'; }
    const lazySeen = new Set();
    function showTip(rec, kind, ev) {
      hideTip();
      if (!rec.tip && !lazySeen.has(rec.id)) {
        // stary przedmiot bez zapisanego opisu z gry: jeśli nadal leży w torbie/ekwipunku, pobierz jego dymek z gry
        lazySeen.add(rec.id);
        const node = [...document.querySelectorAll('.item-id-' + String(rec.id).replace(/[^\w-]/g, ''))].find(n => !n.closest('.gi-float,#gi-panel,.gi-dtip'));
        if (node) captureTip(node, rec.name, false).then(h => { if (h) { rec.tip = h; saveD(); renderD(); if (tipEl) showTip(rec, kind, ev); } });
      }
      const c = DR_COL[kind] || '#ddd';
      tipEl = el('div', { className: 'gi-dtip' });
      if (rec.tip) {
        tipEl.style.cssText = 'position:fixed;z-index:100001;pointer-events:none;max-width:340px;width:max-content;display:block';
        tipEl.innerHTML = rec.tip;
        [tipEl.firstElementChild].filter(Boolean).forEach(x => { x.style.setProperty('position', 'static', 'important'); x.style.setProperty('transform', 'none', 'important'); x.style.setProperty('margin', '0', 'important'); if (x.style) { const p = x.style.position; if (p === 'absolute' || p === 'fixed') x.style.position = 'static'; x.style.left = x.style.top = x.style.right = x.style.bottom = 'auto'; x.style.transform = 'none'; if (x.style.display === 'none') x.style.display = 'block'; x.style.visibility = 'visible'; x.style.opacity = '1'; } });
        document.body.append(tipEl);
        // dymek z gry rysuje ikonę na canvasie/tle, którego zapis HTML nie zachowuje – wstawiamy obrazek przedmiotu
        try {
          const src = rec._src || rec.snap || '';
          if (src) {
            const cvs = [...tipEl.querySelectorAll('canvas')];
            cvs.forEach(cv => { const im = new Image(); im.src = src; im.className = cv.className; im.style.cssText = 'width:' + (cv.clientWidth || 32) + 'px;height:' + (cv.clientHeight || 32) + 'px;object-fit:contain;image-rendering:pixelated'; cv.replaceWith(im); });
            if (!cvs.length) {
              const box = [...tipEl.querySelectorAll('div,span')].find(n => !n.children.length && !n.textContent.trim() && n.offsetWidth >= 24 && n.offsetWidth <= 80 && Math.abs(n.offsetWidth - n.offsetHeight) < 6);
              if (box) { box.style.setProperty('background', 'url("' + src + '") center/contain no-repeat', 'important'); box.style.imageRendering = 'pixelated'; }
            }
          }
        } catch (err) { /* ikona w dymku jest dodatkiem */ }
        moveTip(ev); return;
      }
      tipEl.style.cssText = 'position:fixed;z-index:100001;max-width:300px;pointer-events:none;background:rgba(8,8,8,.97);border:1px solid ' + c + ';box-shadow:0 0 8px ' + c + ';border-radius:4px;padding:6px 8px;color:#ddd;font:12px/1.4 Arial,sans-serif';
      tipEl.append(el('div', { textContent: rec.name, style: 'font-weight:bold;color:' + c }));
      const RN = { her: 'Heroiczny', uni: 'Unikatowy', leg: 'Legendarny' };
      tipEl.append(el('div', { textContent: RN[rec.r] || '', style: 'color:' + c + ';font-size:11px' }));
      const d = rec.d || {};
      const stat = String(d.stat || '');
      stat.split(';').filter(Boolean).forEach(kv => { const i = kv.indexOf('='); const k = i < 0 ? kv : kv.slice(0, i), v = i < 0 ? '' : kv.slice(i + 1); if (!STAT_PL[k] || k === 'rarity' || v === '') return; const PROF = { w: 'Wojownik', m: 'Mag', p: 'Paladyn', t: 'Tropiciel', h: 'Łowca', b: 'Tancerz ostrzy' }; tipEl.append(el('div', { textContent: STAT_PL[k] + ': ' + (k === 'reqp' ? v.split('').map(ch => PROF[ch] || ch).join(', ') : v) })); });
      if (d.pr) tipEl.append(el('div', { textContent: 'Wartość: ' + d.pr, style: 'color:#888;font-size:11px' }));
      tipEl.append(el('div', { textContent: 'Uproszczony opis – brak zapisu opisu z gry dla tego przedmiotu.', style: 'color:#a58a3a;font-size:10px;margin-top:3px' }));
      tipEl.append(el('div', { textContent: 'Wypadło: ' + new Date(rec.t).toLocaleString() + ' · prawy klik: usuń', style: 'color:#78909c;font-size:10px;margin-top:3px' }));
      document.body.append(tipEl); moveTip(ev);
    }
    // Tooltip z gry: najeżdżamy (sztucznie) na przedmiot w oknie łupów, odczytujemy dymek wygenerowany przez grę i zapisujemy jego HTML.
    function captureTip(node, name, probe) {
      return new Promise(resolve => {
        try {
          const added = [];
          const mo = new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1 && !n.closest('.gi-float,#gi-panel,.gi-dtip')) added.push(n); })));
          mo.observe(document.body, { childList: true, subtree: true });
          const tipish = () => [...document.querySelectorAll('[class*="tip" i],[id*="tip" i]')].filter(n => !n.closest('.gi-float,#gi-panel,.gi-dtip,.gi-dslot'));
          const before = new Set(tipish());
          const fire = (type, T) => node.dispatchEvent(new T(type, { bubbles: true, cancelable: true, clientX: r.left + 4, clientY: r.top + 4 }));
          const r = node.getBoundingClientRect();
          ['pointerover', 'pointerenter'].forEach(t => fire(t, PointerEvent)); ['mouseover', 'mouseenter', 'mousemove'].forEach(t => fire(t, MouseEvent));
          try { const jq = W.jQuery || W.$; if (typeof jq === 'function') jq(node).trigger('mouseenter').trigger('mouseover').trigger('mousemove'); } catch (err) { /* brak jQuery */ }
          setTimeout(() => {
            mo.disconnect();
            let html = '', info = null;
            try {
              const want = normName(name);
              const has = n => normName(n.textContent || '').includes(want);
              const pool = [...added.filter(has), ...tipish().filter(n => !before.has(n) && has(n)), ...tipish().filter(has)];
              const outer = pool.filter(n => !pool.some(o => o !== n && o.contains(n)));
              const pick = pool.find(n => n.matches && n.matches('.tip-wrapper')) || outer[0]; // sam dymek (tip-wrapper), nie cała warstwa .tip-layer
              if (probe) info = { added: added.slice(0, 8).map(n => ({ tag: n.tagName, cls: String(n.className).slice(0, 60), text: (n.textContent || '').replace(/\s+/g, ' ').slice(0, 60) })), tipish: tipish().filter(n => !before.has(n)).slice(0, 5).map(n => String(n.className).slice(0, 60)), picked: pick ? String(pick.className).slice(0, 60) : null, attrs: [...node.attributes].map(a => a.name + '=' + String(a.value).slice(0, 30)) };
              if (pick) {
                const doc = new DOMParser().parseFromString('<div>' + pick.outerHTML + '</div>', 'text/html');
                doc.querySelectorAll('script,iframe').forEach(x => x.remove());
                doc.querySelectorAll('*').forEach(x => [...x.attributes].forEach(a => { if (/^on/i.test(a.name)) x.removeAttribute(a.name); }));
                html = doc.body.firstChild.innerHTML;
              }
            } catch (err) { /* brak dymka */ }
            ['mouseout', 'mouseleave'].forEach(t => fire(t, MouseEvent)); ['pointerout', 'pointerleave'].forEach(t => fire(t, PointerEvent));
            html = html.length > 20 && html.length < 30000 ? html : '';
            resolve(probe ? { html, info } : html);
          }, probe ? 900 : 600);
        } catch (err) { resolve(probe ? { html: '', info: String(err) } : ''); }
      });
    }
    const compactD = d => { const o = {}; if (!d) return o; let n = 0; for (const k of Object.keys(d)) { const v = d[k]; if ((typeof v === 'string' && v.length < 900) || typeof v === 'number') { o[k] = v; if (++n > 40) break; } } return o; };
    const mkSlot = (rec, kind, list) => {
      const c = DR_COL[kind];
      const slot = el('div', { className: 'gi-dslot' });
      slot.style.borderColor = rec ? c : '#333';
      if (rec) {
        slot.style.boxShadow = `0 0 6px ${c}`;
        slot.addEventListener('mouseenter', ev => showTip(rec, kind, ev));
        slot.addEventListener('mousemove', ev => moveTip(ev));
        slot.addEventListener('mouseleave', hideTip);
        const urls = itemUrls(rec.icon);
        const next = () => { const u = urls.shift() || (rec.snap && !rec.snapTried ? (rec.snapTried = 1, rec.snap) : ''); if (!u) { slot.textContent = '?'; return; } const im = new Image(); im.onload = () => { rec._src = u; im.style.cssText = 'max-width:100%;max-height:100%;image-rendering:pixelated'; slot.textContent = ''; slot.append(im); }; im.onerror = next; im.src = u; };
        next();
        slot.addEventListener('contextmenu', ev => { ev.preventDefault(); hideTip(); if (kind === 'leg') dst.leg = dst.leg.filter(x => x !== rec); else dst.left = dst.left.filter(x => x !== rec); saveD(); renderD(); });
      }
      return slot;
    };
    function renderD() {
      const mk = (list, n, forced) => { const g = el('div', { className: 'gi-dgrp' }); for (let i = 0; i < n; i++) { const rec = list[i]; g.append(mkSlot(rec, rec ? (forced || rec.r) : (forced || 'her'), list)); } return g; };
      const left = ((dst && dst.left) || []).filter(x => dcfg[x.r]);
      view.replaceChildren(mk(left, dcfg.n), el('div', { className: 'gi-dsep' }), mk((dst && dst.leg) || [], 3, 'leg'));
    }
    // Dropy = przedmioty widoczne w OKNIE ŁUPÓW (po zabiciu potwora). Czytamy je z DOM: element przedmiotu (item-id-…) wewnątrz
    // kontenera z „loot” w klasie (albo przedmiot, którego lokalizacja w danych to nie torba/ekwipunek). Rzadkość: t-her / t-leg / t-uni*.
    const RAR_RE = /(?:^|\s)t-(leg|her|uni)\w*/;
    function domLoot() {
      const out = new Map();
      document.querySelectorAll('[class*="item-id-"]').forEach(node => {
        if (node.closest('#gi-panel,.gi-float,[class*="tip" i]')) return;
        const id = idOf(node);
        if (!id || out.has(id)) return;
        const d = itemData(id);
        const inLoot = !!node.closest('[class*="loot" i]');
        const loc = d && d.loc != null ? String(d.loc) : '';
        if (!inLoot && !(loc === 'l' || loc === 'loot')) return;
        if (loc === 'g') return; // torba
        let r = '';
        for (const c of [node, ...node.querySelectorAll('*')]) { const m = RAR_RE.exec(clsOf(c) + ' ' + (c.getAttribute && c.getAttribute('data-item-type') || '')); if (m) { r = m[1]; break; } }
        if (!r) { const m = /rarity=(unique|heroic|legendary)/.exec(String((d && d.stat) || '')); if (m) r = { unique: 'uni', heroic: 'her', legendary: 'leg' }[m[1]]; }
        if (!r) { const t = node.getAttribute('data-item-type') || ''; if (/uni/i.test(t)) r = 'uni'; else if (/her/i.test(t)) r = 'her'; else if (/leg/i.test(t)) r = 'leg'; }
        out.set(id, { id, node, r, d, loc });
      });
      return [...out.values()];
    }
    function snapOf(node) {
      try { const cv = node.querySelector('canvas'); if (!cv) return ''; const u = cv.toDataURL('image/png'); return u.length < 12000 ? u : ''; } catch (e) { return ''; }
    }
    function scan() {
      if (!dropsEnabled) return;
      const id = safe(() => W.Engine.hero.d.id, 0);
      if (!id) return;
      if (id !== hid) { hid = id; dst = loadFor(id); renderD(); }
      const loot = domLoot();
      const cnt = { her: 0, uni: 0, leg: 0 }; loot.forEach(x => { if (x.r) cnt[x.r]++; });
      statusEl.textContent = loot.length ? `w oknie łupów: ${loot.length} przedm. · heroiki ${cnt.her}, unikaty ${cnt.uni}, legendy ${cnt.leg}` : 'Czekam na okno łupów (po zabiciu potwora).';
      const known = new Set(dst.known);
      let ch = false;
      loot.forEach(x => {
        if (known.has(String(x.id))) return;
        dst.known.push(String(x.id)); ch = true;
        if (!x.r) return;
        const rec = { id: String(x.id), r: x.r, name: String((x.d && x.d.name) || 'Przedmiot'), icon: String((x.d && x.d.icon) || ''), d: compactD(x.d), snap: snapOf(x.node), t: Date.now() };
        captureTip(x.node, rec.name, false).then(h => { if (h) { rec.tip = h; saveD(); renderD(); } });
        if (x.r === 'leg') { dst.leg.unshift(rec); dst.leg.length = Math.min(dst.leg.length, 3); }
        else { dst.left.unshift(rec); dst.left.length = Math.min(dst.left.length, 40); }
      });
      if (ch) { saveD(); renderD(); }
    }
    renderD();
    setInterval(() => { try { scan(); } catch (err) { log('dropy – błąd', err); } }, 2000);

    // ustawienia (⚙)
    const clearBtn = el('button', { textContent: 'Wyczyść sloty tej postaci' });
    clearBtn.addEventListener('click', () => { if (dst) { dst.left = []; dst.leg = []; saveD(); renderD(); } });
    const nSel = isolate(el('select', {}));
    for (let i = 3; i <= 9; i++) nSel.append(el('option', { value: String(i), textContent: String(i), selected: dcfg.n === i }));
    nSel.addEventListener('change', () => { dcfg.n = Number(nSel.value); writeLS(DR_CFG_KEY, dcfg); renderD(); if (root.clearSize) root.clearSize(); });
    const mkChk = (key, label) => {
      const cb = el('input', { type: 'checkbox', checked: !!dcfg[key] });
      cb.addEventListener('change', () => { dcfg[key] = cb.checked; writeLS(DR_CFG_KEY, dcfg); renderD(); });
      return el('label', { style: 'display:block' }, cb, ' ' + label);
    };
    const dbg = isolate(el('textarea', { rows: 6, readOnly: true, placeholder: 'Diagnostyka dropów' }));
    dbg.style.fontSize = '10px';
    const dbgBtn = el('button', { textContent: 'Diagnostyka dropów' });
    dbgBtn.addEventListener('click', async () => {
      const loot = domLoot();
      dbg.value = 'Zbieram dane…';
      const probe = loot[0] ? await captureTip(loot[0].node, String((loot[0].d && loot[0].d.name) || ''), true) : null;
      const tipKeys = { engine: safe(() => Object.keys(W.Engine).filter(k => /tip/i.test(k)), []), win: Object.keys(W).filter(k => /tip/i.test(k)).slice(0, 20), tipsObj: safe(() => { const T = W.TIPS; return T ? { type: typeof T, keys: Object.keys(T).slice(0, 20) } : null; }, null), jqTip: safe(() => String((W.$ || W.jQuery).fn.tip).slice(0, 700), null), itemAttrs: loot[0] ? [...loot[0].node.attributes].map(a => a.name + '=' + String(a.value).slice(0, 40)) : null };
      const scriptHits = [];
      for (const u of [...document.scripts].map(x => x.src).filter(x => /margonem\.pl\/js\//.test(x)).slice(0, 4)) { try { const t = await (await fetch(u, { credentials: 'omit' })).text(); for (const kw of ['fn.tip=', 'fn.tip =', 'getItemTip', 'createItemTip', 'setTipHeader=', 'function setTipHeader']) { const i = t.indexOf(kw); if (i >= 0) scriptHits.push({ kw, ctx: t.slice(Math.max(0, i - 200), i + 700) }); if (scriptHits.length > 5) break; } } catch (err) { /* pomijamy */ } }
      const chain = n => { const a = []; for (let c = n; c && c !== document.body && a.length < 8; c = c.parentElement) a.push(c.tagName.toLowerCase() + '.' + clsOf(c).split(/\s+/).slice(0, 3).join('.')); return a; };
      const out = {
        heroId: hid, lootItems: loot.length,
        lootSample: loot.slice(0, 6).map(x => ({ id: x.id, rarity: x.r, itemType: x.node.getAttribute('data-item-type'), statRarity: /rarity=(\w+)/.exec(String((x.d && x.d.stat) || '')) ? /rarity=(\w+)/.exec(String(x.d.stat))[1] : null, name: x.d && x.d.name, loc: x.loc, icon: x.d && x.d.icon, chain: chain(x.node) })),
        lootElements: [...document.querySelectorAll('[class*="loot" i]')].filter(n => !n.closest('#gi-panel,.gi-float')).slice(0, 10).map(n => ({ tag: n.tagName, cls: clsOf(n).slice(0, 80), items: n.querySelectorAll('[class*="item-id-"]').length, shown: n.offsetParent !== null })),
        rarityChains: [...document.querySelectorAll('[class*="item-id-"] [class*="t-"]')].slice(0, 4).map(n => chain(n.closest('[class*="item-id-"]') || n)),
        left: dst && dst.left.length, leg: dst && dst.leg.length, known: dst && dst.known.length,
        savedTips: dst ? dst.left.concat(dst.leg).filter(x => x.tip).length : 0,
        tipProbe: probe && probe.info, tipProbeGotHtml: !!(probe && probe.html), tipKeys, scriptHits
      };
      dbg.value = JSON.stringify(out, null, 1); dbg.select();
      if (navigator.clipboard) navigator.clipboard.writeText(dbg.value).catch(() => {});
    });
    const resetBtn = el('button', { textContent: 'Resetuj pozycję okna' });
    resetBtn.addEventListener('click', () => { if (root.resetPos) root.resetPos(); });
    const sets = setTabs([
      ['Wizualne', [mkChk('her', 'Pokazuj heroiki (niebieska ramka)'), mkChk('uni', 'Pokazuj unikaty (złota ramka; wymieszane z heroikami po lewej)'), el('div', { style: 'margin-top:4px' }, 'Liczba slotów heroików/unikatów (3–9): ', nSel)]],
      ['Funkcje', [el('div', { textContent: 'Lewa strona: 3–9 ostatnich heroików i (opcjonalnie) unikatów, najnowszy pierwszy, prawa: 3 ostatnie legendy – osobno dla każdej postaci. Prawy klik na slocie usuwa przedmiot.', style: 'color:#888;margin-bottom:4px' }), el('div', {}, clearBtn), el('details', {}, el('summary', { textContent: 'Diagnostyka' }), dbgBtn, dbg)]],
      ['Okno', [el('div', {}, resetBtn)]]
    ]);
    const gear = el('button', { textContent: '⚙', title: 'Ustawienia (osobne okno)' });
    gear.addEventListener('click', () => { if (root.openSettings) root.openSettings(); });
    const root = el('div', {}, view, statusEl);
    root.settingsBox = sets;
    root.gearBtn = gear;
    return root;
  }


  // ───────────── Dodatek: Przelogowanie (własny pasek postaci) ─────────────
  // Dane postaci: Engine.characterList (nick, lvl, outfit…) albo – gdy nie da się ich odczytać – miniatury z wbudowanego okna
  // przelogowania (.relogger__one-character). Przełączenie = to samo kliknięcie, które wykonałbyś w oknie z gry.
  const RELOG_ON_KEY = 'gi_relog_on_v1', RELOG_CFG_KEY = 'gi_relog_cfg_v1';
  let relogEnabled = (() => { try { return localStorage.getItem(RELOG_ON_KEY) !== '0'; } catch (e) { return true; } })();
  let relogApi = null, relogApi_diag = null;
  const iconBase = u => String(u || '').split('?')[0].split('/').pop();

  function buildRelogView() {
    const cfg = Object.assign({ rows: 1, outfit: true, nick: true, lvl: true, prof: false, world: false, size: 44, nickRight: false, order: 'game', dbl: false, activeHl: true, bare: true, worldOnly: true, worldSel: '', worldTiles: [], orient: 'h', ultra: false }, readLS(RELOG_CFG_KEY, {}));
    const saveCfg = () => writeLS(RELOG_CFG_KEY, cfg);
    const heroNow = () => safe(() => W.Engine.hero.d, {}) || {};

    function listData() {
      const root = safe(() => W.Engine.characterList, null);
      if (!root) return [];
      const out = [], seen = new Set(); let budget = 4000;
      const walk = (o, depth) => {
        if (!o || typeof o !== 'object' || seen.has(o) || budget-- <= 0 || depth > 4) return;
        seen.add(o);
        const d = (o.d && typeof o.d === 'object') ? o.d : o;
        if (typeof d.nick === 'string' && d.nick && (d.id != null || d.lvl != null || d.icon || d.img)) { out.push(d); return; }
        Object.keys(o).forEach(k => { let v; try { v = o[k]; } catch (e) { return; } if (v && typeof v === 'object') walk(v, depth + 1); });
      };
      walk(root, 0);
      const uniq = new Map(); out.forEach(d => uniq.set(String(d.id != null ? d.id : d.nick), d));
      return [...uniq.values()];
    }
    function domAvatars() {
      return [...document.querySelectorAll('.relogger__one-character')].filter(n => !n.closest('.gi-float,#gi-panel')).map((n, i) => {
        let url = '';
        for (const c of [n, ...n.querySelectorAll('*')]) {
          if (c.tagName === 'IMG' && c.src) { url = c.src; break; }
          const m = /url\(["']?([^"')]+)["']?\)/.exec(getComputedStyle(c).backgroundImage || ''); if (m) { url = m[1]; break; }
        }
        const nm = n.getAttribute('title') || n.getAttribute('data-nick') || n.getAttribute('data-name') || n.getAttribute('aria-label') || '';
        return { el: n, i, url, nm, disabled: n.classList.contains('disabled') };
      });
    }
    // światy: grupy z wbudowanego okna (.relogger__char-group) albo pole „world” w danych postaci
    function worldList() {
      const groups = [...document.querySelectorAll('.relogger__char-group')].filter(g => !g.closest('.gi-float,#gi-panel'));
      if (groups.length) return groups.map((g, i) => {
        const t = g.querySelector('[class*="title" i],[class*="name" i],[class*="world" i],h1,h2,h3,h4,h5') || g.previousElementSibling;
        let label = (g.getAttribute('data-world') || g.getAttribute('title') || (t && !t.querySelector('.relogger__one-character') && t.textContent) || '').replace(/\s+/g, ' ').trim().slice(0, 24);
        if (!label) label = 'Świat ' + (i + 1);
        return { key: 'g' + i, label, active: g.classList.contains('active'), group: g };
      });
      const names = [...new Set(listData().map(d => d.world || d.server || d.w).filter(Boolean).map(String))];
      return names.map(n => ({ key: 'w:' + n, label: n, active: normName(n) === curWorld(), group: null }));
    }
    const curWorld = () => { const h = location.hostname.split('.')[0]; const m = /\/\/([a-z0-9-]+)\.margonem/i.exec(String(heroNow().mpath || '')); return normName(m ? m[1] : h); };
    function getChars(all) {
      const data = listData(), av = domAvatars();
      const h = heroNow();
      let chars;
      if (data.length) {
        // Okno gry tworzy miniatury grupami światów (data-world), w kolejności getSortedCharacters: poziom, potem nick.
        // Wiele postaci ma ten sam outfit (np. klanowy), więc parujemy po świecie + kolejności, a outfit służy tylko do sprawdzenia.
        const pairs = new Map(), claimed = new Set();
        const avOf = new Map(av.map(a => [a.el, a]));
        const lists = new Map();
        document.querySelectorAll('.relogger__char-group').forEach(g => { if (!g.closest('.gi-float,#gi-panel')) lists.set(String(g.getAttribute('data-world') || ''), [...g.querySelectorAll('.relogger__one-character')]); });
        data.slice().sort((a, b) => (a.lvl - b.lvl) || String(a.nick).localeCompare(String(b.nick))).forEach(d => {
          const lst = lists.get(String(d.world || '')) || (lists.size ? [] : av.map(a => a.el));
          const base = iconBase(d.icon || d.img);
          const free = lst.filter(x => !claimed.has(x));
          const byId = free.find(x => x.getAttribute('data-char-id') != null && String(x.getAttribute('data-char-id')) === String(d.id));
          const byIcon = free.find(x => base && avOf.get(x) && iconBase(avOf.get(x).url) === base);
          const el0 = byId || byIcon || free[0];
          if (el0) { claimed.add(el0); pairs.set(String(d.id), avOf.get(el0) || null); }
        });
        chars = data.map(d => {
          const icon = d.icon || d.img || d.outfit || d.look || '';
          const a = pairs.get(String(d.id)) || null;
          return { id: d.id, nick: d.nick, lvl: d.lvl || d.level || 0, prof: d.prof || '', world: d.world || d.server || d.w || '', icon, av: a };
        });
      } else {
        chars = av.map(a => ({ id: a.i, nick: a.nm, lvl: 0, prof: '', world: '', icon: a.url, av: a }));
      }
      chars.forEach(c => { c.active = (c.id != null && h.id != null && String(c.id) === String(h.id)) || (!data.length && c.nick && normName(c.nick) === normName(h.nick)) || (iconBase(c.icon) && iconBase(c.icon) === iconBase(h.img) && !data.length); });
      const ws = !all && (cfg.worldTiles || []).length && cfg.worldSel ? worldList().find(w => normName(w.label) === normName(cfg.worldSel)) : null;
      if (ws) {
        const f = chars.filter(c => c.world ? normName(c.world) === normName(ws.label) : (ws.group && c.av && ws.group.contains(c.av.el)));
        if (f.length) chars = f;
      } else if (!all && cfg.worldOnly) {
        let f = chars;
        const w = curWorld();
        if (f.some(c => c.world)) f = f.filter(c => normName(c.world) === w || !c.world);          // pole „świat” w danych postaci
        else if (document.querySelector('.relogger__char-group')) {                                 // grupy światów w oknie gry: aktywna = bieżący świat
          const g = f.filter(c => { const gr = c.av && c.av.el.closest('.relogger__char-group'); return gr && gr.classList.contains('active'); });
          if (g.length) f = g;
        }
        if (f.length) chars = f;
      }
      if (cfg.order === 'lvl') chars.sort((a, b) => b.lvl - a.lvl);
      else if (cfg.order === 'nick') chars.sort((a, b) => String(a.nick).localeCompare(String(b.nick), 'pl'));
      return chars;
    }
    let lastSwitch = null, clickStartId = null;
    function clickEl(n) {
      const ev = (T, t) => n.dispatchEvent(new T(t, { bubbles: true, cancelable: true, button: 0, detail: 1 }));
      ev(PointerEvent, 'pointerdown'); ev(MouseEvent, 'mousedown'); ev(PointerEvent, 'pointerup'); ev(MouseEvent, 'mouseup'); ev(MouseEvent, 'click');
      // jedno kliknięcie wystarczy: gra odlicza 5 s i dopiero przełącza (ponowne kliknięcie anulowałoby odliczanie)
    }
    const toastEl = el('div', { className: 'gi-rtoast' });
    let toastT = 0;
    const toast = m => { toastEl.textContent = m; clearTimeout(toastT); toastT = setTimeout(() => { toastEl.textContent = ''; }, 5000); };
    async function switchTo(c) {
      if (c.active) { toast('To już ta postać.'); return false; }
      if (c.av && c.av.disabled) { toast('Ta postać jest niedostępna (zablokowana w grze).'); return false; }
      let a = c.av;
      if (!a || !a.el.isConnected) { const fresh = getChars().find(x => (c.id != null && String(x.id) === String(c.id)) || (iconBase(c.icon) && iconBase(x.icon) === iconBase(c.icon))); a = fresh && fresh.av; }
      if (!a) { toast('Nie widzę tej postaci w liście gry. Otwórz raz wbudowane okno przelogowania (jest tworzone przy otwarciu) i spróbuj ponownie.'); return false; }
      const before = heroNow().id; clickStartId = before;
      lastSwitch = { nick: c.nick, id: c.id, cls: String(a.el.className).slice(0, 90), visible: a.el.offsetParent !== null, url: a.url, html: a.el.outerHTML.slice(0, 500), parent: a.el.parentElement && String(a.el.parentElement.className).slice(0, 90), listeners: (() => { try { const jq = W.jQuery || W.$; const ev = jq && jq._data && jq._data(a.el, 'events'); return ev ? Object.keys(ev) : null; } catch (err) { return 'err'; } })() };
      clickEl(a.el);
      setTimeout(() => { if (heroNow().id === before && document.body.contains(a.el)) { toast('Gra nie zareagowała na kliknięcie. Zbieram diagnostykę…'); if (relogApi_diag) relogApi_diag(); } }, 14000);
      return true;
    }

    let uTip = null;
    function hideUTip() { if (uTip) { uTip.remove(); uTip = null; } }
    function moveUTip(ev) { if (!uTip) return; const w = uTip.offsetWidth, h = uTip.offsetHeight; let x = ev.clientX + 14, y = ev.clientY + 16; if (x + w > innerWidth - 4) x = ev.clientX - w - 14; if (y + h > innerHeight - 4) y = ev.clientY - h - 12; uTip.style.left = Math.max(4, x) + 'px'; uTip.style.top = Math.max(4, y) + 'px'; }
    function showUTip(lines, ev) {
      hideUTip();
      uTip = el('div', { className: 'gi-utip' }, ...lines.map((l, i) => el('div', { textContent: l, style: i === 0 ? 'font-weight:bold;color:#fff;font-size:13px' : 'color:#b0b0b0;font-size:12px' })));
      document.body.append(uTip); moveUTip(ev);
    }
    const view = el('div', { className: 'gi-rl' });
    // Kafelki światów nad postaciami: w ustawieniach zaznaczasz, które światy mają się pojawić; klik w kafelek = pokaż postacie tego świata.
    const worldBar = el('div', { className: 'gi-rworlds' });
    ['pointerdown', 'mousedown', 'dblclick'].forEach(t => worldBar.addEventListener(t, e => e.stopPropagation()));
    const worldSetBox = el('div', { className: 'gi-rwset' });
    function renderBar() {
      const ws = worldList();
      cfg.worldTiles = (cfg.worldTiles || []).map(x => normName(x));
      const shown = ws.filter(w => cfg.worldTiles.includes(normName(w.label)));
      const curW = (ws.find(w => w.active) || {}).label || curWorld();
      const sel = normName(cfg.worldSel || curW);
      worldBar.style.display = shown.length && !cfg.ultra ? '' : 'none';
      const sig = JSON.stringify([shown.map(w => w.label), sel, curW]);
      if (worldBar.dataset.sig !== sig) {
        worldBar.dataset.sig = sig;
        worldBar.replaceChildren(...shown.map(w => {
          const t = el('div', { className: 'gi-rwtile' + (normName(w.label) === sel ? ' on' : '') + (w.active ? ' cur' : ''), textContent: w.label, title: w.active ? 'Bieżący świat' : 'Pokaż postacie z tego świata' });
          t.addEventListener('click', () => { cfg.worldSel = w.label; saveCfg(); render(); });
          return t;
        }));
      }
      const ssig = JSON.stringify([ws.map(w => w.label), cfg.worldTiles]);
      if (worldSetBox.dataset.sig !== ssig) {
        worldSetBox.dataset.sig = ssig;
        worldSetBox.replaceChildren(el('div', { textContent: 'Światy jako kafelki nad postaciami (zaznacz, które pokazać):', style: 'color:#9ecbe0;margin-top:4px' }), ...(ws.length ? ws.map(w => {
          const cb = el('input', { type: 'checkbox', checked: cfg.worldTiles.includes(normName(w.label)) });
          cb.addEventListener('change', () => {
            const k = normName(w.label);
            cfg.worldTiles = cb.checked ? [...new Set([...cfg.worldTiles, k])] : cfg.worldTiles.filter(x => x !== k);
            if (!cfg.worldTiles.includes(normName(cfg.worldSel))) cfg.worldSel = '';
            saveCfg(); render();
          });
          return el('label', { style: 'display:inline-block;margin-right:10px' }, cb, ' ' + w.label + (w.active ? ' ●' : ''));
        }) : [el('span', { textContent: 'Brak danych o światach – otwórz raz okno przelogowania z gry.', style: 'color:#888' })]));
      }
    }
    // Skalowanie całości rozmiarem okna: po zmianie rozmiaru okna (uchwyt w rogu) cała zawartość skaluje się proporcjonalnie.
    let fitRO = null, rootEl = null;
    function fit() {
      const box = rootEl && rootEl.closest('.gi-float');
      if (!box) return;
      if (!fitRO && window.ResizeObserver) { fitRO = new ResizeObserver(() => fit()); fitRO.observe(box); }
      if (box.style.display === 'none') return;
      if (!box.style.width) { zoomBox.style.zoom = '1'; if (box.style.height) box.style.height = ''; return; } // okno bez ręcznego rozmiaru = rozmiar naturalny
      zoomBox.style.zoom = '1';
      const cs = getComputedStyle(box);
      const nw = zoomBox.offsetWidth || 1, nh = zoomBox.offsetHeight || 1;
      const aw = box.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      const padX = box.clientWidth - aw, padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) + (box.classList.contains('gi-bare') ? 0 : ((box.querySelector('.gi-fhead') || {}).offsetHeight || 0) + 8);
      const maxH = window.innerHeight * 0.9 - padY; // okno nie może wyjść poza ekran (np. 5 rzędów w jednej kolumnie)
      let z = aw / nw; // skalujemy po szerokości okna, wysokość okna dopasowuje się sama (proporcje zawartości zostają)
      if (nh * z > maxH) { z = maxH / nh; box.style.width = Math.round(nw * z + padX) + 'px'; }
      if (box.style.height) box.style.height = '';
      zoomBox.style.zoom = String(Math.min(6, Math.max(0.3, isFinite(z) ? z : 1)));
    }
    function render() {
      const chars = getChars();
      view.style.setProperty('--rows', cfg.rows);
      view.classList.remove('gi-v');
      view.classList.toggle('gi-ultra', !!cfg.ultra);
      renderBar(); fit();
      view.style.fontSize = Math.max(10, Math.round(cfg.size * 0.27)) + 'px';
      view.style.setProperty('--tw', Math.max(76, Math.round(cfg.size * 1.7)) + 'px');
      if (!chars.length) { view.replaceChildren(el('div', { className: 'gi-rempty', textContent: 'Nie widzę listy postaci. Otwórz raz wbudowane okno przelogowania lub użyj ⚙ → Diagnostyka.' })); return; }
      view.replaceChildren(...chars.map(c => {
        const t = el('div', { className: 'gi-ch' + (c.active && cfg.activeHl ? ' gi-ch-on' : '') + (c.av && c.av.disabled ? ' gi-ch-off' : '') + (cfg.nickRight ? ' gi-ch-row' : '') });
        if (!cfg.ultra) t.title = `${c.nick || ''}${c.lvl ? ' · ' + c.lvl + ' lvl' : ''}${c.prof ? ' · ' + c.prof : ''}${c.world ? ' · ' + c.world : ''}\n` + (cfg.dbl ? 'Dwuklik: przełącz' : 'Klik: przełącz');
        if (cfg.outfit) t.append(makeOutfit([c.icon], Math.round(cfg.size * 0.75), cfg.size));
        const info = el('div', { className: 'gi-chi' });
        if (cfg.nick && c.nick) info.append(el('div', { className: 'gi-chn', textContent: c.nick }));
        const sub = [cfg.lvl && c.lvl ? c.lvl + ' lvl' : '', cfg.prof && c.prof ? c.prof : '', cfg.world && c.world ? c.world : ''].filter(Boolean).join(' · ');
        if (sub) info.append(el('div', { className: 'gi-chs', textContent: sub }));
        if (info.children.length && !cfg.ultra) t.append(info);
        if (cfg.ultra) {
          const tipText = () => [c.nick || '', 'Lvl: ' + (c.lvl || '?') + (c.prof || ''), cfg.world && c.world ? 'Świat: ' + c.world : ''].filter(Boolean);
          t.addEventListener('mouseenter', ev => showUTip(tipText(), ev)); t.addEventListener('mousemove', moveUTip); t.addEventListener('mouseleave', hideUTip);
        }
        t.addEventListener(cfg.dbl ? 'dblclick' : 'click', () => { switchTo(c); });
        return t;
      }));
    }
    render();
    let lastSig = '';
    setInterval(() => {
      if (!relogEnabled) return;
      const sig = JSON.stringify(getChars().map(c => [c.id, c.nick, c.lvl, c.active, c.icon, !!(c.av && c.av.disabled)]));
      if (sig !== lastSig) { lastSig = sig; render(); }
    }, 2000);

    // ustawienia
    const mk = (type, props) => isolate(el(type, props));
    const rowsSel = mk('select', {}); [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => [String(n), String(n)]).forEach(([v, l]) => rowsSel.append(el('option', { value: v, textContent: l, selected: String(cfg.rows) === v })));
    rowsSel.addEventListener('change', () => { cfg.rows = Number(rowsSel.value); saveCfg(); render(); });
    const orSel = mk('select', {}); [['h', 'poziome (postacie obok siebie)'], ['v', 'pionowe (postacie jedna pod drugą)']].forEach(([v, l]) => orSel.append(el('option', { value: v, textContent: l, selected: cfg.orient === v })));
    orSel.addEventListener('change', () => { cfg.orient = orSel.value; saveCfg(); if (root.clearSize) root.clearSize(); render(); });
    const ordSel = mk('select', {}); [['game', 'kolejność z gry'], ['lvl', 'wg poziomu (malejąco)'], ['nick', 'wg nicku']].forEach(([v, l]) => ordSel.append(el('option', { value: v, textContent: l, selected: cfg.order === v })));
    ordSel.addEventListener('change', () => { cfg.order = ordSel.value; saveCfg(); render(); });
    const sizeIn = mk('input', { type: 'range', min: 24, max: 80, step: 2, value: cfg.size }); sizeIn.style.cssText = 'width:110px;vertical-align:middle';
    sizeIn.addEventListener('input', () => { cfg.size = Number(sizeIn.value); saveCfg(); if (root.clearSize) root.clearSize(); render(); });
    const chk = (key, label) => { const cb = el('input', { type: 'checkbox', checked: !!cfg[key] }); cb.addEventListener('change', () => { cfg[key] = cb.checked; saveCfg(); render(); if (root.onCfg) root.onCfg(); }); return el('label', { style: 'display:block' }, cb, ' ' + label); };
    const dbg = mk('textarea', { rows: 6, readOnly: true, placeholder: 'Diagnostyka przelogowania' }); dbg.style.fontSize = '10px';
    const dbgBtn = el('button', { textContent: 'Diagnostyka przelogowania' });
    async function collectDiag() {
      const cl = safe(() => W.Engine.characterList, null);
      const prim = o => { const r = {}; Object.keys(o || {}).forEach(k => { const v = o[k]; if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) r[k] = typeof v === 'string' ? v.slice(0, 60) : v; else r[k] = '[' + (Array.isArray(v) ? 'array ' + v.length : typeof v) + ']'; }); return r; };
      const fnSrc = o => { const r = {}; if (!o) return r; let n = 0; const seen = new Set(); for (let c = o; c && c !== Object.prototype && n < 30; c = Object.getPrototypeOf(c)) for (const k of Object.getOwnPropertyNames(c)) { if (seen.has(k)) continue; seen.add(k); let v; try { v = o[k]; } catch (e) { continue; } if (typeof v === 'function' && /char|switch|relog|login|change|select|world/i.test(k)) { r[k] = String(v).slice(0, 500); n++; } } return r; };
      const out = {
        characterListType: cl === null ? null : (Array.isArray(cl) ? 'array' : typeof cl),
        characterListKeys: cl ? Object.keys(cl).slice(0, 40) : null,
        characterListPrim: cl ? prim(cl) : null,
        characterListFns: fnSrc(cl),
        engineRelogKeys: safe(() => Object.keys(W.Engine).filter(k => /relog|switch|login|world|account/i.test(k)), []),
        parsed: listData().slice(0, 6).map(d => prim(d)),
        avatars: domAvatars().slice(0, 8).map(a => ({ cls: String(a.el.className).slice(0, 80), nm: a.nm, url: a.url, disabled: a.disabled, html: a.el.outerHTML.slice(0, 260) })),
        groups: [...document.querySelectorAll('.relogger__char-group,.relogger__characters')].slice(0, 6).map(g => ({ cls: String(g.className).slice(0, 80), kids: g.children.length, shown: g.offsetParent !== null, text: (g.textContent || '').replace(/\s+/g, ' ').slice(0, 60), html: g.outerHTML.slice(0, 300) })),
        worlds: worldList().map(w => ({ key: w.key, label: w.label, active: w.active })),
        relogOpeners: [...document.querySelectorAll('[class*="relog" i],[class*="char-info" i]')].filter(n => !n.closest('.gi-float,#gi-panel')).slice(0, 10).map(n => ({ tag: n.tagName, cls: String(n.className).slice(0, 70), shown: n.offsetParent !== null })),
        lastSwitch,
        curWorld: curWorld(),
        chars: getChars(true).map(c => ({ world: c.world, id: c.id, nick: c.nick, lvl: c.lvl, active: c.active, icon: c.icon, el: !!c.av })),
        scriptHits: []
      };
      // kod gry odpowiedzialny za kliknięcie w postać (żebym mógł odtworzyć przełączanie)
      const srcs = [...document.scripts].map(x => x.src).filter(Boolean).slice(0, 12);
      for (const u of srcs.filter(x => /margonem\.pl\/js\//.test(x))) {
        try {
          const t = await (await fetch(u, { credentials: 'omit' })).text();
          for (const [kw, pre, post] of [['changePlayer(t){', 0, 1400], ['changePlayerRequest(t){', 0, 1200], ['createCharacterAvatar(t,n={})', 0, 1500]]) { const i = t.indexOf(kw); if (i >= 0) out.scriptHits.push({ kw, ctx: t.slice(i - pre, i + post) }); }
        } catch (err) { /* skrypt z innej domeny – pomijamy */ }
        if (out.scriptHits.length >= 3) break;
      }
      return out;
    }
    async function runDiag(copy) {
      dbg.value = 'Zbieram dane…';
      const out = await collectDiag();
      dbg.value = JSON.stringify(out, null, 1); dbg.select();
      if (copy && navigator.clipboard) navigator.clipboard.writeText(dbg.value).then(() => toast('Skopiowałem diagnostykę do schowka – wklej mi ją w czacie.')).catch(() => toast('Nie udało się skopiować. Otwórz ⚙ → Diagnostyka i skopiuj ręcznie.'));
    }
    relogApi_diag = () => runDiag(true);
    dbgBtn.addEventListener('click', () => runDiag(true));
    const resetBtn = el('button', { textContent: 'Resetuj pozycję okna' });
    resetBtn.addEventListener('click', () => { if (root.resetPos) root.resetPos(); });
    const sets = setTabs([
      ['Wizualne', [
        chk('bare', 'Minimalistyczny wygląd (bez ramek; pasek okna po najechaniu)'), chk('ultra', 'Ultra clear: same outfity obok siebie, informacje dopiero po najechaniu'),
        chk('outfit', 'Pokazuj outfit'), chk('nick', 'Pokazuj nick'), chk('lvl', 'Pokazuj poziom'), chk('prof', 'Pokazuj profesję'), chk('world', 'Pokazuj świat'),
        chk('nickRight', 'Nick obok outfitu (zamiast pod spodem)'), chk('activeHl', 'Wyróżnij aktualną postać')]],
      ['Funkcje', [
        el('div', { style: 'color:#888;margin-bottom:4px', textContent: 'Własny pasek postaci. Klik (albo dwuklik) na postaci przełącza ją – tak samo jak w wbudowanym oknie przelogowania.' }),
        worldSetBox, chk('worldOnly', 'Tylko postacie z tego świata'), el('div', {}, 'Kolejność: ', ordSel), chk('dbl', 'Przełączaj dwuklikiem (bezpieczniej)'),
        el('details', { style: 'margin-top:4px' }, el('summary', { textContent: 'Diagnostyka' }), dbgBtn, dbg)]],
      ['Okno', [el('div', {}, 'Ilość rzędów (1–9): ', rowsSel), el('div', {}, 'Rozmiar outfitu: ', sizeIn), el('div', {}, resetBtn)]]
    ]);
    const gear = el('button', { textContent: '⚙', title: 'Ustawienia (osobne okno)' });
    gear.addEventListener('click', () => { if (root.openSettings) root.openSettings(); });
    const zoomBox = el('div', { style: 'width:max-content' }, worldBar, view);
    const root = el('div', { style: 'position:relative' }, zoomBox, toastEl);
    rootEl = root;
    const initFit = setInterval(() => { try { fit(); } catch (err) { /* okno jeszcze nie w DOM */ } if (fitRO) clearInterval(initFit); }, 700);
    root.settingsBox = sets; root.gearBtn = gear; root.cfg = cfg;
    relogApi = {
      // używane przez Minutnik (dwuklik na wierszu): znajdź postać po nicku/outfitcie i przełącz
      async switchByNickOrIcon(nick, icon) {
        const all0 = getChars(true), w0 = curWorld();
        const cs = all0.filter(x => !x.world || normName(x.world) === w0).concat(all0.filter(x => x.world && normName(x.world) !== w0)); // najpierw bieżący świat
        const c = cs.find(x => nick && normName(x.nick) === normName(nick)) || cs.find(x => iconBase(icon) && iconBase(x.icon) === iconBase(icon));
        if (!c) return null;
        return switchTo(c);
      }
    };
    return root;
  }

  // ───────────── Pływające okno (osobne od głównego panelu) ─────────────
  // Przesuwane za pasek tytułu, skalowane z prawego dolnego rogu, zwijane (—) i zamykane (✕).
  // Pozycja, rozmiar, zwinięcie i stan otwarcia są zapamiętywane w przeglądarce.
  function makeFloatWindow(opts) {
    let st = readLS(opts.key, {});
    if (!st || typeof st !== 'object') st = {};
    const save = () => writeLS(opts.key, st);
    const W0 = opts.width || 380;
    const minBtn = el('button', { textContent: '—', title: 'Zwiń / rozwiń' });
    const closeBtn = el('button', { textContent: '✕', title: 'Zamknij' });
    // Tryb „mini”: kółko/przyciski po lewej, tytuł na środku, ✕ po prawej; dwuklik zwija okno.
    const head = opts.mini
      ? el('div', { className: 'gi-fhead', title: 'Przeciągnij, aby przesunąć okno. Dwuklik = zwiń / rozwiń.' },
          el('div', { className: 'gi-fl' }, ...(opts.headLeft || [])),
          el('span', { textContent: opts.title, className: 'gi-ft' }),
          el('div', { className: 'gi-fr' }, closeBtn))
      : el('div', { className: 'gi-fhead', title: 'Przeciągnij, aby przesunąć okno. Dwuklik = pozycja i rozmiar domyślne.' },
          el('span', { textContent: opts.title, style: 'flex:1;font-weight:bold;color:#81d4fa;white-space:nowrap' }), minBtn, closeBtn);
    const box = el('div', { id: opts.id, className: 'gi-float' + (opts.mini ? ' gi-mini' : '') }, head, el('div', { className: 'gi-fbody' }, opts.content));
    if (opts.autoSize) box.classList.add('gi-fitwin');
    if (st.w || !opts.autoSize) box.style.width = (st.w || W0) + 'px';
    if (st.h && !opts.autoSize) box.style.height = st.h + 'px';
    if (st.min) box.classList.add('gi-min');

    function place(x, y) {
      const w = box.offsetWidth || W0;
      const nx = Math.min(Math.max(0, x), Math.max(0, window.innerWidth - Math.min(w, 120))); // kawałek okna zawsze na ekranie
      const ny = Math.min(Math.max(0, y), Math.max(0, window.innerHeight - 44));              // pasek tytułu zawsze widoczny
      box.style.left = nx + 'px'; box.style.top = ny + 'px';
      return { x: nx, y: ny };
    }
    const defPos = () => ({ x: Math.max(0, window.innerWidth - (st.w || W0) - 16), y: opts.top || 90 });
    function setOpen(open) {
      box.style.display = open ? 'block' : 'none';
      st.open = open; save();
      if (open) { const p = typeof st.x === 'number' ? { x: st.x, y: st.y } : defPos(); place(p.x, p.y); }
    }
    closeBtn.addEventListener('click', () => setOpen(false));
    minBtn.addEventListener('click', () => { st.min = box.classList.toggle('gi-min'); save(); });

    let drag = null;
    head.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('button')) return;
      const r = box.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId };
      try { head.setPointerCapture(e.pointerId); } catch (err) { /* starsze przeglądarki */ }
      e.preventDefault();
    });
    head.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const p = place(e.clientX - drag.dx, e.clientY - drag.dy);
      st.x = p.x; st.y = p.y;
    });
    const endDrag = () => { if (!drag) return; drag = null; save(); };
    head.addEventListener('pointerup', endDrag);
    head.addEventListener('pointercancel', endDrag);
    function reset() {
      st = { open: st.open }; save();
      box.classList.remove('gi-min');
      box.style.width = W0 + 'px'; box.style.height = '';
      const p = defPos(); place(p.x, p.y);
    }
    head.addEventListener('dblclick', e => {
      if (e.target.closest('button')) return;
      if (opts.mini) { st.min = box.classList.toggle('gi-min'); save(); } else reset();
    });

    // przeciąganie za treść okna (np. za outfity w trybie Ultra clear): ruch > 6 px = przesuwanie, zwykłe kliknięcie działa jak zawsze
    let bd = null, justDragged = false;
    box.addEventListener('pointerdown', e => {
      if (!opts.dragBody || !opts.dragBody() || e.button !== 0 || e.target.closest('button,select,input,.gi-fhead')) return;
      const r = box.getBoundingClientRect();
      if (r.right - e.clientX < 22 && r.bottom - e.clientY < 22) return; // uchwyt zmiany rozmiaru
      bd = { dx: e.clientX - r.left, dy: e.clientY - r.top, x: e.clientX, y: e.clientY, moved: false };
    });
    document.addEventListener('pointermove', e => {
      if (!bd) return;
      if (!bd.moved && Math.hypot(e.clientX - bd.x, e.clientY - bd.y) < 6) return;
      bd.moved = true;
      const p = place(e.clientX - bd.dx, e.clientY - bd.dy); st.x = p.x; st.y = p.y;
    });
    const endBd = () => { if (bd && bd.moved) { save(); justDragged = true; setTimeout(() => { justDragged = false; }, 60); } bd = null; };
    document.addEventListener('pointerup', endBd, true);
    document.addEventListener('pointercancel', endBd, true);
    ['click', 'dblclick'].forEach(t => box.addEventListener(t, e => { if (justDragged) { e.stopPropagation(); e.preventDefault(); } }, true));

    let resizing = false;
    box.addEventListener('mousedown', e => {
      if (e.target !== box) return;
      const r = box.getBoundingClientRect();
      resizing = r.right - e.clientX < 26 && r.bottom - e.clientY < 26; // uchwyt zmiany rozmiaru
    });
    const endResize = () => {
      if (opts.autoSize && box.style.width) { if (st.w !== box.offsetWidth) { st.w = box.offsetWidth; save(); } return; }
      if (!resizing) return;
      resizing = false;
      st.w = box.offsetWidth; st.h = box.offsetHeight; save();
    };
    document.addEventListener('mouseup', endResize, true);
    document.addEventListener('pointerup', endResize, true);
    window.addEventListener('resize', () => {
      if (box.style.display === 'block' && typeof st.x === 'number') place(st.x, st.y);
    });

    return {
      el: box, setOpen, reset,
      clearSize: () => { st.w = st.h = undefined; box.style.width = box.style.height = ''; save(); },
      toggle: () => setOpen(box.style.display !== 'block'),
      restore: () => { if (st.open) setOpen(true); }
    };
  }


  // ───────────── Dodatek: Ogień przy dropie ─────────────
  // Po pojawieniu się heroika (opcjonalnie legendy / unikatu) w oknie łupów dookoła ekranu pojawia się niebieski ogień na kilka sekund.
  const FLAME_ON_KEY = 'gi_flame_on_v1', FLAME_CFG_KEY = 'gi_flame_cfg_v1';
  let flameEnabled = (() => { try { return localStorage.getItem(FLAME_ON_KEY) !== '0'; } catch (e) { return true; } })();
  function buildFlameView() {
    const cfg = Object.assign({ her: true, uni: true, sec: 10 }, readLS(FLAME_CFG_KEY, {}));
    const save = () => writeLS(FLAME_CFG_KEY, cfg);
    document.head.append(el('style', { textContent: `
      #gi-flame{position:fixed;left:0;top:0;right:0;bottom:0;z-index:99990;pointer-events:none;opacity:0;transition:opacity .6s}
      #gi-flame.on{opacity:1}
      #gi-flame .gi-fl-glow{position:absolute;inset:0;box-shadow:inset 0 0 90px 22px rgba(41,121,255,.55),inset 0 0 200px 40px rgba(79,195,247,.25);animation:gi-flglow 1.1s ease-in-out infinite alternate}
      @keyframes gi-flglow{from{opacity:.65}to{opacity:1}}
      #gi-flame.gi-fl-y .gi-fl-glow{box-shadow:inset 0 0 90px 22px rgba(255,179,0,.55),inset 0 0 200px 40px rgba(255,213,79,.25)}
      #gi-flame.gi-fl-y .gi-fl-edge span{background:radial-gradient(ellipse at 50% 100%,#fffbe0 0%,#ffd54f 25%,#ff9800 55%,rgba(255,111,0,0) 75%)}
      #gi-flame .gi-fl-edge{position:absolute;overflow:hidden}
      #gi-flame .gi-fl-b{left:0;right:0;bottom:0;height:120px}
      #gi-flame .gi-fl-t{left:0;right:0;top:0;height:120px;transform:scaleY(-1)}
      #gi-flame .gi-fl-l{left:0;top:0;width:100vh;height:120px;transform-origin:0 0;transform:translateX(120px) rotate(90deg)}
      #gi-flame .gi-fl-r{left:0;top:0;width:100vh;height:120px;transform-origin:0 0;transform:translate(calc(100vw - 120px),100vh) rotate(-90deg)}
      #gi-flame .gi-fl-edge span{position:absolute;bottom:-20px;border-radius:50% 50% 30% 30% / 80% 80% 20% 20%;transform-origin:50% 100%;
        background:radial-gradient(ellipse at 50% 100%,#e8fbff 0%,#4fc3f7 25%,#1e6bff 55%,rgba(41,98,255,0) 75%);filter:blur(1.2px);animation:gi-flflick .8s ease-in-out infinite alternate}
      @keyframes gi-flflick{0%{transform:scale(.8,.5) skewX(-7deg);opacity:.6}40%{transform:scale(1.05,1) skewX(6deg);opacity:.95}100%{transform:scale(1.1,1.15) skewX(-4deg);opacity:1}}
    ` }));
    const ov = el('div', { id: 'gi-flame' }, el('div', { className: 'gi-fl-glow' }));
    ['b', 't', 'l', 'r'].forEach(k => {
      const e = el('div', { className: 'gi-fl-edge gi-fl-' + k });
      const n = 34;
      for (let i = 0; i < n; i++) {
        const sp = el('span');
        const w = 36 + Math.random() * 44;
        sp.style.cssText = `left:${(i / n) * 100 - 2 + Math.random() * 4}%;width:${w}px;height:${55 + Math.random() * 70}px;animation-delay:${(-Math.random() * 0.8).toFixed(2)}s;animation-duration:${(0.55 + Math.random() * 0.5).toFixed(2)}s`;
        e.append(sp);
      }
      ov.append(e);
    });
    let hideT = 0, remT = 0;
    function show(sec, color) {
      if (!ov.isConnected) document.body.append(ov);
      ov.classList.toggle('gi-fl-y', color === 'yellow');
      clearTimeout(hideT); clearTimeout(remT);
      void ov.offsetWidth;
      ov.classList.add('on');
      hideT = setTimeout(() => ov.classList.remove('on'), Math.max(1, sec) * 1000);
    }
    const RAR = /(?:^|\s)t-(leg|her|uni)\w*/;
    const rarityOf = (node, d) => {
      const t = (clsOf(node) + ' ' + (node.getAttribute('data-item-type') || '') + ' ' + [...node.querySelectorAll('*')].map(clsOf).join(' '));
      let m = RAR.exec(t);
      if (m) return m[1];
      m = /rarity=(unique|heroic|legendary)/.exec(String((d && d.stat) || ''));
      return m ? { unique: 'uni', heroic: 'her', legendary: 'leg' }[m[1]] : '';
    };
    const known = new Set(); let first = true;
    function scan() {
      if (!flameEnabled) return;
      const fresh = [];
      document.querySelectorAll('[class*="item-id-"]').forEach(node => {
        if (node.closest('#gi-panel,.gi-float,[class*="tip" i]')) return;
        const id = idOf(node);
        if (!id || known.has(id)) return;
        const d = itemData(id);
        const loc = d && d.loc != null ? String(d.loc) : '';
        const inLoot = !!node.closest('[class*="loot" i]') || loc === 'l' || loc === 'loot';
        if (!inLoot || loc === 'g') return;
        known.add(id);
        const r = rarityOf(node, d);
        if (r === 'her' || r === 'uni') fresh.push(r);
      });
      if (known.size > 3000) known.clear();
      if (first) { first = false; return; } // to, co już leży w oknie łupów przy starcie skryptu, nie liczy się
      // heroik ma pierwszeństwo: gdy spadną razem heroik i unikat, ogień jest niebieski
      if (fresh.includes('her') && cfg.her) show(cfg.sec, 'blue');
      else if (fresh.includes('uni') && cfg.uni) show(cfg.sec, 'yellow');
    }
    setInterval(() => { try { scan(); } catch (err) { log('ogień – błąd', err); } }, 500);

    const mkChk = (key, label) => { const cb = el('input', { type: 'checkbox', checked: !!cfg[key] }); cb.addEventListener('change', () => { cfg[key] = cb.checked; save(); }); return el('label', { style: 'display:block' }, cb, ' ' + label); };
    const secIn = el('input', { type: 'number', min: 1, max: 60, value: cfg.sec });
    secIn.style.cssText = 'width:52px';
    ['keydown', 'keyup', 'keypress'].forEach(ev => secIn.addEventListener(ev, e => e.stopPropagation()));
    secIn.addEventListener('change', () => { cfg.sec = Math.min(60, Math.max(1, Number(secIn.value) || 10)); save(); });
    const testBtn = el('button', { textContent: '🔥 Test – heroik (niebieski)' });
    testBtn.style.cssText = 'padding:4px 14px;font-weight:bold;margin-right:6px';
    testBtn.addEventListener('click', () => show(cfg.sec, 'blue'));
    const testBtn2 = el('button', { textContent: '🔥 Test – unikat (żółty)' });
    testBtn2.style.cssText = 'padding:4px 14px;font-weight:bold';
    testBtn2.addEventListener('click', () => show(cfg.sec, 'yellow'));
    const root = el('div');
    root.settingsBox = setTabs([
      ['Wizualne', [el('div', { style: 'margin-bottom:6px' }, testBtn, testBtn2), el('div', { textContent: 'Gdy w oknie łupów pojawi się przedmiot o wybranej rzadkości, dookoła ekranu zapala się niebieski ogień.', style: 'color:#888;margin-bottom:4px' }), el('div', {}, 'Czas trwania (s): ', secIn)]],
      ['Funkcje', [mkChk('her', 'Heroiki – niebieski ogień'), mkChk('uni', 'Unikaty – żółty ogień (gdy razem z unikatem wypadnie heroik, zawsze jest niebieski)')]]
    ]);
    root.test = () => show(Math.min(cfg.sec, 5), 'blue');
    root.stop = () => ov.classList.remove('on');
    return root;
  }

  // ───────────── Panel ─────────────
  let panel, status, selBox, pickBtn, rulesBox, urlIn, prev, scopeSel, dumpBox;
  function setStatus(t) { if (status) status.textContent = t; }

  function renderRules() {
    if (!rulesBox) return;
    rulesBox.replaceChildren(...(rules.length ? rules.map((r, i) => {
      const th = el('img', { src: r.url, width: 24, height: 24 });
      th.style.cssText = 'vertical-align:middle;object-fit:contain;background:#111;border:1px solid #2b6c8a;margin-right:4px';
      const x = el('button', { textContent: '×', title: 'Usuń regułę' });
      x.addEventListener('click', () => { rules.splice(i, 1); saveRules(); renderRules(); sweep(); });
      const label = `${r.label || r.key} (${SCOPES[r.scope]})`;
      const row = el('div', {}, th, el('span', { textContent: label.length > 34 ? label.slice(0, 33) + '…' : label, title: label }), ' ', x);
      row.style.cssText = 'padding:2px 0';
      return row;
    }) : [el('div', { textContent: 'Brak reguł.', style: 'color:#888' })]));
  }

  // ustawienia podzielone na zakładki: [['Wizualne',[węzły]], ['Funkcje',[…]], ['Okno',[…]]]
  function setTabs(groups) {
    const bar = el('div', { className: 'gi-stabs' });
    const wrap = el('div', { className: 'gi-rset gi-sbox' }, bar);
    const panes = groups.map(([, nodes]) => el('div', { className: 'gi-spane' }, ...nodes));
    const tabs = groups.map(([label], i) => { const t = el('div', { className: 'gi-stab', textContent: label }); t.addEventListener('click', () => pick(i)); bar.append(t); return t; });
    function pick(i) { tabs.forEach((t, j) => t.classList.toggle('on', i === j)); panes.forEach((pn, j) => { pn.style.display = i === j ? '' : 'none'; }); }
    wrap.append(...panes); pick(0);
    return wrap;
  }

  function isolate(n) { ['keydown', 'keyup', 'keypress'].forEach(ev => n.addEventListener(ev, e => e.stopPropagation())); return n; }

  // ── Motyw wyglądu: „fantasy” (zielone ramki jak w grze) albo „klasyczny” (dotychczasowy niebieski) ──
  const THEME_KEY = 'gi_theme_v1';
  // grafiki ramek i tła wycięte ze zrzutu ekranu gry (zielone kamienie w rogach, pnącza, tekstura ze świetlikami)
  const ART = {"tl": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAABECAYAAADzyHdMAAAXXklEQVR42sV6S4wc15Xlue8Tn/xVRVXxU0WKopJuy66SfyrPuNuk0cAMDYx7pOnGAPJmYPaO3lnGzILaNb0Td0MBszB3pnYmBpg22WM1xFk0QA7an7LdbZGSJTmpD1Ulsj5RlZmREfF+dxZZVayiSLcMNDAJJC5eZMTLE+fdd+99917Cp/gQEf5/fWg/kE9c+tf/QwKYP/396lEXhSCEwADRvzrcP3Yx1B+aif7I5eVtav6lZ/6lKXkPxeqRK84PFlqz3/2JHjnZoxWH+MFvJAns+ZGKRY+Zj/cC3FE9IQgEAhEQtu8I4cEk/GnUmbb1DAAH3p2c9z790ET80CxhD9Vq5wYlCO1WCgJBEME4D+c9XB0+MSM9PKkgaKUAerA81njwLuuPfzV+3JgIQgjI3bWWAhPtBrLJ5vcOTLb+RxQpKCV6SoqKGRBC7E4StjeSFAJaSTSSCI00QhJHSRxLl8RRQkQu0gqRVhBKQAoBKcdfIQW0GEtssw2iXXC8vYpE4oEKxJHCoal293Mn5n5/dGYC65sF1odDhOBx96PNE9aF3qiqYaxDCAFKScSRQiPS2fRE40dS8ZxSqjt+WZ0Vpbm6zUg1rKtLwYY8BM4DI2egFIzMBl4p6xrWeAQAwQfwjkowQ8g9ABuJxkQ7xmeeOMBPHZ6GcYzBqAAJRllYmNpjWFY3CmNeNYaXGmn8QqJx2lp3a7qTnIljhWYcQSsFIkAGoPABUhBqZ1EaBxEEPAc4F8AMFMYu+RCWi6J+1Qderqy7GZjHOsiA3Auw00qgJWOmE3/vqSMHLnZaLXhrIHXA4YkO6tKhqA0GdY3BiDHRaSIRDiur65hoaLQaTUy1UjSTGM4bHEojLJcGDa1BkrBRVYgRIYSAujYwDKwPR0ijGBtbQ1jHGJR1zzMvu8A9BlVKorsLcLKV4MjB9n8/0E5e1EpARALtOMFaf4i5ySYSLdBupAiBcXe9wMagxPGDHaRKol8OYT0w2UqRJjGsNTiQxvhwa4hGFIERtre2QCIJKjA2A+H+Zo7JVgd1beCdg9YKDkBtPWxgKCm2zQyNOW034hcnmgmGoxKjUYVISGwOyusa4fSBLMVM1AJbBthjOBrdMra5MDfRRh0MTGlhQwA5Bx8YQ+sAZlTWIXCAlmJsbEhAkwAJQjPSSCMJLSIgSEy2U1SeURmPynmonV1MBERKotOMTje0PBZCwKh2y4Xxrrb2Zl3XZaOZHpNa4P2VTaysb+WQwo2MzcAMHcdQSkFKwDEj0Rq18ziSdWACQymFgXdoag0fAMOMOgBHpibBQsI4jyjSiOIIW1UNHwTK2sBav9+TOBd6o9qest4jgHIlOWu3orPW2F6/rBA3FNYHBZRSWSPVmWPC+rCENh7NRCLSgPWAkhLGezgGAhGUEHAAjGOEwLAhYKsyiJXGyFoMigpJpDCyHnlRggNhVFYgxphBQYQ4Uug0om95cFIa9w8qkseyyehg1kkhtMw2+sV1ncru5tboxtGDM8cmmxpJmmKtX2JlrX9ByXBKSgnjGCCGBcP4AB8YSkqUzsCaAMuEgTG4u9Zf6ldmbjCqsD4oUNqAvD/CZlGXw2E13ByMrpS1Xd3VQQJgnbtFihMpMRdNcLc5JUCwsN7BqpDHxz0movhUtVFj5BgTiUQziVBW9mRRebgwgveMQaTgQ8AaCUghoaXAQFYgN/Y6xjNqdjfW+sWSAGccQlmb0CVwChJACGASldK6qx64UYbzvocANCLR1Z2AaIJhbI1q4BBSPBc/EdCSCsVKja06LKVCL2opEWt5qjT+elHVOUKAkDpz3vd84GUlVRfEsBNuQRASZq7YyR4zeqZ0S2CGlmLBOr6tBHWVHBt7IWSmI7UNkAHPDMfoQYbMpZyFOKAUBbxyGI58GR0QqWhaBEHwQWK9HF3QNf8IUsIYuxRI5EVlLkeSFmOpTiEQiERaO38TmkEJndFthXKrgh/xFVGJPJbylBCUKSm7WtK8IJFZF24zoRSCsgCUal8kTYRASDnmBS8D+qUFBUZp+XY2HS16eBjL8ELAh5CvbhX/SWnZJUYCqeAc9yRhznte9ozlwJwb55agKJMSCImD8gTOqQQDkZaLgZHvbFLr/e2ydleFlBnAsD7cUjsBppIEqdUchM9YB3h4bGzUkIFQQYAmA8oSGA0tfBSVrUgv3lsdXpAKUEIiUr4rhZzlwKX1/rYPtOwDVqzztziIBRkchA+YzFKUK2rBqnBLazU/LOtL7LiyQtwqK3OtrP1SHEdda0wvMD/YxQSCkOhpKdLmYTrj2SLWGoM1e8soOvanf9VN791Zh9kEhI81F6KMdXJASB5IQW0JzEql5pSkY9uhiGPikoRIucEnqeO+1Tkk0ZARzCp62aHGf4PybePcUqCw6gkrpvZLxoWKSOU+eIABAQCBGbX1GI4M2HKpEgFjAtI4Rl3gVdLInnn2OPq5HUe8KUF4mR2embw40UrOtxr6bKTEYqTFYhTLRanErNQ0qzR1dazmVSqeJ82YmIkQCQEWIZs+mkJ0XBp1xFkkvOgolIEpZx7bUqkjiB1XxwwEMAiAbuJUWVrAS3z4TnG13VTfySXBeYCEBCAxyg3W1utvsMDrkdKLnTR5ITQ8SBCEJGgVwQWPoamWNor6vErFacSEiU6EwUqACZz3iy0MqiFmT0zN3Xmz6nqvV5iBZiebbXdmzhf91YtlYW+LfQcVIiDiRWs8XMUoNt1L7aZa4MBYXe7DVQA7QpHXL43qGsbZJR94eW/IT0QQUowDXCLU3q3YEEopgUhKVANG3Gi9YJ0BVEA6RYhb9Hwct05aGzBz8Mjro9HoSp5v3LYuPGAQBJAEanjEDFR9f3myrV5sNzTsx+X13/7jndPVhocOjGFuL6SJQBTJxUFRvjIc4ZIzvqci0Y21OhVElVNAYuFvj0qzZLb4B+lBvFwPGPfeqy6c+MyJc07+HlMHU5TVCNOHG7jfTxeL8h5arcmFVjt7/eO7dwi0e6obL68QBBbITOWRTUVnprUEOwcucPmjX+enzUZYHnm7kkienz04eavRbgAcMCjKi3EcnwrweWXtdePCEgcqoYAkVYtJM/1Ooi0G9xmb96qXhjP1uXgyBQePUeEQjMLm2vpfex9w5903p+4uL+dfWXz2jTf/6VfPiL3pDSEIIErKwl0+eqyJ40cSmKoGlXRt7Y3RN10evj+8X39zokHnP3tsCjNTTUxNNU9rJRayrPVykiSnvffLpja9UVWv1LVbmZxsvNxu6oVm3EB/mVFuBbyx9AatLZe9esQYDQLy9RJbG1sgMFbvLeeL//bZjV8v/eoZ2jnVAUDWiuA9oxy4V+KOPPf1P/0K6rvv4KMPh8hadLaq6xuSkSSJ/N7s9OQLH3y8juW+/66QPitdfbVY2bhsvV+ZyfQPQwh5qN1tZzy8CUso7fzahzQ3O/Ukvv7vn+bV+8s3Vlc+WGCty6ADJDdQ1iP82cmvs2cDSIc/+fyRv8lX13+wy2Az0V0ww5uwpGOx+MTRA+i0Y2ilEEsxLxxVLa1eyFrJeSkU7q72v313a+vSan94ofauN6jKlao2YKBMY/V8I1aLwQWMhtUlW9pr9UBdLQcO/eEKpPLdyYnD54tNd74chBvHn/oCAGBiOkPc0FjP714aDjZeSZrR/C5AKcWsIEIjVc/FqcCdD36PzS0DQGLQr16pS790eCo6c+TQBN7srZ9ayd2V5vFoowgBRoa5A0cbP8xm4tMf3x99v9VMzh6eafySBGPUNz1buqumGLz63u9vn9jYWD5fllvXjjx15Fzd5wuSW5W1Hs8sPvHGL35xnd68vUQUXC6V6OpILe4ucVm7m2BGKuWc8AFvv3UX8cBga8uirt1SO9VnZw+0cX+tRn9obpYOmP2TdlaW/CP2biVonvcUkriZJmXtrj4113nx/eUBisrD1/5mkGLWG+5RB3MIMv8/f/czAoCTX3jy9OrHKyirretKiy44lNXQXTK177GzvV2Am8MKSSKRQM2Gss5v/eZelkmBj++ZM8EDcwfSH84dznDzF7efF1KAfUD2uQzl0J+pV0tsbZYXzChc+2x3lt9780Na/Pzci41EPVeZcM0Zn3vvc28ZRCHJ17Ze+vqff5FZOGyu31sGUUqCMklImKncuj/qcWBIbfNdgM6PHbM3dmVKNrOBHeaOkU109PlOQ5+b//wx3Hp7DUrFXYIBAIyGFWYXj6K/3Ef/zfvngrfL+XBwVcUCvQ83MDOR/Hhjq25EUmWlCzkJACRS7xzeufUmkaBxlmI73WXrcaLK+3F2hm3Arg76wJACEIGzFsUgp3vOS0y0ou70ZLIwMz2JN9/e+LaQUSbF2HYW/QoHPn8IM1+YRXQwhepE5zaL4asqlovvLedTE604FWAoIbpSADoSAImEBCE4Rl14VJsGo7xGsVHDFA6mcOO037YHEXvjQaUEZiaaZzeHJewIN0xJtzhIbPbr/PV/eBsbm+5Kvln9oJHq5wQBdmgRBHDo+BzimRSiIedYoWsD8qoOOUNCS0JV2aVYi9k4lfPEoopb0WLciNBox1CR2M2kMT4pBfZQvOOT01iDHNLgZb6x6a9vbJrvvntnnWoTUFYWSSRPK0kgy6hHFRqdBmQqAUkgha6lkESJxtagzpupfA4hoJHoF9hjpS785Z3/IWBf/uVRcgxQjB8IgbGWFxePHZmGpjCvEHfvfFh+8/6qvTIqPZgB5xha0UKsAQ2J4f0tsK/BPsC7AFKi68in2cHWjz9Y6U9NtuOXIyW77Uby4qhv8/79+lrVt0vl0KAY1iAiMG/nEx/HoJYPsniVcdfvfLABKcRcrGhOK4IPvC91O521TicR4AcWw5U+NlfXYAsDMIMkzYpYnoTk2dp4dFrxgpaYd9b1lCQ4E+BqD28DvA1w1u+eKh/LoJI0fhMQPPPK7965RwRKlAA6LX16B/xOenZ6qok04nnTtxiuDLD+0X2YwgABEFLMyUSeNsHlAUAjjSEJc1Vpr0eRzDgwrAkIfrxizoTHJzF3AFoHtFIFazza7cb34kR01/Ly21uFuXFkpvl6msjthPr4odpYJAqnUfGyHRhs9tahhIA3fjn4sAyJucLUS81WhNIEAAFbA3MhjeVzn9A1eiDxiLHYsYGRFiCSiLRe7LTjc0Vpb/YLeyFSAp12fHpHVwCgKA1iRafIUY8rj9H9AiIQBFMF5kpozDsZ5pJUnh6ObB4pWqyNRxKp0zv5612m+PHyAcAQAGY00kZmDJYOHeycFYJQjOy1e2uDS4dmGq8rRbsMDkZ1mSg6HZFMNSRQM3zpEcW6C0IiY0rjtj4bxbyYb41ebDfUWaUIaayeJ0GfYO5xchcgM1AZDx98LkBZoiJknfRvnHXY6NvvTmdtTLSj+Z037w/NhadPHMjcyF0JVYAvAkK9nbolTkkyAnmkrfg7Ve2vT0+lIGL4EJalwOON3iPkricpKo+qqqGk7JIXODTdOs/BY3MYMDXZwnSWXt5Rk8HQvfLsF4+gHpiLduiW7DCA7VhVxgnxAONs3phIF1zglYMzTYAZde1uKvWgXPFpvvvSbz54tJvxglYSw8r2Ws1ovu6722++u778zOePL7YPzrPSTRA5zM01QP7XlWBREgsEwxBKQLeSbvuAQEFlNihKfOZzX+B2qw+lZFJW7upnnp7nRmduXwGH/0CF8BOlMCkBJQQ2C/tSuxm/uFX4777b+/jIl5+Z5bdv/Zy2+hYA4b+e+S8sAkMGyoNHHhAyEWmoVCLpKNihQbFR37j/wRvf+PITx1gIyqwPtz96/525tY03Vj5tEXDfmUQqhY3NwY3gPFZzc2Wi0zzbTCgJzHj3vVW0Guo7QhACM/qFhWSCgkAwYSm4sAwp4QLgAoO0gHG+FxjovZ8jBM7jWJ+MtFjcpW2vvj3GlYgHhZzxopeVvRZCgI4bIJLotOJzkSas3Ou/1Gros41UQhDw63/+EIen018Kxz14XobnFQagmyk8CCQFoESXBGE1r/LtslqutVzY0S+SD3b07rWHdvIuwEgTvPfwHsueGQcPzbxcGe5NdNLzjUTO5xvDC+1Un+q09Asgwk9f/+2Vp5+cWIRxSyIgh+dlDgHN6Q4CFCAFolSeEiQwLN0lEFDV/rpSsks7dRBB++tqj7CFuwAnmjFCAOIoOuU5YHoiPQcQNraq7x6bnbg12aTvrW9WF1ut+OyBLJpfy6tvP909jDDyN3WgXGxT1Gg1IeIGXCDoRIGJUZT+MhHSELiy1t/aYUvs3dGP8Sq7ADvN+BwDiCN9kgE0YwkikWxslpdmJho4PBVfLArzaqTl4syE/nFVBRyYakMFdGVALgkpBYYgAZIxAgR0rMDMqIy/TaAkBIYxfmmnogqx32s8qri4C1BrNU8ECIEs0RpbW30wc1XZgA/u9W89feIwDk6nr6+tDr6dRmLh8Ez88j/fXsbxw+3XYcJSJESmGLj3u2WYfIQkiaC1gvcMzwIkRBoYqI2/SWKMxNUBxPtr0Xsl7QXoA68IwfAhrAghUBTFFevDLe8Y99ZH33Ae+OyTU1kr4rOm9rnWNP/2nQ08cXgSmtElE5bI+OViZTOvVodA5SFJwAdGYAIzyp14kjCubAbH+3XuERv7gScpzWVBjMrY6z4w6qq+UdXuOgjYKmz+m7fvL331mSNYeLL5wvpGeWY0slfu3h+dOXp4Cg0lXvCFvRyG5hIPqov1x5s3yntDkBvXbkNg+MArHLaNMvGj/e8jYsJdgP3C3NZqrHeVGZexRrW9gu23/nit/Ortd1fxme5BnPw3x68qge6w9K9+dG8TrYSeb8f6jC/8q1T7m6ION13f3uivleVOHLkDTArarsB/Ope8C3BQGERKJkrKblk7SKK5srIrO8qQDy1u/uqDi4cOTeHfnTyByU50fseANzShncZn3cj3YMMt4dBzg/DK5r3RN8Yh2tjeSQnEkZzfZ/roQaMFPUru9SSHsgQn5jLWSqA2AW+8v0GurnY5bycSf/blQ/zs/Cw6Uxl++toS1vJySeswP3D0yker5iWVEgwTnGWIQAg1I40JrUR0tY7mjz1x6OovfnOHdo4Rn9rVMTOM9dBKgIjQaiYwbnxe2HmNQeXxT79b++pbvTVMZy08cTDBZCddbDWS1BnfowAEw7CFhy0CTBkgQJibO/TDOI5OCiEyJRXCnq6SRzG4dyz2oi0qB+89iAiNNBmf8Hm/cdoY2KVf3l4987d/93MoqfC1rzyJLy08gVYjOttKVUbbGQotgFgRtBZIInF6embm8qgyV269fZeYH/SA7Lah8P5zz85YfaKhhgg+BASI8c1if6eHc4zVzfrVN95Zy47Pti9y3IAQQLuZLIagflyZ6LoL6MVxfHJUuStKR92p6UNdBkAfbaRf/PKz5XvvvX/+/fff+8Ef3buVaIGvPXOUrbVodzK8/o9vUSLDbg774U+nqXH0UPLG9ERjIYoUvGMwAz4A01NT+Gh1iOzgYfzktX/c9/RfPf8X/Pev/W/6o1ujEjVOQ4TAGI7Mw/06u4HljqyMx8dr1Ve3hv75SMvFcZYCGbMoEWUvTs7M4Sev/d+HwH2Lf/XLn5+gTxmx7gMYawHvGQSBQVlfedRZda80NmDDhkoW7oqSdEUIghKA88Dy6lvfP/rEsR/tneMvn/sP/Pev/ZQe2STE+7vjdqTYD1B1jXW9NI4wGI4uPtwQRo+RHBjOM6wNKE2AdQEnPvv073/71p2/BoA/P/U1BoC/vfYa/cV/fI5pu31qx0LsGz+0k/cBlErM1tbdaMQa1rnbDzd98WNkYMD7MUjnxrLdnuwCwAv/+S/55z/7GX3pmad/AgD/839dI62j8fN75+JH7+h9dD91uHMy0mLxS925izffWk5XVvtVosIu5Tu68vD4cTrUbrdR1zWMGevzwYMHF4ej/tJoWH3qlr99DAai3Hu3IoXAjtI/isG9YzzEwl7b1u8PYIzZHd+7d3+prs0n7uM/kB/8f4GtPBe24GHqAAAAAElFTkSuQmCC", "tr": "data:image/png;base64,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", "bl": "data:image/png;base64,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", "br": "data:image/png;base64,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", "top": "data:image/png;base64,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", "bot": "data:image/png;base64,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", "left": "data:image/png;base64,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", "right": "data:image/png;base64,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", "tex": "data:image/jpeg;base64,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"};
  const GAME_BG = ['tl left top', 'tr right top', 'bl left bottom', 'br right bottom'].map(x => { const [k, h, v] = x.split(' '); return `url(${ART[k]}) ${h} ${v} no-repeat`; })
    .concat([`url(${ART.top}) repeat-x left top`, `url(${ART.bot}) repeat-x left bottom`, `url(${ART.left}) repeat-y left top`, `url(${ART.right}) repeat-y right top`, 'linear-gradient(rgba(0,0,0,.38),rgba(0,0,0,.38))', `url(${ART.tex}) left top`]).join(',');
  const applyTheme = t => document.documentElement.classList.toggle('gi-fantasy', t !== 'classic');
  const getTheme = () => { try { return localStorage.getItem(THEME_KEY) === 'classic' ? 'classic' : 'fantasy'; } catch (e) { return 'fantasy'; } };
  applyTheme(getTheme());

  const LOGO = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PGNpcmNsZSBjeD0iMzIiIGN5PSIzMiIgcj0iMzAiIGZpbGw9IiNmN2Q0NGMiIHN0cm9rZT0iI2I4OTAxZSIgc3Ryb2tlLXdpZHRoPSIzIi8+PGNpcmNsZSBjeD0iMzIiIGN5PSIzMiIgcj0iMjQiIGZpbGw9IiNmZmY4ZGMiLz48ZyBmaWxsPSIjYjg5MDFlIj48cmVjdCB4PSIyOSIgeT0iOSIgd2lkdGg9IjYiIGhlaWdodD0iMzQiIHJ4PSIxIi8+PHJlY3QgeD0iMjIiIHk9IjE1IiB3aWR0aD0iMjAiIGhlaWdodD0iNSIgcng9IjEiLz48cmVjdCB4PSIxOSIgeT0iMjQiIHdpZHRoPSIyNiIgaGVpZ2h0PSI1IiByeD0iMSIvPjxyZWN0IHg9IjE2IiB5PSIzMyIgd2lkdGg9IjMyIiBoZWlnaHQ9IjUiIHJ4PSIxIi8+PC9nPjx0ZXh0IHg9IjMyIiB5PSI1NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsLHNhbnMtc2VyaWYiIGZvbnQtd2VpZ2h0PSJib2xkIiBmb250LXNpemU9IjEzIiBmaWxsPSIjN2E1YTBhIj4yMTM3PC90ZXh0Pjwvc3ZnPg==';

  function installTheme() {
    document.head.append(el('style', { id: 'gi-theme-css', textContent: `
      .gi-stabs{display:flex;gap:4px;margin:0 0 6px}
      .gi-stab{flex:1;text-align:center;padding:3px 0;font:bold 11px Arial,sans-serif;color:#9e9e9e;background:#111;border:1px solid #333;border-radius:10px;cursor:pointer;user-select:none}
      .gi-stab:hover{color:#fff;border-color:#666}
      .gi-stab.on{color:#fff;background:#173a4c;border-color:#4fc3f7}
      .gi-sbox{margin-top:0;padding-top:0;border-top:0}
      .gi-spane>*{margin-top:3px}
      .gi-rminwin .gi-rrow{background:transparent !important;border:0 !important;box-shadow:none !important;animation:none !important;padding:1px 4px;margin:0;border-radius:0}
      .gi-rminwin .gi-rrow>img,.gi-rminwin .gi-rrow>canvas,.gi-rminwin .gi-rrow>.gi-flames,.gi-rminwin .gi-rrow>div:not(.gi-rinfo):not(.gi-rtime):not(.gi-rdel){display:none !important}
      .gi-rminwin .gi-rrow .gi-rnick{display:none}
      .gi-rminwin .gi-rname{font-size:12px}
      .gi-rminwin .gi-rrow.gi-fire,.gi-rminwin .gi-rrow.gi-exp{font-weight:bold}
      .gi-rminwin .gi-rrow.gi-fire.gi-fblue{--c:#4fc3f7 !important}
      .gi-rminwin .gi-rrow.gi-fire.gi-fblue.gi-win{--c:#b39ddb !important}
      .gi-rminwin .gi-rtime{font-size:12px}
      .gi-rminwin .gi-rtabs{margin-bottom:2px}
      .gi-themebtn{background:none !important;border:0 !important;color:#ddd;font-size:15px;line-height:1;padding:0 4px !important;margin:0 !important;cursor:pointer}
      html.gi-fantasy .gi-float:not(.gi-bare),html.gi-fantasy #gi-panel{
        border:0;padding:27px 22px 24px;color:#f1ecd2;background:${GAME_BG};background-color:#0a1f12;
        box-shadow:0 6px 22px rgba(0,0,0,.85)}
      html.gi-fantasy .gi-float:not(.gi-bare) .gi-fhead,html.gi-fantasy #gi-head{background:transparent;border-bottom:1px solid rgba(201,178,90,.45);top:0;margin:0 0 6px;padding:2px 6px;color:#f1e3a6}
      html.gi-fantasy .gi-mini:not(.gi-bare) .gi-fhead{background:transparent;border-bottom:0;top:0;margin:0 0 4px;padding:2px 4px}
      html.gi-fantasy .gi-float:not(.gi-bare) .gi-ft{color:#f1e3a6;text-shadow:0 1px 2px #000;letter-spacing:.3px}
      html.gi-fantasy .gi-float h4,html.gi-fantasy #gi-panel h4,html.gi-fantasy .gi-float summary{color:#e6d38a;border-color:#8a7430}
      html.gi-fantasy .gi-float:not(.gi-bare) button,html.gi-fantasy .gi-float:not(.gi-bare) select,html.gi-fantasy #gi-panel button,html.gi-fantasy #gi-panel select{background:linear-gradient(#2a5a30,#16381d);color:#f3ecc8;border:1px solid #9a8236;border-radius:3px}
      html.gi-fantasy .gi-float:not(.gi-bare) .gi-fhead button,html.gi-fantasy #gi-head button{background:none;border:0}
      html.gi-fantasy .gi-float input[type=text],html.gi-fantasy .gi-float input[type=number],html.gi-fantasy .gi-float textarea,html.gi-fantasy #gi-panel input[type=text],html.gi-fantasy #gi-panel textarea{background:#08170d;color:#eaf2da;border:1px solid #6f6128}
      html.gi-fantasy .gi-stab{background:#0c2214;border-color:#4d5a2a;color:#b9c79a}
      html.gi-fantasy .gi-stab.on{background:linear-gradient(#2f6a37,#1a4423);border-color:#c9b25a;color:#fff1b8}
      html.gi-fantasy .gi-rtab{background:#0c2214;border-color:#4d5a2a}
      html.gi-fantasy .gi-rtab.on{background:#1a4423}
      :where(html.gi-fantasy) .gi-rrow{background:#0a1c10}
      :where(html.gi-fantasy) .gi-ch,:where(html.gi-fantasy) .gi-rwtile,:where(html.gi-fantasy) .gi-dslot{background:#0a1c10;border-color:#4d5a2a}
      html.gi-fantasy .gi-add{background:#0a1c10 !important;border-color:#9a8236 !important}
      html.gi-fantasy .gi-rset{border-color:#4d5a2a}
      html.gi-fantasy .gi-mtitle{color:#f1e3a6 !important}
      html.gi-fantasy .gi-mdesc{color:#d9e2c4 !important}
      html.gi-fantasy .gi-float:not(.gi-bare) .gi-fhead>span{color:#f1e3a6 !important}
      html.gi-fantasy .gi-mitem{background:linear-gradient(#17391f,#0d2415) !important;border-color:#8a7430 !important}
      html.gi-fantasy .gi-mitem:hover{border-color:#d8c36a !important}
      html.gi-fantasy .gi-mgear{background:linear-gradient(#2a5a30,#16381d) !important;border-color:#9a8236 !important}
      html.gi-fantasy .gi-dsep{background:linear-gradient(#0000,#c9b25a,#0000)}
      #gi-ask{position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:99997;display:flex;flex-direction:column;gap:8px;align-items:center;cursor:move;touch-action:none}
      .gi-askc{min-width:260px;max-width:420px;text-align:center;background:#0a1820;border:2px solid #4fc3f7;border-radius:8px;padding:10px 16px;color:#e6f4fb;font:13px/1.4 Arial,sans-serif;box-shadow:0 6px 22px rgba(0,0,0,.85)}
      .gi-askt{font-weight:bold;font-size:15px;color:#ffd54f}
      .gi-asks{margin:2px 0 8px}
      .gi-askb{display:flex;gap:8px;justify-content:center}
      .gi-askb button{background:#123446;color:#e6f4fb;border:1px solid #4fc3f7;border-radius:4px;padding:4px 14px;cursor:pointer;font:bold 12px Arial,sans-serif}
      .gi-askb button:hover{filter:brightness(1.25)}
      html.gi-fantasy .gi-askc{border:0;padding:30px 34px 28px;background:${GAME_BG};background-color:#0a1f12;color:#f1ecd2}
      html.gi-fantasy .gi-askt{color:#f1e3a6;text-shadow:0 1px 2px #000}
      html.gi-fantasy .gi-askb button{background:linear-gradient(#2a5a30,#16381d);border-color:#9a8236;color:#f3ecc8}
    ` }));
  }

  function build() {
    document.head.append(el('style', { textContent: `
      #gi-btn{position:fixed;left:8px;bottom:8px;z-index:99999;width:32px;height:32px;border-radius:50%;
        background:#fff8dc url("${LOGO}") center/cover no-repeat;border:2px solid #d9b13a;box-shadow:0 0 6px rgba(0,0,0,.7);cursor:pointer;user-select:none}
      .gi-rl{width:max-content;display:grid;grid-auto-flow:column;grid-template-rows:repeat(var(--rows,1),auto);gap:6px;padding:6px;justify-content:start;align-items:stretch}
      .gi-rl.gi-v{grid-auto-flow:row;grid-template-rows:none;grid-template-columns:repeat(var(--rows,1),auto)}
      .gi-utip{position:fixed;z-index:100001;pointer-events:none;background:rgba(5,5,5,.96);border:1px solid #333;border-radius:3px;padding:6px 12px;text-align:center;font-family:Arial,sans-serif;box-shadow:0 2px 8px #000}
      .gi-ultra{gap:2px !important}
      .gi-ultra .gi-ch{width:auto !important;padding:0 !important;border:0 !important;background:transparent !important;box-shadow:none !important}
      .gi-ultra .gi-ch>div:first-child{background:transparent !important;border:0 !important}
      .gi-ultra .gi-ch:hover{filter:brightness(1.25)}
      .gi-ultra .gi-ch-on{filter:drop-shadow(0 0 4px #4fc3f7)}
      .gi-ch{display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px 6px;width:var(--tw,90px);box-sizing:border-box;border:1px solid #333;border-radius:4px;background:#0b0b0b;cursor:pointer;color:#ddd;font-family:Arial,sans-serif;font-size:inherit;min-width:0}
      .gi-ch.gi-ch-row{flex-direction:row;width:calc(var(--tw,90px) * 1.9)}
      .gi-ch:hover{border-color:#8c6d1f;background:#15110a}
      .gi-ch-on{border-color:#4fc3f7;box-shadow:0 0 8px #4fc3f7}
      .gi-ch-off{opacity:.4;cursor:not-allowed}
      .gi-chi{text-align:center;min-width:0;flex:1 1 auto;max-width:100%}
      .gi-ch-row .gi-chi{text-align:left}
      .gi-chn{font-weight:bold;white-space:normal;overflow-wrap:anywhere;line-height:1.15}
      .gi-chs{color:#9e9e9e;font-size:.9em;white-space:normal;overflow-wrap:anywhere}
      .gi-drops{display:flex;align-items:center;gap:8px;padding:4px 2px}
      .gi-dgrp{display:flex;gap:4px}
      .gi-dslot{width:34px;height:34px;flex:none;box-sizing:border-box;border:1px solid #333;border-radius:4px;background:#050505;display:flex;align-items:center;justify-content:center;color:#607d8b;overflow:hidden}
      .gi-dsep{width:2px;align-self:stretch;background:linear-gradient(#0000,#8c6d1f,#0000)}
      .gi-float,#gi-panel{box-sizing:border-box}
      .gi-float{position:fixed;z-index:var(--gi-z,99998);width:380px;min-width:260px;max-width:98vw;max-height:92vh;resize:both;overflow:auto;display:none;
        background:rgba(10,24,32,.97);color:#e6f4fb;border:2px solid #4fc3f7;border-radius:6px;padding:8px;font:12px/1.5 Arial,sans-serif}
      .gi-float.gi-autoh{height:auto !important;resize:horizontal}
      .gi-float.gi-min{resize:none;overflow:hidden;height:auto !important;min-height:0}
      .gi-float.gi-min .gi-fbody{display:none}
      .gi-float.gi-min .gi-fhead{margin-bottom:-8px;border-bottom:0}
      .gi-fhead{position:sticky;top:-8px;z-index:5;display:flex;align-items:center;gap:6px;margin:-8px -8px 6px;padding:6px 8px;
        background:rgb(10,24,32);border-bottom:1px solid #2b6c8a;cursor:move;user-select:none;touch-action:none}
      .gi-float h4{margin:6px 0 4px;color:#81d4fa;font-size:13px;border-bottom:1px solid #2b6c8a}
      .gi-float summary{cursor:pointer;color:#81d4fa;font-weight:bold;margin:6px 0 2px;user-select:none}
      .gi-float button,.gi-float select{background:#123446;color:#e6f4fb;border:1px solid #4fc3f7;border-radius:3px;cursor:pointer;margin:2px 0}
      .gi-float input[type=text]{width:150px}
      .gi-float input[type=text],.gi-float input[type=number],.gi-float textarea{box-sizing:border-box;background:#06141b;color:#e6f4fb;border:1px solid #2b6c8a}
      .gi-float textarea{width:100%}
      .gi-mini{width:300px;min-width:210px;padding:6px;background:#0a0a0a;border:2px solid #8c6d1f;border-radius:8px}
      .gi-mini .gi-fhead{display:grid;grid-template-columns:1fr auto 1fr;top:-6px;margin:-6px -6px 4px;padding:4px 6px;background:#0a0a0a;border-bottom:0}
      .gi-mini.gi-min .gi-fhead{margin-bottom:-6px}
      .gi-mini .gi-ft{font-weight:bold;color:#fff;font-size:13px;text-align:center}
      .gi-mini .gi-fl{display:flex;gap:2px;align-items:center}
      .gi-mini .gi-fr{display:flex;justify-content:flex-end;align-items:center}
      .gi-float.gi-fitwin{width:max-content;min-width:0;max-width:98vw}
      .gi-float.gi-bare.gi-ultrawin{padding:0 12px 12px 0;cursor:grab}
      .gi-ultrawin .gi-fhead{display:none}
      .gi-float.gi-bare{background:transparent;border:0;box-shadow:none;padding:24px 12px 12px 0;overflow:hidden;resize:both;min-width:0}
      .gi-bare .gi-fhead{position:absolute;left:0;right:0;top:0;height:24px;box-sizing:border-box;margin:0;padding:2px 6px;border-radius:6px 6px 0 0;opacity:0;pointer-events:none;transition:opacity .15s;background:rgba(10,10,10,.92)}
      .gi-bare:hover .gi-fhead{opacity:1;pointer-events:auto}
      .gi-bare .gi-rl{padding:0;gap:10px}
      .gi-bare .gi-ch{border-color:transparent;background:transparent;padding:2px 4px;text-shadow:0 1px 3px #000,0 0 4px #000}
      .gi-bare .gi-ch:hover{background:rgba(0,0,0,.35);border-color:rgba(255,255,255,.18)}
      .gi-bare .gi-ch-on{box-shadow:none;filter:drop-shadow(0 0 5px #4fc3f7);border-color:transparent}
      .gi-rworlds{width:0;min-width:100%;display:flex;flex-wrap:wrap;gap:4px;margin:0 0 4px 0;padding:0 2px}
      .gi-rwtile{padding:2px 9px;border:1px solid #455a64;border-radius:4px;background:#0b0b0b;color:#b0bec5;font:11px Arial,sans-serif;cursor:pointer;user-select:none}
      .gi-rwtile:hover{border-color:#8c6d1f}
      .gi-rwtile.cur{color:#fff}
      .gi-rwtile.on{border-color:#4fc3f7;color:#fff;box-shadow:0 0 6px #4fc3f7}
      .gi-bare .gi-rwtile{background:rgba(0,0,0,.45);text-shadow:0 1px 3px #000}
      .gi-bare .gi-rtoast{position:absolute;left:0;bottom:0;white-space:nowrap}
      .gi-rtabs{display:flex;gap:4px;margin:0 0 5px}
      .gi-rtab{flex:1;text-align:center;padding:2px 0;font:bold 11px Arial,sans-serif;color:#9e9e9e;background:#111;border:1px solid #333;border-radius:10px;cursor:pointer;user-select:none;white-space:nowrap}
      .gi-rtab:hover{color:#fff;border-color:#666}
      .gi-rtab.on{color:#fff;background:#222;border-color:var(--tc,#8c6d1f);box-shadow:0 0 6px var(--tc,#8c6d1f)}
      .gi-mini .gi-fhead button{background:none;border:0;color:#ddd;font-size:16px;line-height:1;padding:0 4px;margin:0;cursor:pointer}
      .gi-mini .gi-fhead button:hover{color:#fff}
      .gi-rrow{position:relative;display:flex;align-items:center;gap:6px;padding:3px 6px;margin:4px 0;border:1px solid var(--c,#8c6d1f);border-radius:4px;background:#0d0d0d;color:var(--c,#ddd)}
      .gi-rrow.gi-exp,.gi-rrow.gi-fire{--c:#ff3b30 !important}
      .gi-rrow>*:not(.gi-flames):not(.gi-rdel){position:relative;z-index:1}
      .gi-flames{display:none;position:absolute;left:0;right:0;top:0;bottom:0;overflow:hidden;border-radius:3px;pointer-events:none;z-index:0}
      .gi-flames span{position:absolute;bottom:-6px;width:20%;height:62%;border-radius:50% 50% 25% 25% / 75% 75% 25% 25%;transform-origin:50% 100%;opacity:.75;
        background:radial-gradient(ellipse at 50% 100%,#fff6b5 0%,#ffc107 28%,#ff5722 58%,rgba(255,59,48,0) 72%);animation:gi-flick .7s ease-in-out infinite alternate;filter:blur(.6px)}
      @keyframes gi-flick{0%{transform:scale(.8,.55) translateX(-3px) skewX(-6deg);opacity:.6}35%{transform:scale(1.05,1) translateX(2px) skewX(5deg);opacity:.95}70%{transform:scale(.9,.75) translateX(-2px) skewX(-3deg);opacity:.75}100%{transform:scale(1.1,1.1) translateX(3px) skewX(7deg);opacity:1}}
      .gi-rrow.gi-fire{background:linear-gradient(0deg,#4a0f0a,#140505 70%);border-width:2px;animation:gi-fpulse 1s ease-in-out infinite alternate}
      .gi-rrow.gi-fire .gi-flames{display:block}
      .gi-rrow.gi-fire.gi-fblue.gi-win{--c:#9575ff !important;background:linear-gradient(0deg,#1d1050,#0a0714 70%);animation-name:gi-fpulsev}
      .gi-fblue.gi-win .gi-flames span{background:radial-gradient(ellipse at 50% 100%,#f1ebff 0%,#9575ff 28%,#4527d6 58%,rgba(83,52,255,0) 72%)}
      @keyframes gi-fpulsev{from{box-shadow:0 0 4px #9575ff,inset 0 0 6px rgba(149,117,255,.35)}to{box-shadow:0 0 14px #9575ff,inset 0 0 14px rgba(103,58,255,.6)}}
      .gi-rrow.gi-fire.gi-fblue{--c:#4fc3f7 !important;background:linear-gradient(0deg,#0a2a4a,#050b14 70%);animation-name:gi-fpulseb}
      .gi-fblue .gi-flames span{background:radial-gradient(ellipse at 50% 100%,#e8fbff 0%,#4fc3f7 28%,#1565c0 58%,rgba(41,121,255,0) 72%)}
      @keyframes gi-fpulseb{from{box-shadow:0 0 4px #4fc3f7,inset 0 0 6px rgba(79,195,247,.35)}to{box-shadow:0 0 14px #4fc3f7,inset 0 0 14px rgba(41,121,255,.6)}}
      @keyframes gi-fpulse{from{box-shadow:0 0 4px #ff3b30,inset 0 0 6px rgba(255,59,48,.35)}to{box-shadow:0 0 14px #ff3b30,inset 0 0 14px rgba(255,87,34,.6)}}
      .gi-rinfo{flex:1;min-width:0}
      .gi-rname{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
      .gi-rnick{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;color:#9e9e9e;line-height:1.1}
      .gi-rt2{font-size:10px;color:#9e9e9e;margin-top:2px;text-align:right}
      .gi-rt1{text-align:right}
      .gi-rtime{flex:none;font:13px/1 Arial,sans-serif;font-variant-numeric:tabular-nums;cursor:pointer}
      .gi-rdel{position:absolute;top:-7px;right:-5px;width:15px;height:15px;line-height:14px;border-radius:50%;background:#5a1515;color:#fff;font-size:11px;text-align:center;cursor:pointer;display:none}
      .gi-rrow:hover .gi-rdel{display:block}
      .gi-rrow.gi-glow{background:linear-gradient(90deg,color-mix(in srgb,var(--c) 16%,#000),#0d0d0d 70%);border-width:2px;box-shadow:0 0 var(--g) var(--c),inset 0 0 calc(var(--g) * .9) color-mix(in srgb,var(--c) 40%,transparent)}
      .gi-rrow.gi-glow .gi-rname{font-weight:bold;text-shadow:0 0 6px var(--c)}
      .gi-rrow[data-sw]{cursor:pointer}
      .gi-rtoast{color:#ffd54f;font-size:12px;padding:2px 4px;white-space:normal}.gi-rtoast:not(:empty){background:#2a2200;border:1px solid #8c6d1f;border-radius:4px;margin:4px 0;padding:4px 6px}
      .gi-rempty{color:#777;font-size:11px;padding:4px 2px}
      .gi-add{display:block;width:100%;background:#000 !important;border:1px solid #8c6d1f !important;color:#ddd;border-radius:4px;font-size:18px;line-height:20px;cursor:pointer;margin:4px 0 0 !important;padding:0}
      .gi-rform{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-top:4px}
      .gi-rset{margin-top:6px;padding-top:6px;border-top:1px solid #333;font-size:11px}
      #gi-panel{position:fixed;left:8px;bottom:48px;z-index:99999;width:300px;min-width:260px;min-height:140px;max-width:98vw;max-height:92vh;resize:both;overflow:auto;display:none;
        background:rgba(10,24,32,.97);color:#e6f4fb;border:2px solid #4fc3f7;border-radius:6px;padding:8px;font:12px/1.5 Arial,sans-serif}
      #gi-panel h4{margin:6px 0 4px;color:#81d4fa;font-size:13px;border-bottom:1px solid #2b6c8a}
      #gi-head{position:sticky;top:-8px;z-index:5;display:flex;align-items:center;gap:6px;margin:-8px -8px 6px;padding:6px 8px;
        background:rgb(10,24,32);border-bottom:1px solid #2b6c8a;cursor:move;user-select:none;touch-action:none}
      #gi-head button{cursor:pointer}
      #gi-panel button,#gi-panel select{background:#123446;color:#e6f4fb;border:1px solid #4fc3f7;border-radius:3px;cursor:pointer;margin:2px 0}
      #gi-panel input[type=text],#gi-panel textarea{width:100%;box-sizing:border-box;background:#06141b;color:#e6f4fb;border:1px solid #2b6c8a}
    ` }));

    pickBtn = el('button', { textContent: '🎯 Wybierz przedmiot' });
    pickBtn.addEventListener('click', () => {
      picking = !picking;
      pickBtn.textContent = picking ? '🎯 Kliknij przedmiot… (ponownie = anuluj)' : '🎯 Wybierz przedmiot';
      if (!picking) clearHl();
      else setStatus('Tryb wyboru: kliknięcia nie trafiają do gry.');
    });

    selBox = el('div', { textContent: 'Nic nie wybrano.', style: 'white-space:pre-wrap;word-break:break-all;color:#b3e5fc' });

    urlIn = isolate(el('input', { type: 'text', placeholder: 'https://…/obrazek.png' }));
    prev = el('img', { width: 48, height: 48 });
    prev.style.cssText = 'display:none;object-fit:contain;background:#06141b;border:1px solid #2b6c8a;margin:4px 0';
    urlIn.addEventListener('input', () => {
      const u = cleanUrl(urlIn.value);
      if (u) { prev.src = u; prev.style.display = 'block'; } else { prev.style.display = 'none'; }
    });
    prev.addEventListener('error', () => setStatus('Nie udało się wczytać obrazka z tego linku (zły adres lub blokada hostingu).'));

    scopeSel = el('select');
    Object.entries(SCOPES).forEach(([v, t]) => scopeSel.append(el('option', { value: v, textContent: t })));

    const apply = el('button', { textContent: '✔ Zastosuj' });
    apply.addEventListener('click', () => {
      if (!sel) return setStatus('Najpierw wybierz przedmiot.');
      const url = cleanUrl(urlIn.value);
      if (!url) return setStatus('Link musi zaczynać się od http:// lub https:// (albo być obrazkiem data:image).');
      const key = scopeSel.value === 'name' ? sel.name : scopeSel.value === 'icon' ? sel.icon : sel.id;
      if (!key) return setStatus('Nie udało się odczytać tej cechy przedmiotu – wybierz inny zakres (np. „tylko ten egzemplarz”).');
      rules = rules.filter(r => !(r.scope === scopeSel.value && String(r.key) === String(key)));
      rules.push({ scope: scopeSel.value, key: String(key), label: sel.name || String(key), url });
      saveRules(); renderRules(); sweep();
      setStatus('Zastosowano. Jeśli grafika nadal wygląda źle, użyj „Kopiuj strukturę przedmiotu” i wklej mi wynik.');
    });

    const onCb = el('input', { type: 'checkbox', checked: enabled });
    onCbRef = onCb;
    onCb.addEventListener('change', () => { enabled = onCb.checked; try { localStorage.setItem(ON_KEY, enabled ? '1' : '0'); } catch (e) {} sweep(); });

    rulesBox = el('div');

    const io = isolate(el('textarea', { rows: 3, placeholder: 'Eksport/import reguł (JSON)' }));
    const exp = el('button', { textContent: 'Eksportuj' });
    exp.addEventListener('click', () => { io.value = JSON.stringify(rules); io.select(); });
    const imp = el('button', { textContent: 'Importuj' });
    imp.addEventListener('click', () => {
      try {
        const arr = JSON.parse(io.value);
        const ok = (Array.isArray(arr) ? arr : []).filter(r => r && SCOPES[r.scope] && r.key && cleanUrl(r.url))
          .map(r => ({ scope: r.scope, key: String(r.key), label: String(r.label || r.key), url: cleanUrl(r.url) }));
        rules = ok; saveRules(); renderRules(); sweep();
        setStatus(`Zaimportowano reguł: ${ok.length}.`);
      } catch (e) { setStatus('Niepoprawny JSON.'); }
    });

    dumpBox = isolate(el('textarea', { rows: 6, readOnly: true, placeholder: 'Tu pojawi się struktura wybranego przedmiotu.' }));
    dumpBox.style.fontSize = '10px';
    const dump = el('button', { textContent: 'Kopiuj strukturę przedmiotu' });
    dump.addEventListener('click', () => {
      if (!selNode || !selNode.isConnected) return setStatus('Najpierw wybierz przedmiot (nadal widoczny w oknie).');
      const wasOverlaid = overlays.has(selNode);
      const text = describeTree(selNode, 0, []).join('\n');
      dumpBox.value = (wasOverlaid ? '[uwaga: przedmiot ma teraz aktywną nakładkę]\n' : '') + text;
      dumpBox.select();
      const done = () => setStatus('Struktura skopiowana – wklej ją w rozmowie.');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(dumpBox.value).then(done, () => setStatus('Zaznacz tekst w polu i skopiuj ręcznie (Ctrl+C).'));
      else setStatus('Zaznacz tekst w polu i skopiuj ręcznie (Ctrl+C).');
      log('struktura:\n' + text);
    });

    status = el('div', { style: 'color:#ffd54f;min-height:16px;margin-top:4px' });

    // ── Widok dodatku: Zmieniacz grafik ──
    const imagesView = el('div', {},
      el('label', {}, onCb, ' Podmiana włączona'),
      el('h4', { textContent: '1. Przedmiot' }), pickBtn, selBox,
      el('h4', { textContent: '2. Nowa grafika' }), urlIn, prev,
      el('div', {}, 'Zakres: ', scopeSel), apply, status,
      el('h4', { textContent: 'Reguły' }), rulesBox,
      el('h4', { textContent: 'Kopia / diagnostyka' }), io, exp, ' ', imp, el('br'), dump, dumpBox
    );

    // ── Widok dodatku: Drop z potworów (miejsce na przyszły dodatek) ──
    // Błąd w jednym dodatku nie może zablokować reszty (ani ikonki).
    const safeView = (name, fn) => {
      try { return fn(); } catch (err) {
        log('błąd dodatku', name, err);
        return el('div', { textContent: `Błąd dodatku „${name}”: ${err.message}`, style: 'color:#ff8a80' });
      }
    };
    const respView = safeView('Respawny', buildRespView);
    const respWin = (() => {
      try {
        const w = makeFloatWindow({
          id: 'gi-resp-win', title: 'Minutnik', key: 'gi_win_resp_v1', content: respView, width: 300, top: 90,
          mini: true, headLeft: respView.gearBtn ? [respView.gearBtn] : []
        });
        respView.resetPos = w.reset;
        respView.onCfg = () => { const c = respView.cfg || {}; w.el.classList.toggle('gi-autoh', c.autoH !== false); w.el.classList.toggle('gi-rminwin', !!c.minimal); };
        respView.onCfg();
        return w;
      } catch (err) { log('błąd okna respawnów', err); return { el: el('div'), toggle() {}, restore() {}, setOpen() {} }; }
    })();

    function applyResp() {
      if (!respEnabled) { respWin.setOpen(false); respSetWin.setOpen(false); } else respWin.restore();
    }

    const dropsView = safeView('Ostatnie dropy', buildDropsView);
    const dropsWin = (() => {
      try {
        return makeFloatWindow({ id: 'gi-drops-win', title: 'Ostatnie dropy', key: 'gi_win_drops_v1', content: dropsView, width: 520, top: 8, mini: true, autoSize: true, headLeft: dropsView.gearBtn ? [dropsView.gearBtn] : [] });
      } catch (err) { log('błąd okna dropów', err); return { el: el('div'), toggle() {}, restore() {}, setOpen() {} }; }
    })();
    const flameView = safeView('Ogień przy dropie', buildFlameView);
    const relogView = safeView('Przelogowanie', buildRelogView);
    const relogWin = (() => {
      try {
        return makeFloatWindow({ id: 'gi-relog-win', title: 'Postacie', key: 'gi_win_relog_v1', content: relogView, width: 420, top: 60, mini: true, autoSize: true, dragBody: () => !!(relogView.cfg && relogView.cfg.ultra), headLeft: relogView.gearBtn ? [relogView.gearBtn] : [] });
      } catch (err) { log('błąd okna postaci', err); return { el: el('div'), toggle() {}, restore() {}, setOpen() {} }; }
    })();
    relogView.onCfg = () => { const c = relogView.cfg || {}; relogWin.el.classList.toggle('gi-bare', c.bare !== false || !!c.ultra); relogWin.el.classList.toggle('gi-ultrawin', !!c.ultra); };
    relogView.onCfg();
    relogView.clearSize = relogWin.clearSize;
    relogView.resetPos = relogWin.reset;
    function applyRelog() {
      if (!relogEnabled) { relogWin.setOpen(false); relogSetWin.setOpen(false); } else relogWin.restore();
    }
    function applyDrops() {
      if (!dropsEnabled) { dropsWin.setOpen(false); dropsSetWin.setOpen(false); } else dropsWin.restore();
    }

    const mkSetWin = (id, title, key, box, top) => {
      try {
        box.style.display = 'block';
        return makeFloatWindow({ id, title, key, content: box, width: 360, top });
      } catch (err) { log('błąd okna ustawień', err); return { el: el('div'), toggle() {}, restore() {}, setOpen() {} }; }
    };
    const respSetWin = mkSetWin('gi-resp-set', 'Ustawienia – Minutnik', 'gi_win_respset_v1', respView.settingsBox || el('div'), 330);
    const dropsSetWin = mkSetWin('gi-drops-set', 'Ustawienia – Ostatnie dropy', 'gi_win_dropset_v1', dropsView.settingsBox || el('div'), 330);
    const relogSetWin = mkSetWin('gi-relog-set', 'Ustawienia – Przelogowanie', 'gi_win_relogset_v1', relogView.settingsBox || el('div'), 330);
    const flameSetWin = mkSetWin('gi-flame-set', 'Ustawienia – Ogień przy dropie', 'gi_win_flameset_v1', flameView.settingsBox || el('div'), 330);
    relogView.openSettings = () => relogSetWin.toggle();
    respView.openSettings = () => respSetWin.toggle();
    dropsView.openSettings = () => dropsSetWin.toggle();
    dropsView.clearSize = dropsWin.clearSize;
    dropsView.resetPos = dropsWin.reset;

    // ── Rejestr dodatków: tu dopisujemy kolejne ──
    const ADDONS = [
      { id: 'grafiki', icon: '🖼', title: 'Zmieniacz grafik', desc: 'Podmienia wygląd wybranych przedmiotów w grze na Twój własny obrazek (np. inna ikona miecza). Zmiana jest widoczna tylko u Ciebie. Wskazujesz przedmiot i wklejasz link do grafiki.', view: imagesView,
        isOn: () => enabled,
        setOn: v => { enabled = v; try { localStorage.setItem(ON_KEY, v ? '1' : '0'); } catch (e) {} if (onCbRef) onCbRef.checked = v; sweep(); } },
      { id: 'resp', icon: '⏱', title: 'Minutnik', desc: 'Okno z licznikami respawnu elit II, herosów i tytanów, z ogniem i dźwiękiem przed respawnem. WYMAGA włączonego i widocznego minutnika z gry – schowaj go pod tym oknem (okno dodatku przesuń na wierzch), bo bez niego czasy są tylko szacowane.', view: el('div'), action: () => { if (respEnabled) respWin.toggle(); },
        settings: () => respSetWin.toggle(),
        isOn: () => respEnabled,
        setOn: v => { respEnabled = v; try { localStorage.setItem(RESP_ON_KEY, v ? '1' : '0'); } catch (e) {} applyResp(); } },
      { id: 'drops', icon: '💎', title: 'Ostatnie dropy', desc: 'Pasek z ostatnimi heroikami i unikatami (3–9) oraz 3 ostatnimi legendami z okna łupów, osobno dla każdej postaci. Najedź na przedmiot, aby zobaczyć jego opis.', view: el('div'), action: () => { if (dropsEnabled) dropsWin.toggle(); },
        settings: () => dropsSetWin.toggle(),
        isOn: () => dropsEnabled,
        setOn: v => { dropsEnabled = v; try { localStorage.setItem(DROPS_ON_KEY, v ? '1' : '0'); } catch (e) {} applyDrops(); } },
      { id: 'flame', icon: '🔥', title: 'Ogień przy dropie', desc: 'Gdy w oknie łupów pojawi się heroik (niebieski ogień) lub unikat (żółty), dookoła ekranu zapala się ogień na kilka sekund. W ustawieniach jest przycisk „Test”.', view: el('div'), action: () => { if (flameEnabled && flameView.test) flameView.test(); },
        settings: () => flameSetWin.toggle(),
        isOn: () => flameEnabled,
        setOn: v => { flameEnabled = v; try { localStorage.setItem(FLAME_ON_KEY, v ? '1' : '0'); } catch (e) {} if (!v) { if (flameView.stop) flameView.stop(); flameSetWin.setOpen(false); } } },
      { id: 'relog', icon: '👥', title: 'Przelogowanie', desc: 'Własny pasek postaci z outfitami, nickiem i poziomem. Klik (lub dwuklik) przełącza postać. Można filtrować po świecie, ustawić liczbę rzędów i tryb „ultra clear” (same outfity).', view: el('div'), action: () => { if (relogEnabled) relogWin.toggle(); },
        settings: () => relogSetWin.toggle(),
        isOn: () => relogEnabled,
        setOn: v => { relogEnabled = v; try { localStorage.setItem(RELOG_ON_KEY, v ? '1' : '0'); } catch (e) {} applyRelog(); } }
    ];

    // Stan okna (pozycja i rozmiar) – zapamiętywany w przeglądarce.
    const WIN_KEY = 'gi_win_v1';
    let win = readLS(WIN_KEY, {});
    if (!win || typeof win !== 'object') win = {};
    const saveWin = () => writeLS(WIN_KEY, win);
    let curId = null;

    const titleEl = el('span', { className: 'gi-mtitle', style: 'font-weight:bold;color:#81d4fa' });
    const backBtn = el('button', { textContent: '←', title: 'Wróć do listy dodatków' });
    const menuView = el('div');
    ADDONS.forEach(a => {
      const txt = el('div', { style: 'flex:1;min-width:0' }, el('div', { textContent: `${a.icon} ${a.title}`, style: 'font-weight:bold;color:#e6f4fb' }), el('div', { className: 'gi-mdesc', textContent: a.desc, style: 'color:#90a4ae;font-size:11px' }));
      const sw = el('button', { title: 'Włącz / wyłącz ten dodatek' });
      const paint = () => {
        const on = a.isOn();
        sw.textContent = on ? 'ON' : 'OFF';
        sw.style.cssText = `flex:none;margin-left:8px;min-width:44px;padding:3px 6px;border-radius:10px;cursor:pointer;font:bold 11px Arial,sans-serif;border:1px solid ${on ? '#2e7d32' : '#7a2b2b'};background:${on ? '#1b5e20' : '#4a1515'};color:#fff`;
        item.style.opacity = on ? '' : '0.6';
      };
      const gb = a.settings ? el('button', { textContent: '⚙', title: 'Ustawienia (osobne okno)' }) : null;
      if (gb) { gb.className = 'gi-mgear'; gb.style.cssText = 'flex:none;margin-left:8px;padding:2px 6px;border-radius:10px;cursor:pointer;background:#123446;border:1px solid #2b6c8a;color:#fff'; gb.addEventListener('click', e => { e.stopPropagation(); a.settings(); }); }
      const item = el('div', {}, txt, ...(gb ? [gb] : []), sw);
      item.className = 'gi-mitem';
      item.style.cssText = 'display:flex;align-items:center;padding:6px 8px;margin:4px 0;border:1px solid #2b6c8a;border-radius:4px;cursor:pointer;background:#0c2431';
      item.addEventListener('mouseenter', () => { item.style.background = '#123446'; });
      item.addEventListener('mouseleave', () => { item.style.background = '#0c2431'; });
      item.addEventListener('click', () => { if (a.isOn && !a.isOn()) return; if (a.action) a.action(); else showView(a.id); });
      sw.addEventListener('click', e => { e.stopPropagation(); a.setOn(!a.isOn()); paint(); });
      a.paint = paint;
      paint();
      menuView.append(item);
    });

    // ── warstwa okien: nad grą (domyślnie) albo pod oknami gry (np. ekwipunek, sklep przykrywają nasze okna) ──
    const LAYER_KEY = 'gi_layer_v1';
    const layerCfg = Object.assign({ mode: 'top' }, readLS(LAYER_KEY, {}));
    const OURS_SEL = '.gi-float,#gi-panel,#gi-ask,#gi-btn,#gi-flame,.gi-utip,.gi-dtip';
    const GAME_WIN_SEL = '.border-window,.ui-draggable,[class*="-wnd"],[class*="window" i]';
    const gameWins = () => [...document.querySelectorAll(GAME_WIN_SEL)].filter(n => {
      if (n.closest(OURS_SEL) || n.offsetParent === null && getComputedStyle(n).position !== 'fixed') return false;
      const r = n.getBoundingClientRect(), cs = getComputedStyle(n);
      return r.width > 20 && r.height > 20 && r.width * r.height < innerWidth * innerHeight * 0.85 && /absolute|fixed/.test(cs.position) && /^-?\d+$/.test(cs.zIndex);
    });
    let layerMsg = '';
    function layerApply() {
      const root = document.documentElement;
      if (layerCfg.mode !== 'under') { root.style.removeProperty('--gi-z'); return; }
      const zs = gameWins().map(n => Number(getComputedStyle(n).zIndex)).filter(z => isFinite(z));
      if (!zs.length) return; // brak otwartych okien gry – zostaje poprzednia wartość
      const z = Math.max(1, Math.min(...zs) - 1);
      if (root.style.getPropertyValue('--gi-z') !== String(z)) { root.style.setProperty('--gi-z', String(z)); setTimeout(layerVerify, 500); }
    }
    function layerVerify() {
      if (layerCfg.mode !== 'under') return;
      const open = [...document.querySelectorAll('.gi-float')].filter(f => f.style.display === 'block');
      for (const f of open) {
        const r = f.getBoundingClientRect();
        const list = document.elementsFromPoint(r.left + r.width / 2, r.top + Math.min(30, r.height / 2));
        for (const n of list) {
          if (f.contains(n)) break;                        // nasze okno na wierzchu – dobrze
          if (n.closest(GAME_WIN_SEL)) break;               // przykrywa je okno gry – tak ma być
          layerCfg.mode = 'top'; writeLS(LAYER_KEY, layerCfg); layerApply(); layerSel.value = 'top';
          layerMsg = 'Nie da się zejść pod okna gry w tej grze (okna zniknęłyby za planszą) – wracam do „nad grą”. Wyślij mi diagnostykę warstw.';
          layerNote.textContent = layerMsg; return;
        }
      }
    }
    const layerSel = isolate(el('select', {}));
    [['top', 'Nad wszystkim (domyślnie)'], ['under', 'Pod oknami gry (ekwipunek, sklep itp.)']].forEach(([v, l]) => layerSel.append(el('option', { value: v, textContent: l, selected: layerCfg.mode === v })));
    const layerNote = el('div', { style: 'color:#ffd54f;font-size:10px;margin-top:2px' });
    layerSel.addEventListener('change', () => { layerCfg.mode = layerSel.value; writeLS(LAYER_KEY, layerCfg); layerNote.textContent = ''; document.documentElement.style.removeProperty('--gi-z'); layerApply(); });
    const layerDbg = isolate(el('textarea', { rows: 6, readOnly: true, placeholder: 'Diagnostyka warstw' })); layerDbg.style.fontSize = '10px';
    const layerBtn = el('button', { textContent: 'Diagnostyka warstw' });
    layerBtn.addEventListener('click', () => {
      const chain = n => { const a = []; for (let c = n; c && c !== document.documentElement && a.length < 6; c = c.parentElement) { const cs = getComputedStyle(c); a.push(c.tagName.toLowerCase() + (c.id ? '#' + c.id : '') + '.' + String(c.className || '').split(/\s+/).slice(0, 2).join('.') + ' z=' + cs.zIndex + ' ' + cs.position); } return a; };
      const out = {
        mode: layerCfg.mode, giZ: document.documentElement.style.getPropertyValue('--gi-z') || null,
        gameWindows: gameWins().slice(0, 12).map(n => ({ cls: String(n.className).slice(0, 60), z: getComputedStyle(n).zIndex, chain: chain(n) })),
        bodyChildren: [...document.body.children].slice(0, 40).map(n => { const cs = getComputedStyle(n); return n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + '.' + String(n.className || '').slice(0, 30) + ' z=' + cs.zIndex + ' ' + cs.position; }),
        ours: [...document.querySelectorAll('.gi-float')].map(n => ({ id: n.id, z: getComputedStyle(n).zIndex, shown: n.style.display === 'block' }))
      };
      layerDbg.value = JSON.stringify(out, null, 1); layerDbg.select();
      if (navigator.clipboard) navigator.clipboard.writeText(layerDbg.value).catch(() => {});
    });
    menuView.append(el('div', { className: 'gi-rset' }, el('div', { style: 'font-weight:bold;margin-bottom:2px' }, 'Warstwa okien'), layerSel, layerNote, el('details', { style: 'margin-top:4px' }, el('summary', { textContent: 'Diagnostyka warstw' }), layerBtn, layerDbg)));
    layerApply();
    setInterval(() => { try { layerApply(); } catch (err) { /* ignorujemy */ } }, 1500);

    function showView(id) {
      stopPick();
      const a = ADDONS.find(x => x.id === id);
      menuView.style.display = a ? 'none' : '';
      ADDONS.forEach(x => { x.view.style.display = x === a ? '' : 'none'; });
      backBtn.style.display = a ? '' : 'none';
      curId = id;
      panel.style.width = win.w ? win.w + 'px' : (a && a.wide ? 'min(640px, 94vw)' : '');
      titleEl.textContent = a ? `${a.icon} ${a.title}` : 'Dodatki by Papiesz';
      if (a) panel.scrollTop = 0;
    }
    backBtn.addEventListener('click', () => showView(null));

    const closeBtn = el('button', { textContent: '✕', title: 'Zamknij okno' });
    titleEl.style.flex = '1';
    const themeBtn = el('button', { className: 'gi-themebtn', textContent: '🎨', title: 'Zmień wygląd okien: fantasy / klasyczny' });
    themeBtn.addEventListener('click', () => { const nt = getTheme() === 'fantasy' ? 'classic' : 'fantasy'; try { localStorage.setItem(THEME_KEY, nt); } catch (e) { /* brak zapisu */ } applyTheme(nt); themeBtn.title = 'Wygląd: ' + (nt === 'fantasy' ? 'fantasy' : 'klasyczny') + ' (kliknij, aby zmienić)'; });
    const head = el('div', { id: 'gi-head', title: 'Przeciągnij, aby przesunąć okno. Dwuklik = pozycja i rozmiar domyślne.' }, backBtn, titleEl, themeBtn, closeBtn);
    panel = el('div', { id: 'gi-panel' }, head, menuView, ...ADDONS.map(a => a.view));
    showView(null);
    installTheme();

    const btn = el('div', { id: 'gi-btn', title: 'Dodatki by Papiesz' });

    // ── pływające okno: przeciąganie za pasek tytułu, zmiana rozmiaru z prawego dolnego rogu ──
    function placePanel(x, y) {
      const w = panel.offsetWidth || 300;
      const nx = Math.min(Math.max(0, x), Math.max(0, window.innerWidth - Math.min(w, 120))); // kawałek okna zawsze na ekranie
      const ny = Math.min(Math.max(0, y), Math.max(0, window.innerHeight - 44));              // pasek tytułu zawsze widoczny
      panel.style.left = nx + 'px'; panel.style.top = ny + 'px'; panel.style.bottom = 'auto';
      return { x: nx, y: ny };
    }
    const togglePanel = open => {
      panel.style.display = open ? 'block' : 'none';
      if (open && typeof win.x === 'number') placePanel(win.x, win.y); // po otwarciu znamy rozmiar – popraw pozycję
      if (!open) stopPick();
    };
    btn.addEventListener('click', () => togglePanel(panel.style.display !== 'block'));
    closeBtn.addEventListener('click', () => togglePanel(false));

    if (typeof win.x === 'number') placePanel(win.x, win.y);
    if (win.h) panel.style.height = win.h + 'px';

    let drag = null;
    head.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('button')) return;
      const r = panel.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId };
      try { head.setPointerCapture(e.pointerId); } catch (err) { /* starsze przeglądarki */ }
      e.preventDefault();
    });
    head.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const p = placePanel(e.clientX - drag.dx, e.clientY - drag.dy);
      win.x = p.x; win.y = p.y;
    });
    const endDrag = () => { if (!drag) return; drag = null; saveWin(); };
    head.addEventListener('pointerup', endDrag);
    head.addEventListener('pointercancel', endDrag);
    head.addEventListener('dblclick', e => {
      if (e.target.closest('button')) return;
      win = {}; saveWin();
      ['left', 'top', 'bottom', 'height'].forEach(p => { panel.style[p] = ''; });
      showView(curId);
    });

    let resizing = false;
    panel.addEventListener('mousedown', e => {
      if (e.target !== panel) return;
      const r = panel.getBoundingClientRect();
      resizing = r.right - e.clientX < 26 && r.bottom - e.clientY < 26; // uchwyt zmiany rozmiaru
    });
    const endResize = () => {
      if (!resizing) return;
      resizing = false;
      win.w = panel.offsetWidth; win.h = panel.offsetHeight; saveWin();
    };
    document.addEventListener('mouseup', endResize, true);
    document.addEventListener('pointerup', endResize, true);

    window.addEventListener('resize', () => { // po zmniejszeniu okna przeglądarki nie zgub okna dodatków
      if (panel.style.display === 'block' && typeof win.x === 'number') placePanel(win.x, win.y);
    });

    document.body.append(btn, panel, respWin.el, dropsWin.el, relogWin.el, respSetWin.el, dropsSetWin.el, relogSetWin.el, flameSetWin.el);
    respWin.restore();
    applyResp();
    dropsWin.restore();
    applyDrops();
    relogWin.restore();
    applyRelog();
    renderRules();
    setInterval(sweep, 600);
    sweep();
    log('Załadowano v2.49.4');
  }

  let tries = 0;
  const wait = setInterval(() => {
    tries++;
    if (typeof W.Engine !== 'undefined' && document.body && !$('#gi-btn') && safe(() => W.Engine.hero.d.nick, null)) { clearInterval(wait); build(); }
    else if (tries > 240) clearInterval(wait);
  }, 500);
})();
