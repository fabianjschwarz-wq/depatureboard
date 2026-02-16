const API_ENDPOINTS = [
  "https://v6.db.transport.rest",
  "https://v5.db.transport.rest"
];
const API_TIMEOUT_MS = 12000;
const MAX_RETRIES_PER_ENDPOINT = 2;

const DEFAULTS = {
  station: { id: "8011160", name: "Berlin Hbf" },
  refreshSeconds: 30,
  colors: {
    bg: "#0b0f16",
    panel: "#111827",
    card: "#151f30",
    textPrimary: "#f8fafc",
    textSecondary: "#94a3b8",
    accent: "#f59e0b",
    delay: "#ef4444",
    ledOn: "#34d399",
    ledOff: "#334155"
  },
  types: {
    ICE: { icon: "🚄", color: "#f97316" },
    IC: { icon: "🚅", color: "#fb7185" },
    EC: { icon: "🚅", color: "#fb7185" },
    RE: { icon: "🚆", color: "#38bdf8" },
    RB: { icon: "🚆", color: "#22d3ee" },
    S: { icon: "Ⓢ", color: "#4ade80" },
    U: { icon: "Ⓤ", color: "#a78bfa" },
    STR: { icon: "🚋", color: "#facc15" },
    BUS: { icon: "🚌", color: "#f59e0b" },
    OTHER: { icon: "➡️", color: "#cbd5e1" }
  }
};

const COLOR_LABELS = {
  bg: "Hintergrund",
  panel: "Einstellungen",
  card: "Karten",
  textPrimary: "Text primär",
  textSecondary: "Text sekundär",
  accent: "Akzent",
  delay: "Verspätung",
  ledOn: "LED aktiv",
  ledOff: "LED inaktiv"
};

const TYPE_ORDER = ["ICE", "IC", "EC", "RE", "RB", "S", "U", "STR", "BUS", "OTHER"];
const state = loadSettings();
const els = {
  stationQuery: document.querySelector("#stationQuery"),
  stationSelect: document.querySelector("#stationSelect"),
  stationSearchBtn: document.querySelector("#stationSearchBtn"),
  saveStationBtn: document.querySelector("#saveStationBtn"),
  selectedStation: document.querySelector("#selectedStation"),
  globalColors: document.querySelector("#globalColors"),
  typeConfig: document.querySelector("#typeConfig"),
  refreshSeconds: document.querySelector("#refreshSeconds"),
  saveSettingsBtn: document.querySelector("#saveSettingsBtn"),
  boardStation: document.querySelector("#boardStation"),
  boardTime: document.querySelector("#boardTime"),
  board: document.querySelector("#board"),
  cardTemplate: document.querySelector("#cardTemplate")
};

let refreshHandle;

setupUI();
applyTheme();
updateHeaderClock();
refreshBoard();
setupAutoRefresh();
setInterval(updateHeaderClock, 1000);

function loadSettings() {
  const raw = localStorage.getItem("departureBoardSettings");
  if (!raw) return structuredClone(DEFAULTS);
  try {
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULTS),
      ...parsed,
      colors: { ...DEFAULTS.colors, ...parsed.colors },
      types: { ...DEFAULTS.types, ...parsed.types }
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function saveSettings() {
  localStorage.setItem("departureBoardSettings", JSON.stringify(state));
}

function getStationCacheKey() {
  return `departureCache:${state.station.id}`;
}

function setCachedDepartures(departures) {
  const safeDepartures = Array.isArray(departures) ? departures : [];
  localStorage.setItem(getStationCacheKey(), JSON.stringify({ timestamp: Date.now(), departures: safeDepartures }));
}

function getCachedDepartures() {
  const raw = localStorage.getItem(getStationCacheKey());
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.departures || null;
  } catch {
    return null;
  }
}

function setupUI() {
  renderColorControls();
  renderTypeControls();
  els.refreshSeconds.value = state.refreshSeconds;
  setSelectedStationText();

  els.stationSearchBtn.addEventListener("click", () => searchStations(els.stationQuery.value));
  els.stationQuery.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchStations(els.stationQuery.value);
    }
  });

  els.saveStationBtn.addEventListener("click", () => {
    const selected = els.stationSelect.selectedOptions[0];
    if (!selected) return;
    state.station = { id: selected.value, name: selected.textContent || "Unbekannt" };
    setSelectedStationText();
    saveSettings();
    refreshBoard();
  });

  els.saveSettingsBtn.addEventListener("click", () => {
    state.refreshSeconds = Number(els.refreshSeconds.value) || 30;
    applyTheme();
    saveSettings();
    setupAutoRefresh();
    refreshBoard();
  });
}

