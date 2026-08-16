import React, { useEffect, useState } from "react";
import {
  useWatchlistLists,
  useCreateWatchlistList,
  useDeleteWatchlistList,
  useRemoveStock,
  useReorderWatchlistList,
} from "@/hooks/useStocks";
import { getQuoteFromData, type StockDataPoint } from "@/lib/stockApi";
import AddStockForm from "@/components/AddStockForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Plus, X, Check, TrendingUp, TrendingDown, Minus, Loader2, ListPlus, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface WatchlistSidebarProps {
  stocksData: Record<string, StockDataPoint[]> | undefined;
  selectedSymbol: string | null;
  onSelectSymbol: (symbol: string | null) => void;
}

interface SymbolRowProps {
  symbol: string;
  data: StockDataPoint[] | undefined;
  selected: boolean;
  removing: boolean;
  onSelect: () => void;
  onRemove: () => void;
}

const SymbolRow: React.FC<SymbolRowProps> = ({ symbol, data, selected, removing, onSelect, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: symbol });
  const quote = data ? getQuoteFromData(data) : null;
  const isUp = quote ? quote.change > 0 : false;
  const isDown = quote ? quote.change < 0 : false;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onSelect}
      className={cn(
        "flex items-center justify-between px-2 py-2.5 border-b border-border/50 last:border-0 cursor-pointer group",
        selected ? "bg-muted" : "hover:bg-muted/50",
        isDragging && "opacity-50 relative z-10"
      )}
    >
      <div className="flex items-center gap-1 min-w-0">
        <button
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="cursor-grab active:cursor-grabbing touch-none shrink-0 text-muted-foreground/50 hover:text-muted-foreground p-0.5"
          title="Drag to reorder"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        {isUp && <TrendingUp className="h-3.5 w-3.5 text-stock-up shrink-0" />}
        {isDown && <TrendingDown className="h-3.5 w-3.5 text-stock-down shrink-0" />}
        {!isUp && !isDown && <Minus className="h-3.5 w-3.5 text-stock-neutral shrink-0" />}
        <span className="font-mono font-bold text-foreground truncate">{symbol}</span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {quote ? (
          <div className="text-right">
            <div className="font-mono text-sm text-foreground">${quote.lastPrice.toFixed(2)}</div>
            <div className={cn("font-mono text-xs", isUp ? "price-up" : isDown ? "price-down" : "price-neutral")}>
              {isUp ? "+" : ""}
              {quote.changePercent.toFixed(2)}%
            </div>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">...</span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          disabled={removing}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
};

const WatchlistSidebar: React.FC<WatchlistSidebarProps> = ({ stocksData, selectedSymbol, onSelectSymbol }) => {
  const { data: lists, isLoading } = useWatchlistLists();
  const createList = useCreateWatchlistList();
  const deleteList = useDeleteWatchlistList();
  const removeStock = useRemoveStock();
  const reorderList = useReorderWatchlistList();

  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newListName, setNewListName] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Default to the account's default list once lists load, without
  // clobbering a selection the user already made.
  useEffect(() => {
    if (!lists || lists.length === 0) return;
    if (activeListId && lists.some((l) => l.id === activeListId)) return;
    setActiveListId((lists.find((l) => l.isDefault) ?? lists[0]).id);
  }, [lists, activeListId]);

  const activeList = lists?.find((l) => l.id === activeListId) ?? null;

  const handleCreateList = async () => {
    const name = newListName.trim();
    if (!name) return;
    try {
      const list = await createList.mutateAsync(name);
      setActiveListId(list.id);
      setNewListName("");
      setCreating(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteList = async (id: string, name: string) => {
    try {
      await deleteList.mutateAsync(id);
      toast.success(`"${name}" list removed`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRemoveStock = async (symbol: string) => {
    if (!activeListId) return;
    try {
      await removeStock.mutateAsync({ symbol, listId: activeListId });
      if (selectedSymbol === symbol) onSelectSymbol(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!activeList || !over || active.id === over.id) return;

    const oldIndex = activeList.symbols.indexOf(String(active.id));
    const newIndex = activeList.symbols.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(activeList.symbols, oldIndex, newIndex);
    reorderList.mutate({ listId: activeList.id, symbols: newOrder });
  };

  return (
    <aside className="w-full lg:w-80 shrink-0 bg-card border border-border rounded-xl flex flex-col max-h-[calc(100vh-6rem)] lg:sticky lg:top-20">
      {/* List tabs — compact (first letter only, name on hover) so many lists fit without scrolling */}
      <div className="flex items-center gap-1.5 p-2 border-b border-border flex-wrap">
        {lists?.map((list) => (
          <div key={list.id} className="group relative shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setActiveListId(list.id)}
                  className={cn(
                    "h-8 w-8 rounded-md text-sm font-semibold flex items-center justify-center transition-colors",
                    activeListId === list.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                  )}
                >
                  {list.name.charAt(0).toUpperCase()}
                </button>
              </TooltipTrigger>
              <TooltipContent>{list.name}</TooltipContent>
            </Tooltip>

            {!list.isDefault && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    title={`Delete "${list.name}"`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete "{list.name}"?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes the list. Any stock only tracked in this list will also be removed from your
                      watchlist entirely. This can't be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => handleDeleteList(list.id, list.name)}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        ))}

        {creating ? (
          <div className="flex items-center gap-1 shrink-0">
            <Input
              autoFocus
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateList();
                if (e.key === "Escape") {
                  setCreating(false);
                  setNewListName("");
                }
              }}
              placeholder="List name"
              className="h-8 w-32 text-sm"
            />
            <Button size="icon" className="h-8 w-8 shrink-0" onClick={handleCreateList} disabled={createList.isPending}>
              {createList.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </Button>
          </div>
        ) : (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            onClick={() => setCreating(true)}
            title="Create a new list"
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>

      {activeListId && (
        <div className="p-2 border-b border-border">
          <AddStockForm listId={activeListId} />
        </div>
      )}

      {/* Symbol rows */}
      <div className="overflow-y-auto flex-1">
        {isLoading ? (
          <p className="text-muted-foreground text-sm p-4">Loading lists...</p>
        ) : !activeList || activeList.symbols.length === 0 ? (
          <div className="text-center py-10 px-4">
            <ListPlus className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">No stocks in this list yet.</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={activeList.symbols} strategy={verticalListSortingStrategy}>
              {activeList.symbols.map((symbol) => (
                <SymbolRow
                  key={symbol}
                  symbol={symbol}
                  data={stocksData?.[symbol]}
                  selected={selectedSymbol === symbol}
                  removing={removeStock.isPending}
                  onSelect={() => onSelectSymbol(symbol)}
                  onRemove={() => handleRemoveStock(symbol)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </aside>
  );
};

export default WatchlistSidebar;
