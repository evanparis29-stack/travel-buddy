// api/visa.ts — Final: CORS + ISO3→ISO2 + proper form body + echo debugger

const RAPID_HOST = "visa-requirement.p.rapidapi.com";
const RAPID_URL = `https://${RAPID_HOST}/`;
const RAPID_KEY = process.env.VISA_API_KEY || process.env.RAPIDAPI_KEY || "";

// ---- CORS
function setCORS(res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-RapidAPI-Key, X-RapidAPI-Host, x-rapidapi-key, x-rapidapi-host"
  );
}

// ISO3 → ISO2 using restcountries
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

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Accept GET ?passport=FRA&destination=JPN and POST { passport, destination }
  const isGET = req.method === "GET";
  const body = isGET ? req.query : (req.body || {});
  const passportISO3 = String((body as any).passport || "").toUpperCase();
  const destinationISO3 = String((body as any).destination || "").toUpperCase();

  // Debug flags
  const echo = isGET ? String((req.query as any).echo || "") : "";
  const dry = isGET ? String((req.query as any).dry || "") : "";

  if (!RAPID_KEY) {
    return res
      .status(500)
      .json({ error: true, message: "Missing VISA_API_KEY or RAPIDAPI_KEY env" });
  }
  if (!passportISO3 || !destinationISO3) {
    return res.status(400).json({
      error: true,
      message:
        "Missing 'passport' or 'destination' (use ISO3 like FRA, JPN in your app)",
    });
  }

  // Convert to ISO2 for RapidAPI (they need alpha-2)
  const [passportISO2, destinationISO2] = await Promise.all([
    iso3to2(passportISO3),
    iso3to2(destinationISO3),
  ]);

  if (!passportISO2 || !destinationISO2) {
    return res.status(400).json({
      error: true,
      message: "Could not resolve ISO3→ISO2 mapping",
      debug: { passportISO3, destinationISO3, passportISO2, destinationISO2 },
    });
  }

  // Build EXACT form body RapidAPI expects
  const form = new URLSearchParams();
  form.set("passport", passportISO2);     // e.g. FRA → FR
  form.set("destination", destinationISO2); // e.g. JPN → JP
  const formString = form.toString();     // "passport=FR&destination=JP"

  // Echo debugger (does NOT call upstream when echo=1 or dry=1)
  if (echo === "1" || dry === "1") {
    return res.status(200).json({
      ok: true,
      note: "Echo only, no upstream call was made. Remove echo=1 to actually call RapidAPI.",
      sent: {
        url: RAPID_URL,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "X-RapidAPI-Host": RAPID_HOST,
          "X-RapidAPI-Key": "<redacted>",
        },
        body: formString,
        computed: {
          passportISO3,
          destinationISO3,
          passportISO2,
          destinationISO2,
        },
      },
      builtAt: new Date().toISOString(),
    });
  }

  try {
    // Make the actual RapidAPI call (headers per their docs)
    const upstream = await fetch(RAPID_URL, {
      method: "POST",
      headers: {
        // exact content type they show in examples
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        // RapidAPI prefers these header casings (case-insensitive, but keep it exact)
        "X-RapidAPI-Host": RAPID_HOST,
        "X-RapidAPI-Key": RAPID_KEY,
      },
      body: formString,
    });

    const text = await upstream.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    // Normalize for your app
    const color = String(data?.color || "").toLowerCase();
    const map: Record<string, string> = {
      red: "visa_required",
      green: "visa_free",
      blue: "visa_on_arrival", // provider groups VoA/eVisa as blue
      yellow: "eta",
    };

    const normalized = {
      passport: passportISO3,
      destination: destinationISO3,
      requirement:
        (map[color] as
          | "visa_required"
          | "visa_free"
          | "visa_on_arrival"
          | "eta"
          | "unknown") || "unknown",
      allowedStay: data?.stay_of || null,
      notes: data?.except_text || null,
      source: RAPID_HOST,
      fetchedAt: new Date().toISOString(),
      _raw: data,
    };

    setCORS(res);
    return res.status(200).json(normalized);
  } catch (e: any) {
    setCORS(res);
    return res.status(502).json({
      error: true,
      message: "Upstream call failed",
      detail: e?.message,
    });
  }
}