function renderColorControls() {
  els.globalColors.innerHTML = "";
  Object.entries(COLOR_LABELS).forEach(([key, label]) => {
    const wrapper = document.createElement("label");
    wrapper.textContent = label;

    const input = document.createElement("input");
    input.type = "color";
    input.value = state.colors[key];
    input.addEventListener("input", () => {
      state.colors[key] = input.value;
      applyTheme();
    });

    wrapper.appendChild(input);
    els.globalColors.appendChild(wrapper);
  });
}

function renderTypeControls() {
  els.typeConfig.innerHTML = "";
  TYPE_ORDER.forEach((type) => {
    if (!state.types[type]) state.types[type] = { ...DEFAULTS.types[type] };
    const values = state.types[type];
    const row = document.createElement("div");
    row.className = "type-row";

    const name = document.createElement("div");
    name.innerHTML = `<strong>${type}</strong><small>Typ</small>`;

    const iconLabel = document.createElement("label");
    iconLabel.textContent = "Icon";
    const iconInput = document.createElement("input");
    iconInput.type = "text";
    iconInput.maxLength = 4;
    iconInput.value = values.icon;
    iconInput.addEventListener("input", () => {
      state.types[type].icon = iconInput.value || DEFAULTS.types[type]?.icon || "➡️";
    });
    iconLabel.appendChild(iconInput);

    const colorLabel = document.createElement("label");
    colorLabel.textContent = "Farbe";
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = values.color;
    colorInput.addEventListener("input", () => {
      state.types[type].color = colorInput.value;
    });
    colorLabel.appendChild(colorInput);

    row.append(name, iconLabel, colorLabel);
    els.typeConfig.appendChild(row);
  });
}

async function fetchJsonWithFallback(pathAndQuery) {
  let lastError = "";

  for (const baseUrl of API_ENDPOINTS) {
    for (let attempt = 1; attempt <= MAX_RETRIES_PER_ENDPOINT; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
      try {
        const response = await fetch(`${baseUrl}${pathAndQuery}`, { signal: controller.signal });
        clearTimeout(timeout);
        if (response.ok) return await response.json();

        if (response.status >= 500) {
          lastError = `${baseUrl} antwortete mit ${response.status}`;
          await wait(300 * attempt);
          continue;
        }

        const bodyText = await response.text();
        throw new Error(`${baseUrl} Fehler ${response.status}: ${bodyText.slice(0, 150)}`);
      } catch (error) {
        clearTimeout(timeout);
        lastError = `${baseUrl} Versuch ${attempt}: ${error?.message || "Unbekannter Fehler"}`;
        await wait(350 * attempt);
      }
    }
  }

  throw new Error(lastError || "Alle API-Endpunkte fehlgeschlagen");
}

async function searchStations(query) {
  const q = query.trim();
  if (q.length < 2) return;

  try {
    const locationsResponse = await fetchJsonWithFallback(`/locations?query=${encodeURIComponent(q)}&poi=false&addresses=false&results=25&national=true`);
    const locations = normalizeApiArray(locationsResponse, "locations");
    const stations = locations
      .filter((loc) => loc?.id && loc?.name)
      .filter((loc) => !loc.address || loc.address?.countryCode === "DE")
      .filter((loc, idx, arr) => arr.findIndex((other) => other.id === loc.id) === idx);

    els.stationSelect.innerHTML = "";

    stations.forEach((station) => {
      const opt = document.createElement("option");
      opt.value = station.id;
      opt.textContent = station.name;
      els.stationSelect.appendChild(opt);
    });

    if (!stations.length) {
      els.selectedStation.textContent = "Keine deutschen Bahnhöfe gefunden. Bitte Begriff präzisieren.";
    }
  } catch (error) {
    els.selectedStation.textContent = `Bahnhofssuche fehlgeschlagen: ${error.message}`;
  }
}

function setupAutoRefresh() {
  if (refreshHandle) clearInterval(refreshHandle);
  refreshHandle = setInterval(refreshBoard, state.refreshSeconds * 1000);
}

function setSelectedStationText() {
  els.selectedStation.textContent = `Aktiver Bahnhof: ${state.station.name} (${state.station.id})`;
  els.boardStation.textContent = `Abfahrten · ${state.station.name}`;
}

function applyTheme() {
  const root = document.documentElement;
  Object.entries(state.colors).forEach(([key, value]) => {
    root.style.setProperty(`--${key}`, value);
  });
}

function updateHeaderClock() {
  els.boardTime.textContent = `Stand: ${new Date().toLocaleString("de-DE")}`;
}

