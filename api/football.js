const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";

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
    const url = new URL(`${API_FOOTBALL_BASE_URL}/fixtures`);
    url.searchParams.set("date", date);
    url.searchParams.set("league", league);
    url.searchParams.set("season", season);

    const apiResponse = await fetch(url, {
      headers: {
        "x-apisports-key": apiKey,
      },
    });

    const data = await apiResponse.json();

    if (!apiResponse.ok) {
      response.status(apiResponse.status).json({
        configured: true,
        error: data?.message || "No se pudo consultar API-Football",
        events: [],
      });
      return;
    }

    response.status(200).json({
      configured: true,
      events: Array.isArray(data.response) ? data.response : [],
    });
  } catch (error) {
    response.status(500).json({
      configured: true,
      error: "Error consultando API-Football",
      events: [],
    });
  }
}
