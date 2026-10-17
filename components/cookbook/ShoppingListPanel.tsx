"use client";
import { useEffect, useState } from "react";
import { X, ShoppingCart, Trash2 } from "lucide-react";
import { ShoppingList, ShoppingListItem } from "@/lib/interfaces";
import { cn } from "@/lib/utils";

interface ShoppingListPanelProps {
  recipeId: string;
  recipeTitle: string;
  onClose: () => void;
}

export function ShoppingListPanel({ recipeId, recipeTitle, onClose }: ShoppingListPanelProps) {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const activeList = lists.find((l) => String(l._id) === activeId);

  useEffect(() => {
    fetch("/api/shopping-list")
      .then((r) => r.json())
      .then((data: ShoppingList[]) => {
        setLists(data);
        if (data.length > 0) setActiveId(String(data[0]._id));
      })
      .catch(() => {});
  }, []);

  async function createList() {
    setCreating(true);
    try {
      const res = await fetch("/api/shopping-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${recipeTitle} ingredients`, recipeId }),
      });
      if (!res.ok) return;
      const { insertedId } = await res.json();
      const listsRes = await fetch("/api/shopping-list");
      const updated: ShoppingList[] = await listsRes.json();
      setLists(updated);
      setActiveId(insertedId);
    } finally {
      setCreating(false);
    }
  }

  async function toggleItem(itemIndex: number) {
    if (!activeList) return;
    const updatedItems: ShoppingListItem[] = activeList.items.map((item, i) =>
      i === itemIndex ? { ...item, checked: !item.checked } : item
    );
    await fetch(`/api/shopping-list/${activeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: updatedItems }),
    });
    setLists((prev) =>
      prev.map((l) => (String(l._id) === activeId ? { ...l, items: updatedItems } : l))
    );
  }

  async function deleteList(id: string) {
    await fetch(`/api/shopping-list/${id}`, { method: "DELETE" });
    const remaining = lists.filter((l) => String(l._id) !== id);
    setLists(remaining);
    setActiveId(remaining.length > 0 ? String(remaining[0]._id) : null);
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-sm bg-white dark:bg-slate-950 shadow-xl border-l border-slate-100 dark:border-slate-800 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-emerald-500" />
          <h2 className="font-semibold text-slate-900 dark:text-white">Shopping List</h2>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <X className="w-5 h-5 text-slate-500" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {/* List selector */}
        {lists.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {lists.map((l) => (
              <button
                key={String(l._id)}
                onClick={() => setActiveId(String(l._id))}
                className={cn(
                  "flex-shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors",
                  String(l._id) === activeId
                    ? "bg-emerald-500 text-white border-emerald-500"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-emerald-400"
                )}
              >
                {l.name}
              </button>
            ))}
          </div>
        )}

        {/* Active list items */}
        {activeList ? (
          <>
            <ul className="flex flex-col gap-2">
              {activeList.items.map((item, i) => (
                <li key={i}>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => toggleItem(i)}
                      className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-emerald-500 focus:ring-emerald-400"
                    />
                    <span className={cn(
                      "text-sm text-slate-700 dark:text-slate-300",
                      item.checked && "line-through text-slate-400 dark:text-slate-500"
                    )}>
                      {item.amount} {item.unit} {item.name}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <button
              onClick={() => deleteList(String(activeList._id))}
              className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-500 transition-colors mt-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete this list
            </button>
          </>
        ) : (
          <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">No shopping lists yet.</p>
        )}
      </div>

      <div className="p-4 border-t border-slate-100 dark:border-slate-800">
        <button
          onClick={createList}
          disabled={creating}
          className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors disabled:opacity-60"
        >
          {creating ? "Creating…" : `Add "${recipeTitle}" ingredients`}
        </button>
      </div>
    </div>
  );
}
