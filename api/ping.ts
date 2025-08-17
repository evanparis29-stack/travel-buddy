// api/ping.ts — sanity check
export default async function handler(req: any, res: any) {
  res.status(200).json({
    ok: true,
    time: new Date().toISOString(),
    env: {
      VISA_API_KEY: Boolean(process.env.VISA_API_KEY),
      RAPIDAPI_KEY: Boolean(process.env.RAPIDAPI_KEY),
    },
    query: req.query,
  });
}
