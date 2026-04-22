export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Handle preflight requests
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // 1. GET: Fetch all domains (Used by syncFromCloud)
    // URL will be sarayu.ae/api?action=getDomains
    if (url.searchParams.get("action") === "getDomains") {
      const { results } = await env.DB.prepare("SELECT * FROM domains").all();
      return Response.json(results, { headers: corsHeaders });
    }

    // 2. POST: Process Purchase
    // URL will be sarayu.ae/api?action=buy
    if (url.searchParams.get("action") === "buy" && request.method === "POST") {
      const data = await request.json();
      await env.DB.prepare(`
        UPDATE domains 
        SET status = 'UNDER_REVIEW', statusText = 'Under Review', 
            buyer_name = ?, buyer_email = ?, buyer_phone = ? 
        WHERE subdomain = ?
      `).bind(data.name, data.email, data.phone, data.subdomain).run();
      return Response.json({ success: true }, { headers: corsHeaders });
    }
  } catch (e) {
    return new Response(e.message, { status: 500, headers: corsHeaders });
  }

  return new Response("Not Found", { status: 404 });
}
