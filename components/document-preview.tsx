'use client';

import {
  memo,
  MouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ArtifactKind, UIArtifact } from './artifact';
import { FileIcon, FullscreenIcon, ImageIcon, LoaderIcon } from './icons';
import { cn, fetcher } from '@/lib/utils';
import { Document } from '@/lib/db/schema';
import { InlineDocumentSkeleton } from './document-skeleton';
import useSWR from 'swr';
import { Editor } from './text-editor';
import { DocumentToolCall, DocumentToolResult } from './document';
import { CodeEditor } from './code-editor';
import { useArtifact } from '@/hooks/use-artifact';
import equal from 'fast-deep-equal';
import { SpreadsheetEditor } from './sheet-editor';
import { ImageEditor } from './image-editor';

// Debug utility function to help trace document lifecycle issues
const DEBUG = false;
function debugLog(...args: any[]) {
  if (DEBUG) console.log('[DocumentPreview]', ...args);
}

interface DocumentPreviewProps {
  isReadonly: boolean;
  result?: any;
  args?: any;
}

export function DocumentPreview({
  isReadonly,
  result,
  args,
}: DocumentPreviewProps) {
  const { artifact, setArtifact } = useArtifact();
  const hitboxRef = useRef<HTMLDivElement>(null);

  // Fetch document data when we have a result ID
  const { data: documents, isLoading: isDocumentsFetching } = useSWR<Array<Document>>(
    result ? `/api/document?id=${result.id}` : null, 
    fetcher
  );

  const previewDocument = useMemo(() => documents?.[0], [documents]);
  
  // Build a document object that works across all stages of the document lifecycle
  // This ensures consistent access to document data regardless of streaming state
  const document: Document | null = useMemo(() => {
    // First priority: use fetched document if available
    if (previewDocument) {
      debugLog('Using previewDocument:', previewDocument);
      return previewDocument;
    }
    
    // Second priority: construct document from artifact, result, or args data
    // This order ensures consistent document reconstruction regardless of state
    const documentId = artifact.documentId || (result ? result.id : '');
    const documentTitle = artifact.title || 
                         (result ? result.title : args?.title) || 
                         'Untitled Document';
    const documentKind = artifact.kind || 
                        (result ? result.kind : args?.kind) || 
                        'text';
    // Critical: Use a consistent source for content across streaming/post-refresh
    // This ensures the document appears the same in both states
    const documentContent = artifact.content || 
                          (result ? result.content : '') || 
                          '';
    
    if (documentId || result || args) {
      const doc = {
        title: documentTitle,
        kind: documentKind,
        content: documentContent,
        id: documentId,
        createdAt: new Date(),
        userId: 'user',
      };
      debugLog('Using constructed document:', doc);
      return doc;
    }
    
    // No document data available
    return null;
  }, [previewDocument, artifact, result, args]);

  // Update bounding box when document ID changes
  useEffect(() => {
    const boundingBox = hitboxRef.current?.getBoundingClientRect();

    if (artifact.documentId && boundingBox) {
      setArtifact((prevArtifact) => ({
        ...prevArtifact,
        boundingBox: {
          left: boundingBox.x,
          top: boundingBox.y,
          width: boundingBox.width,
          height: boundingBox.height,
        },
      }));
    }
  }, [artifact.documentId, setArtifact]);

  // Render full document preview interface
  const renderFullDocumentPreview = (title: string, content: string) => {
    return (
      <div className="flex flex-col gap-2">
        <div 
          className="relative w-full cursor-pointer"
          onClick={(event) => {
            if (isReadonly) return;
            
            const rect = event.currentTarget.getBoundingClientRect();
            const boundingBox = {
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            };

            // When clicked, make the artifact visible (expanded)
            // CRITICAL FIX: Ensure document content and metadata are preserved during expansion
            setArtifact(current => {
              // Get current document ID - either from artifact or from the document
              const docId = current.documentId || document?.id || '';
              
              // Ensure we've loaded the document from localStorage if needed
              let docContent = current.content;
              let docTitle = current.title;
              
              // Only attempt to load from localStorage if we don't have content
              if ((!docContent || docContent.length === 0) && docId) {
                try {
                  // Try to load from localStorage using the same key format as in client.tsx
                  const storedDoc = localStorage.getItem(`document-${docId}`);
                  if (storedDoc) {
                    const parsedDoc = JSON.parse(storedDoc);
                    // Use the stored content if available
                    docContent = parsedDoc.content || docContent;
                    // Use the stored title if available
                    docTitle = parsedDoc.title || docTitle;
                    console.log('[DocumentPreview] Restored content on expansion:', {
                      docId,
                      contentLength: docContent.length,
                      title: docTitle
                    });
                  }
                } catch (error) {
                  console.error('[DocumentPreview] Error loading document during expansion:', error);
                }
              }
              
              return {
                ...current,
                isVisible: true,
                content: docContent || content || '',  // Ensure content is preserved
                title: docTitle || title || 'Untitled Document', // Ensure title is preserved
                documentId: docId, // Ensure document ID is preserved
                boundingBox,
              };
            });
          }}
        >
          <div className="p-4 border rounded-t-2xl flex flex-row gap-2 items-center justify-between dark:bg-muted h-[57px] dark:border-zinc-700 border-b-0">
            <div className="flex flex-row items-center gap-3">
              <div className="text-muted-foreground">
                <FileIcon />
              </div>
              <div>{title || 'Untitled Document'}</div>
            </div>
            <div>
              <FullscreenIcon />
            </div>
          </div>
          <div className="overflow-y-scroll border rounded-b-2xl p-4 bg-background border-t-0 dark:border-zinc-700 h-[257px]">
            <div className="whitespace-pre-wrap overflow-hidden font-mono text-sm">
              {content || ''}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render simplified document result (used when artifact is expanded)
  const renderSimpleDocumentResult = (id: string, title: string, kind: ArtifactKind) => {
    return (
      <DocumentToolResult
        type="create"
        result={{ id, title, kind }}
        isReadonly={isReadonly}
      />
    );
  };

  // Determine what to show based on expanded state and document lifecycle phase
  
  // Debug the component state
  debugLog('Rendering with state:', { 
    hasResult: !!result, 
    hasArgs: !!args, 
    isExpanded: artifact.isVisible,
    documentId: document?.id || 'none',
    artifactStatus: artifact.status,
  });

  // CASE 1: Document is complete (result exists)
  if (result) {
    // If expanded, show simple result to avoid duplication with editor
    if (artifact.isVisible) {
      return renderSimpleDocumentResult(result.id, result.title, result.kind);
    }
    
    // If not expanded, always show full document preview
    return renderFullDocumentPreview(
      result.title || document?.title || 'Untitled Document',
      document?.content || ''
    );
  }
  
  // CASE 2: Document is being created (args exist)
  if (args) {
    // If expanded, show simple creating message
    if (artifact.isVisible) {
      return (
        <DocumentToolCall
          type="create"
          args={{ title: args.title }}
          isReadonly={isReadonly}
        />
      );
    }
    
    // Always show full document preview with streaming content when not expanded
    // This provides consistency between streaming and post-refresh states
    const title = args.title || document?.title || 'Untitled Document';
    const content = artifact.content || document?.content || '';
    
    // Note: We're always using the full document rendering to maintain consistency
    return renderFullDocumentPreview(title, content);
  }

  // Only show loading skeleton if we're actively fetching documents but not streaming
  // This ensures we don't unnecessarily show loading states during refresh
  if (isDocumentsFetching && artifact.status !== 'streaming' && !document && !artifact.content) {
    return <LoadingSkeleton artifactKind={result?.kind ?? args?.kind ?? artifact.kind} />;
  }
  
  // For refreshed pages where document data might be temporarily unavailable,
  // we use artifact data if available to maintain consistent display
  if (!document && artifact.status !== 'streaming' && !artifact.content) {
    // If we have result or args data, we can still render something meaningful
    if (result || args) {
      const title = result?.title || args?.title || 'Untitled Document';
      const content = result?.content || '';
      // Use consistent document preview rendering with available data
      return renderFullDocumentPreview(title, content);
    }
    return <LoadingSkeleton artifactKind={artifact.kind} />;
  }

  // CASE 3: Default case - normal document viewing
  if (document) {
    // When artifact is not expanded, always show the full document preview interface
    // This ensures consistent behavior before/after refresh
    if (!artifact.isVisible) {
      return renderFullDocumentPreview(document.title, document.content || '');
    }
    
    // When artifact is expanded, show the document content in the expanded view
    // This is typically rendered elsewhere in the UI (in the artifact editor)
    debugLog('Rendering expanded document view:', {
      documentId: document.id,
      title: document.title,
      contentLength: document.content?.length || 0,
      isStreaming: artifact.status === 'streaming',
      isArtifactVisible: artifact.isVisible
    });
    
    // For expanded view, we use a simpler rendering to avoid duplication
    // since the full content is shown in the artifact editor
    return (
      <div className="relative w-full cursor-pointer">
        <div ref={hitboxRef}></div>
        <DocumentHeader
          title={document.title}
          kind={document.kind}
          isStreaming={artifact.status === 'streaming'}
        />
        <DocumentContent document={document} />
      </div>
    );
  }
  
  // Fallback for any other cases
  return <LoadingSkeleton artifactKind={artifact.kind} />;
}

const LoadingSkeleton = ({ artifactKind }: { artifactKind: ArtifactKind }) => (
  <div className="w-full">
    <div className="p-4 border rounded-t-2xl flex flex-row gap-2 items-center justify-between dark:bg-muted h-[57px] dark:border-zinc-700 border-b-0">
      <div className="flex flex-row items-center gap-3">
        <div className="text-muted-foreground">
          <div className="animate-pulse rounded-md size-4 bg-muted-foreground/20" />
        </div>
        <div className="animate-pulse rounded-lg h-4 bg-muted-foreground/20 w-24" />
      </div>
      <div>
        <FullscreenIcon />
      </div>
    </div>
    {artifactKind === 'image' ? (
      <div className="overflow-y-scroll border rounded-b-2xl bg-muted border-t-0 dark:border-zinc-700">
        <div className="animate-pulse h-[257px] bg-muted-foreground/20 w-full" />
      </div>
    ) : (
      <div className="overflow-y-scroll border rounded-b-2xl p-8 pt-4 bg-muted border-t-0 dark:border-zinc-700">
        <InlineDocumentSkeleton />
      </div>
    )}
  </div>
);

const PureHitboxLayer = ({
  hitboxRef,
  result,
  setArtifact,
}: {
  hitboxRef: React.RefObject<HTMLDivElement>;
  result: any;
  setArtifact: (
    updaterFn: UIArtifact | ((currentArtifact: UIArtifact) => UIArtifact),
  ) => void;
}) => {
  const handleClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      // Only when the user explicitly clicks should we make the artifact visible
      const boundingBox = event.currentTarget.getBoundingClientRect();

      setArtifact((artifact) => ({
        ...artifact,
        title: result?.title || artifact.title,
        documentId: result?.id || artifact.documentId,
        kind: result?.kind || artifact.kind,
        isVisible: true, // Only set to visible on explicit user click
        boundingBox: {
          left: boundingBox.x,
          top: boundingBox.y,
          width: boundingBox.width,
          height: boundingBox.height,
        },
      }));
    },
    [setArtifact, result],
  );

  return (
    <div
      className="size-full absolute top-0 left-0 rounded-xl z-10"
      ref={hitboxRef}
      onClick={handleClick}
      role="presentation"
      aria-hidden="true"
    >
      <div className="w-full p-4 flex justify-end items-center">
        <div className="absolute right-[9px] top-[13px] p-2 hover:dark:bg-zinc-700 rounded-md hover:bg-zinc-100">
          <FullscreenIcon />
        </div>
      </div>
    </div>
  );
};

