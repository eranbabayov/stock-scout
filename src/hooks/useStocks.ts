import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { useAuth } from "@/contexts/AuthContext";
import { fetchStockData } from "@/lib/stockApi";
import type { UserStock, UserTrade, StockAlert, WatchlistListWithSymbols } from "@/lib/types";

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
    mutationFn: async ({ symbol, listId }: { symbol: string; listId: string }) => {
      if (!user) throw new Error("Not authenticated");
      await apiFetch(`/watchlist-lists/${listId}/stocks`, {
        method: "POST",
        body: JSON.stringify({ symbol: symbol.toUpperCase() }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-stocks"] });
      qc.invalidateQueries({ queryKey: ["stock-data"] });
      qc.invalidateQueries({ queryKey: ["watchlist-lists"] });
    },
  });
}

export function useRemoveStock() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ symbol, listId }: { symbol: string; listId: string }) => {
      if (!user) throw new Error("Not authenticated");
      await apiFetch(`/watchlist-lists/${listId}/stocks/${symbol.toUpperCase()}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-stocks"] });
      qc.invalidateQueries({ queryKey: ["stock-data"] });
      qc.invalidateQueries({ queryKey: ["watchlist-lists"] });
    },
  });
}

export function useWatchlistLists() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["watchlist-lists", user?.id],
    queryFn: async () => {
      if (!user) return [];
      return apiFetch<WatchlistListWithSymbols[]>("/watchlist-lists");
    },
    enabled: !!user,
  });
}

export function useCreateWatchlistList() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error("Not authenticated");
      return apiFetch<WatchlistListWithSymbols>("/watchlist-lists", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist-lists"] }),
  });
}

export function useDeleteWatchlistList() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (listId: string) => {
      if (!user) throw new Error("Not authenticated");
      await apiFetch(`/watchlist-lists/${listId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["watchlist-lists"] });
      qc.invalidateQueries({ queryKey: ["user-stocks"] });
      qc.invalidateQueries({ queryKey: ["stock-data"] });
    },
  });
}

export function useReorderWatchlistList() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const queryKey = ["watchlist-lists", user?.id];

  return useMutation({
    mutationFn: async ({ listId, symbols }: { listId: string; symbols: string[] }) => {
      if (!user) throw new Error("Not authenticated");
      await apiFetch(`/watchlist-lists/${listId}/reorder`, {
        method: "PATCH",
        body: JSON.stringify({ symbols }),
      });
    },
    // Applied immediately so the drag feels instant — the drop already shows
    // the new order optimistically before the request round-trips; rolled
    // back on failure since the server is the source of truth.
    onMutate: async ({ listId, symbols }) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<WatchlistListWithSymbols[]>(queryKey);
      qc.setQueryData<WatchlistListWithSymbols[]>(queryKey, (lists) =>
        lists?.map((l) => (l.id === listId ? { ...l, symbols } : l))
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(queryKey, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
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
      direction: "long" | "short";
      quantity: number;
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

export function useUpdateTrade() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...trade
    }: {
      id: string;
      direction?: "long" | "short";
      quantity?: number;
      buy_price?: number;
      buy_date?: string;
      sell_price?: number | null;
      sell_date?: string | null;
      notes?: string | null;
    }) => {
      if (!user) throw new Error("Not authenticated");
      await apiFetch(`/trades/${id}`, {
        method: "PATCH",
        body: JSON.stringify(trade),
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

export function useAlerts() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["alerts", user?.id],
    queryFn: async () => {
      if (!user) return [];
      return apiFetch<StockAlert[]>("/alerts");
    },
    enabled: !!user,
  });
}

export function useCreatePriceAlert() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ symbol, target_price }: { symbol: string; target_price: number }) => {
      if (!user) throw new Error("Not authenticated");
      return apiFetch<StockAlert>("/alerts", {
        method: "POST",
        body: JSON.stringify({ symbol: symbol.toUpperCase(), kind: "price", target_price }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
}

export function useCreateMovingAverageAlert() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      symbol,
      indicator_type,
      indicator_period,
    }: {
      symbol: string;
      indicator_type: "EMA" | "SMA";
      indicator_period: number;
    }) => {
      if (!user) throw new Error("Not authenticated");
      return apiFetch<StockAlert>("/alerts", {
        method: "POST",
        body: JSON.stringify({ symbol: symbol.toUpperCase(), kind: "moving_average", indicator_type, indicator_period }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
}

export function useDeleteAlert() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (alertId: string) => {
      if (!user) throw new Error("Not authenticated");
      await apiFetch(`/alerts/${alertId}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
}
