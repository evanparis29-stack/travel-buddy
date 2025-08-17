// api/visa.ts — FINAL: accepts ISO3 (e.g. FRA,JPN), converts to ISO2 (FR,JP), form-encoded RapidAPI call, CORS, echo+debug

const RAPID_HOST = "visa-requirement.p.rapidapi.com";
const RAPID_URL = `https://${RAPID_HOST}/`;
const RAPID_KEY = process.env.VISA_API_KEY || process.env.RAPIDAPI_KEY || "";

// CORS
function setCORS(res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,x-rapidapi-key,x-api-key,x-rapidapi-host"
  );
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
  const q = isGET ? req.query : (req.body || {});

  const passportISO3 = String((q as any).passport || "").toUpperCase();     // e.g. FRA
  const destinationISO3 = String((q as any).destination || "").toUpperCase(); // e.g. JPN

  const echo = isGET ? String((q as any).echo || "") : "";
  const debug = isGET ? String((q as any).debug || "") : "";

  if (!RAPID_KEY) {
    return res.status(500).json({ error: true, message: "Missing VISA_API_KEY or RAPIDAPI_KEY env" });
  }
  if (!passportISO3 || !destinationISO3) {
    return res.status(400).json({ error: true, message: "Missing 'passport' or 'destination' (use ISO3 like FRA,JPN)" });
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

  // EXACT form-encoded body
  const formString =
    `passport=${encodeURIComponent(passportISO2)}&destination=${encodeURIComponent(destinationISO2)}`;

  // Echo (no upstream) to verify what we send
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
        "x-rapidapi-host": RAPID_HOST,
        "x-rapidapi-key": RAPID_KEY,
        "x-api-key": RAPID_KEY, // also send this variant, seen on docs for /map
      },
      body: formString,
    });

    const upstreamStatus = upstream.status;
    const upstreamText = await upstream.text();
    let upstreamJson: any;
    try { upstreamJson = JSON.parse(upstreamText); } catch { upstreamJson = { raw: upstreamText }; }

    // Normalize for the app
    const color = String(upstreamJson?.color || "").toLowerCase();
    const map: Record<string, string> = {
      red: "visa_required",
      green: "visa_free",
      blue: "visa_on_arrival",
      yellow: "eta",
    };

    const normalized = {
      passport: passportISO3,
      destination: destinationISO3,
      requirement:
        (map[color] as "visa_required"|"visa_free"|"visa_on_arrival"|"eta"|"unknown") || "unknown",
      allowedStay: upstreamJson?.stay_of || null,
      notes: upstreamJson?.except_text || null,
      source: RAPID_HOST,
      fetchedAt: new Date().toISOString(),
      _raw: upstreamJson,
    };

    // Optional debug payload
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
