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
    response.status(200).json({ configured: false, events: [] });
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) {
    response.status(400).json({ configured: true, error: "Fecha invalida", events: [] });
    return;
  }

  try {
    const leagueRequests = leagueIds.map((league) =>
      fetchFixtures({ apiKey, date, league, season, timezone, withLeague: true }),
    );
    const dateRequest = fetchFixtures({ apiKey, date, season, timezone, withLeague: false });
    const results = await Promise.all([...leagueRequests, dateRequest]);
    const okResults = results.filter((item) => item.ok);

    if (okResults.length === 0) {
      const firstError = results[0] || {};
      response.status(firstError.status || 502).json({
        configured: true,
        error: firstError.error || "No se pudo consultar API-Football",
        events: [],
      });
      return;
    }

    const events = uniqueFixtures(
      okResults.flatMap((result) => result.events).filter(isWorldCupFixture),
    );

    response.status(200).json({
      configured: true,
      source: events.length > 0 ? "api-football" : "api-football-empty",
      timezone,
      date,
      leagueIds,
      events,
    });
  } catch (error) {
    response.status(500).json({
      configured: true,
      error: "Error consultando API-Football",
      events: [],
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
