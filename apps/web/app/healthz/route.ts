export async function GET() {
  // Shallow health check: keeps Fly machine checks stable and fast.
  // Use `/healthz/deep` for dependency checks (BFF/DB).
  return Response.json({
    status: "ok",
    service: "vendora-web",
    timestamp: new Date().toISOString(),
  });
}
