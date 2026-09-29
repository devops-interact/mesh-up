'use client';

import { useState } from 'react';
import { Box } from 'lucide-react';
import { resolveAssetUrl } from '@/lib/resolveAssetUrl';

interface ScanThumbnailProps {
  url?: string | null;
  alt: string;
  className?: string;
}

export default function ScanThumbnail({ url, alt, className = '' }: ScanThumbnailProps) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return (
      <div
        className={`flex aspect-video w-full items-center justify-center rounded-lg bg-neutral-900/80 border border-white/[0.08] ${className}`}
        aria-hidden
      >
        <Box className="h-8 w-8 text-white/25" />
      </div>
    );
  }

  return (
    <img
      src={resolveAssetUrl(url)}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={`aspect-video w-full rounded-lg object-cover bg-neutral-900 border border-white/[0.08] ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
