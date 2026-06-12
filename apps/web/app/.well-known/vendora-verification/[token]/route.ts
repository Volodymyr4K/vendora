/**
 * HTTP Verification Endpoint
 *
 * Purpose: Echo token to prove traffic reaches our infrastructure
 * Used for: Cloudflare proxied domains (CNAME flattening bypass)
 *
 * Flow:
 * 1. User adds domain to Cloudflare (proxied)
 * 2. DNS: shop.com → Cloudflare → Vercel → Next.js
 * 3. BFF calls: GET https://shop.com/.well-known/vendora-verification/{token}
 * 4. This handler echoes token back
 * 5. BFF verifies token matches expected value
 */

export async function GET(
  request: Request,
  { params }: { params: { token: string } }
) {
  const { token } = params;

  // Simply echo the token back
  // BFF validates during verification
  return new Response(token, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
}

