import React, { useState } from "react";
import { type StockDataPoint, type FibLevel, FIB_LEVELS, checkStocksNearFib } from "@/lib/stockApi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Waves } from "lucide-react";

interface FibRetracementProps {
  stocksData: Record<string, StockDataPoint[]>;
}

const FibRetracement: React.FC<FibRetracementProps> = ({ stocksData }) => {
  const [selectedLevel, setSelectedLevel] = useState<FibLevel>(61.8);
  const [results, setResults] = useState<Record<
    string,
    { low: number; high: number; levelPrice: number; percentFromLevel: number }
  > | null>(null);
  const [lowerThreshold, setLowerThreshold] = useState<number>(0);
  const [upperThreshold, setUpperThreshold] = useState<number>(3);

  const analyze = () => {
    const res = checkStocksNearFib(stocksData, selectedLevel, lowerThreshold, upperThreshold);
    setResults(res);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Waves className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-bold text-foreground">Fibonacci Retracement</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        For each stock, finds the lowest low ("the bottom") and the highest high after it, then checks how close
        the last price is to the chosen retracement level of that move.
      </p>

      {/* Fib level (single choice) */}
      <RadioGroup
        value={String(selectedLevel)}
        onValueChange={(value) => setSelectedLevel(Number(value) as FibLevel)}
        className="flex items-center gap-4 mb-4 flex-wrap"
      >
        {FIB_LEVELS.map((level) => (
          <label key={level} className="flex items-center gap-2 text-sm cursor-pointer">
            <RadioGroupItem value={String(level)} id={`fib-${level}`} />
            <span className="font-mono text-foreground">{level}%</span>
          </label>
        ))}
      </RadioGroup>

      {/* Threshold controls */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Min % above level:</span>
          <input
            type="number"
            value={lowerThreshold}
            onChange={(e) => setLowerThreshold(Number(e.target.value))}
            className="w-20 px-2 py-1 rounded border border-border bg-background text-foreground font-mono text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Max % above level:</span>
          <input
            type="number"
            value={upperThreshold}
            onChange={(e) => setUpperThreshold(Number(e.target.value))}
            className="w-20 px-2 py-1 rounded border border-border bg-background text-foreground font-mono text-sm"
          />
        </label>
        <Button onClick={analyze} size="sm">
          Analyze
        </Button>
      </div>

      {/* Results */}
      {results !== null && (
        <div className="space-y-2">
          {Object.keys(results).length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No stocks found near the {selectedLevel}% Fibonacci level within the threshold.
            </p>
          ) : (
            Object.entries(results).map(([symbol, fib]) => (
              <div key={symbol} className="flex items-center gap-2 p-3 rounded-lg bg-accent/50 flex-wrap">
                <span className="font-mono font-bold text-foreground w-16">{symbol}</span>
                <Badge variant="secondary" className="font-mono text-xs flex items-center gap-1">
                  Fib {selectedLevel}% @ ${fib.levelPrice.toFixed(2)} ✓
                  <span className={fib.percentFromLevel >= 0 ? "text-green-500" : "text-red-500"}>
                    {fib.percentFromLevel >= 0 ? "+" : ""}
                    {fib.percentFromLevel}% from level
                  </span>
                </Badge>
                <span className="text-xs text-muted-foreground font-mono">
                  Low: ${fib.low.toFixed(2)} · High: ${fib.high.toFixed(2)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default FibRetracement;
