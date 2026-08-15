import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { useAuth } from "@/contexts/AuthContext";
import { fetchStockData } from "@/lib/stockApi";
import type { UserStock, UserTrade } from "@/lib/types";

export function useUserStocks() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["user-stocks", user?.id],
    queryFn: async () => {
      if (!user) return [];
      return apiFetch<UserStock[]>("/stocks");
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
      await apiFetch("/stocks", {
        method: "POST",
        body: JSON.stringify({ symbol: symbol.toUpperCase() }),
      });
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
      await apiFetch(`/stocks/${symbol.toUpperCase()}`, { method: "DELETE" });
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
      return apiFetch<UserTrade[]>("/trades");
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
      await apiFetch("/trades", {
        method: "POST",
        body: JSON.stringify({ ...trade, symbol: trade.symbol.toUpperCase() }),
      });
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
      await apiFetch(`/trades/${tradeId}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-trades"] }),
  });
}