async function resolveStationByNameFallback() {
  try {
    const locationsResponse = await fetchJsonWithFallback(`/locations?query=${encodeURIComponent(state.station.name)}&poi=false&addresses=false&results=5&national=true`);
    const locations = normalizeApiArray(locationsResponse, "locations");
    const candidate = locations.find((entry) => entry?.id && entry?.name && entry.name.toLowerCase().includes(state.station.name.toLowerCase().slice(0, 4)));
    if (candidate?.id && candidate.id !== state.station.id) {
      state.station = { id: candidate.id, name: candidate.name };
      saveSettings();
      setSelectedStationText();
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

async function refreshBoard() {
  setSelectedStationText();
  try {
    const departuresResponse = await fetchJsonWithFallback(`/stops/${state.station.id}/departures?duration=90&remarks=true&linesOfStops=false`);
    const departures = normalizeApiArray(departuresResponse, "departures");
    setCachedDepartures(departures);
    renderBoard(departures.slice(0, 30));
  } catch (error) {
    const resolved = await resolveStationByNameFallback();
    if (resolved) {
      return refreshBoard();
    }

    const cached = getCachedDepartures();
    if (cached?.length) {
      renderBoard(cached.slice(0, 30));
      els.board.insertAdjacentHTML("afterbegin", `<p class="hint">⚠️ Live-Daten derzeit nicht erreichbar (${escapeHtml(error.message)}). Zeige zuletzt bekannte Abfahrten.</p>`);
      return;
    }

    els.board.innerHTML = `<p class="hint">Keine Daten verfügbar: ${escapeHtml(error.message)}</p>`;
  }
}

function renderBoard(departures) {
  els.board.innerHTML = "";
  if (!departures.length) {
    els.board.innerHTML = `<p class="hint">Keine Abfahrten gefunden.</p>`;
    return;
  }

  departures.forEach((dep) => {
    const card = els.cardTemplate.content.firstElementChild.cloneNode(true);
    const scheduled = new Date(dep.plannedWhen || dep.when || Date.now());
    const effective = new Date(dep.when || dep.plannedWhen || Date.now());
    const now = new Date();
    const type = classifyType(dep);
    const typeConfig = state.types[type] || state.types.OTHER;
    const delayMin = dep.delay ? Math.round(dep.delay / 60) : 0;

    card.querySelector(".time").textContent = effective.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    card.querySelector(".line").textContent = dep.line?.name || dep.line?.fahrtNr || "Unbekannt";
    card.querySelector(".destination").textContent = dep.direction || "Ohne Ziel";
    card.querySelector(".when").textContent = `Plan: ${scheduled.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;

    const badge = card.querySelector(".type-badge");
    badge.textContent = `${typeConfig.icon} ${type}`;
    badge.style.background = typeConfig.color;

    if (delayMin > 0) {
      card.querySelector(".delay").textContent = `+${delayMin} min`;
    }

    const isSev = isSEV(dep);
    card.querySelector(".platform").textContent = isSev ? "🚌 SEV" : dep.platform ? `Gl. ${dep.platform}` : "Kein Gleis";

    const led = card.querySelector(".led");
    const diffMs = now.getTime() - effective.getTime();
    const inWindow = diffMs >= -60000 && diffMs <= 60000;
    if (inWindow) led.classList.add("on");

    els.board.appendChild(card);
  });
}

function classifyType(dep) {
  const line = dep.line || {};
  const name = `${line.productName || ""} ${line.name || ""}`.toUpperCase();
  if (isSEV(dep)) return "BUS";
  if (name.includes("ICE")) return "ICE";
  if (name.includes("EC")) return "EC";
  if (name.includes("IC")) return "IC";
  if (name.includes("RE")) return "RE";
  if (name.includes("RB")) return "RB";
  if (name.match(/\bS\d/)) return "S";
  if (name.match(/\bU\d/)) return "U";
  if (name.includes("TRAM") || name.includes("STR")) return "STR";
  if (name.includes("BUS")) return "BUS";
  return "OTHER";
}

function isSEV(dep) {
  const txt = `${dep.line?.name || ""} ${dep.line?.productName || ""} ${(dep.remarks || []).map((r) => r.text || "").join(" ")}`.toUpperCase();
  return txt.includes("SEV") || txt.includes("ERSATZVERKEHR") || dep.line?.mode === "bus";
}


function normalizeApiArray(value, keyHint) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const candidate = value[keyHint];
    if (Array.isArray(candidate)) return candidate;
  }
  throw new Error(`Unerwartetes API-Format für ${keyHint}`);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
