import React, { useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useUserStocks } from "@/hooks/useStocks";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface SymbolAutocompleteProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  autoFocus?: boolean;
}

const MAX_SUGGESTIONS = 8;

/**
 * A plain text input (any real ticker can still be typed/submitted — this is
 * a convenience, not a closed choice) that suggests the user's own watchlist
 * symbols in a dropdown: the full list on focus with nothing typed yet,
 * narrowed to prefix matches as they type.
 */
const SymbolAutocomplete: React.FC<SymbolAutocompleteProps> = ({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  required,
  className,
  autoFocus,
}) => {
  const { data: userStocks } = useUserStocks();
  const symbols = useMemo(() => (userStocks ?? []).map((s) => s.symbol), [userStocks]);

  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    const query = value.trim().toUpperCase();
    const filtered = query ? symbols.filter((s) => s.startsWith(query)) : symbols;
    return filtered.slice(0, MAX_SUGGESTIONS);
  }, [symbols, value]);

  const select = (symbol: string) => {
    onChange(symbol);
    setOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" && highlighted < suggestions.length) {
      e.preventDefault();
      select(suggestions[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <Popover open={open && suggestions.length > 0}>
      <PopoverAnchor asChild>
        <Input
          id={id}
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value.toUpperCase());
            setHighlighted(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          // Delay so a click on a suggestion (below) registers before the
          // list unmounts — a plain blur would close it first and swallow the click.
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          autoFocus={autoFocus}
          autoComplete="off"
          className={cn("font-mono", className)}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-56 p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          {value.trim() ? "Matching your stocks" : "Your stocks"}
        </div>
        <div className="max-h-60 overflow-y-auto">
          {suggestions.map((symbol, i) => (
            <button
              type="button"
              key={symbol}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(symbol)}
              onMouseEnter={() => setHighlighted(i)}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left font-mono text-sm",
                i === highlighted ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
              )}
            >
              <TrendingUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {symbol}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default SymbolAutocomplete;
