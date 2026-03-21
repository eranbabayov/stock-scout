import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAddStock } from "@/hooks/useStocks";
import { validateStock } from "@/lib/stockApi";

const AddStockForm: React.FC = () => {
  const [symbol, setSymbol] = useState("");
  const [validating, setValidating] = useState(false);
  const addStock = useAddStock();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const s = symbol.trim().toUpperCase();
    if (!s) return;

    setValidating(true);
    const valid = await validateStock(s);
    setValidating(false);

    if (!valid) {
      toast.error(`"${s}" is not a valid stock symbol`);
      return;
    }

    try {
      await addStock.mutateAsync(s);
      toast.success(`${s} added to your watchlist`);
      setSymbol("");
    } catch (err: any) {
      if (err.message?.includes("duplicate")) {
        toast.error(`${s} is already in your watchlist`);
      } else {
        toast.error(err.message);
      }
    }
  };

  const isLoading = validating || addStock.isPending;

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        value={symbol}
        onChange={(e) => setSymbol(e.target.value.toUpperCase())}
        placeholder="Enter stock symbol (e.g. AAPL)"
        className="font-mono"
        disabled={isLoading}
      />
      <Button type="submit" disabled={isLoading || !symbol.trim()}>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Add
      </Button>
    </form>
  );
};

export default AddStockForm;
