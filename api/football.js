const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";
const DEFAULT_TIMEZONE = "America/La_Paz";

export default async function handler(request, response) {
  const apiKey = process.env.APISPORTS_KEY;
  const league = process.env.APISPORTS_LEAGUE_ID || "1";
  const season = process.env.APISPORTS_SEASON || "2026";
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
    const leagueData = await fetchFixtures({ apiKey, date, league, season, withLeague: true });
    if (!leagueData.ok) {
      response.status(leagueData.status).json({
        configured: true,
        error: leagueData.error || "No se pudo consultar API-Football",
        events: [],
      });
      return;
    }

    let events = leagueData.events;

    if (events.length === 0) {
      const dateData = await fetchFixtures({ apiKey, date, league, season, withLeague: false });
      if (dateData.ok) events = dateData.events.filter(isWorldCupFixture);
    }

    response.status(200).json({
      configured: true,
      source: events.length > 0 ? "api-football" : "api-football-empty",
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

async function fetchFixtures({ apiKey, date, league, season, withLeague }) {
  const url = new URL(`${API_FOOTBALL_BASE_URL}/fixtures`);
  url.searchParams.set("date", date);
  url.searchParams.set("timezone", process.env.APISPORTS_TIMEZONE || DEFAULT_TIMEZONE);
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
