import { useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SearchBarProps {
  onSearch: (query: string) => void;
  initialQuery?: string;
  isLoading?: boolean;
}

export function SearchBar({ onSearch, initialQuery = "", isLoading = false }: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  const handleClear = () => {
    setQuery("");
    onSearch("");
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-3xl mx-auto relative group">
      <div className="relative flex items-center">
        <Search className="absolute left-4 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
        
        <Input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search TikTok..."
          className="w-full h-14 pl-12 pr-24 text-lg bg-card/50 border-card-border focus-visible:ring-primary focus-visible:border-primary rounded-2xl shadow-sm transition-all"
        />
        
        <div className="absolute right-2 flex items-center gap-1">
          {query && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="w-8 h-8 rounded-full text-muted-foreground hover:text-foreground"
              onClick={handleClear}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
          <Button 
            type="submit" 
            disabled={!query.trim() || isLoading}
            className="h-10 rounded-xl px-5 font-semibold tracking-wide"
          >
            {isLoading ? "Searching..." : "Search"}
          </Button>
        </div>
      </div>
    </form>
  );
}
