const API_ENDPOINTS = [
  "https://v6.db.transport.rest",
  "https://v5.db.transport.rest"
];
const API_TIMEOUT_MS = 12000;
const MAX_RETRIES_PER_ENDPOINT = 2;

const DEFAULTS = {
  station: { id: "8011160", name: "Berlin Hbf" },
  refreshSeconds: 30,
  boardColumns: 3,
  boardRows: 10,
  menuCollapsed: false,
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
    ICE: { icon: "🚄", color: "#f97316", operator: "DB Fernverkehr" },
    IC: { icon: "🚅", color: "#fb7185", operator: "DB Fernverkehr" },
    EC: { icon: "🚅", color: "#fb7185", operator: "DB Fernverkehr" },
    RE: { icon: "🚆", color: "#38bdf8", operator: "DB Regio" },
    RB: { icon: "🚆", color: "#22d3ee", operator: "DB Regio" },
    S: { icon: "Ⓢ", color: "#4ade80", operator: "S-Bahn" },
    U: { icon: "Ⓤ", color: "#a78bfa", operator: "U-Bahn" },
    STR: { icon: "🚋", color: "#facc15", operator: "Tram" },
    BUS: { icon: "🚌", color: "#f59e0b", operator: "Bus" },
    OTHER: { icon: "➡️", color: "#cbd5e1", operator: "Unbekannt" }
  },
  lineOverrides: []
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
  appShell: document.querySelector("#appShell"),
  settingsPanel: document.querySelector("#settingsPanel"),
  settingsContent: document.querySelector("#settingsContent"),
  toggleMenuBtn: document.querySelector("#toggleMenuBtn"),
  stationQuery: document.querySelector("#stationQuery"),
  stationSelect: document.querySelector("#stationSelect"),
  stationSearchBtn: document.querySelector("#stationSearchBtn"),
  saveStationBtn: document.querySelector("#saveStationBtn"),
  selectedStation: document.querySelector("#selectedStation"),
  globalColors: document.querySelector("#globalColors"),
  typeConfig: document.querySelector("#typeConfig"),
  lineOverrides: document.querySelector("#lineOverrides"),
  addOverrideBtn: document.querySelector("#addOverrideBtn"),
  refreshSeconds: document.querySelector("#refreshSeconds"),
  boardColumns: document.querySelector("#boardColumns"),
  boardRows: document.querySelector("#boardRows"),
  saveSettingsBtn: document.querySelector("#saveSettingsBtn"),
  boardStation: document.querySelector("#boardStation"),
  boardInfo: document.querySelector("#boardInfo"),
  boardTime: document.querySelector("#boardTime"),
  board: document.querySelector("#board"),
  cardTemplate: document.querySelector("#cardTemplate")
};

let refreshHandle;

setupUI();
applyTheme();
applyBoardLayout();
applyMenuState();
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
      types: mergeTypeSettings(parsed.types),
      lineOverrides: Array.isArray(parsed.lineOverrides) ? parsed.lineOverrides : []
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function mergeTypeSettings(savedTypes) {
  const merged = {};
  TYPE_ORDER.forEach((type) => {
    merged[type] = {
      ...DEFAULTS.types[type],
      ...(savedTypes?.[type] || {})
    };
  });
  return merged;
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
  renderOverrideControls();
  els.refreshSeconds.value = state.refreshSeconds;
  els.boardColumns.value = state.boardColumns;
  els.boardRows.value = state.boardRows;
  setSelectedStationText();

  els.toggleMenuBtn.addEventListener("click", () => {
    state.menuCollapsed = !state.menuCollapsed;
    applyMenuState();
    saveSettings();
  });

  els.addOverrideBtn.addEventListener("click", () => {
    state.lineOverrides.push({
      matcher: "",
      logo: "",
      color: "#cbd5e1",
      operator: ""
    });
    renderOverrideControls();
  });

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
    state.refreshSeconds = clampNumber(els.refreshSeconds.value, 10, 300, 30);
    state.boardColumns = clampNumber(els.boardColumns.value, 1, 6, 3);
    state.boardRows = clampNumber(els.boardRows.value, 1, 20, 10);
    applyTheme();
    applyBoardLayout();
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
    const values = state.types[type] || { ...DEFAULTS.types[type] };
    const row = document.createElement("div");
    row.className = "type-row";

    const name = document.createElement("div");
    name.innerHTML = `<strong>${type}</strong><small>Typ</small>`;

    const iconLabel = document.createElement("label");
    iconLabel.textContent = "Logo/Icon";
    const iconInput = document.createElement("input");
    iconInput.type = "text";
    iconInput.maxLength = 12;
    iconInput.value = values.icon;
    iconInput.addEventListener("input", () => {
      state.types[type].icon = iconInput.value || DEFAULTS.types[type]?.icon || "➡️";
    });
    iconLabel.appendChild(iconInput);

    const colorLabel = document.createElement("label");
    colorLabel.textContent = "Badge-Farbe";
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = values.color;
    colorInput.addEventListener("input", () => {
      state.types[type].color = colorInput.value;
    });
    colorLabel.appendChild(colorInput);

    const operatorLabel = document.createElement("label");
    operatorLabel.textContent = "Betreiber";
    const operatorInput = document.createElement("input");
    operatorInput.type = "text";
    operatorInput.value = values.operator || "";
    operatorInput.placeholder = "z. B. DB Regio";
    operatorInput.addEventListener("input", () => {
      state.types[type].operator = operatorInput.value;
    });
    operatorLabel.appendChild(operatorInput);

    row.append(name, iconLabel, colorLabel, operatorLabel);
    els.typeConfig.appendChild(row);
  });
}

