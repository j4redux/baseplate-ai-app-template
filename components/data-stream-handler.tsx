'use client';

import { useChat } from '@ai-sdk/react';
import { useCallback, useEffect, useRef } from 'react';
import { artifactDefinitions, ArtifactKind } from './artifact';
import { Suggestion } from '@/lib/db/schema';
import { initialArtifactData, useArtifact } from '@/hooks/use-artifact';

// Environment flag to enable parallel streaming
// When true, message text will continue streaming while documents are being created
const ENABLE_PARALLEL_STREAMING = true;

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
  
  // Buffer for text deltas to batch updates - allows smoother rendering
  const textDeltaBuffer = useRef<string>('');
  const bufferTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track document creation state to handle parallel streaming
  const documentCreationActive = useRef<boolean>(false);
  const messageStreamingActive = useRef<boolean>(false);
  
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
          setArtifact,
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
  
  // Function to flush the buffer and apply text updates
  const flushTextBuffer = useCallback(() => {
    if (textDeltaBuffer.current.length > 0) {
      console.log(`[DataStreamHandler] Flushing text buffer with ${textDeltaBuffer.current.length} characters`);
      
      // Process through artifact handler first - for text documents, this will handle the content update
      const artifactDefinition = artifactDefinitions.find(
        (def) => def.kind === artifact.kind
      );

      // Create a buffered delta for the artifact handler
      const bufferedDelta: DataStreamDelta = {
        type: 'text-delta',
        content: textDeltaBuffer.current
      };
      
      // Track whether this is document content or message text
      const isDocumentContent = documentCreationActive.current && 
                              artifact.kind !== 'text' && 
                              artifact.status === 'streaming';
      
      // For text artifacts, let the artifact-specific handler handle the content update
      // This prevents duplication since both handlers would otherwise update the content
      if (artifactDefinition?.onStreamPart) {
        // If we're in parallel streaming mode, both message text and document content 
        // can update simultaneously
        if (ENABLE_PARALLEL_STREAMING || !isDocumentContent) {
          artifactDefinition.onStreamPart({
            streamPart: bufferedDelta,
            setArtifact,
            setMetadata,
          });
        }
        
        // For text artifacts or when we're in parallel streaming mode, 
        // we need specialized processing
        if (artifact.kind === 'text' || ENABLE_PARALLEL_STREAMING) {
          // Update metadata for consistent message structure
          if (typeof setMetadata === 'function') {
            setMetadata((prev) => ({
              ...prev,
              originalMessageStructure: true,
              streamingMessageId: prev.streamingMessageId || `streaming-${Date.now()}`,
              // Flag that message streaming is active
              messageStreamingActive: true
            }));
          }
          
          // In parallel streaming mode, continue with both document and message updates
          if (ENABLE_PARALLEL_STREAMING) {
            console.log('[DataStreamHandler] Parallel streaming enabled, continuing with updates');
            // Don't return early - we'll continue to process message text alongside document content
          } else {
            // In legacy mode, handle text artifacts as before
            if (artifact.kind === 'text') {
              // Log the delegation to the text artifact handler
              console.log('[DataStreamHandler] Text content update delegated to text artifact handler');
              
              // Clear the buffer and return early
              textDeltaBuffer.current = '';
              bufferTimeoutRef.current = null;
              return;
            }
          }
        }
      }
      
      // For non-text artifacts or if no specific handler exists, apply the standard processing
      setArtifact((currentArtifact) => {
        // Ensure we have a valid artifact to work with
        const baseArtifact = currentArtifact ?? initialArtifactData;
        const { isVisible } = baseArtifact;
        const existingContent = baseArtifact.content || '';
        
        // Get the content we want to add from the buffer
        const bufferContent = textDeltaBuffer.current;
        
        // Initialize the content we'll actually add (may be modified by deduplication)
        let contentToAdd = bufferContent;
        let deduplicationApplied = false;
        
        // Only attempt deduplication if we have existing content
        if (existingContent.length > 0 && contentToAdd.length > 0) {
          // First check if the entire buffer content is already at the end of existing content
          if (existingContent.endsWith(contentToAdd)) {
            console.log('[DataStreamHandler] Complete duplication detected, skipping update');
            contentToAdd = '';
            deduplicationApplied = true;
          } else {
            // Check for partial overlap between existing content end and new content beginning
            const maxOverlapCheck = Math.min(contentToAdd.length, 100);
            const endOfExisting = existingContent.slice(-maxOverlapCheck);
            
            // Start with the largest possible overlap and work down
            for (let overlapSize = maxOverlapCheck; overlapSize > 2; overlapSize--) {
              // Only check if the overlap size is valid for both strings
              if (endOfExisting.length >= overlapSize && contentToAdd.length >= overlapSize) {
                const endChunk = endOfExisting.slice(-overlapSize);
                const startChunk = contentToAdd.slice(0, overlapSize);
                
                if (endChunk === startChunk) {
                  // Found an overlap, remove the duplicated part
                  contentToAdd = contentToAdd.slice(overlapSize);
                  console.log(`[DataStreamHandler] Removed ${overlapSize} duplicate characters`);
                  deduplicationApplied = true;
                  break;
                }
              }
            }
          }
        }
        
        // Only update if we have content to add after deduplication
        if (contentToAdd.length === 0 && deduplicationApplied) {
          console.log('[DataStreamHandler] No new content to add after deduplication');
          return baseArtifact; // No changes needed
        }
        
        // Combine existing content with the new content
        const newContent = existingContent + contentToAdd;
        
        // Update metadata for consistent message structure
        if (typeof setMetadata === 'function') {
          setMetadata((prev) => ({
            ...prev,
            originalMessageStructure: true,
            streamingMessageId: prev.streamingMessageId || `streaming-${Date.now()}`,
          }));
        }
        
        // Enhanced logging for text-delta events
        console.log('[DataStreamHandler] Text buffer processed:', {
          bufferLength: bufferContent.length,
          addedContentLength: contentToAdd.length,
          prevContentLength: existingContent.length,
          newContentLength: newContent.length,
          deduplicationApplied
        });
        
        // Return updated artifact with new content
        return {
          ...baseArtifact,
          content: newContent,
          status: 'streaming',
          isVisible,
        };
      });
      
      // Clear the buffer after processing
      textDeltaBuffer.current = '';
    }
    
    // Reset the timeout reference
    bufferTimeoutRef.current = null;
  }, [artifact.kind, setArtifact, setMetadata]);

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

    // Group text deltas for buffering and process other deltas immediately
    const textDeltas: string[] = [];
    const otherDeltas: DataStreamDelta[] = [];
    
    // Separate text deltas from other types for buffering
    (newDeltas as DataStreamDelta[]).forEach((delta: DataStreamDelta) => {
      if (delta.type === 'text-delta' && typeof delta.content === 'string') {
        textDeltas.push(delta.content);
      } else {
        otherDeltas.push(delta);
      }
    });
    
    // Process non-text deltas immediately
    otherDeltas.forEach((delta: DataStreamDelta) => {
      console.log(`[DataStreamHandler] Processing non-text delta:`, {
        type: delta.type,
        contentLength: typeof delta.content === 'string' ? delta.content.length : 'non-string'
      });
      
      // Process through the artifact's handler
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
      
      // Process standard delta types directly
      setArtifact((currentArtifact) => {
        const baseArtifact = currentArtifact ?? initialArtifactData;
        const { isVisible } = baseArtifact;

        switch (delta.type) {
          case 'id':
            // Mark document creation as active when an ID is assigned
            documentCreationActive.current = true;
            console.log('[DataStreamHandler] Document creation active with ID:', delta.content);
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
          // We now handle text-delta in the buffering system
          // This case should never be reached for text-delta
          // but we keep it as a fallback just in case
          case 'finish':
            // Important: When document streaming finishes, we need to ensure
            // all document state is properly preserved for consistent display
            // after page refreshes.
            
            // Flush any remaining content in the buffer before finishing
            if (textDeltaBuffer.current.length > 0) {
              flushTextBuffer();
            }
            
            // Reset document creation state
            documentCreationActive.current = false;
            console.log('[DataStreamHandler] Document creation completed');
            
            // Store the final document state in metadata to ensure consistent message processing
            if (typeof setMetadata === 'function') {
              setMetadata((prev) => {
                // Ensure we have a valid metadata object
                const metadata = prev || {};
                
                // In parallel streaming mode, ensure we preserve message text streaming state
                if (ENABLE_PARALLEL_STREAMING) {
                  console.log('[DataStreamHandler] Preserving message streaming state with parallel streaming');
                }
                
                // For text artifacts, ensure we preserve the complete message structure
                // This is critical for consistent display after page reloads
                if (baseArtifact.kind === 'text') {
                  // Ensure the original message structure is preserved
                  const originalMessageId = metadata.streamingMessageId || `message-${Date.now()}`;
                  
                  // Log the preservation of message structure
                  console.log('[DataStreamHandler] Preserving complete message structure for text document', {
                    documentId: baseArtifact.documentId,
                    contentLength: baseArtifact.content.length,
                    messageId: originalMessageId
                  });
                }
                
                return {
                  ...metadata,
                  documentFinished: true,
                  finalContent: baseArtifact.content,
                  documentId: baseArtifact.documentId,
                  title: baseArtifact.title,
                  kind: baseArtifact.kind,
                  messageStructureComplete: true,
                  // Preserve the original message structure explicitly
                  originalMessageStructure: true,
                  // Mark message streaming as active if we're in parallel mode
                  messageStreamingActive: ENABLE_PARALLEL_STREAMING ? true : metadata.messageStreamingActive
                };
              });
            }
            
            // Add a small delay before setting to idle state for smoother transition
            setTimeout(() => {
              setArtifact(current => ({
                ...current,
                status: 'idle'
              }));
            }, 100);
            
            return {
              ...baseArtifact,
              // Preserve document content explicitly to ensure it's available after refresh
              content: baseArtifact.content,
              // Preserve all document metadata
              documentId: baseArtifact.documentId,
              title: baseArtifact.title,
              kind: baseArtifact.kind,
              // Keep streaming state until the timeout changes it
              status: 'streaming',
              // Don't change visibility state - maintain user control
              isVisible,
            };
          case 'suggestion':
            // Handle suggestion events for AI-generated suggestions
            const suggestion = delta.content as Suggestion;
            
            // Store suggestions in metadata instead of directly on the artifact
            // since UIArtifact doesn't have a suggestions property
            if (typeof setMetadata === 'function') {
              setMetadata((prev) => ({
                ...prev,
                suggestions: [...(prev.suggestions || []), suggestion]
              }));
            }
            
            return {
              ...baseArtifact,
              status: 'streaming',
              isVisible,
            };
          default:
            console.log(
              `[DataStreamHandler] Unhandled delta type: ${delta.type}`,
              delta
            );
            return baseArtifact;
        }
      });
    });
    
    // Add text deltas to buffer
    if (textDeltas.length > 0) {
      const combinedText = textDeltas.join('');
      
      // Only add to buffer if we have actual content
      if (combinedText.trim().length > 0) {
        textDeltaBuffer.current += combinedText;
        
        console.log(`[DataStreamHandler] Added ${combinedText.length} characters to buffer (total: ${textDeltaBuffer.current.length})`);
        
        // Clear any existing timeout
        if (bufferTimeoutRef.current) {
          clearTimeout(bufferTimeoutRef.current);
        }
        
        // Use a slightly longer buffer time (33ms) to collect more deltas before processing
        // This helps reduce the frequency of updates while still maintaining responsiveness
        bufferTimeoutRef.current = setTimeout(flushTextBuffer, 33);
      } else {
        console.log('[DataStreamHandler] Skipped empty text delta');
      }
    }
  }, [dataStream, setArtifact, setMetadata, artifact.kind, flushTextBuffer]);

  // Ensure buffer is flushed when component unmounts
  useEffect(() => {
    return () => {
      if (bufferTimeoutRef.current) {
        clearTimeout(bufferTimeoutRef.current);
        if (textDeltaBuffer.current.length > 0) {
          flushTextBuffer();
        }
      }
    };
  }, [flushTextBuffer]);

  return null;
}
