import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface YahooChartResult {
  timestamp: number[];
  indicators: {
    quote: Array<{
      open: number[];
      high: number[];
      low: number[];
      close: number[];
      volume: number[];
    }>;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbols, period = "1y" } = await req.json();

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return new Response(
        JSON.stringify({ error: "symbols array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const results: Record<string, any> = {};
    const today = new Date().toISOString().split("T")[0];

    for (const symbol of symbols) {
      const upperSymbol = symbol.toUpperCase();

      // Check cache first - get data from last year
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const { data: cachedData } = await supabase
        .from("stock_cache")
        .select("*")
        .eq("symbol", upperSymbol)
        .gte("date", oneYearAgo.toISOString().split("T")[0])
        .order("date", { ascending: true });

      // Check if we have recent data (within last trading day)
      const hasRecentData =
        cachedData &&
        cachedData.length > 200 &&
        cachedData[cachedData.length - 1]?.date >= getLastTradingDay();

      if (hasRecentData) {
        results[upperSymbol] = cachedData;
        continue;
      }

      // Fetch from Yahoo Finance
      try {
        const range = period === "1y" ? "1y" : period;
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${upperSymbol}?range=${range}&interval=1d`;

        const yahooRes = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0",
          },
        });

        if (!yahooRes.ok) {
          results[upperSymbol] = { error: `Invalid symbol: ${upperSymbol}` };
          continue;
        }

        const yahooData = await yahooRes.json();
        const chart = yahooData.chart?.result?.[0] as YahooChartResult | undefined;

        if (!chart || !chart.timestamp) {
          results[upperSymbol] = { error: `No data for ${upperSymbol}` };
          continue;
        }

        const quotes = chart.indicators.quote[0];
        const rows = chart.timestamp.map((ts: number, i: number) => {
          const date = new Date(ts * 1000).toISOString().split("T")[0];
          return {
            symbol: upperSymbol,
            date,
            open: quotes.open[i] ? Math.round(quotes.open[i] * 100) / 100 : null,
            high: quotes.high[i] ? Math.round(quotes.high[i] * 100) / 100 : null,
            low: quotes.low[i] ? Math.round(quotes.low[i] * 100) / 100 : null,
            close: quotes.close[i] ? Math.round(quotes.close[i] * 100) / 100 : null,
            volume: quotes.volume[i] || null,
          };
        }).filter((r: any) => r.close !== null);

        // Upsert into cache
        if (rows.length > 0) {
          const { error: upsertError } = await supabase
            .from("stock_cache")
            .upsert(rows, { onConflict: "symbol,date" });

          if (upsertError) {
            console.error(`Cache upsert error for ${upperSymbol}:`, upsertError);
          }
        }

        results[upperSymbol] = rows;
      } catch (fetchError) {
        console.error(`Yahoo fetch error for ${upperSymbol}:`, fetchError);
        // Fall back to cached data if available
        if (cachedData && cachedData.length > 0) {
          results[upperSymbol] = cachedData;
        } else {
          results[upperSymbol] = { error: `Failed to fetch ${upperSymbol}` };
        }
      }
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getLastTradingDay(): string {
  const now = new Date();
  const day = now.getDay();
  // If Sunday, go back 2 days. If Saturday, go back 1 day. If Monday before market close, go back 3 days.
  let daysBack = 1;
  if (day === 0) daysBack = 2;
  else if (day === 6) daysBack = 1;
  else if (day === 1) daysBack = 3;

  const lastTrading = new Date(now);
  lastTrading.setDate(lastTrading.getDate() - daysBack);
  return lastTrading.toISOString().split("T")[0];
}
