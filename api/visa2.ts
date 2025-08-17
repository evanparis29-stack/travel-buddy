// api/visa2.ts — minimal test: expects ISO2 (FR, JP). Has CORS + echo/debug.
const RAPID_HOST = "visa-requirement.p.rapidapi.com";
const RAPID_URL = `https://${RAPID_HOST}/`;
const RAPID_KEY = process.env.VISA_API_KEY || process.env.RAPIDAPI_KEY || "";

function setCORS(res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-rapidapi-key,x-api-key,x-rapidapi-host");
}

export default async function handler(req: any, res: any) {
  setCORS(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const isGET = req.method === "GET";
  const q = isGET ? req.query : (req.body || {});
  const passportISO2 = String((q as any).passport || "").trim().toUpperCase();     // e.g. FR
  const destinationISO2 = String((q as any).destination || "").trim().toUpperCase(); // e.g. JP
  const echo = isGET ? String((q as any).echo || "") : "";
  const debug = isGET ? String((q as any).debug || "") : "";

  if (!RAPID_KEY) return res.status(500).json({ error: true, message: "Missing VISA_API_KEY/RAPIDAPI_KEY env" });
  if (!passportISO2 || !destinationISO2) return res.status(400).json({ error: true, message: "Missing 'passport' or 'destination' (use ISO2 like FR, JP)" });

  const formString = `passport=${encodeURIComponent(passportISO2)}&destination=${encodeURIComponent(destinationISO2)}`;

  if (echo === "1") {
    return res.status(200).json({
      ok: true,
      note: "Echo only (no upstream). Remove echo=1 to call RapidAPI.",
      sent: {
        url: RAPID_URL,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "x-rapidapi-host": RAPID_HOST,
          "x-rapidapi-key": "<redacted>",
          "x-api-key": "<redacted>",
        },
        body: formString,
      },
      at: new Date().toISOString(),
    });
  }

  try {
    const upstream = await fetch(RAPID_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "x-rapidapi-host": RAPID_HOST,
        "x-rapidapi-key": RAPID_KEY,
        "x-api-key": RAPID_KEY,
      },
      body: formString,
    });

    const upstreamStatus = upstream.status;
    const upstreamText = await upstream.text();
    let upstreamJson: any;
    try { upstreamJson = JSON.parse(upstreamText); } catch { upstreamJson = { raw: upstreamText }; }

    if (debug === "1") {
      setCORS(res);
      return res.status(200).json({
        ok: upstream.ok,
        upstreamStatus,
        sent: {
          url: RAPID_URL,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "x-rapidapi-host": RAPID_HOST,
            "x-rapidapi-key": "<redacted>",
            "x-api-key": "<redacted>",
          },
          body: formString,
        },
        received: upstreamJson,
        at: new Date().toISOString(),
      });
    }

    setCORS(res);
    return res.status(200).json(upstreamJson);
  } catch (e: any) {
    setCORS(res);
    return res.status(502).json({ error: true, message: "Upstream call failed", detail: e?.message });
  }
}
