import { useState } from "react";
import { Link2, Play, Heart, MessageCircle, Eye, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNumber, formatDate } from "@/lib/format";
import type { TikTokVideo } from "@workspace/api-client-react";

interface VideoCardProps {
  video: TikTokVideo;
}

function getThumbnailUrl(url: string): string {
  if (!url) return "";
  return `/api/tiktok/thumbnail?url=${encodeURIComponent(url)}`;
}

export function VideoCard({ video }: VideoCardProps) {
  const [imgError, setImgError] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyLink = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(video.videoUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group flex flex-col bg-card border border-card-border rounded-xl overflow-hidden transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
      {/* Thumbnail */}
      <a 
        href={video.videoUrl} 
        target="_blank" 
        rel="noopener noreferrer"
        className="relative block aspect-[9/16] w-full bg-muted/30 overflow-hidden"
      >
        {!imgError && video.thumbnail ? (
          <img 
            src={getThumbnailUrl(video.thumbnail)} 
            alt={video.title} 
            onError={() => setImgError(true)}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-secondary/50">
            <Play className="w-10 h-10 text-muted-foreground/30" />
          </div>
        )}
        
        {/* Play overlay on hover */}
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="bg-primary/90 text-primary-foreground rounded-full p-4 transform translate-y-4 group-hover:translate-y-0 transition-transform">
            <Play fill="currentColor" className="w-6 h-6" />
          </div>
        </div>

        {/* Duration badge if available */}
        {video.duration && (
          <div className="absolute bottom-3 right-3 bg-black/80 backdrop-blur-sm text-white text-xs font-mono px-2 py-1 rounded-md">
            {video.duration}
          </div>
        )}
      </a>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1">
        <div className="flex-1">
          <a 
            href={video.videoUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="block"
          >
            <h3 className="font-semibold text-sm leading-tight text-foreground line-clamp-2 mb-2 group-hover:text-primary transition-colors">
              {video.title || "Untitled Video"}
            </h3>
          </a>
          
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center shrink-0 text-[10px] font-bold text-muted-foreground uppercase border border-border">
              {video.author?.charAt(0) || video.authorUsername?.charAt(0) || "?"}
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-xs font-medium truncate">{video.author}</span>
              <span className="text-[10px] text-muted-foreground truncate">@{video.authorUsername}</span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 py-3 border-y border-border/50 mb-4">
          <div className="flex flex-col items-center justify-center gap-1">
            <Eye className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">{formatNumber(video.views)}</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-1">
            <Heart className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">{formatNumber(video.likes)}</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-1">
            <MessageCircle className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">{formatNumber(video.comments)}</span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between mt-auto">
          <span className="text-[10px] text-muted-foreground">
            {formatDate(video.postedAt)}
          </span>
          <Button 
            variant={copied ? "default" : "secondary"} 
            size="sm" 
            className="h-8 text-xs font-medium gap-1.5 transition-all"
            onClick={handleCopyLink}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Copied!
              </>
            ) : (
              <>
                <Link2 className="w-3.5 h-3.5" />
                Copy Link
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
