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
const STORAGE_KEYS = {
  users: "delta-apuesta-users",
  activeUser: "delta-apuesta-active-user",
  bets: "delta-apuesta-bets",
  settlements: "delta-apuesta-settlements",
  manualScores: "delta-apuesta-manual-scores",
};

const FALLBACK_MATCHES = [
  {
    id: "wc2026-2026-06-16-france-senegal",
    date: "2026-06-16",
    kickoffUtc: "2026-06-16T19:00:00Z",
    homeTeam: "Francia",
    awayTeam: "Senegal",
    group: "Grupo I",
    venue: "New York New Jersey Stadium",
    source: "Respaldo local",
  },
  {
    id: "wc2026-2026-06-16-iraq-norway",
    date: "2026-06-16",
    kickoffUtc: "2026-06-16T22:00:00Z",
    homeTeam: "Irak",
    awayTeam: "Noruega",
    group: "Grupo I",
    venue: "Boston Stadium",
    source: "Respaldo local",
  },
  {
    id: "wc2026-2026-06-16-argentina-algeria",
    date: "2026-06-16",
    kickoffUtc: "2026-06-17T01:00:00Z",
    homeTeam: "Argentina",
    awayTeam: "Argelia",
    group: "Grupo J",
    venue: "Kansas City Stadium",
    source: "Respaldo local",
  },
  {
    id: "wc2026-2026-06-16-austria-jordan",
    date: "2026-06-16",
    kickoffUtc: "2026-06-17T03:00:00Z",
    homeTeam: "Austria",
    awayTeam: "Jordania",
    group: "Grupo J",
    venue: "San Francisco Bay Area Stadium",
    source: "Respaldo local",
  },
];

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
  matchesList: document.querySelector("#matchesList"),
  betsList: document.querySelector("#betsList"),
  clearMyBetsButton: document.querySelector("#clearMyBetsButton"),
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
  loadState();
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
    saveState();
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

  elements.clearMyBetsButton.addEventListener("click", async () => {
    const removableBetIds = state.bets
      .filter((bet) => bet.user === state.activeUser && !getSettlement(bet.matchId))
      .map((bet) => bet.id);
    state.bets = state.bets.filter(
      (bet) => bet.user !== state.activeUser || getSettlement(bet.matchId),
    );
    if (state.remoteEnabled) {
      await Promise.all(removableBetIds.map((id) => deleteDoc(remoteDoc("bets", id))));
    } else {
      saveState();
    }
    renderAll();
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

function loadState() {
  state.users = readJson(STORAGE_KEYS.users, DEFAULT_USERS);
  state.bets = readJson(STORAGE_KEYS.bets, []);
  state.settlements = readJson(STORAGE_KEYS.settlements, []);
  state.manualScores = readJson(STORAGE_KEYS.manualScores, []);
  const storedActiveUser = localStorage.getItem(STORAGE_KEYS.activeUser);
  state.activeUser = state.users.includes(storedActiveUser) ? storedActiveUser : state.users[0];
}

function saveState() {
  localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(state.users));
  localStorage.setItem(STORAGE_KEYS.bets, JSON.stringify(state.bets));
  localStorage.setItem(STORAGE_KEYS.settlements, JSON.stringify(state.settlements));
  localStorage.setItem(STORAGE_KEYS.manualScores, JSON.stringify(state.manualScores));
  localStorage.setItem(STORAGE_KEYS.activeUser, state.activeUser);
}

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

async function initRemoteStore() {
  if (!isFirebaseConfigured()) return;

  try {
    const app = initializeApp(firebaseConfig);
    state.db = getFirestore(app);
    state.remoteEnabled = true;
    await seedRemoteUsers();
    await seedRemoteItems("bets", state.bets, (item) => item.id);
    await seedRemoteItems("settlements", state.settlements, (item) => item.matchId);
    await seedRemoteItems("manualScores", state.manualScores, (item) => item.matchId);
    subscribeToRemoteCollection("users", applyRemoteUsers);
    subscribeToRemoteCollection("bets", applyRemoteBets);
    subscribeToRemoteCollection("settlements", applyRemoteSettlements);
    subscribeToRemoteCollection("manualScores", applyRemoteManualScores);
  } catch (error) {
    console.warn("Firebase no esta disponible. Usando localStorage.", error);
    state.remoteEnabled = false;
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

async function seedRemoteItems(collectionName, items, getId) {
  if (!items.length) return;

  const snapshot = await getDocs(remoteCollection(collectionName));
  if (!snapshot.empty) return;

  const batch = writeBatch(state.db);
  items.forEach((item) => {
    const id = getId(item);
    if (id) batch.set(remoteDoc(collectionName, id), item);
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
  state.users = users.length > 0 ? users : DEFAULT_USERS;
  if (!state.users.includes(state.activeUser)) state.activeUser = state.users[0];
  localStorage.setItem(STORAGE_KEYS.activeUser, state.activeUser);
}

function applyRemoteBets(items) {
  state.bets = items
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
  if (!state.remoteEnabled) {
    saveState();
    return;
  }

  await setDoc(remoteDoc("users", getUserId(name)), {
    name,
    createdAt: new Date().toISOString(),
  });
  localStorage.setItem(STORAGE_KEYS.activeUser, name);
}

async function deleteUser(name) {
  state.users = state.users.filter((user) => normalize(user) !== normalize(name));
  if (state.users.length === 0) state.users = [...DEFAULT_USERS];
  state.activeUser = state.users[0];
  localStorage.setItem(STORAGE_KEYS.activeUser, state.activeUser);

  if (!state.remoteEnabled) {
    saveState();
    return;
  }

  await deleteDoc(remoteDoc("users", getUserId(name)));
}

async function persistBet(bet) {
  if (!state.remoteEnabled) {
    saveState();
    return;
  }

  await setDoc(remoteDoc("bets", bet.id), bet);
}

async function deleteBet(id) {
  if (!state.remoteEnabled) {
    state.bets = state.bets.filter((bet) => bet.id !== id);
    saveState();
    renderAll();
    return;
  }

  await deleteDoc(remoteDoc("bets", id));
}

async function persistSettlement(settlement) {
  const existingIndex = state.settlements.findIndex((item) => item.matchId === settlement.matchId);
  if (existingIndex >= 0) state.settlements.splice(existingIndex, 1, settlement);
  else state.settlements.unshift(settlement);

  if (!state.remoteEnabled) {
    saveState();
    return;
  }

  await setDoc(remoteDoc("settlements", settlement.matchId), settlement);
}

async function persistManualScore(score) {
  const existingIndex = state.manualScores.findIndex((item) => item.matchId === score.matchId);
  if (existingIndex >= 0) state.manualScores.splice(existingIndex, 1, score);
  else state.manualScores.unshift(score);
  applyManualScoresToMatches();

  if (!state.remoteEnabled) {
    saveState();
    return;
  }

  await setDoc(remoteDoc("manualScores", score.matchId), score);
}

function getUserId(name) {
  return slugify(name) || crypto.randomUUID();
}

async function addUser() {
  const name = toTitleName(elements.newUserInput.value);
  if (!name) return;

  const exists = state.users.some((user) => normalize(user) === normalize(name));
  if (!exists) state.users.push(name);

  state.activeUser = state.users.find((user) => normalize(user) === normalize(name)) || name;
  elements.newUserInput.value = "";
  await persistUser(state.activeUser);
  renderAll();
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

  await deleteUser(user);
  renderAll();
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
  const fallback = getFallbackMatchesForDate(state.todayIso);
  try {
    const apiFootballMatches = await fetchApiFootballMatchesForBoliviaDate(state.todayIso);
    if (apiFootballMatches.length > 0) {
      state.matches = sortMatches(mergeMatches(apiFootballMatches, fallback));
      applyManualScoresToMatches();
      elements.sourceLabel.textContent = `API-Football + ${getStorageLabel()}`;
      return;
    }

    const apiMatches = await fetchSportsDbMatchesForBoliviaDate(state.todayIso);
    const merged = mergeMatches(apiMatches, fallback);
    state.matches = sortMatches(merged);
    applyManualScoresToMatches();
    elements.sourceLabel.textContent =
      apiMatches.length > 0
        ? `TheSportsDB + ${getStorageLabel()}`
        : `Respaldo local + ${getStorageLabel()}`;
  } catch (error) {
    state.matches = sortMatches(fallback);
    applyManualScoresToMatches();
    elements.sourceLabel.textContent = `Respaldo local + ${getStorageLabel()}`;
  }
}

function getStorageLabel() {
  return state.remoteEnabled ? "Firebase" : "localStorage";
}

async function fetchApiFootballMatchesForBoliviaDate(dateIso) {
  const apiDates = [dateIso, addDaysIso(dateIso, 1)];
  const batches = await Promise.all(apiDates.map(fetchApiFootballMatches));
  return batches
    .flat()
    .filter((match) => getBoliviaDateIso(new Date(match.kickoffUtc)) === dateIso);
}

async function fetchApiFootballMatches(dateIso) {
  const response = await fetch(`/api/football?date=${encodeURIComponent(dateIso)}`, {
    cache: "no-store",
  });
  if (!response.ok) return [];

  const data = await response.json();
  if (!data.configured || !Array.isArray(data.events)) return [];
  return data.events.map(mapApiFootballEvent).filter(Boolean);
}

function mapApiFootballEvent(event) {
  const fixture = event.fixture || {};
  const teams = event.teams || {};
  const league = event.league || {};
  const goals = event.goals || {};
  const status = fixture.status || {};
  const homeTeam = teams.home?.name || "Local";
  const awayTeam = teams.away?.name || "Visitante";
  const kickoffUtc = fixture.date;
  if (!kickoffUtc) return null;

  return {
    id: fixture.id ? `api-football-${fixture.id}` : slugify(`${kickoffUtc}-${homeTeam}-${awayTeam}`),
    date: kickoffUtc.slice(0, 10),
    kickoffUtc,
    homeTeam,
    awayTeam,
    group: league.round || league.name || "FIFA World Cup 2026",
    venue: fixture.venue?.name || "Sede por confirmar",
    status: [status.long, status.short, status.elapsed ? `${status.elapsed}'` : ""]
      .filter(Boolean)
      .join(" "),
    homeScore: toScore(goals.home),
    awayScore: toScore(goals.away),
    source: "API-Football",
  };
}

async function fetchSportsDbMatchesForBoliviaDate(dateIso) {
  const apiDates = [dateIso, addDaysIso(dateIso, 1)];
  const batches = await Promise.all(apiDates.map(fetchSportsDbMatches));
  return batches
    .flat()
    .filter((match) => getBoliviaDateIso(new Date(match.kickoffUtc)) === dateIso);
}

async function fetchSportsDbMatches(dateIso) {
  const endpoint = `https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d=${dateIso}&s=Soccer`;
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) throw new Error("No se pudo consultar la API");

  const data = await response.json();
  const events = Array.isArray(data.events) ? data.events : [];
  return events.filter(isWorldCupEvent).map(mapSportsDbEvent);
}

function isWorldCupEvent(event) {
  const fields = [
    event.strLeague,
    event.strEvent,
    event.strFilename,
    event.strSport,
    event.strCountry,
    event.strDescriptionEN,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return fields.includes("world cup") || fields.includes("fifa world cup");
}

function mapSportsDbEvent(event) {
  const homeTeam = event.strHomeTeam || "Local";
  const awayTeam = event.strAwayTeam || "Visitante";
  const date = event.dateEvent || state.todayIso;
  const kickoffUtc = event.strTimestamp || buildUtcFromDateTime(date, event.strTime);
  const status = [event.strStatus, event.strProgress, event.strResult].filter(Boolean).join(" ");

  return {
    id: event.idEvent || slugify(`${date}-${homeTeam}-${awayTeam}`),
    date,
    kickoffUtc,
    homeTeam,
    awayTeam,
    group: event.strLeague || "FIFA World Cup 2026",
    venue: event.strVenue || "Sede por confirmar",
    status,
    homeScore: toScore(event.intHomeScore),
    awayScore: toScore(event.intAwayScore),
    source: "TheSportsDB",
  };
}

function buildUtcFromDateTime(date, time) {
  if (!time) return `${date}T12:00:00Z`;
  const cleanTime = time.split("+")[0].replace("Z", "").slice(0, 8);
  return `${date}T${cleanTime}Z`;
}

function getFallbackMatchesForDate(dateIso) {
  return FALLBACK_MATCHES.filter((match) => match.date === dateIso);
}

function addDaysIso(dateIso, days) {
  const [year, month, day] = dateIso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return getBoliviaDateIso(date);
}

function mergeMatches(apiMatches, fallbackMatches) {
  const map = new Map();
  [...apiMatches, ...fallbackMatches].forEach((match) => {
    const key = normalize(`${match.date}-${match.homeTeam}-${match.awayTeam}`);
    if (!map.has(key)) {
      map.set(key, match);
      return;
    }

    const current = map.get(key);
    map.set(key, {
      ...current,
      ...match,
      kickoffUtc: current.kickoffUtc || match.kickoffUtc,
      homeScore: current.homeScore ?? match.homeScore,
      awayScore: current.awayScore ?? match.awayScore,
      status: current.status || match.status,
      source:
        current.source === match.source ? current.source : `${current.source} + ${match.source}`,
    });
  });
  return [...map.values()];
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
}

function renderShell() {
  elements.todayLabel.textContent = formatBoliviaDate(state.todayIso);
  elements.activeUserLabel.textContent = state.activeUser;
  elements.ticketUserLabel.textContent = state.activeUser;
  elements.ticketPoolLabel.textContent = formatCurrency(getCurrentPot());
  elements.ticketBetCountLabel.textContent = state.bets.length;
  elements.liveBetToggle.checked = state.liveBettingEnabled;
  elements.liveBetStatus.textContent = state.liveBettingEnabled
    ? "Habilitado con admin"
    : "Bloqueado";
}

function renderMatches() {
  if (state.matches.length === 0) {
    elements.matchesList.innerHTML =
      '<div class="empty-state">No hay partidos del Mundial 2026 registrados para hoy en Bolivia.</div>';
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
        <span>${formatBoliviaTime(match.kickoffUtc)}</span>
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
    <strong>${formatBoliviaTime(match.kickoffUtc)} hora Bolivia</strong><br>
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

  if (existingIndex >= 0) state.bets.splice(existingIndex, 1, bet);
  else state.bets.unshift(bet);

  await persistBet(bet);
  showFormMessage(existingIndex >= 0 ? "Apuesta actualizada." : "Apuesta registrada.");
  renderAll();
  setTimeout(closeBetModal, 350);
}

function showFormMessage(message, isError = false) {
  elements.formMessage.textContent = message;
  elements.formMessage.classList.toggle("error", isError);
}

function renderBets() {
  const total = getCurrentPot();
  const apostadores = new Set(state.bets.map((bet) => bet.user)).size;

  elements.myBetCount.textContent = state.bets.length;
  elements.myBetTotal.textContent = formatCurrency(total);
  elements.globalBetCount.textContent = apostadores;

  if (state.bets.length === 0) {
    elements.betsList.innerHTML = '<div class="empty-state">Todavia no hay apuestas registradas.</div>';
    return;
  }

  elements.betsList.innerHTML = state.bets.map(renderBetItem).join("");
  elements.betsList.querySelectorAll("[data-remove-bet]").forEach((button) => {
    button.addEventListener("click", async () => {
      await deleteBet(button.dataset.removeBet);
    });
  });
}

function renderBetItem(bet) {
  const settlement = getSettlement(bet.matchId);
  const payout = settlement?.payouts.find((item) => item.user === bet.user);
  const canRemove = bet.user === state.activeUser && !settlement;
  return `
    <article class="bet-item">
      <header>
        <h3>${escapeHtml(bet.user)}</h3>
        ${
          canRemove
            ? `<button class="remove-bet" type="button" data-remove-bet="${escapeHtml(bet.id)}">Quitar</button>`
            : ""
        }
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
      await persistSettlement(settlement);
      changed = true;
      if (!matchToOpen) matchToOpen = match.id;
      continue;
    }

    if (!matchToOpen && !state.dismissedSettlementPrompts.has(match.id)) matchToOpen = match.id;
  }

  if (changed) {
    saveState();
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
  await persistSettlement(settlement);
  renderMatches();
  renderBets();
  renderSettlementModal(match);
}

function renderSettlementSummary(settlement) {
  const carryoverText =
    settlement.carryoverOut > 0
      ? `<div class="empty-state">Empate: nadie cobra en este partido y ${formatCurrency(
          settlement.carryoverOut,
        )} queda acumulado para el siguiente.</div>`
      : "";

  return `
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
          <p class="eyebrow">${escapeHtml(match.group)} &middot; ${formatBoliviaTime(match.kickoffUtc)} BO</p>
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

function getCurrentPot() {
  return getTotalPool(getOpenBets()) + getAvailableCarryover();
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
