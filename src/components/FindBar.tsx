import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import type { SearchAddon } from "@xterm/addon-search";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface FindBarProps {
  search: SearchAddon;
  onClose: () => void;
}

export function FindBar({ search, onClose }: FindBarProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const next = () => query && search.findNext(query);
  const prev = () => query && search.findPrevious(query);

  return (
    <div className="absolute top-2 right-3 z-10 flex items-center gap-1 rounded-lg border border-border bg-popover/95 p-1 shadow-lg backdrop-blur duration-150 animate-in fade-in slide-in-from-top-1">
      <Input
        ref={inputRef}
        value={query}
        placeholder="Buscar"
        className="h-7 w-44 border-transparent bg-transparent text-xs shadow-none focus-visible:ring-0"
        onChange={(e) => {
          setQuery(e.target.value);
          if (e.target.value) search.findNext(e.target.value, { incremental: true });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.shiftKey ? prev : next)();
          if (e.key === "Escape") onClose();
        }}
      />
      <Button variant="ghost" size="icon" className="size-6" onClick={prev}>
        <ChevronUp className="size-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="size-6" onClick={next}>
        <ChevronDown className="size-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="size-6" onClick={onClose}>
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
