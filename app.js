import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  setDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const BOLIVIA_TIME_ZONE = "America/La_Paz";
const ADMIN_PASSWORD = "admin123";
const FIREBASE_ROOM_ID = "delta-apuesta-main";
const DEFAULT_USERS = ["Rene", "Cesar", "Rolando"];
const QUICK_AMOUNTS = [5, 10, 15, 20, 30, 50, 100];
const DAY_PICKER_PAST_DAYS = 3;
const DAY_PICKER_FUTURE_DAYS = 14;

const state = {
  users: [],
  activeUser: "",
  matches: [],
  selectedMatchId: "",
  selectedChoice: "",
  selectedAmount: QUICK_AMOUNTS[0],
  bets: [],
  settlements: [],
  manualScores: [],
  modalMatchId: "",
  dismissedSettlementPrompts: new Set(),
  apiDiagnostics: null,
  liveBettingEnabled: false,
  db: null,
  remoteEnabled: false,
  remoteReady: false,
  unsubscribeRemote: [],
  todayIso: getBoliviaDateIso(new Date()),
};

const elements = {
  userSelect: document.querySelector("#userSelect"),
  newUserInput: document.querySelector("#newUserInput"),
  addUserButton: document.querySelector("#addUserButton"),
  deleteUserButton: document.querySelector("#deleteUserButton"),
  todayLabel: document.querySelector("#todayLabel"),
  activeUserLabel: document.querySelector("#activeUserLabel"),
  sourceLabel: document.querySelector("#sourceLabel"),
  ticketUserLabel: document.querySelector("#ticketUserLabel"),
  ticketPoolLabel: document.querySelector("#ticketPoolLabel"),
  ticketBetCountLabel: document.querySelector("#ticketBetCountLabel"),
  liveBetToggle: document.querySelector("#liveBetToggle"),
  liveBetStatus: document.querySelector("#liveBetStatus"),
  betModal: document.querySelector("#betModal"),
  closeBetButton: document.querySelector("#closeBetButton"),
  selectedMatchTitle: document.querySelector("#selectedMatchTitle"),
  selectedMatchInfo: document.querySelector("#selectedMatchInfo"),
  betMatchInfo: document.querySelector("#betMatchInfo"),
  betForm: document.querySelector("#betForm"),
  selectionOptions: document.querySelector("#selectionOptions"),
  quickAmounts: document.querySelector("#quickAmounts"),
  customAmount: document.querySelector("#customAmount"),
  placeBetButton: document.querySelector("#placeBetButton"),
  formMessage: document.querySelector("#formMessage"),
  refreshButton: document.querySelector("#refreshButton"),
  matchesTitle: document.querySelector("#matchesTitle"),
  dayPicker: document.querySelector("#dayPicker"),
  matchesList: document.querySelector("#matchesList"),
  betsList: document.querySelector("#betsList"),
  openHistoryButton: document.querySelector("#openHistoryButton"),
  myBetCount: document.querySelector("#myBetCount"),
  myBetTotal: document.querySelector("#myBetTotal"),
  globalBetCount: document.querySelector("#globalBetCount"),
  openResultsButton: document.querySelector("#openResultsButton"),
  resultsModal: document.querySelector("#resultsModal"),
  resultsBody: document.querySelector("#resultsBody"),
  closeResultsButton: document.querySelector("#closeResultsButton"),
  closeResultsFooterButton: document.querySelector("#closeResultsFooterButton"),
  refreshResultsButton: document.querySelector("#refreshResultsButton"),
  settlementModal: document.querySelector("#settlementModal"),
  settlementTitle: document.querySelector("#settlementTitle"),
  settlementBody: document.querySelector("#settlementBody"),
  closeSettlementButton: document.querySelector("#closeSettlementButton"),
  historyModal: document.querySelector("#historyModal"),
  historyList: document.querySelector("#historyList"),
  closeHistoryButton: document.querySelector("#closeHistoryButton"),
  closeHistoryFooterButton: document.querySelector("#closeHistoryFooterButton"),
};

init();

async function init() {
  await initRemoteStore();
  bindEvents();
  renderUsers();
  renderShell();
  renderAmounts();
  await loadMatches();
  renderAll();
  processFinishedMatches(true);
  setInterval(async () => {
    await loadMatches();
    renderAll();
    processFinishedMatches(true);
  }, 60 * 1000);
}

function bindEvents() {
  elements.addUserButton.addEventListener("click", addUser);
  elements.deleteUserButton.addEventListener("click", deleteActiveUser);
  elements.newUserInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addUser();
    }
  });

  elements.userSelect.addEventListener("change", () => {
    state.activeUser = elements.userSelect.value;
    state.selectedMatchId = "";
    renderAll();
  });

  elements.refreshButton.addEventListener("click", async () => {
    elements.refreshButton.disabled = true;
    elements.sourceLabel.textContent = "Actualizando...";
    await loadMatches();
    elements.refreshButton.disabled = false;
    renderAll();
    processFinishedMatches(true);
  });

  elements.betForm.addEventListener("submit", (event) => {
    event.preventDefault();
    placeBet();
  });

  elements.closeBetButton.addEventListener("click", closeBetModal);
  elements.liveBetToggle.addEventListener("change", handleLiveBetToggle);

  elements.customAmount.addEventListener("input", () => {
    const value = Number(elements.customAmount.value);
    state.selectedAmount = Number.isFinite(value) ? value : 0;
    renderAmounts();
  });

  elements.openResultsButton.addEventListener("click", openResultsModal);
  elements.closeResultsButton.addEventListener("click", closeResultsModal);
  elements.closeResultsFooterButton.addEventListener("click", closeResultsModal);
  elements.refreshResultsButton.addEventListener("click", refreshResultsModal);
  elements.openHistoryButton.addEventListener("click", openHistoryModal);
  elements.closeSettlementButton.addEventListener("click", closeSettlementModal);
  elements.closeHistoryButton.addEventListener("click", closeHistoryModal);
  elements.closeHistoryFooterButton.addEventListener("click", closeHistoryModal);

  elements.settlementModal.addEventListener("click", (event) => {
    if (event.target === elements.settlementModal) closeSettlementModal();
  });

  elements.historyModal.addEventListener("click", (event) => {
    if (event.target === elements.historyModal) closeHistoryModal();
  });

  elements.resultsModal.addEventListener("click", (event) => {
    if (event.target === elements.resultsModal) closeResultsModal();
  });

  elements.betModal.addEventListener("click", (event) => {
    if (event.target === elements.betModal) closeBetModal();
  });
}

