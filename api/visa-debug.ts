// api/visa-debug.ts — mirrors your working curl exactly and returns what we sent/received

export default async function handler(req: any, res: any) {
  const passport = String(req.query.passport || "").toUpperCase();      // e.g. TR
  const destination = String(req.query.destination || "").toUpperCase(); // e.g. AE

  const apiKey = process.env.VISA_API_KEY || process.env.RAPIDAPI_KEY || "";
  const missing = [];
  if (!passport) missing.push("passport");
  if (!destination) missing.push("destination");
  if (!apiKey) missing.push("VISA_API_KEY/RAPIDAPI_KEY");
  if (missing.length) {
    return res.status(400).json({ error: true, message: `Missing: ${missing.join(", ")}`, query: req.query });
  }

  const form = new URLSearchParams();
  form.append("passport", passport);
  form.append("destination", destination);

  const url = "https://visa-requirement.p.rapidapi.com/";
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    "x-rapidapi-host": "visa-requirement.p.rapidapi.com",
    "x-rapidapi-key": apiKey,
  };

  const r = await fetch(url, {
    method: "POST",
    headers,
    body: form,              // IMPORTANT: pass URLSearchParams object directly
    cache: "no-store",
  });

  const text = await r.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* keep text */ }

  return res.status(200).json({
    sent: {
      url,
      method: "POST",
      headers: { ...headers, "x-rapidapi-key": "<redacted>" },
      bodyAsForm: `passport=${passport}&destination=${destination}`,
    },
    received: {
      status: r.status,
      ok: r.ok,
      body: json ?? text,
    },
  });
}
