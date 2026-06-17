import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const root = resolve(process.cwd());
const port = Number(process.env.PORT || 5173);
const host = "127.0.0.1";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${host}:${port}`);

  if (url.pathname === "/api/football") {
    await handleApiFootball(url, response);
    return;
  }

  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = resolve(join(root, pathname));

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath)] || "text/plain; charset=utf-8",
    });
    response.end(file);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}).listen(port, host, () => {
  console.log(`Delta Apuesta listo en http://${host}:${port}`);
});

async function handleApiFootball(url, response) {
  const apiKey = process.env.APISPORTS_KEY;
  const date = url.searchParams.get("date");
  const league = process.env.APISPORTS_LEAGUE_ID || "1";
  const season = process.env.APISPORTS_SEASON || "2026";
  const timezone = process.env.APISPORTS_TIMEZONE || "America/La_Paz";

  if (!apiKey) {
    sendJson(response, 200, { configured: false, events: [] });
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) {
    sendJson(response, 400, { configured: true, error: "Fecha invalida", events: [] });
    return;
  }

  try {
    const leagueData = await fetchFixtures({ apiKey, date, league, season, timezone, withLeague: true });
    if (!leagueData.ok) {
      sendJson(response, leagueData.status, {
        configured: true,
        error: leagueData.error || "No se pudo consultar API-Football",
        events: [],
      });
      return;
    }

    let events = leagueData.events;
    if (events.length === 0) {
      const dateData = await fetchFixtures({ apiKey, date, league, season, timezone, withLeague: false });
      if (dateData.ok) events = dateData.events.filter(isWorldCupFixture);
    }

    sendJson(response, 200, {
      configured: true,
      source: events.length > 0 ? "api-football" : "api-football-empty",
      events,
    });
  } catch {
    sendJson(response, 500, {
      configured: true,
      error: "Error consultando API-Football",
      events: [],
    });
  }
}

async function fetchFixtures({ apiKey, date, league, season, timezone, withLeague }) {
  const apiUrl = new URL("https://v3.football.api-sports.io/fixtures");
  apiUrl.searchParams.set("date", date);
  apiUrl.searchParams.set("timezone", timezone);
  if (withLeague) {
    apiUrl.searchParams.set("league", league);
    apiUrl.searchParams.set("season", season);
  }

  const apiResponse = await fetch(apiUrl, {
    headers: { "x-apisports-key": apiKey },
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

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}