async function initRemoteStore() {
  if (!isFirebaseConfigured()) return;

  try {
    const app = initializeApp(firebaseConfig);
    state.db = getFirestore(app);
    state.remoteEnabled = true;
    await seedRemoteUsers();
    subscribeToRemoteCollection("users", applyRemoteUsers);
    subscribeToRemoteCollection("bets", applyRemoteBets);
    subscribeToRemoteCollection("settlements", applyRemoteSettlements);
    subscribeToRemoteCollection("manualScores", applyRemoteManualScores);
  } catch (error) {
    console.warn("Firebase no esta disponible.", error);
    state.remoteEnabled = false;
    elements.sourceLabel.textContent = "Firebase no conectado";
  }
}

function isFirebaseConfigured() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
}

function remoteCollection(name) {
  return collection(state.db, "rooms", FIREBASE_ROOM_ID, name);
}

function remoteDoc(name, id) {
  return doc(state.db, "rooms", FIREBASE_ROOM_ID, name, id);
}

async function seedRemoteUsers() {
  const snapshot = await getDocs(remoteCollection("users"));
  if (!snapshot.empty) return;

  const batch = writeBatch(state.db);
  const users = [...new Set([...DEFAULT_USERS, ...state.users])].filter(Boolean);
  users.forEach((name) => {
    batch.set(remoteDoc("users", getUserId(name)), {
      name,
      createdAt: new Date().toISOString(),
    });
  });
  await batch.commit();
}

function subscribeToRemoteCollection(name, onData) {
  const unsubscribe = onSnapshot(remoteCollection(name), (snapshot) => {
    onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    state.remoteReady = true;
    renderAll();
    processFinishedMatches(false);
  });
  state.unsubscribeRemote.push(unsubscribe);
}

function applyRemoteUsers(items) {
  const users = items
    .map((item) => item.name)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "es"));
  state.users = users;
  if (!state.users.includes(state.activeUser)) state.activeUser = state.users[0] || "";
}

