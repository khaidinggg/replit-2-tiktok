import { useState } from "react";
import { useSearchTikTok, getSearchTikTokQueryKey } from "@workspace/api-client-react";
import { SearchBar } from "@/components/search-bar";
import { VideoCard } from "@/components/video-card";
import { Search, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading, error, isError } = useSearchTikTok(
    { q: searchQuery, count: 20 },
    { 
      query: { 
        enabled: !!searchQuery,
        queryKey: getSearchTikTokQueryKey({ q: searchQuery, count: 20 }),
        staleTime: 1000 * 60 * 5, // 5 minutes
      } 
    }
  );

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      {/* Header Area */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border/40 py-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col items-center gap-6">
          <div className="flex items-center gap-3 select-none">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <Search className="w-5 h-5 text-primary-foreground stroke-[3]" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">TikTok Search</h1>
          </div>
          
          <div className="w-full">
            <SearchBar onSearch={handleSearch} initialQuery={searchQuery} isLoading={isLoading} />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Empty State */}
        {!searchQuery && !isLoading && (
          <div className="h-[50vh] flex flex-col items-center justify-center text-center opacity-60">
            <Search className="w-16 h-16 text-muted-foreground mb-6" strokeWidth={1} />
            <h2 className="text-xl font-medium mb-2">Focused Search</h2>
            <p className="text-muted-foreground max-w-md">
              A clean, distraction-free interface for finding TikTok videos. 
              Enter a keyword above to begin.
            </p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex flex-col bg-card border border-card-border rounded-xl overflow-hidden h-[450px]">
                <Skeleton className="w-full aspect-[9/16] rounded-none" />
                <div className="p-4 flex flex-col flex-1 gap-4">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <div className="grid grid-cols-3 gap-2 mt-auto">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {isError && (
          <Alert variant="destructive" className="max-w-2xl mx-auto bg-destructive/10 text-destructive border-destructive/20">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error?.error || "An error occurred while searching. Please try again."}
            </AlertDescription>
          </Alert>
        )}

        {/* Results */}
        {!isLoading && !isError && data && (
          <div className="space-y-6">
            <div className="flex items-center justify-between text-sm text-muted-foreground pb-4 border-b border-border/40">
              <p>Found <span className="text-foreground font-medium">{data.total || data.results?.length || 0}</span> results for "<span className="text-foreground font-medium">{data.query}</span>"</p>
            </div>

            {data.results && data.results.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {data.results.map((video) => (
                  <VideoCard key={video.id} video={video} />
                ))}
              </div>
            ) : (
              <div className="py-20 text-center">
                <p className="text-lg text-muted-foreground">No videos found for "{data.query}".</p>
              </div>
            )}
          </div>
        )}
        
      </main>
    </div>
  );
}
