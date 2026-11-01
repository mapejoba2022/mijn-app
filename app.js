'use strict';

const ENTRIES_KEY = 'pdl.entries.v1';
const SETTINGS_KEY = 'pdl.settings.v1';
const DEFAULT_SETTINGS = { nightStart: '23:00', nightEnd: '07:00' };
const MAX_AMOUNT = 5000;

const DRINK_AMOUNTS = [100, 150, 200, 250, 330, 500];
const URINE_AMOUNTS = [100, 150, 200, 250, 300, 400, 500];
const DRINK_TYPES = ['Water', 'Koffie', 'Thee', 'Frisdrank', 'Melk', 'Alcohol', 'Anders'];
const URGENCY = ['Geen', 'Licht', 'Sterk', 'Niet uit te stellen'];
const LEAKS = ['Geen', 'Druppels', 'Veel'];

const $ = (id) => document.getElementById(id);

// Opslag: localStorage kan ontbreken of vol zijn, dus elke toegang is afgeschermd.
function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    alert('Opslaan is niet gelukt. Maak ruimte vrij op je toestel en probeer het opnieuw.');
    return false;
  }
}

const TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const CLOCK_RE = /^\d{2}:\d{2}$/;

// Controleert een item uit opslag of een reservekopie; geeft null bij ongeldige data.
function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.kind !== 'drink' && raw.kind !== 'urine') return null;
  if (typeof raw.time !== 'string' || !TIME_RE.test(raw.time)) return null;
  const hasAmount = raw.amount !== null && raw.amount !== undefined;
  if (hasAmount && !(Number.isInteger(raw.amount) && raw.amount >= 0 && raw.amount <= MAX_AMOUNT)) return null;
  if (raw.kind === 'drink' && !hasAmount) return null;
  const entry = {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    kind: raw.kind,
    time: raw.time,
    amount: hasAmount ? raw.amount : null,
    note: typeof raw.note === 'string' ? raw.note.slice(0, 200) : '',
  };
  if (raw.kind === 'drink') {
    entry.drinkType = DRINK_TYPES.includes(raw.drinkType) ? raw.drinkType : 'Anders';
  } else {
    entry.urgency = URGENCY.includes(raw.urgency) ? raw.urgency : URGENCY[0];
    entry.leak = LEAKS.includes(raw.leak) ? raw.leak : LEAKS[0];
  }
  return entry;
}

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadEntries() {
  const raw = readJson(ENTRIES_KEY, []);
  return Array.isArray(raw) ? raw.map(normalizeEntry).filter(Boolean) : [];
}

function normalizeSettings(raw) {
  const out = { ...DEFAULT_SETTINGS };
  if (raw && CLOCK_RE.test(raw.nightStart)) out.nightStart = raw.nightStart;
  if (raw && CLOCK_RE.test(raw.nightEnd)) out.nightEnd = raw.nightEnd;
  return out;
}

let entries = loadEntries();
let settings = normalizeSettings(readJson(SETTINGS_KEY, null));
let currentDay = dayKey(new Date());
let editing = null;
let form = { kind: 'drink', drinkType: DRINK_TYPES[0], urgency: URGENCY[0], leak: LEAKS[0] };

// Tijden blijven lokale tekst (JJJJ-MM-DDTUU:MM), zodat een dag niet verschuift bij zomertijd.
function pad(n) {
  return String(n).padStart(2, '0');
}

function dayKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localTime(date) {
  return `${dayKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function shiftDay(key, delta) {
  const date = parseDay(key);
  date.setDate(date.getDate() + delta);
  return dayKey(date);
}

function isNight(time) {
  const clock = time.slice(11);
  const { nightStart: start, nightEnd: end } = settings;
  if (start === end) return false;
  return start < end ? clock >= start && clock < end : clock >= start || clock < end;
}

function formatMl(value) {
  return value >= 1000 ? `${(value / 1000).toFixed(1).replace('.', ',')} L` : `${value} ml`;
}

function dayTitle(key) {
  const today = dayKey(new Date());
  const date = parseDay(key);
  const label = date.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
  if (key === today) return `Vandaag, ${label}`;
  if (key === shiftDay(today, -1)) return `Gisteren, ${label}`;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function render() {
  const today = dayKey(new Date());
  const items = entries
    .filter((e) => e.time.slice(0, 10) === currentDay)
    .sort((a, b) => a.time.localeCompare(b.time));

  const drinks = items.filter((e) => e.kind === 'drink');
  const voids = items.filter((e) => e.kind === 'urine');
  const measured = voids.filter((e) => e.amount !== null);
  const sum = (list) => list.reduce((total, e) => total + (e.amount || 0), 0);

  $('day-title').textContent = dayTitle(currentDay);
  $('go-today').hidden = currentDay === today;
  $('next-day').disabled = currentDay >= today;
  $('stat-drink').textContent = formatMl(sum(drinks));
  $('stat-urine').textContent = formatMl(sum(measured));
  $('stat-voids').textContent = String(voids.length);
  $('stat-night').textContent = String(voids.filter((e) => isNight(e.time)).length);
  $('stat-max').textContent = measured.length ? formatMl(Math.max(...measured.map((e) => e.amount))) : '–';
  $('stat-leaks').textContent = String(voids.filter((e) => e.leak !== 'Geen').length);

  $('empty').hidden = items.length > 0;
  $('entries').replaceChildren(...items.map(renderEntry));
}

function renderEntry(entry) {
  const li = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `entry entry-${entry.kind}`;
  button.addEventListener('click', () => openEntry(entry.kind, entry));

  const time = document.createElement('span');
  time.className = 'entry-time';
  time.textContent = entry.time.slice(11);

  const body = document.createElement('span');
  const main = document.createElement('span');
  main.className = 'entry-main';
  const sub = document.createElement('span');
  sub.className = 'entry-sub';

  if (entry.kind === 'drink') {
    main.textContent = `${entry.drinkType}: ${entry.amount} ml`;
  } else {
    main.textContent = `Geplast: ${entry.amount === null ? 'niet gemeten' : `${entry.amount} ml`}`;
    const details = [`Aandrang: ${entry.urgency.toLowerCase()}`];
    if (entry.leak !== 'Geen') details.push(`Urineverlies: ${entry.leak.toLowerCase()}`);
    if (isNight(entry.time)) details.push('nacht');
    sub.textContent = details.join(' · ');
  }
  body.append(main, sub);
  if (entry.note) {
    const note = document.createElement('span');
    note.className = 'entry-sub';
    note.textContent = entry.note;
    body.append(note);
  }
  button.append(time, body);
  li.append(button);
  return li;
}

function renderChips(container, options, selected, label, onSelect) {
  container.replaceChildren(...options.map((option) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = label(option);
    chip.setAttribute('aria-pressed', String(option === selected));
    chip.addEventListener('click', () => onSelect(option));
    return chip;
  }));
}

function parseAmount() {
  const value = $('entry-amount').value.trim();
  return value === '' ? null : Number(value);
}

function renderFormChips() {
  const amounts = form.kind === 'drink' ? DRINK_AMOUNTS : URINE_AMOUNTS;
  const amount = parseAmount();
  renderChips($('amount-chips'), amounts, amount, (v) => `${v} ml`, (v) => {
    $('entry-amount').value = String(v);
    setAmountError('');
    renderFormChips();
  });
  renderChips($('drink-type-chips'), DRINK_TYPES, form.drinkType, String, (v) => {
    form.drinkType = v;
    renderFormChips();
  });
  renderChips($('urgency-chips'), URGENCY, form.urgency, String, (v) => {
    form.urgency = v;
    renderFormChips();
  });
  renderChips($('leak-chips'), LEAKS, form.leak, String, (v) => {
    form.leak = v;
    renderFormChips();
  });
}

function setAmountError(message) {
  $('amount-error').textContent = message;
  $('amount-error').hidden = !message;
}

function openEntry(kind, entry = null) {
  editing = entry;
  form = {
    kind,
    drinkType: entry?.drinkType ?? DRINK_TYPES[0],
    urgency: entry?.urgency ?? URGENCY[0],
    leak: entry?.leak ?? LEAKS[0],
  };
  const formEl = $('entry-form');
  formEl.className = `mode-${kind}`;
  $('entry-title').textContent = `${entry ? 'Bewerken' : 'Nieuw'}: ${kind === 'drink' ? 'drinken' : 'plassen'}`;
  $('amount-legend').textContent = kind === 'drink' ? 'Hoeveelheid' : 'Hoeveelheid (leeg als je niet hebt gemeten)';

  // Op een eerdere dag begint een nieuw item op die dag, met de huidige kloktijd.
  const now = localTime(new Date());
  $('entry-time').value = entry ? entry.time : `${currentDay}T${now.slice(11)}`;
  $('entry-amount').value = entry && entry.amount !== null ? String(entry.amount) : '';
  $('entry-note').value = entry?.note ?? '';
  $('delete-entry').hidden = !entry;
  setAmountError('');
  renderFormChips();
  $('entry-dialog').showModal();
}

function saveEntry(event) {
  event.preventDefault();
  const time = $('entry-time').value;
  if (!TIME_RE.test(time)) {
    $('entry-time').focus();
    return;
  }
  const amount = parseAmount();
  if (amount !== null && !(Number.isInteger(amount) && amount >= 0 && amount <= MAX_AMOUNT)) {
    setAmountError(`Vul een heel getal in tussen 0 en ${MAX_AMOUNT} ml.`);
    return;
  }
  if (form.kind === 'drink' && amount === null) {
    setAmountError('Kies of vul in hoeveel je hebt gedronken.');
    return;
  }

  const entry = normalizeEntry({
    id: editing?.id,
    kind: form.kind,
    time,
    amount,
    note: $('entry-note').value.trim(),
    drinkType: form.drinkType,
    urgency: form.urgency,
    leak: form.leak,
  });
  const next = editing
    ? entries.map((e) => (e.id === editing.id ? entry : e))
    : [...entries, entry];
  if (!writeJson(ENTRIES_KEY, next)) return;
  entries = next;
  currentDay = entry.time.slice(0, 10);
  $('entry-dialog').close();
  render();
}

function deleteEntry() {
  if (!editing || !confirm('Dit item verwijderen?')) return;
  const next = entries.filter((e) => e.id !== editing.id);
  if (!writeJson(ENTRIES_KEY, next)) return;
  entries = next;
  $('entry-dialog').close();
  render();
}

// Voorkomt dat Excel een notitie als formule uitvoert.
function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildCsv() {
  const header = ['Datum', 'Tijd', 'Soort', 'Hoeveelheid (ml)', 'Drank', 'Aandrang', 'Urineverlies', 'Nacht', 'Notitie'];
  const rows = [...entries]
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((e) => [
      e.time.slice(0, 10),
      e.time.slice(11),
      e.kind === 'drink' ? 'Drinken' : 'Plassen',
      e.amount ?? '',
      e.drinkType ?? '',
      e.urgency ?? '',
      e.leak ?? '',
      e.kind === 'urine' && isNight(e.time) ? 'Ja' : '',
      e.note,
    ]);
  // Puntkomma en BOM zorgen dat een Nederlandse Excel de kolommen en tekens goed leest.
  return `﻿${[header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`;
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function setStatus(message, isError = false) {
  $('settings-status').textContent = message;
  $('settings-status').classList.toggle('status-error', isError);
}

function exportCsv() {
  if (!entries.length) {
    setStatus('Er is nog niets om te exporteren.', true);
    return;
  }
  download(`plas-drinklogboek-${dayKey(new Date())}.csv`, buildCsv(), 'text/csv;charset=utf-8');
  setStatus('CSV-bestand gemaakt.');
}

function exportBackup() {
  const data = JSON.stringify({ app: 'plas-drinklogboek', version: 1, settings, entries }, null, 2);
  download(`plas-drinklogboek-reservekopie-${dayKey(new Date())}.json`, data, 'application/json');
  setStatus('Reservekopie gemaakt.');
}

async function importBackup(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data?.app !== 'plas-drinklogboek' || !Array.isArray(data.entries)) throw new Error('format');
    const imported = data.entries.map(normalizeEntry);
    if (imported.some((e) => e === null)) throw new Error('format');

    // Samenvoegen op id: bestaande items blijven staan, gelijke id's komen uit de kopie.
    const byId = new Map(entries.map((e) => [e.id, e]));
    imported.forEach((e) => byId.set(e.id, e));
    const merged = [...byId.values()];
    if (!confirm(`${imported.length} item(s) terugzetten? Je hebt nu ${entries.length} item(s); dat worden er ${merged.length}.`)) return;
    if (!writeJson(ENTRIES_KEY, merged)) return;
    entries = merged;
    render();
    setStatus(`${imported.length} item(s) teruggezet.`);
  } catch {
    setStatus('Dit bestand is geen geldige reservekopie. Er is niets gewijzigd.', true);
  }
}

function openSettings() {
  $('night-start').value = settings.nightStart;
  $('night-end').value = settings.nightEnd;
  setStatus('');
  $('settings-dialog').showModal();
}

function saveNightSettings() {
  const next = normalizeSettings({ nightStart: $('night-start').value, nightEnd: $('night-end').value });
  if (!writeJson(SETTINGS_KEY, next)) return;
  settings = next;
  render();
}

$('prev-day').addEventListener('click', () => { currentDay = shiftDay(currentDay, -1); render(); });
$('next-day').addEventListener('click', () => { currentDay = shiftDay(currentDay, 1); render(); });
$('go-today').addEventListener('click', () => { currentDay = dayKey(new Date()); render(); });
$('add-drink').addEventListener('click', () => openEntry('drink'));
$('add-urine').addEventListener('click', () => openEntry('urine'));
$('entry-form').addEventListener('submit', saveEntry);
$('entry-amount').addEventListener('input', () => { setAmountError(''); renderFormChips(); });
$('cancel-entry').addEventListener('click', () => $('entry-dialog').close());
$('delete-entry').addEventListener('click', deleteEntry);
$('open-settings').addEventListener('click', openSettings);
$('close-settings').addEventListener('click', () => $('settings-dialog').close());
$('night-start').addEventListener('change', saveNightSettings);
$('night-end').addEventListener('change', saveNightSettings);
$('export-csv').addEventListener('click', exportCsv);
$('export-backup').addEventListener('click', exportBackup);
$('import-backup').addEventListener('change', importBackup);

// Na middernacht of bij terugkeren naar de app de titel en knoppen bijwerken.
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

render();