function renderOverrideControls() {
  els.lineOverrides.innerHTML = "";
  state.lineOverrides.forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = "override-row";

    const matcherLabel = document.createElement("label");
    matcherLabel.textContent = "Linie enthält";
    const matcherInput = document.createElement("input");
    matcherInput.type = "text";
    matcherInput.placeholder = "z. B. RE1";
    matcherInput.value = entry.matcher || "";
    matcherInput.addEventListener("input", () => {
      state.lineOverrides[index].matcher = matcherInput.value;
    });
    matcherLabel.appendChild(matcherInput);

    const logoLabel = document.createElement("label");
    logoLabel.textContent = "Logo/Icon";
    const logoInput = document.createElement("input");
    logoInput.type = "text";
    logoInput.maxLength = 18;
    logoInput.value = entry.logo || "";
    logoInput.placeholder = "z. B. 🚆 oder ODEG";
    logoInput.addEventListener("input", () => {
      state.lineOverrides[index].logo = logoInput.value;
    });
    logoLabel.appendChild(logoInput);

    const colorLabel = document.createElement("label");
    colorLabel.textContent = "Farbe";
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = validColor(entry.color) ? entry.color : "#cbd5e1";
    colorInput.addEventListener("input", () => {
      state.lineOverrides[index].color = colorInput.value;
    });
    colorLabel.appendChild(colorInput);

    const operatorLabel = document.createElement("label");
    operatorLabel.textContent = "Betreiber";
    const operatorInput = document.createElement("input");
    operatorInput.type = "text";
    operatorInput.placeholder = "z. B. ODEG";
    operatorInput.value = entry.operator || "";
    operatorInput.addEventListener("input", () => {
      state.lineOverrides[index].operator = operatorInput.value;
    });
    operatorLabel.appendChild(operatorInput);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "delete-override";
    deleteBtn.textContent = "✕";
    deleteBtn.addEventListener("click", () => {
      state.lineOverrides.splice(index, 1);
      renderOverrideControls();
    });

    row.append(matcherLabel, logoLabel, colorLabel, operatorLabel, deleteBtn);
    els.lineOverrides.appendChild(row);
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

function applyBoardLayout() {
  const root = document.documentElement;
  root.style.setProperty("--board-columns", String(state.boardColumns));
  els.boardInfo.textContent = `${state.boardColumns} Spalten · ${state.boardRows} Zeilen · Echtzeit inkl. Verspätung`;
}

function applyMenuState() {
  els.appShell.classList.toggle("menu-collapsed", Boolean(state.menuCollapsed));
  els.toggleMenuBtn.textContent = state.menuCollapsed ? "⟩" : "⟨";
  els.toggleMenuBtn.setAttribute("aria-expanded", String(!state.menuCollapsed));
  els.toggleMenuBtn.title = state.menuCollapsed ? "Menü ausklappen" : "Menü einklappen";
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
  const limit = state.boardColumns * state.boardRows;
  try {
    const departuresResponse = await fetchJsonWithFallback(`/stops/${state.station.id}/departures?duration=90&remarks=true&linesOfStops=true`);
    const departures = normalizeApiArray(departuresResponse, "departures");
    setCachedDepartures(departures);
    renderBoard(departures.slice(0, limit));
  } catch (error) {
    const resolved = await resolveStationByNameFallback();
    if (resolved) {
      return refreshBoard();
    }

    const cached = getCachedDepartures();
    if (cached?.length) {
      renderBoard(cached.slice(0, limit));
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
    const lineName = dep.line?.name || dep.line?.fahrtNr || "Unbekannt";
    const override = getLineOverride(lineName);
    const delayMin = dep.delay ? Math.round(dep.delay / 60) : 0;
    const badgeColor = override?.color || typeConfig.color;
    const logo = override?.logo || typeConfig.icon;
    const operator = override?.operator || dep.line?.operator?.name || typeConfig.operator || "";

    card.querySelector(".time").textContent = effective.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    card.querySelector(".destination").textContent = dep.direction || "Ohne Ziel";
    card.querySelector(".when").textContent = `Plan: ${scheduled.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;

    const stops = extractImportantStops(dep);
    card.querySelector(".stops").textContent = stops.length ? `Zwischenhalte: ${stops.join(" · ")}` : "Zwischenhalte: n/a";

    const badge = card.querySelector(".type-badge");
    badge.textContent = `${logo} ${lineName}${operator ? ` · ${operator}` : ""}`;
    badge.style.background = badgeColor;

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

function getLineOverride(lineName) {
  const normalizedName = String(lineName || "").toLowerCase();
  return state.lineOverrides.find((entry) => {
    const matcher = String(entry.matcher || "").trim().toLowerCase();
    return matcher && normalizedName.includes(matcher);
  });
}

function extractImportantStops(dep) {
  const candidates = [];
  if (Array.isArray(dep.line?.stopovers)) {
    dep.line.stopovers.forEach((stop) => {
      const name = stop?.stop?.name;
      if (name) candidates.push(name);
    });
  }
  if (!candidates.length && Array.isArray(dep.remarks)) {
    dep.remarks.forEach((remark) => {
      const txt = remark?.text || "";
      const match = txt.match(/(?:über|via)\s+(.+)/i);
      if (match?.[1]) {
        match[1].split(/,|;|\//).forEach((value) => {
          const trimmed = value.trim();
          if (trimmed) candidates.push(trimmed);
        });
      }
    });
  }

  const unique = [];
  for (const stop of candidates) {
    if (!unique.includes(stop) && stop !== dep.direction) unique.push(stop);
    if (unique.length >= 4) break;
  }
  return unique;
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

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function validColor(value) {
  return typeof value === "string" && /^#[0-9A-F]{6}$/i.test(value);
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
