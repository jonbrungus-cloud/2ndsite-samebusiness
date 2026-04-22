export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Content-Type": "application/json"
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Guard: make sure D1 binding exists
  if (!env.DB) {
    return new Response(
      JSON.stringify({ error: "D1 binding 'DB' not found. Check your Pages project settings." }),
      { status: 500, headers: corsHeaders }
    );
  }

  const action = url.searchParams.get("action");

  try {

    // ── 1. GET: Fetch all domains ──────────────────────────────────────────
    if (action === "getDomains" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT * FROM domains ORDER BY id ASC"
      ).all();
      return Response.json(results ?? [], { headers: corsHeaders });
    }

    // ── 2. POST: Buyer submits purchase request ────────────────────────────
    if (action === "buy" && request.method === "POST") {
      const data = await request.json();

      if (!data.name || !data.email || !data.phone || !data.subdomain) {
        return Response.json(
          { error: "Missing required fields" },
          { status: 400, headers: corsHeaders }
        );
      }

      const result = await env.DB.prepare(`
        UPDATE domains
        SET status      = 'UNDER_REVIEW',
            statusText  = 'Under Review',
            buyer_name  = ?,
            buyer_email = ?,
            buyer_phone = ?
        WHERE subdomain = ?
          AND status = 'AVAILABLE'
      `).bind(data.name, data.email, data.phone, data.subdomain).run();

      if (result.meta?.changes === 0) {
        return Response.json(
          { error: "Subdomain not found or no longer available" },
          { status: 409, headers: corsHeaders }
        );
      }

      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // ── 3. POST: Admin adds a new subdomain ───────────────────────────────
    if (action === "add" && request.method === "POST") {
      const data = await request.json();

      if (!data.subdomain) {
        return Response.json(
          { error: "Subdomain name required" },
          { status: 400, headers: corsHeaders }
        );
      }

      const subdomain = data.subdomain.includes(".")
        ? data.subdomain
        : `${data.subdomain}.sarayu.ae`;

      await env.DB.prepare(`
        INSERT OR IGNORE INTO domains
          (subdomain, price, status, statusText, nodeCluster, features,
           buyer_name, buyer_email, buyer_phone)
        VALUES (?, 36, 'AVAILABLE', 'Available', 'AE-DXB-01', 'Wildcard SSL,DDoS Shield',
                NULL, NULL, NULL)
      `).bind(subdomain).run();

      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // ── 4. POST: Admin updates domain status ──────────────────────────────
    if (action === "updateStatus" && request.method === "POST") {
      const data = await request.json();

      const validStatuses = ["AVAILABLE", "UNDER_REVIEW", "SOLD", "BANNED"];
      if (!validStatuses.includes(data.status)) {
        return Response.json(
          { error: "Invalid status" },
          { status: 400, headers: corsHeaders }
        );
      }

      const statusTextMap = {
        AVAILABLE:    "Available",
        UNDER_REVIEW: "Under Review",
        SOLD:         "Sold",
        BANNED:       "Banned"
      };

      // Clear buyer info when marking as AVAILABLE again
      const clearBuyer = data.status === "AVAILABLE";

      await env.DB.prepare(`
        UPDATE domains
        SET status      = ?,
            statusText  = ?,
            buyer_name  = ${clearBuyer ? "NULL" : "buyer_name"},
            buyer_email = ${clearBuyer ? "NULL" : "buyer_email"},
            buyer_phone = ${clearBuyer ? "NULL" : "buyer_phone"}
        WHERE subdomain = ?
      `).bind(data.status, statusTextMap[data.status], data.subdomain).run();

      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // ── 5. POST: Admin deletes a domain ───────────────────────────────────
    if (action === "delete" && request.method === "POST") {
      const data = await request.json();
      await env.DB.prepare("DELETE FROM domains WHERE subdomain = ?")
        .bind(data.subdomain)
        .run();
      return Response.json({ success: true }, { headers: corsHeaders });
    }

  } catch (e) {
    console.error("API error:", e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: corsHeaders }
    );
  }

  return new Response(
    JSON.stringify({ error: "Unknown action or method" }),
    { status: 404, headers: corsHeaders }
  );
}
