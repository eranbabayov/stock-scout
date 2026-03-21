import React, { useState, useMemo } from "react";
import { type StockDataPoint, checkStocksAboveAvg } from "@/lib/stockApi";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { BarChart3 } from "lucide-react";

interface StocksAboveAvgProps {
  stocksData: Record<string, StockDataPoint[]>;
}

const ALL_PERIODS = [20, 50, 150, 200];

const StocksAboveAvg: React.FC<StocksAboveAvgProps> = ({ stocksData }) => {
  const [selectedPeriods, setSelectedPeriods] = useState<number[]>([20, 50]);
  const [results, setResults] = useState<Record<string, Record<string, boolean>> | null>(null);

  const togglePeriod = (period: number) => {
    setSelectedPeriods((prev) =>
      prev.includes(period) ? prev.filter((p) => p !== period) : [...prev, period]
    );
  };

  const analyze = () => {
    const res = checkStocksAboveAvg(stocksData, selectedPeriods);
    setResults(res);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-bold text-foreground">Stocks Above Moving Averages</h3>
      </div>

      <div className="flex items-center gap-4 mb-4 flex-wrap">
        {ALL_PERIODS.map((period) => (
          <label key={period} className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={selectedPeriods.includes(period)}
              onCheckedChange={() => togglePeriod(period)}
            />
            <span className="font-mono text-foreground">EMA {period}</span>
          </label>
        ))}
        <Button onClick={analyze} size="sm" disabled={selectedPeriods.length === 0}>
          Analyze
        </Button>
      </div>

      {results !== null && (
        <div className="space-y-2">
          {Object.keys(results).length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No stocks found above all selected moving averages within the threshold.
            </p>
          ) : (
            Object.entries(results).map(([symbol, periods]) => (
              <div key={symbol} className="flex items-center gap-2 p-3 rounded-lg bg-accent/50">
                <span className="font-mono font-bold text-foreground">{symbol}</span>
                {Object.keys(periods).map((p) => (
                  <Badge key={p} variant="secondary" className="font-mono text-xs">
                    EMA {p} ✓
                  </Badge>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default StocksAboveAvg;
