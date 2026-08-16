import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import SymbolAutocomplete from "@/components/SymbolAutocomplete";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAddStock } from "@/hooks/useStocks";
import { validateStock } from "@/lib/stockApi";

interface AddStockFormProps {
  listId: string;
}

const AddStockForm: React.FC<AddStockFormProps> = ({ listId }) => {
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
      await addStock.mutateAsync({ symbol: s, listId });
      toast.success(`${s} added`);
      setSymbol("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const isLoading = validating || addStock.isPending;

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <SymbolAutocomplete
        value={symbol}
        onChange={setSymbol}
        placeholder="Enter stock symbol (e.g. AAPL)"
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
