// api/visa.ts — GET-only attempt for RapidAPI visa-requirement

export default async function handler(req: any, res: any) {
  const p = String(req.query.passport || "").toUpperCase();
  const d = String(req.query.destination || "").toUpperCase();

  if (!p || !d) {
    return res.status(400).json({ error: true, message: "Missing passport or destination" });
  }
  if (!process.env.VISA_API_KEY) {
    return res.status(500).json({ error: true, message: "VISA_API_KEY not set in Vercel" });
  }

  try {
    // Send only GET query parameters (no body at all)
    const qs = new URLSearchParams({
      passport: p,
      nationality: p,
      destination: d,
      country: d,
    }).toString();

    const url = `https://visa-requirement.p.rapidapi.com/map?${qs}`;

    const r = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "x-rapidapi-host": "visa-requirement.p.rapidapi.com",
        "x-rapidapi-key": process.env.VISA_API_KEY as string,
      },
      cache: "no-store",
    });

    const text = await r.text();
    let json: any;
    try { json = JSON.parse(text); } catch { json = { error: true, message: "Non-JSON response", text }; }

    return res.status(200).json({
      passport: p,
      destination: d,
      fetchedAt: new Date().toISOString(),
      _raw: json,
    });
  } catch (err: any) {
    return res.status(500).json({ error: true, message: err?.message || "Unknown error" });
  }
}
