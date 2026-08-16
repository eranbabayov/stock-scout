import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserStocks, useStockData, useRemoveStock } from "@/hooks/useStocks";
import WatchlistCard from "@/components/WatchlistCard";
import StockChart from "@/components/StockChart";
import AddStockForm from "@/components/AddStockForm";
import StocksAboveAvg from "@/components/StocksAboveAvg";
import FibRetracement from "@/components/FibRetracement";
import CombinedScreener from "@/components/CombinedScreener";
import TradesPanel from "@/components/TradesPanel";
import { Button } from "@/components/ui/button";
import { TrendingUp, LogOut, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import Logo from "@/components/Logo";

const DashboardPage: React.FC = () => {
  const { user, signOut } = useAuth();
  const { data: userStocks, isLoading: stocksLoading } = useUserStocks();
  const symbols = userStocks?.map((s) => s.symbol) ?? [];
  const { data: stocksData, isLoading: dataLoading } = useStockData(symbols);
  const removeStock = useRemoveStock();

  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  const handleRemove = async (symbol: string) => {
    try {
      await removeStock.mutateAsync(symbol);
      toast.success(`${symbol} removed from watchlist`);
      if (selectedSymbol === symbol) setSelectedSymbol(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const isLoading = stocksLoading || dataLoading;

  // Auto-select first stock
  const activeSymbol = selectedSymbol ?? symbols[0] ?? null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between py-3 px-4">
          <div className="flex items-center gap-3">
            <Logo className="h-8 w-8" />
            <span className="font-bold text-lg text-foreground">Stock Scout</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-1" /> Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto p-4 space-y-6">
        {/* Add Stock */}
        <div className="max-w-lg">
          <AddStockForm />
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading stock data...
          </div>
        )}

        {/* Watchlist Grid */}
        {symbols.length > 0 && stocksData && (
          <div className="overflow-y-auto max-h-[calc(3*theme(spacing.28))]">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {symbols.map((symbol) => {
              const data = stocksData[symbol];
              if (!data || !Array.isArray(data)) return null;
              return (
                <WatchlistCard
                  key={symbol}
                  symbol={symbol}
                  data={data}
                  onRemove={handleRemove}
                  onSelect={setSelectedSymbol}
                  selected={activeSymbol === symbol}
                  removing={removeStock.isPending}
                />
              );
            })}
          </div>
        </div>
        )}

        {symbols.length === 0 && !isLoading && (
          <div className="text-center py-16">
            <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Your watchlist is empty</h2>
            <p className="text-muted-foreground">Add stock symbols above to start tracking</p>
          </div>
        )}

        {/* Tabs for Chart, Analysis, Trades */}
        {symbols.length > 0 && stocksData && (
          <Tabs defaultValue="chart" className="space-y-4">
            <TabsList>
              <TabsTrigger value="chart">Chart</TabsTrigger>
              <TabsTrigger value="analysis">Analysis</TabsTrigger>
              <TabsTrigger value="trades">Trades</TabsTrigger>
            </TabsList>

            <TabsContent value="chart">
              {activeSymbol && stocksData[activeSymbol] && Array.isArray(stocksData[activeSymbol]) && (
                <StockChart symbol={activeSymbol} data={stocksData[activeSymbol]} />
              )}
            </TabsContent>

            <TabsContent value="analysis" className="space-y-4">
              <StocksAboveAvg stocksData={stocksData} />
              <FibRetracement stocksData={stocksData} />
              <CombinedScreener stocksData={stocksData} />
            </TabsContent>

            <TabsContent value="trades">
              <TradesPanel />
            </TabsContent>
          </Tabs>
        )}

        {/* Show trades even with empty watchlist */}
        {symbols.length === 0 && !isLoading && (
          <TradesPanel />
        )}
      </main>
    </div>
  );
};

export default DashboardPage;
