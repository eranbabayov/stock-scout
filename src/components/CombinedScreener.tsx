import React, { useState } from "react";
import {
  type StockDataPoint,
  type MovingAverageIndicator,
  type FibLevel,
  ALL_MA_INDICATORS,
  maIndicatorKey,
  FIB_LEVELS,
  checkStocksCombined,
  type CombinedScreenResult,
} from "@/lib/stockApi";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Layers } from "lucide-react";

interface CombinedScreenerProps {
  stocksData: Record<string, StockDataPoint[]>;
}

const NO_FIB = "none";

const CombinedScreener: React.FC<CombinedScreenerProps> = ({ stocksData }) => {
  const [selectedIndicators, setSelectedIndicators] = useState<MovingAverageIndicator[]>([]);
  const [fibChoice, setFibChoice] = useState<string>(NO_FIB);
  const [results, setResults] = useState<Record<string, CombinedScreenResult> | null>(null);
  const [lowerThreshold, setLowerThreshold] = useState<number>(0);
  const [upperThreshold, setUpperThreshold] = useState<number>(5);

  const toggleIndicator = (indicator: MovingAverageIndicator) => {
    setSelectedIndicators((prev) =>
      prev.some((i) => maIndicatorKey(i) === maIndicatorKey(indicator))
        ? prev.filter((i) => maIndicatorKey(i) !== maIndicatorKey(indicator))
        : [...prev, indicator]
    );
  };

  const fibLevel: FibLevel | null = fibChoice === NO_FIB ? null : (Number(fibChoice) as FibLevel);
  const nothingSelected = selectedIndicators.length === 0 && fibLevel == null;

  const analyze = () => {
    const res = checkStocksCombined(stocksData, selectedIndicators, fibLevel, lowerThreshold, upperThreshold);
    setResults(res);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Layers className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-bold text-foreground">Combined Screener</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Pick any combination of moving averages and a Fibonacci level — only stocks that satisfy every one of them
        (within the shared threshold) are returned.
      </p>

      {/* Moving averages */}
      <div className="mb-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Moving Averages</p>
        <div className="flex items-center gap-4 flex-wrap">
          {ALL_MA_INDICATORS.map((indicator) => (
            <label key={maIndicatorKey(indicator)} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={selectedIndicators.some((i) => maIndicatorKey(i) === maIndicatorKey(indicator))}
                onCheckedChange={() => toggleIndicator(indicator)}
              />
              <span className="font-mono text-foreground">
                {indicator.type} {indicator.period}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Fibonacci level */}
      <div className="mb-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Fibonacci Level (optional)</p>
        <RadioGroup value={fibChoice} onValueChange={setFibChoice} className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <RadioGroupItem value={NO_FIB} id="fib-none" />
            <span className="text-muted-foreground">None</span>
          </label>
          {FIB_LEVELS.map((level) => (
            <label key={level} className="flex items-center gap-2 text-sm cursor-pointer">
              <RadioGroupItem value={String(level)} id={`combined-fib-${level}`} />
              <span className="font-mono text-foreground">{level}%</span>
            </label>
          ))}
        </RadioGroup>
      </div>

      {/* Threshold controls */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Min % above:</span>
          <input
            type="number"
            value={lowerThreshold}
            onChange={(e) => setLowerThreshold(Number(e.target.value))}
            className="w-20 px-2 py-1 rounded border border-border bg-background text-foreground font-mono text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Max % above:</span>
          <input
            type="number"
            value={upperThreshold}
            onChange={(e) => setUpperThreshold(Number(e.target.value))}
            className="w-20 px-2 py-1 rounded border border-border bg-background text-foreground font-mono text-sm"
          />
        </label>
        <Button onClick={analyze} size="sm" disabled={nothingSelected}>
          Analyze
        </Button>
      </div>

      {/* Results */}
      {results !== null && (
        <div className="space-y-2">
          {Object.keys(results).length === 0 ? (
            <p className="text-muted-foreground text-sm">No stocks satisfy every selected condition.</p>
          ) : (
            Object.entries(results).map(([symbol, match]) => (
              <div key={symbol} className="flex items-center gap-2 p-3 rounded-lg bg-accent/50 flex-wrap">
                <span className="font-mono font-bold text-foreground w-16">{symbol}</span>
                {Object.entries(match.maMatches).map(([key, pct]) => (
                  <Badge key={key} variant="secondary" className="font-mono text-xs flex items-center gap-1">
                    {key.replace(/(\d+)$/, " $1")} ✓
                    <span className="text-green-500">+{pct}% above</span>
                  </Badge>
                ))}
                {match.fib && (
                  <>
                    <Badge variant="secondary" className="font-mono text-xs flex items-center gap-1">
                      Fib {fibLevel}% @ ${match.fib.levelPrice.toFixed(2)} ✓
                      <span className={match.fib.percentFromLevel >= 0 ? "text-green-500" : "text-red-500"}>
                        {match.fib.percentFromLevel >= 0 ? "+" : ""}
                        {match.fib.percentFromLevel}% from level
                      </span>
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">
                      Low: ${match.fib.low.toFixed(2)} · High: ${match.fib.high.toFixed(2)}
                    </span>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default CombinedScreener;
