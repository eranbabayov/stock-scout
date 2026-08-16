import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserStocks, useStockData } from "@/hooks/useStocks";
import StockChart from "@/components/StockChart";
import StocksAboveAvg from "@/components/StocksAboveAvg";
import FibRetracement from "@/components/FibRetracement";
import CombinedScreener from "@/components/CombinedScreener";
import TradesPanel from "@/components/TradesPanel";
import AlertsPanel from "@/components/AlertsPanel";
import WatchlistSidebar from "@/components/WatchlistSidebar";
import { Button } from "@/components/ui/button";
import { TrendingUp, LogOut, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Logo from "@/components/Logo";

const DashboardPage: React.FC = () => {
  const { user, signOut } = useAuth();
  const { data: userStocks, isLoading: stocksLoading } = useUserStocks();
  const symbols = userStocks?.map((s) => s.symbol) ?? [];
  const { data: stocksData, isLoading: dataLoading } = useStockData(symbols);

  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  const isLoading = stocksLoading || dataLoading;
  const activeSymbol = selectedSymbol ?? symbols[0] ?? null;
  const activeSymbolData = activeSymbol && stocksData?.[activeSymbol];

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

      <main className="container mx-auto p-4">
        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground mb-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading stock data...
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-4">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            <Tabs defaultValue="chart" className="space-y-4">
              <TabsList>
                <TabsTrigger value="chart">Chart</TabsTrigger>
                <TabsTrigger value="analysis">Analysis</TabsTrigger>
                <TabsTrigger value="trades">Trades</TabsTrigger>
                <TabsTrigger value="alerts">Alerts</TabsTrigger>
              </TabsList>

              <TabsContent value="chart">
                {activeSymbol && activeSymbolData && Array.isArray(activeSymbolData) ? (
                  <StockChart symbol={activeSymbol} data={activeSymbolData} />
                ) : (
                  <div className="text-center py-16 bg-card border border-border rounded-xl">
                    <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-foreground mb-2">No stock selected</h2>
                    <p className="text-muted-foreground">Add a stock to a list on the right, then click it to chart it here.</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="analysis" className="space-y-4">
                {symbols.length > 0 && stocksData ? (
                  <>
                    <StocksAboveAvg stocksData={stocksData} />
                    <FibRetracement stocksData={stocksData} />
                    <CombinedScreener stocksData={stocksData} />
                  </>
                ) : (
                  <div className="text-center py-16 bg-card border border-border rounded-xl">
                    <p className="text-muted-foreground">Add stocks to a list to screen them here.</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="trades">
                <TradesPanel />
              </TabsContent>

              <TabsContent value="alerts">
                <AlertsPanel />
              </TabsContent>
            </Tabs>
          </div>

          {/* Persistent watchlist sidebar */}
          <WatchlistSidebar stocksData={stocksData} selectedSymbol={activeSymbol} onSelectSymbol={setSelectedSymbol} />
        </div>
      </main>
    </div>
  );
};

export default DashboardPage;
