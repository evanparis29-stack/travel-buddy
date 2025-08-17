import { NextRequest, NextResponse } from "next/server";

const ISO3_TO_ISO2: Record<string, string> = {
  FRA: "FR",
  JPN: "JP",
  USA: "US",
  GBR: "GB",
  // add more as needed
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const passport = searchParams.get("passport");
  const destination = searchParams.get("destination");

  if (!passport || !destination) {
    return NextResponse.json({ error: true, message: "Missing passport or destination" }, { status: 400 });
  }

  // Convert FRA → FR, JPN → JP
  const passportIso2 = ISO3_TO_ISO2[passport] || passport;
  const destinationIso2 = ISO3_TO_ISO2[destination] || destination;

  try {
    const res = await fetch("https://visa-requirement.p.rapidapi.com/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "x-rapidapi-host": "visa-requirement.p.rapidapi.com",
        "x-rapidapi-key": process.env.RAPIDAPI_KEY!,
      },
      body: new URLSearchParams({
        passport: passportIso2,
        destination: destinationIso2,
      }),
    });

    const data = await res.json();

    return NextResponse.json({
      passport,
      destination,
      requirement: data.visa || "unknown",
      allowedStay: data.stay_of || null,
      notes: data.except_text || null,
      fetchedAt: new Date().toISOString(),
      _raw: data,
    });
  } catch (err: any) {
    return NextResponse.json({ error: true, message: err.message }, { status: 500 });
  }
}
