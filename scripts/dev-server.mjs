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

  if (!apiKey) {
    sendJson(response, 200, { configured: false, events: [] });
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) {
    sendJson(response, 400, { configured: true, error: "Fecha invalida", events: [] });
    return;
  }

  try {
    const apiUrl = new URL("https://v3.football.api-sports.io/fixtures");
    apiUrl.searchParams.set("date", date);
    apiUrl.searchParams.set("league", league);
    apiUrl.searchParams.set("season", season);

    const apiResponse = await fetch(apiUrl, {
      headers: { "x-apisports-key": apiKey },
    });
    const data = await apiResponse.json();

    sendJson(response, apiResponse.ok ? 200 : apiResponse.status, {
      configured: true,
      events: Array.isArray(data.response) ? data.response : [],
      error: apiResponse.ok ? undefined : data?.message || "No se pudo consultar API-Football",
    });
  } catch {
    sendJson(response, 500, {
      configured: true,
      error: "Error consultando API-Football",
      events: [],
    });
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}