const HitboxLayer = memo(PureHitboxLayer, (prevProps, nextProps) => {
  if (!equal(prevProps.result, nextProps.result)) return false;
  return true;
});

const PureDocumentHeader = ({
  title,
  kind,
  isStreaming,
}: {
  title: string;
  kind: ArtifactKind;
  isStreaming: boolean;
}) => (
  <div className="p-4 border rounded-t-2xl flex flex-row gap-2 items-start sm:items-center justify-between dark:bg-muted border-b-0 dark:border-zinc-700">
    <div className="flex flex-row items-start sm:items-center gap-3">
      <div className="text-muted-foreground">
        {isStreaming ? (
          <div className="animate-spin">
            <LoaderIcon />
          </div>
        ) : kind === 'image' ? (
          <ImageIcon />
        ) : (
          <FileIcon />
        )}
      </div>
      <div className="-translate-y-1 sm:translate-y-0 font-medium">{title}</div>
    </div>
    <div className="w-8" />
  </div>
);

const DocumentHeader = memo(PureDocumentHeader, (prevProps, nextProps) => {
  if (prevProps.title !== nextProps.title) return false;
  if (prevProps.isStreaming !== nextProps.isStreaming) return false;

  return true;
});

const DocumentContent = ({ document }: { document: Document }) => {
  const { artifact } = useArtifact();

  // Add debug logging to track document content during streaming
  console.log(`[DocumentContent] Rendering with status: ${artifact.status}`, {
    documentContent: document.content?.length || 0,
    artifactContent: artifact.content?.length || 0
  });

  const containerClassName = cn(
    'h-[257px] overflow-y-scroll border rounded-b-2xl dark:bg-muted border-t-0 dark:border-zinc-700',
    {
      'p-4 sm:px-14 sm:py-16': document.kind === 'text',
      'p-0': document.kind === 'code',
    },
  );

  // Document preview content behavior:
  // 1. When artifact is NOT expanded, always show document content regardless of streaming status
  // 2. When artifact IS expanded, don't show duplicate content in the preview
  // This ensures the document preview maintains consistency after streaming completes
  const contentToShow = 
    !artifact.isVisible ? 
      artifact.content || document.content || '' : 
      '';
      
  // Use useLayoutEffect to ensure the DOM is updated synchronously after React renders
  // This helps prevent flickering during streaming updates
  useLayoutEffect(() => {
    if (artifact.status === 'streaming' && artifact.content) {
      console.log('[DocumentContent] Layout effect during streaming update');
    }
  }, [artifact.status, artifact.content]);

  const commonProps = {
    content: contentToShow,
    isCurrentVersion: true,
    currentVersionIndex: 0,
    status: artifact.status,
    saveContent: () => {},
    suggestions: [],
  };

  return (
    <div className={containerClassName}>
      {document.kind === 'text' ? (
        <Editor {...commonProps} onSaveContent={() => {}} />
      ) : document.kind === 'code' ? (
        <div className="flex flex-1 relative w-full">
          <div className="absolute inset-0">
            <CodeEditor {...commonProps} onSaveContent={() => {}} />
          </div>
        </div>
      ) : document.kind === 'sheet' ? (
        <div className="flex flex-1 relative size-full p-4">
          <div className="absolute inset-0">
            <SpreadsheetEditor {...commonProps} />
          </div>
        </div>
      ) : document.kind === 'image' ? (
        <ImageEditor
          title={document.title}
          content={document.content ?? ''}
          isCurrentVersion={true}
          currentVersionIndex={0}
          status={artifact.status}
          isInline={true}
        />
      ) : null}
    </div>
  );
};
