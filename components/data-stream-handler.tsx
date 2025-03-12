'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef } from 'react';
import { artifactDefinitions, ArtifactKind } from './artifact';
import { Suggestion } from '@/lib/db/schema';
import { initialArtifactData, useArtifact } from '@/hooks/use-artifact';

export type DataStreamDelta = {
  type:
    | 'text-delta'
    | 'code-delta'
    | 'sheet-delta'
    | 'image-delta'
    | 'title'
    | 'id'
    | 'suggestion'
    | 'clear'
    | 'finish'
    | 'kind';
  content: string | Suggestion;
};

interface DataStreamHandlerProps {
  readonly id: string;
}

export function DataStreamHandler({ id }: DataStreamHandlerProps) {
  const { data: dataStream } = useChat({ id });
  const { artifact, setArtifact, metadata, setMetadata } = useArtifact();
  const lastProcessedIndex = useRef(-1);
  const isInitialized = useRef(false);

  // Initialize metadata when artifact kind changes or component mounts
  useEffect(() => {
    if (!isInitialized.current && artifact.kind) {
      const artifactDefinition = artifactDefinitions.find(
        (def) => def.kind === artifact.kind
      );
      
      if (artifactDefinition?.initialize) {
        isInitialized.current = true;
        artifactDefinition.initialize({
          documentId: id,
          setMetadata,
        });
        
        // Only set streaming state if the artifact is already visible
        // This prevents artifacts from randomly appearing without user interaction
        if (artifact.isVisible) {
          setArtifact(current => ({
            ...current,
            status: 'streaming'
          }));
          
          console.log('Artifact initialized and set to streaming state');
        }
      }
    }
  }, [artifact.kind, id, setMetadata, setArtifact, artifact.isVisible]);

  // Process new data stream deltas
  useEffect(() => {
    if (!dataStream?.length) return;

    const newDeltas = dataStream.slice(lastProcessedIndex.current + 1);
    lastProcessedIndex.current = dataStream.length - 1;
    
    // Log new deltas for debugging
    if (newDeltas.length > 0) {
      const firstDelta = newDeltas[0] as DataStreamDelta;
      console.log(`[DataStreamHandler] Processing ${newDeltas.length} new deltas`, {
        artifactKind: artifact.kind,
        status: artifact.status,
        firstDeltaType: firstDelta.type
      });
    }

    (newDeltas as DataStreamDelta[]).forEach((delta: DataStreamDelta) => {
      // Log each delta for debugging
      console.log(`[DataStreamHandler] Processing delta:`, {
        type: delta.type,
        contentLength: typeof delta.content === 'string' ? delta.content.length : 'non-string'
      });
      
      // Process each delta through the artifact's handler
      const artifactDefinition = artifactDefinitions.find(
        (def) => def.kind === artifact.kind
      );

      if (artifactDefinition?.onStreamPart) {
        artifactDefinition.onStreamPart({
          streamPart: delta,
          setArtifact,
          setMetadata,
        });
      }

      setArtifact((currentArtifact) => {
        const baseArtifact = currentArtifact ?? initialArtifactData;
        
        // Preserve the current visibility state
        const { isVisible } = baseArtifact;

        switch (delta.type) {
          case 'id':
            return {
              ...baseArtifact,
              documentId: delta.content as string,
              status: 'streaming',
              // Don't change visibility state - maintain user control
              isVisible,
            };
          case 'title':
            return {
              ...baseArtifact,
              title: delta.content as string,
              status: 'streaming',
              // Don't change visibility state - maintain user control
              isVisible,
            };
          case 'kind':
            return {
              ...baseArtifact,
              kind: delta.content as ArtifactKind,
              status: 'streaming',
              // Don't change visibility state - maintain user control
              isVisible,
            };
          case 'clear':
            return {
              ...baseArtifact,
              content: '',
              status: 'streaming',
              // Don't change visibility state - maintain user control
              isVisible,
            };
          case 'text-delta':
            // Handle text-delta events directly in the data-stream-handler
            // This ensures document streaming works during creation and updates
            const deltaContent = delta.content as string;
            
            // FIX DUPLICATION: Check if the incoming delta would cause duplication
            // This addresses the issue where each word appears twice in the stream
            let contentToAdd = deltaContent;
            const existingContent = baseArtifact.content;
            
            // If there's existing content, check for potential duplication
            if (existingContent.length > 0) {
              // Get the overlap window size (max length we'd check for duplication)
              const overlapWindow = Math.min(deltaContent.length, 50); // Reasonable max word length
              
              // Check if the start of the incoming delta duplicates the end of existing content
              const endOfExisting = existingContent.slice(-overlapWindow);
              
              // Find the largest matching overlap between end of existing and start of new
              for (let i = Math.min(overlapWindow, deltaContent.length); i > 0; i--) {
                const potentialDuplicate = deltaContent.slice(0, i);
                if (endOfExisting.endsWith(potentialDuplicate)) {
                  // Found duplication, remove it from the content to add
                  contentToAdd = deltaContent.slice(i);
                  console.log(`[DataStreamHandler] Prevented duplication of ${i} characters`);
                  break;
                }
              }
            }
            
            const newContent = existingContent + contentToAdd;
            
            // Enhanced logging for text-delta events with duplication prevention
            console.log(`[DataStreamHandler] Text delta processed:`, {
              originalDeltaLength: deltaContent.length,
              addedContentLength: contentToAdd.length,
              prevContentLength: existingContent.length,
              newContentLength: newContent.length,
              deduplicationApplied: deltaContent.length !== contentToAdd.length
            });
            
            // CRITICAL: Immediately update the artifact content with the new text
            // This ensures real-time streaming directly into the interface
            return {
              ...baseArtifact,
              content: newContent,
              status: 'streaming',
              // Don't change visibility state - maintain user control
              isVisible,
            };
          case 'finish':
            return {
              ...baseArtifact,
              status: 'idle',
              // Don't change visibility state - maintain user control
              isVisible,
            };
          default:
            return baseArtifact;
        }
      });
    });
  }, [dataStream, setArtifact, setMetadata, artifact.kind]);

  return null;
}