function applyRemoteBets(items) {
  state.bets = dedupeBets(items)
    .filter((item) => item.id && item.user && item.matchId)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function applyRemoteSettlements(items) {
  state.settlements = items
    .filter((item) => item.matchId)
    .sort((a, b) => new Date(b.settledAt || 0) - new Date(a.settledAt || 0));
}

function applyRemoteManualScores(items) {
  state.manualScores = items.filter((item) => item.matchId);
  applyManualScoresToMatches();
}

async function persistUser(name) {
  ensureFirebaseReady();

  await setDoc(remoteDoc("users", getUserId(name)), {
    name,
    createdAt: new Date().toISOString(),
  });
}

async function deleteUser(name) {
  ensureFirebaseReady();

  await deleteDoc(remoteDoc("users", getUserId(name)));
  state.users = state.users.filter((user) => normalize(user) !== normalize(name));
  state.activeUser = state.users[0] || "";
}

async function persistBet(bet) {
  ensureFirebaseReady();

  await setDoc(remoteDoc("bets", bet.id), bet);
}

function dedupeBets(items) {
  const byLogicalBet = new Map();
  items.forEach((item) => {
    if (!item.id || !item.user || !item.matchId) return;
    const key = getBetLogicalKey(item);
    const current = byLogicalBet.get(key);
    if (!current || new Date(item.createdAt || 0) >= new Date(current.createdAt || 0)) {
      byLogicalBet.set(key, item);
    }
  });
  return [...byLogicalBet.values()];
}

function upsertBetInState(bet) {
  const key = getBetLogicalKey(bet);
  const nextBets = state.bets.filter((item) => item.id !== bet.id && getBetLogicalKey(item) !== key);
  nextBets.unshift(bet);
  state.bets = dedupeBets(nextBets).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function getBetLogicalKey(bet) {
  return `${normalize(bet.user)}::${bet.matchId}`;
}

async function persistSettlement(settlement) {
  ensureFirebaseReady();

  await setDoc(remoteDoc("settlements", settlement.matchId), settlement);
  const existingIndex = state.settlements.findIndex((item) => item.matchId === settlement.matchId);
  if (existingIndex >= 0) state.settlements.splice(existingIndex, 1, settlement);
  else state.settlements.unshift(settlement);
}

async function persistManualScore(score) {
  ensureFirebaseReady();

  await setDoc(remoteDoc("manualScores", score.matchId), score);
  const existingIndex = state.manualScores.findIndex((item) => item.matchId === score.matchId);
  if (existingIndex >= 0) state.manualScores.splice(existingIndex, 1, score);
  else state.manualScores.unshift(score);
  applyManualScoresToMatches();
}

function ensureFirebaseReady() {
  if (!state.remoteEnabled || !state.db) {
    throw new Error("Firebase no esta conectado. No se guardo ningun dato.");
  }
}

function getUserId(name) {
  return slugify(name) || crypto.randomUUID();
}

async function addUser() {
  const name = toTitleName(elements.newUserInput.value);
  if (!name) return;

  try {
    await persistUser(name);
    const existingUser = state.users.find((user) => normalize(user) === normalize(name));
    if (!existingUser) state.users.push(name);
    state.activeUser = existingUser || name;
    elements.newUserInput.value = "";
    renderAll();
  } catch (error) {
    window.alert(error.message);
  }
}

async function deleteActiveUser() {
  const user = state.activeUser;
  if (!user) return;

  const hasBets = state.bets.some((bet) => bet.user === user);
  const warning = hasBets
    ? `El usuario ${user} tiene apuestas registradas. Se borrara de la lista, pero sus apuestas quedaran en el historial.`
    : `Se borrara el usuario ${user}.`;

  const confirmed = window.confirm(`${warning}\n\nQuieres continuar?`);
  if (!confirmed) return;

  try {
    await deleteUser(user);
    renderAll();
  } catch (error) {
    window.alert(error.message);
  }
}

function handleLiveBetToggle() {
  if (!elements.liveBetToggle.checked) {
    state.liveBettingEnabled = false;
    renderAll();
    return;
  }

  const password = window.prompt("Ingresa la contraseña de administrador");
  if (password === ADMIN_PASSWORD) {
    state.liveBettingEnabled = true;
    renderAll();
    return;
  }

  state.liveBettingEnabled = false;
  elements.liveBetToggle.checked = false;
  window.alert("Contraseña incorrecta. Las apuestas en vivo siguen bloqueadas.");
  renderAll();
}

function canBetOnMatch(match) {
  const lifecycle = getMatchLifecycle(match);
  if (lifecycle.available) return true;
  return state.liveBettingEnabled && lifecycle.live && !getSettlement(match.id);
}

async function loadMatches() {
  try {
    const apiFootballMatches = await fetchApiFootballMatchesForBoliviaDate(state.todayIso);
    state.matches = sortMatches(apiFootballMatches);
    applyManualScoresToMatches();
    elements.sourceLabel.textContent =
      apiFootballMatches.length > 0
        ? `API-Football (${apiFootballMatches.length}) + ${getStorageLabel()}`
        : `Sin partidos API + ${getStorageLabel()}`;
  } catch (error) {
    state.matches = [];
    state.apiDiagnostics = {
      reason: "frontend-error",
      message: "La app no pudo leer la respuesta de /api/football.",
    };
    applyManualScoresToMatches();
    elements.sourceLabel.textContent = `Error API + ${getStorageLabel()}`;
  }
}

function getStorageLabel() {
  return state.remoteEnabled ? "Firebase" : "Firebase no conectado";
}

async function fetchApiFootballMatchesForBoliviaDate(dateIso) {
  const matches = await fetchApiFootballMatches(dateIso);
  return filterMatchesByBoliviaDate(matches, dateIso);
}

async function fetchApiFootballMatches(dateIso) {
  const response = await fetch(`/api/football?date=${encodeURIComponent(dateIso)}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    state.apiDiagnostics = {
      reason: "http-error",
      message: `/api/football respondio ${response.status}.`,
    };
    return [];
  }

  const data = await response.json();
  state.apiDiagnostics = data.diagnostics || null;
  if (!data.configured || !Array.isArray(data.events)) return [];
  return uniqueMatches(data.events.map(mapApiFootballEvent).filter(Boolean));
}

function mapApiFootballEvent(event) {
  const fixture = event.fixture || {};
  const teams = event.teams || {};
  const league = event.league || {};
  const goals = event.goals || {};
  const status = fixture.status || {};
  const homeTeam = teams.home?.name || "Local";
  const awayTeam = teams.away?.name || "Visitante";
  const kickoffUtc = getApiFootballKickoffIso(fixture);
  if (!kickoffUtc) return null;
  const kickoffDate = new Date(kickoffUtc);
  const kickoffLocal = fixture.date || "";
  const round = [league.name, league.round].filter(Boolean).join(" - ");

  return {
    id: fixture.id ? `api-football-${fixture.id}` : slugify(`${kickoffUtc}-${homeTeam}-${awayTeam}`),
    date: getBoliviaDateIso(kickoffDate),
    kickoffUtc,
    kickoffLocal,
    homeTeam,
    awayTeam,
    group: round || "FIFA World Cup 2026",
    venue: fixture.venue?.name || "Sede por confirmar",
    status: [status.long, status.short, status.elapsed ? `${status.elapsed}'` : ""]
      .filter(Boolean)
      .join(" "),
    homeScore: toScore(goals.home),
    awayScore: toScore(goals.away),
    source: "API-Football",
  };
}

function getApiFootballKickoffIso(fixture) {
  const timestamp = Number(fixture.timestamp);
  if (Number.isFinite(timestamp) && timestamp > 0) {
    return new Date(timestamp * 1000).toISOString();
  }

  if (fixture.date && !Number.isNaN(new Date(fixture.date).getTime())) {
    return new Date(fixture.date).toISOString();
  }

  return "";
}

function filterMatchesByBoliviaDate(matches, dateIso) {
  return uniqueMatches(
    matches.filter((match) => {
      const date = new Date(match.kickoffUtc);
      return !Number.isNaN(date.getTime()) && getBoliviaDateIso(date) === dateIso;
    }),
  );
}

function uniqueMatches(matches) {
  const seen = new Set();
  return matches.filter((match) => {
    const key = match.id || slugify(`${match.kickoffUtc}-${match.homeTeam}-${match.awayTeam}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function addDaysIso(dateIso, days) {
  const [year, month, day] = dateIso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return getBoliviaDateIso(date);
}

function applyManualScoresToMatches() {
  state.matches = state.matches.map((match) => {
    const manualScore = getManualScore(match.id);
    if (!manualScore) return match;

    return {
      ...match,
      homeScore: manualScore.homeScore,
      awayScore: manualScore.awayScore,
      status: manualScore.status || match.status,
      source: match.source.includes("Marcador manual")
        ? match.source
        : `${match.source} + Marcador manual`,
    };
  });
}

function getManualScore(matchId) {
  return state.manualScores.find((score) => score.matchId === matchId);
}

function sortMatches(matches) {
  return [...matches].sort((a, b) => new Date(a.kickoffUtc) - new Date(b.kickoffUtc));
}

function renderAll() {
  renderUsers();
  renderShell();
  renderDayPicker();
  renderMatches();
  renderBetForm();
  renderBets();
  if (elements.resultsModal.open) renderResultsModal();
}

function renderUsers() {
  elements.userSelect.innerHTML = state.users
    .map((user) => `<option value="${escapeHtml(user)}">${escapeHtml(user)}</option>`)
    .join("");
  elements.userSelect.value = state.activeUser;
  elements.userSelect.disabled = state.users.length === 0;
}

function renderShell() {
  elements.todayLabel.textContent = formatBoliviaDate(state.todayIso);
  elements.matchesTitle.textContent = isTodayIso(state.todayIso)
    ? "Cartelera de hoy"
    : `Cartelera ${formatShortDate(state.todayIso)}`;
  elements.activeUserLabel.textContent = state.activeUser || "Sin usuario";
  elements.ticketUserLabel.textContent = state.activeUser || "Sin usuario";
  elements.ticketPoolLabel.textContent = formatCurrency(getCurrentPot());
  elements.ticketBetCountLabel.textContent = getVisibleBets().length;
  elements.liveBetToggle.checked = state.liveBettingEnabled;
  elements.liveBetStatus.textContent = state.liveBettingEnabled
    ? "Habilitado con admin"
    : "Bloqueado";
}

function renderDayPicker() {
  const centerDate = parseIsoDate(getBoliviaDateIso(new Date()));
  const offsets = Array.from(
    { length: DAY_PICKER_PAST_DAYS + DAY_PICKER_FUTURE_DAYS + 1 },
    (_, index) => index - DAY_PICKER_PAST_DAYS,
  );
  const days = offsets.map((offset) => {
    const date = new Date(centerDate);
    date.setUTCDate(date.getUTCDate() + offset);
    return getBoliviaDateIso(date);
  });

  elements.dayPicker.innerHTML = days.map(renderDayButton).join("");
  elements.dayPicker.querySelectorAll("[data-day]").forEach((button) => {
    button.addEventListener("click", async () => {
      const dateIso = button.dataset.day;
      if (!dateIso || dateIso === state.todayIso) return;
      state.todayIso = dateIso;
      state.selectedMatchId = "";
      elements.sourceLabel.textContent = "Actualizando...";
      renderAll();
      await loadMatches();
      renderAll();
      processFinishedMatches(true);
    });
  });
}

function renderDayButton(dateIso) {
  const date = parseIsoDate(dateIso);
  const isSelected = dateIso === state.todayIso;
  const isToday = isTodayIso(dateIso);
  const weekday = new Intl.DateTimeFormat("es-BO", {
    weekday: "short",
    timeZone: BOLIVIA_TIME_ZONE,
  })
    .format(date)
    .replace(".", "")
    .toUpperCase();
  const day = new Intl.DateTimeFormat("es-BO", {
    day: "2-digit",
    timeZone: BOLIVIA_TIME_ZONE,
  }).format(date);
  const month = new Intl.DateTimeFormat("es-BO", {
    month: "short",
    timeZone: BOLIVIA_TIME_ZONE,
  })
    .format(date)
    .replace(".", "")
    .toUpperCase();

  return `
    <button class="day-button ${isSelected ? "active" : ""}" type="button" data-day="${dateIso}">
      <span>${isToday ? "HOY" : weekday}</span>
      <strong>${day}</strong>
      <small>${month}</small>
    </button>
  `;
}

function renderMatches() {
  if (state.matches.length === 0) {
    elements.matchesList.innerHTML =
      `<div class="empty-state">No hay partidos del Mundial 2026 registrados para ${escapeHtml(
        formatShortDate(state.todayIso),
      )}. Si API-Football no devuelve datos para esa fecha, aqui no se inventan partidos.</div>
      ${renderApiDiagnostics()}`;
    return;
  }

  elements.matchesList.innerHTML = state.matches.map(renderMatchCard).join("");
  elements.matchesList.querySelectorAll("[data-select-match]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedMatchId = button.dataset.selectMatch;
      state.selectedChoice = "";
      state.selectedAmount = QUICK_AMOUNTS[0];
      renderBetForm();
      renderMatches();
      openBetModal();
    });
  });
  elements.matchesList.querySelectorAll("[data-open-settlement]").forEach((button) => {
    button.addEventListener("click", () => {
      openSettlementModal(button.dataset.openSettlement);
    });
  });
}

function renderApiDiagnostics() {
  const diagnostics = state.apiDiagnostics;
  if (!diagnostics) return "";

  if (diagnostics.message) {
    return `<div class="empty-state api-debug"><strong>Diagnostico API:</strong> ${escapeHtml(
      diagnostics.message,
    )}</div>`;
  }

  const rows = [
    ["Motivo", getDiagnosticReasonLabel(diagnostics.reason)],
    ["Fecha consultada", diagnostics.date || state.todayIso],
    ["Zona horaria", diagnostics.timezone || BOLIVIA_TIME_ZONE],
    ["Temporada", diagnostics.season || "2026"],
    ["Ligas", Array.isArray(diagnostics.leagueIds) ? diagnostics.leagueIds.join(", ") : "1"],
    ["Partidos recibidos", diagnostics.rawCount ?? 0],
    ["Partidos Mundial filtrados", diagnostics.filteredCount ?? 0],
  ];

  const queryHtml = Array.isArray(diagnostics.queries)
    ? diagnostics.queries
        .map(
          (query) => `
            <li>
              ${escapeHtml(query.query)}: ${query.count || 0} eventos
              ${query.error ? ` · ${escapeHtml(String(query.error))}` : ""}
              ${renderDiagnosticLeagues(query.leagues)}
            </li>
          `,
        )
        .join("")
    : "";

  return `
    <div class="empty-state api-debug">
      <strong>Diagnostico API-Football</strong>
      <dl>
        ${rows
          .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
          .join("")}
      </dl>
      ${queryHtml ? `<ul>${queryHtml}</ul>` : ""}
    </div>
  `;
}

function renderDiagnosticLeagues(leagues) {
  if (!Array.isArray(leagues) || leagues.length === 0) return "";
  return `<br><small>Ligas: ${escapeHtml(leagues.join(" | "))}</small>`;
}

function getDiagnosticReasonLabel(reason) {
  const labels = {
    "api-empty": "API-Football respondio 0 eventos.",
    "filtered-empty": "La API devolvio eventos, pero ninguno fue detectado como Mundial.",
    ok: "API-Football respondio partidos del Mundial.",
  };
  return labels[reason] || reason || "Sin detalle";
}

function renderMatchCard(match) {
  const lifecycle = getMatchLifecycle(match);
  const isSelected = state.selectedMatchId === match.id;
  const settlement = getSettlement(match.id);
  const betCount = getBetsForMatch(match.id).length;
  const canSettle = lifecycle.finished && betCount > 0;
  const action = getMatchAction(match, lifecycle, settlement, isSelected, canSettle);
  const bettable = canBetOnMatch(match);
  const statusClass = bettable ? "available" : "closed";
  const statusLabel =
    state.liveBettingEnabled && lifecycle.live ? "En juego · apuestas en vivo" : lifecycle.label;

  return `
    <article class="match-card ${bettable ? "" : "unavailable"}">
      <div class="match-time">
        <span>${formatMatchTime(match)}</span>
        <small>Hora BO</small>
      </div>
      <div class="match-main">
        <div class="teams">
          <span class="team-name">${escapeHtml(match.homeTeam)}</span>
          <span class="versus">vs</span>
          <span class="team-name">${escapeHtml(match.awayTeam)}</span>
        </div>
        <div class="match-meta">
          <span class="pill">${escapeHtml(match.group)}</span>
          <span class="pill">${escapeHtml(match.venue)}</span>
          <span class="pill ${statusClass}">${escapeHtml(statusLabel)}</span>
          ${formatScorePill(match)}
          <span class="pill">${betCount} apuestas</span>
          <span class="pill">${escapeHtml(match.source)}</span>
        </div>
      </div>
      <button class="match-action" type="button" ${action.attribute} ${action.disabled ? "disabled" : ""}>${
        action.label
      }</button>
    </article>
  `;
}

function getMatchAction(match, lifecycle, settlement, isSelected, canSettle) {
  if (canBetOnMatch(match)) {
    return {
      label: isSelected && elements.betModal.open ? "Elegido" : lifecycle.live ? "Apostar en vivo" : "Apostar",
      attribute: `data-select-match="${escapeHtml(match.id)}"`,
      disabled: false,
    };
  }

  if (canSettle) {
    return {
      label: settlement ? "Ver pago" : "Liquidar",
      attribute: `data-open-settlement="${escapeHtml(match.id)}"`,
      disabled: false,
    };
  }

  return {
    label: lifecycle.live ? "En juego" : "No disponible",
    attribute: "",
    disabled: true,
  };
}

function openBetModal() {
  const match = state.matches.find((item) => item.id === state.selectedMatchId);
  if (!match || !canBetOnMatch(match)) return;
  if (!elements.betModal.open) elements.betModal.showModal();
}

function closeBetModal() {
  state.selectedMatchId = "";
  state.selectedChoice = "";
  elements.formMessage.textContent = "";
  elements.formMessage.classList.remove("error");
  if (elements.betModal.open) elements.betModal.close();
  renderMatches();
}

function renderBetForm() {
  const match = state.matches.find((item) => item.id === state.selectedMatchId);

  elements.formMessage.textContent = "";
  elements.formMessage.classList.remove("error");

  if (!match || !canBetOnMatch(match)) {
    elements.selectedMatchTitle.textContent = "Registrar apuesta";
    elements.betMatchInfo.textContent = match
      ? "Este partido ya no admite apuestas."
      : "Elige un partido disponible para preparar la apuesta.";
    elements.betForm.hidden = true;
    return;
  }

  elements.selectedMatchTitle.textContent = `${match.homeTeam} vs ${match.awayTeam}`;
  const lifecycle = getMatchLifecycle(match);
  const liveText = lifecycle.live
    ? "<br><small>Apuesta en vivo habilitada por administrador.</small>"
    : "";
  elements.betMatchInfo.innerHTML = `
    <strong>${formatMatchTime(match)} hora Bolivia</strong><br>
    ${escapeHtml(match.group)} &middot; ${escapeHtml(match.venue)}<br>
    <small>Si termina empatado, el pozo se acumula para el siguiente partido.</small>
    ${liveText}
  `;
  elements.betForm.hidden = false;
  renderSelections(match);
  renderAmounts();
}

function renderSelections(match) {
  const options = [
    { value: match.homeTeam, label: match.homeTeam },
    { value: "Empate", label: "Empate" },
    { value: match.awayTeam, label: match.awayTeam },
  ];

  if (!state.selectedChoice) state.selectedChoice = options[0].value;

  elements.selectionOptions.innerHTML = options
    .map(
      (option) => `
        <button class="choice-button ${state.selectedChoice === option.value ? "active" : ""}" type="button"
          data-choice="${escapeHtml(option.value)}">${escapeHtml(option.label)}</button>
      `,
    )
    .join("");

  elements.selectionOptions.querySelectorAll("[data-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedChoice = button.dataset.choice;
      renderSelections(match);
    });
  });
}

function renderAmounts() {
  elements.quickAmounts.innerHTML = QUICK_AMOUNTS.map(
    (amount) => `
      <button class="choice-button ${state.selectedAmount === amount ? "active" : ""}" type="button"
        data-amount="${amount}">Bs ${amount}</button>
    `,
  ).join("");

  elements.quickAmounts.querySelectorAll("[data-amount]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedAmount = Number(button.dataset.amount);
      elements.customAmount.value = state.selectedAmount;
      renderAmounts();
    });
  });

  if (Number(elements.customAmount.value) !== state.selectedAmount) {
    elements.customAmount.value = state.selectedAmount || "";
  }
}

async function placeBet() {
  const match = state.matches.find((item) => item.id === state.selectedMatchId);
  const amount = Math.round(Number(state.selectedAmount));

  if (!match || !canBetOnMatch(match) || getSettlement(match.id)) {
    showFormMessage("Este partido ya no esta disponible.", true);
    return;
  }

  if (!state.selectedChoice) {
    showFormMessage("Elige una seleccion para apostar.", true);
    return;
  }

  if (!state.activeUser) {
    showFormMessage("Agrega o selecciona un usuario antes de apostar.", true);
    return;
  }

  if (!Number.isFinite(amount) || amount < 1) {
    showFormMessage("Ingresa un monto valido.", true);
    return;
  }

  const existingIndex = state.bets.findIndex(
    (bet) => bet.user === state.activeUser && bet.matchId === match.id,
  );

  const bet = {
    id: existingIndex >= 0 ? state.bets[existingIndex].id : crypto.randomUUID(),
    user: state.activeUser,
    matchId: match.id,
    matchLabel: `${match.homeTeam} vs ${match.awayTeam}`,
    kickoffUtc: match.kickoffUtc,
    selection: state.selectedChoice,
    amount,
    createdAt: new Date().toISOString(),
  };

  try {
    await persistBet(bet);
    upsertBetInState(bet);
    showFormMessage(existingIndex >= 0 ? "Apuesta actualizada." : "Apuesta registrada.");
    renderAll();
    setTimeout(closeBetModal, 350);
  } catch (error) {
    showFormMessage(error.message, true);
  }
}

function showFormMessage(message, isError = false) {
  elements.formMessage.textContent = message;
  elements.formMessage.classList.toggle("error", isError);
}

function renderBets() {
  const visibleBets = getVisibleBets();
  const total = getVisiblePot();
  const apostadores = new Set(visibleBets.map((bet) => bet.user)).size;

  elements.myBetCount.textContent = visibleBets.length;
  elements.myBetTotal.textContent = formatCurrency(total);
  elements.globalBetCount.textContent = apostadores;

  if (visibleBets.length === 0) {
    elements.betsList.innerHTML =
      `<div class="empty-state">Todavia no hay apuestas registradas para ${escapeHtml(
        formatShortDate(state.todayIso),
      )}.</div>`;
    return;
  }

  elements.betsList.innerHTML = visibleBets.map(renderBetItem).join("");
}

function renderBetItem(bet) {
  const settlement = getSettlement(bet.matchId);
  const payout = settlement?.payouts.find((item) => item.user === bet.user);
  return `
    <article class="bet-item">
      <header>
        <h3>${escapeHtml(bet.user)}</h3>
      </header>
      <p><strong>${escapeHtml(bet.matchLabel)}</strong></p>
      <p>Apuesta por <strong>${escapeHtml(bet.selection)}</strong> &middot; <strong>${formatCurrency(
        bet.amount,
      )}</strong></p>
      ${payout ? renderBetPayoutLine(payout) : ""}
      <p>${formatBoliviaDateTime(bet.createdAt)}</p>
    </article>
  `;
}

function renderBetPayoutLine(payout) {
  const status = payout.won ? "Gano" : "Perdio";
  const className = payout.won ? "win-text" : "lose-text";
  return `<p class="${className}"><strong>${status}</strong> &middot; Le corresponde <strong>${formatCurrency(
    payout.payout,
  )}</strong></p>`;
}

function getMatchLifecycle(match) {
  const now = new Date();
  const kickoff = new Date(match.kickoffUtc);
  const estimatedEnd = new Date(kickoff.getTime() + 120 * 60 * 1000);
  const rawStatus = (match.status || "").toLowerCase();
  const closedByStatus =
    rawStatus.includes("finished") ||
    rawStatus.includes("match finished") ||
    rawStatus.includes("ft") ||
    rawStatus.includes("played");

  if (closedByStatus || now >= estimatedEnd) {
    return { available: false, live: false, finished: true, label: "Finalizado" };
  }

  if (now >= kickoff) {
    return { available: false, live: true, finished: false, label: "En juego" };
  }

  return { available: true, live: false, finished: false, label: "Disponible" };
}

async function processFinishedMatches(shouldOpenModal = false) {
  let changed = false;
  let matchToOpen = "";

  for (const match of state.matches) {
    const lifecycle = getMatchLifecycle(match);
    const bets = getBetsForMatch(match.id);
    if (!lifecycle.finished || bets.length === 0 || getSettlement(match.id)) continue;

    const resultChoice = getResultChoice(match);
    if (resultChoice) {
      const settlement = createSettlement(match, resultChoice, "automatico");
      try {
        await persistSettlement(settlement);
        changed = true;
        if (!matchToOpen) matchToOpen = match.id;
      } catch (error) {
        console.warn(error);
      }
      continue;
    }

    if (!matchToOpen && !state.dismissedSettlementPrompts.has(match.id)) matchToOpen = match.id;
  }

  if (changed) {
    renderMatches();
    renderBets();
  }

  if (shouldOpenModal && matchToOpen && !elements.resultsModal.open && !elements.historyModal.open) {
    openSettlementModal(matchToOpen);
  }
}

function openSettlementModal(matchId) {
  const match = state.matches.find((item) => item.id === matchId);
  if (!match) return;

  state.modalMatchId = matchId;
  renderSettlementModal(match);
  if (!elements.settlementModal.open) elements.settlementModal.showModal();
}

function closeSettlementModal() {
  if (state.modalMatchId && !getSettlement(state.modalMatchId)) {
    state.dismissedSettlementPrompts.add(state.modalMatchId);
  }
  state.modalMatchId = "";
  if (elements.settlementModal.open) elements.settlementModal.close();
}

function renderSettlementModal(match) {
  const settlement = getSettlement(match.id);
  elements.settlementTitle.textContent = `${match.homeTeam} vs ${match.awayTeam}`;

  if (settlement) {
    elements.settlementBody.innerHTML = renderSettlementSummary(settlement);
    return;
  }

  const bets = getBetsForMatch(match.id);
  const carryoverIn = getAvailableCarryover();
  const previewPool = getTotalPool(bets) + carryoverIn;
  elements.settlementBody.innerHTML = `
    <div class="settlement-summary">
      <div>
        <span>${formatCurrency(previewPool)}</span>
        <small>pozo a liquidar</small>
      </div>
      <div>
        <span>${bets.length}</span>
        <small>apuestas</small>
      </div>
      <div>
        <span>${formatCurrency(carryoverIn)}</span>
        <small>acumulado anterior</small>
      </div>
    </div>
    <div class="empty-state">
      No se encontro marcador final en la API. Elige el resultado para liquidar el partido.
    </div>
    <div class="result-grid">
      ${getResultOptions(match)
        .map(
          (option) => `
            <button type="button" data-settle-result="${escapeHtml(option.value)}">
              ${escapeHtml(option.label)}
            </button>
          `,
        )
        .join("")}
    </div>
  `;

  elements.settlementBody.querySelectorAll("[data-settle-result]").forEach((button) => {
    button.addEventListener("click", () => {
      settleMatchManually(match, button.dataset.settleResult);
    });
  });
}

async function settleMatchManually(match, resultChoice) {
  if (getSettlement(match.id)) return;
  const settlement = createSettlement(match, resultChoice, "manual");
  try {
    await persistSettlement(settlement);
    renderMatches();
    renderBets();
    renderSettlementModal(match);
  } catch (error) {
    window.alert(error.message);
  }
}

function renderSettlementSummary(settlement) {
  const carryoverText =
    settlement.carryoverOut > 0
      ? `<div class="empty-state">Empate: nadie cobra en este partido y ${formatCurrency(
          settlement.carryoverOut,
        )} queda acumulado para el siguiente.</div>`
      : "";

  return `
    ${renderFinalScoreCard(settlement)}
    <div class="settlement-summary">
      <div>
        <span>${formatCurrency(settlement.totalPool)}</span>
        <small>pozo total</small>
      </div>
      <div>
        <span>${escapeHtml(settlement.resultLabel)}</span>
        <small>resultado ganador</small>
      </div>
      <div>
        <span>${formatCurrency(settlement.winnerPool)}</span>
        <small>apostado por ganadores</small>
      </div>
      <div>
        <span>${formatCurrency(settlement.carryoverIn || 0)}</span>
        <small>acumulado recibido</small>
      </div>
      <div>
        <span>${formatCurrency(settlement.carryoverOut || 0)}</span>
        <small>acumulado siguiente</small>
      </div>
    </div>
    ${carryoverText}
    <div class="payout-list">
      ${settlement.payouts.map(renderPayoutItem).join("")}
    </div>
  `;
}

function renderPayoutItem(item) {
  return `
    <article class="payout-item ${item.won ? "won" : "lost"}">
      <div>
        <strong>${escapeHtml(item.user)}</strong>
        <span>Aposto ${formatCurrency(item.amount)} por ${escapeHtml(item.selection)}</span>
      </div>
      <div>
        <strong>${formatCurrency(item.payout)}</strong>
        <span>${item.won ? "gano" : "perdio"}</span>
      </div>
    </article>
  `;
}

async function openResultsModal() {
  elements.resultsBody.innerHTML = '<div class="empty-state">Actualizando marcador...</div>';
  elements.resultsModal.showModal();
  await refreshResultsModal();
}

function closeResultsModal() {
  if (elements.resultsModal.open) elements.resultsModal.close();
}

async function refreshResultsModal() {
  elements.refreshResultsButton.disabled = true;
  elements.refreshResultsButton.textContent = "Actualizando...";
  await loadMatches();
  renderAll();
  processFinishedMatches(false);
  renderResultsModal();
  elements.refreshResultsButton.disabled = false;
  elements.refreshResultsButton.textContent = "Actualizar marcador";
}

function renderResultsModal() {
  const liveMatches = state.matches.filter((match) => getMatchLifecycle(match).live);

  if (liveMatches.length === 0) {
    elements.resultsBody.innerHTML =
      '<div class="empty-state results-empty">No se esta disputando un partido por el momento.</div>';
    return;
  }

  elements.resultsBody.innerHTML = liveMatches.map(renderLiveResultBlock).join("");
  elements.resultsBody.querySelectorAll("[data-save-score]").forEach((button) => {
    button.addEventListener("click", () => saveManualScoreFromResults(button.dataset.saveScore));
  });
}

function renderLiveResultBlock(match) {
  const homeScore = getDisplayScore(match.homeScore);
  const awayScore = getDisplayScore(match.awayScore);
  const currentChoice = getCurrentResultChoice(match);
  const projection = createProjection(match, currentChoice);
  const leaderLabel = getLiveLeaderLabel(match, currentChoice);

  return `
    <section class="live-result-block">
      <header>
        <div>
          <p class="eyebrow">${escapeHtml(match.group)} &middot; ${formatMatchTime(match)} BO</p>
          <h3>${escapeHtml(match.homeTeam)} vs ${escapeHtml(match.awayTeam)}</h3>
        </div>
        <span class="pill closed">En juego</span>
      </header>

      <div class="scoreboard">
        <div>
          <span class="score-team">${escapeHtml(match.homeTeam)}</span>
          <strong>${homeScore}</strong>
        </div>
        <span class="score-separator">-</span>
        <div>
          <span class="score-team">${escapeHtml(match.awayTeam)}</span>
          <strong>${awayScore}</strong>
        </div>
      </div>

      <div class="manual-score-form">
        <label>
          <span>${escapeHtml(match.homeTeam)}</span>
          <input type="number" min="0" step="1" value="${homeScore}" data-score-home="${escapeHtml(match.id)}" />
        </label>
        <label>
          <span>${escapeHtml(match.awayTeam)}</span>
          <input type="number" min="0" step="1" value="${awayScore}" data-score-away="${escapeHtml(match.id)}" />
        </label>
        <button type="button" data-save-score="${escapeHtml(match.id)}">Guardar marcador</button>
      </div>

      <div class="live-summary">
        <div>
          <span>${escapeHtml(leaderLabel)}</span>
          <small>resultado actual</small>
        </div>
        <div>
          <span>${formatCurrency(projection.totalPool)}</span>
          <small>pozo</small>
        </div>
        <div>
          <span>${formatCurrency(projection.carryoverIn)}</span>
          <small>acumulado anterior</small>
        </div>
        <div>
          <span>${projection.payouts.length}</span>
          <small>apuestas</small>
        </div>
      </div>

      ${renderProjectionNotice(projection, currentChoice)}
      ${renderProjectionPayouts(projection)}
    </section>
  `;
}

async function saveManualScoreFromResults(matchId) {
  const match = state.matches.find((item) => item.id === matchId);
  const homeInput = elements.resultsBody.querySelector(`[data-score-home="${cssEscape(matchId)}"]`);
  const awayInput = elements.resultsBody.querySelector(`[data-score-away="${cssEscape(matchId)}"]`);
  const homeScore = Math.max(0, Math.round(Number(homeInput?.value ?? 0)));
  const awayScore = Math.max(0, Math.round(Number(awayInput?.value ?? 0)));

  if (!match || !Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return;

  try {
    await persistManualScore({
      matchId,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeScore,
      awayScore,
      updatedAt: new Date().toISOString(),
      updatedBy: state.activeUser,
    });

    renderAll();
    renderResultsModal();
  } catch (error) {
    window.alert(error.message);
  }
}

function renderProjectionNotice(projection, resultChoice) {
  if (resultChoice !== "Empate") return "";
  return `<div class="empty-state">Si termina empatado, nadie cobra ahora y ${formatCurrency(
    projection.totalPool,
  )} queda acumulado para el siguiente partido.</div>`;
}

function renderProjectionPayouts(projection) {
  if (projection.payouts.length === 0) {
    return '<div class="empty-state">Todavia no hay apuestas para este partido.</div>';
  }

  return `
    <div class="payout-list">
      ${projection.payouts.map(renderPayoutItem).join("")}
    </div>
  `;
}

function createProjection(match, resultChoice) {
  const bets = getBetsForMatch(match.id);
  const carryoverIn = getAvailableCarryover();
  const matchPool = getTotalPool(bets);
  const totalPool = matchPool + carryoverIn;
  const winnerPool = bets
    .filter((bet) => bet.selection === resultChoice)
    .reduce((sum, bet) => sum + Number(bet.amount || 0), 0);
  const isDraw = resultChoice === "Empate";

  return {
    matchPool,
    carryoverIn,
    totalPool,
    winnerPool,
    carryoverOut: isDraw ? totalPool : 0,
    payouts: distributePayouts(bets, resultChoice, totalPool, winnerPool, isDraw),
  };
}

function getCurrentResultChoice(match) {
  const homeScore = getDisplayScore(match.homeScore);
  const awayScore = getDisplayScore(match.awayScore);
  if (homeScore > awayScore) return match.homeTeam;
  if (awayScore > homeScore) return match.awayTeam;
  return "Empate";
}

function getLiveLeaderLabel(match, resultChoice) {
  if (!hasAnyScore(match)) return "Empate provisional";
  if (resultChoice === "Empate") return "Empate";
  return `Va ganando ${resultChoice}`;
}

function getDisplayScore(score) {
  return Number.isFinite(score) ? score : 0;
}

function hasAnyScore(match) {
  return Number.isFinite(match.homeScore) || Number.isFinite(match.awayScore);
}

function openHistoryModal() {
  renderHistoryModal();
  elements.historyModal.showModal();
}

function closeHistoryModal() {
  if (elements.historyModal.open) elements.historyModal.close();
}

function renderHistoryModal() {
  if (state.settlements.length === 0) {
    elements.historyList.innerHTML =
      '<div class="empty-state">Todavia no hay partidos liquidados.</div>';
    return;
  }

  elements.historyList.innerHTML = state.settlements
    .map(
      (settlement) => `
        <section class="history-block">
          <header>
            <div>
              <p class="eyebrow">${formatBoliviaDateTime(settlement.settledAt)}</p>
              <h3>${escapeHtml(settlement.matchLabel)}</h3>
            </div>
            <span class="pill available">${formatCurrency(settlement.totalPool)}</span>
          </header>
          ${renderFinalScoreCard(settlement)}
          <p>Resultado ganador: <strong>${escapeHtml(settlement.resultLabel)}</strong></p>
          ${renderHistoryCarryoverLine(settlement)}
          <div class="payout-list">
            ${settlement.payouts.map(renderPayoutItem).join("")}
          </div>
        </section>
      `,
    )
    .join("");
}

function renderFinalScoreCard(settlement) {
  if (!hasSettlementScore(settlement)) return "";

  const homeTeam = settlement.homeTeam || getTeamFromMatchLabel(settlement.matchLabel, 0);
  const awayTeam = settlement.awayTeam || getTeamFromMatchLabel(settlement.matchLabel, 1);
  return `
    <div class="final-score-card">
      <div>
        <span>${escapeHtml(homeTeam)}</span>
        <strong>${settlement.homeScore}</strong>
      </div>
      <span class="score-separator">-</span>
      <div>
        <span>${escapeHtml(awayTeam)}</span>
        <strong>${settlement.awayScore}</strong>
      </div>
    </div>
  `;
}

function renderHistoryCarryoverLine(settlement) {
  const carryoverIn = Number(settlement.carryoverIn || 0);
  const carryoverOut = Number(settlement.carryoverOut || 0);
  if (carryoverOut > 0) {
    return `<p>Empate: <strong>${formatCurrency(carryoverOut)}</strong> quedo acumulado para el siguiente partido.</p>`;
  }
  if (carryoverIn > 0) {
    return `<p>Incluyo acumulado anterior: <strong>${formatCurrency(carryoverIn)}</strong>.</p>`;
  }
  return "";
}

function createSettlement(match, resultChoice, source) {
  const bets = getBetsForMatch(match.id);
  const carryoverIn = getAvailableCarryover();
  const matchPool = getTotalPool(bets);
  const totalPool = matchPool + carryoverIn;
  const isDraw = resultChoice === "Empate";
  const winnerPool = bets
    .filter((bet) => bet.selection === resultChoice)
    .reduce((sum, bet) => sum + Number(bet.amount || 0), 0);
  const carryoverOut = isDraw ? totalPool : 0;
  const payouts = distributePayouts(bets, resultChoice, totalPool, winnerPool, isDraw);

  return {
    id: crypto.randomUUID(),
    matchId: match.id,
    matchLabel: `${match.homeTeam} vs ${match.awayTeam}`,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    homeScore: hasFinalScore(match) ? match.homeScore : undefined,
    awayScore: hasFinalScore(match) ? match.awayScore : undefined,
    kickoffUtc: match.kickoffUtc,
    result: resultChoice,
    resultLabel: getResultLabel(match, resultChoice),
    matchPool,
    carryoverIn,
    totalPool,
    winnerPool,
    carryoverOut,
    payouts,
    source,
    settledAt: new Date().toISOString(),
  };
}

function hasSettlementScore(settlement) {
  return Number.isFinite(settlement.homeScore) && Number.isFinite(settlement.awayScore);
}

function getTeamFromMatchLabel(matchLabel, index) {
  return String(matchLabel || "").split(" vs ")[index] || "";
}

function distributePayouts(bets, resultChoice, totalPool, winnerPool, shouldCarryOver = false) {
  if (shouldCarryOver || winnerPool <= 0) {
    return bets.map((bet) => ({
      user: bet.user,
      selection: bet.selection,
      amount: Number(bet.amount || 0),
      won: false,
      payout: 0,
    }));
  }

  const winners = bets.filter((bet) => bet.selection === resultChoice);
  const payouts = bets.map((bet) => {
    const won = bet.selection === resultChoice;
    const rawPayout = won ? (Number(bet.amount || 0) / winnerPool) * totalPool : 0;
    return {
      user: bet.user,
      selection: bet.selection,
      amount: Number(bet.amount || 0),
      won,
      payout: roundMoney(rawPayout),
    };
  });

  const roundedTotal = payouts.reduce((sum, item) => sum + item.payout, 0);
  const difference = roundMoney(totalPool - roundedTotal);
  if (difference !== 0 && winners.length > 0) {
    const firstWinner = payouts.find((item) => item.won);
    firstWinner.payout = roundMoney(firstWinner.payout + difference);
  }

  return payouts;
}

function getBetsForMatch(matchId) {
  return state.bets.filter((bet) => bet.matchId === matchId);
}

function getSettlement(matchId) {
  return state.settlements.find((settlement) => settlement.matchId === matchId);
}

function getOpenBets() {
  return state.bets.filter((bet) => !getSettlement(bet.matchId));
}

function getVisibleBets() {
  return state.bets.filter(isBetForSelectedDay);
}

function getVisibleOpenBets() {
  return getOpenBets().filter(isBetForSelectedDay);
}

function isBetForSelectedDay(bet) {
  const sourceDate = bet.kickoffUtc || bet.createdAt;
  const date = new Date(sourceDate);
  return !Number.isNaN(date.getTime()) && getBoliviaDateIso(date) === state.todayIso;
}

function getCurrentPot() {
  return getTotalPool(getVisibleOpenBets()) + getAvailableCarryover();
}

function getVisiblePot() {
  return getTotalPool(getVisibleOpenBets()) + getAvailableCarryover();
}

function getAvailableCarryover() {
  return [...state.settlements]
    .sort((a, b) => new Date(a.settledAt) - new Date(b.settledAt))
    .reduce((balance, settlement) => Number(settlement.carryoverOut || 0), 0);
}

function getTotalPool(bets) {
  return bets.reduce((sum, bet) => sum + Number(bet.amount || 0), 0);
}

function getResultOptions(match) {
  return [
    { value: match.homeTeam, label: `Gano ${match.homeTeam}` },
    { value: "Empate", label: "Empate" },
    { value: match.awayTeam, label: `Gano ${match.awayTeam}` },
  ];
}

function getResultChoice(match) {
  if (!hasFinalScore(match)) return "";
  if (match.homeScore > match.awayScore) return match.homeTeam;
  if (match.awayScore > match.homeScore) return match.awayTeam;
  return "Empate";
}

function getResultLabel(match, resultChoice) {
  if (hasFinalScore(match)) {
    return `${resultChoice} (${match.homeScore}-${match.awayScore})`;
  }
  return resultChoice === "Empate" ? "Empate" : `Gano ${resultChoice}`;
}

function hasFinalScore(match) {
  return Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore);
}

function formatScorePill(match) {
  if (!hasFinalScore(match)) return "";
  return `<span class="pill">${match.homeScore}-${match.awayScore}</span>`;
}

function toScore(value) {
  if (value === null || value === undefined || value === "") return undefined;
  const score = Number(value);
  return Number.isFinite(score) ? score : undefined;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function formatCurrency(value) {
  return `Bs ${roundMoney(value).toLocaleString("es-BO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function getBoliviaDateIso(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOLIVIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parseIsoDate(dateIso) {
  const [year, month, day] = dateIso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function isTodayIso(dateIso) {
  return dateIso === getBoliviaDateIso(new Date());
}

function formatShortDate(dateIso) {
  return new Intl.DateTimeFormat("es-BO", {
    day: "2-digit",
    month: "short",
    timeZone: BOLIVIA_TIME_ZONE,
  })
    .format(parseIsoDate(dateIso))
    .replace(".", "");
}

function formatBoliviaDate(dateIso) {
  const [year, month, day] = dateIso.split("-").map(Number);
  return new Intl.DateTimeFormat("es-BO", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: BOLIVIA_TIME_ZONE,
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function formatBoliviaTime(iso) {
  return new Intl.DateTimeFormat("es-BO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: BOLIVIA_TIME_ZONE,
  }).format(new Date(iso));
}

function formatMatchTime(match) {
  const apiLocalTime = getApiFootballBoliviaTime(match.kickoffLocal);
  return apiLocalTime || formatBoliviaTime(match.kickoffUtc);
}

function getApiFootballBoliviaTime(value) {
  const text = String(value || "");
  if (!/(?:-04:00|-0400)$/.test(text)) return "";
  const match = text.match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : "";
}

function formatBoliviaDateTime(iso) {
  return new Intl.DateTimeFormat("es-BO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: BOLIVIA_TIME_ZONE,
  }).format(new Date(iso));
}

function toTitleName(value) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalize(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function slugify(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/"/g, '\\"');
}
