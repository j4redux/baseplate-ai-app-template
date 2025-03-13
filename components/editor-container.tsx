import React, { ReactNode, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { formatDistance } from 'date-fns';
import { useArtifact } from '@/hooks/use-artifact';

interface EditorContainerProps {
  children: ReactNode;
  padding?: string;
  className?: string;
  showTimestamp?: boolean;
}

/**
 * EditorContainer - A wrapper component that provides consistent padding and layout
 * for document editors throughout the application.
 * 
 * This component handles the container styling for editors, ensuring consistent
 * spacing and overflow behavior across different document types.
 */
export function EditorContainer({
  children,
  padding = '4rem', // Default to 4rem (64px) padding
  className,
  showTimestamp = true, // Default to showing timestamp
}: EditorContainerProps) {
  const { artifact } = useArtifact();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  // Update the timestamp when the artifact status changes or on initial load
  useEffect(() => {
    if (artifact.status === 'idle') {
      setLastUpdated(new Date());
    }
  }, [artifact.status]);
  
  return (
    <div className="flex flex-col h-full">
      <div 
        className={cn("w-full flex-1 overflow-auto", className)}
        style={{ padding }}
      >
        {children}
      </div>
    </div>
  );
}
