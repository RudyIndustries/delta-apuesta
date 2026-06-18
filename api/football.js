const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";
const DEFAULT_TIMEZONE = "America/La_Paz";
const DEFAULT_LEAGUE_IDS = "1";

export default async function handler(request, response) {
  const apiKey = process.env.APISPORTS_KEY;
  const leagueIds = getLeagueIds();
  const season = process.env.APISPORTS_SEASON || "2026";
  const timezone = DEFAULT_TIMEZONE;
  const { date } = request.query || {};

  if (!apiKey) {
    response.status(200).json({
      configured: false,
      events: [],
      diagnostics: {
        reason: "missing-api-key",
        message: "Falta APISPORTS_KEY en Vercel.",
      },
    });
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) {
    response.status(400).json({ configured: true, error: "Fecha invalida", events: [] });
    return;
  }

  try {
    const queryConfigs = [
      ...leagueIds.map((league) => ({ league, season, timezone, withLeague: true })),
      { season, timezone, withLeague: false },
    ];
    const results = await Promise.all(
      queryConfigs.map((config) =>
        fetchFixtures({ apiKey, date, ...config }).then((result) => ({
          ...result,
          query: getQueryLabel(config),
        })),
      ),
    );
    const okResults = results.filter((item) => item.ok);

    if (okResults.length === 0) {
      const firstError = results[0] || {};
      response.status(firstError.status || 502).json({
        configured: true,
        error: firstError.error || "No se pudo consultar API-Football",
        events: [],
        diagnostics: buildDiagnostics({ date, timezone, season, leagueIds, results, events: [] }),
      });
      return;
    }

    const rawEvents = uniqueFixtures(okResults.flatMap((result) => result.events));
    const events = uniqueFixtures(rawEvents.filter(isWorldCupFixture));

    response.status(200).json({
      configured: true,
      source: events.length > 0 ? "api-football" : "api-football-empty",
      timezone,
      date,
      leagueIds,
      events,
      diagnostics: buildDiagnostics({ date, timezone, season, leagueIds, results, events, rawEvents }),
    });
  } catch (error) {
    response.status(500).json({
      configured: true,
      error: "Error consultando API-Football",
      events: [],
      diagnostics: {
        reason: "server-error",
        message: "La funcion de Vercel fallo consultando API-Football.",
      },
    });
  }
}

function getLeagueIds() {
  const rawValue = process.env.APISPORTS_LEAGUE_IDS || process.env.APISPORTS_LEAGUE_ID || DEFAULT_LEAGUE_IDS;
  return rawValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function fetchFixtures({ apiKey, date, league, season, timezone, withLeague }) {
  const url = new URL(`${API_FOOTBALL_BASE_URL}/fixtures`);
  url.searchParams.set("date", date);
  url.searchParams.set("timezone", timezone);
  if (withLeague) {
    url.searchParams.set("league", league);
    url.searchParams.set("season", season);
  }

  const apiResponse = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
    },
  });
  const data = await apiResponse.json();

  return {
    ok: apiResponse.ok,
    status: apiResponse.status,
    error: data?.message || data?.errors,
    events: Array.isArray(data.response) ? data.response : [],
  };
}

function getQueryLabel(config) {
  return config.withLeague ? `league=${config.league}&season=${config.season}` : "date-only";
}

function buildDiagnostics({ date, timezone, season, leagueIds, results, events, rawEvents = [] }) {
  const totalRaw = rawEvents.length;
  const totalFiltered = events.length;
  return {
    reason: totalFiltered > 0 ? "ok" : totalRaw > 0 ? "filtered-empty" : "api-empty",
    date,
    timezone,
    season,
    leagueIds,
    rawCount: totalRaw,
    filteredCount: totalFiltered,
    queries: results.map((result) => ({
      query: result.query,
      ok: result.ok,
      status: result.status,
      count: result.events.length,
      error: result.error || "",
      leagues: summarizeLeagues(result.events),
    })),
  };
}

function summarizeLeagues(events) {
  return [...new Set(events.map((event) => {
    const league = event?.league || {};
    return [league.id, league.name, league.country].filter(Boolean).join(" - ");
  }).filter(Boolean))].slice(0, 6);
}

function isWorldCupFixture(event) {
  const league = event?.league || {};
  const text = [league.id, league.name, league.round, league.country]
    .filter((value) => value !== undefined && value !== null)
    .join(" ")
    .toLowerCase();

  return text.includes("world cup") || text.includes("fifa") || String(league.id) === "1";
}

function uniqueFixtures(events) {
  const seen = new Set();
  return events.filter((event) => {
    const id = event?.fixture?.id;
    const key = id || JSON.stringify([event?.fixture?.date, event?.teams?.home?.name, event?.teams?.away?.name]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
