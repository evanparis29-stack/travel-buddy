// api/visa.ts — final hardening: exact form body, both key headers, CORS, echo+debug

const RAPID_HOST = "visa-requirement.p.rapidapi.com";
const RAPID_URL = `https://${RAPID_HOST}/`;
const RAPID_KEY = process.env.VISA_API_KEY || process.env.RAPIDAPI_KEY || "";

// CORS
function setCORS(res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-rapidapi-key,x-api-key,x-rapidapi-host");
}

// ISO3 -> ISO2
async function iso3to2(iso3: string): Promise<string> {
  const code = (iso3 || "").trim().toUpperCase();
  if (!code) return "";
  try {
    const r = await fetch(`https://restcountries.com/v3.1/alpha/${code}`);
    if (!r.ok) return "";
    const arr = await r.json();
    const it = Array.isArray(arr) ? arr[0] : arr;
    return (it?.cca2 || "").toUpperCase();
  } catch {
    return "";
  }
}

export default async function handler(req: any, res: any) {
  setCORS(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const isGET = req.method === "GET";
  const body = isGET ? req.query : (req.body || {});
  const passportISO3 = String((body as any).passport || "").toUpperCase();
  const destinationISO3 = String((body as any).destination || "").toUpperCase();

  const echo = isGET ? String((req.query as any).echo || "") : "";
  const debug = isGET ? String((req.query as any).debug || "") : "";

  if (!RAPID_KEY) {
    return res.status(500).json({ error: true, message: "Missing VISA_API_KEY or RAPIDAPI_KEY env" });
  }
  if (!passportISO3 || !destinationISO3) {
    return res.status(400).json({ error: true, message: "Missing 'passport' or 'destination' (ISO3 like FRA,JPN)" });
  }

  const [passportISO2, destinationISO2] = await Promise.all([
    iso3to2(passportISO3),
    iso3to2(destinationISO3),
  ]);
  if (!passportISO2 || !destinationISO2) {
    return res.status(400).json({
      error: true,
      message: "Could not resolve ISO3→ISO2",
      debug: { passportISO3, destinationISO3, passportISO2, destinationISO2 },
    });
  }

  // literal form body exactly as their curl
  const formString = `passport=${encodeURIComponent(passportISO2)}&destination=${encodeURIComponent(destinationISO2)}`;

  // Echo: do NOT call upstream, just return what we'd send
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
        computed: { passportISO3, destinationISO3, passportISO2, destinationISO2 },
      },
      at: new Date().toISOString(),
    });
  }

  try {
    const upstream = await fetch(RAPID_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // send both variants to be safe
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

    // Normalize color -> requirement
    const color = String(upstreamJson?.color || "").toLowerCase();
    const map: Record<string, string> = { red: "visa_required", green: "visa_free", blue: "visa_on_arrival", yellow: "eta" };

    const normalized = {
      passport: passportISO3,
      destination: destinationISO3,
      requirement: (map[color] as "visa_required"|"visa_free"|"visa_on_arrival"|"eta"|"unknown") || "unknown",
      allowedStay: upstreamJson?.stay_of ?? null,
      notes: upstreamJson?.except_text ?? null,
      source: RAPID_HOST,
      fetchedAt: new Date().toISOString(),
      _raw: upstreamJson,
    };

    // If debug=1, also show what we sent and upstream status
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
          computed: { passportISO3, destinationISO3, passportISO2, destinationISO2 },
        },
        received: upstreamJson,
        normalized,
        at: new Date().toISOString(),
      });
    }

    setCORS(res);
    return res.status(200).json(normalized);
  } catch (e: any) {
    setCORS(res);
    return res.status(502).json({ error: true, message: "Upstream call failed", detail: e?.message });
  }
}
