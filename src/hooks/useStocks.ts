import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { fetchStockData, type StockDataPoint } from "@/lib/stockApi";

export function useUserStocks() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["user-stocks", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("user_stocks")
        .select("*")
        .eq("user_id", user.id)
        .order("added_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export function useAddStock() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (symbol: string) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("user_stocks")
        .insert({ user_id: user.id, symbol: symbol.toUpperCase() });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-stocks"] });
      qc.invalidateQueries({ queryKey: ["stock-data"] });
    },
  });
}

export function useRemoveStock() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (symbol: string) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("user_stocks")
        .delete()
        .eq("user_id", user.id)
        .eq("symbol", symbol.toUpperCase());
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-stocks"] });
      qc.invalidateQueries({ queryKey: ["stock-data"] });
    },
  });
}

export function useStockData(symbols: string[]) {
  return useQuery({
    queryKey: ["stock-data", symbols.sort().join(",")],
    queryFn: async () => {
      if (symbols.length === 0) return {};
      return await fetchStockData(symbols);
    },
    enabled: symbols.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useUserTrades() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["user-trades", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("user_trades")
        .select("*")
        .eq("user_id", user.id)
        .order("buy_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export function useAddTrade() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (trade: {
      symbol: string;
      buy_price: number;
      buy_date: string;
      sell_price?: number;
      sell_date?: string;
      notes?: string;
    }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("user_trades")
        .insert({ ...trade, user_id: user.id, symbol: trade.symbol.toUpperCase() });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-trades"] }),
  });
}

export function useDeleteTrade() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (tradeId: string) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("user_trades")
        .delete()
        .eq("id", tradeId)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-trades"] }),
  });
}
