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

  const { data: documents, isLoading: isDocumentsFetching } = useSWR<
    Array<Document>
  >(result ? `/api/document?id=${result.id}` : null, fetcher);

  const previewDocument = useMemo(() => documents?.[0], [documents]);
  const hitboxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const boundingBox = hitboxRef.current?.getBoundingClientRect();

    if (artifact.documentId && boundingBox) {
      setArtifact((artifact) => ({
        ...artifact,
        boundingBox: {
          left: boundingBox.x,
          top: boundingBox.y,
          width: boundingBox.width,
          height: boundingBox.height,
        },
      }));
    }
  }, [artifact.documentId, setArtifact]);

  // When the artifact is visible, prioritize showing the document content
  if (artifact.isVisible) {
    // CRITICAL: If we're streaming, we want to show the document content directly
    // This ensures real-time streaming directly into the interface
    if (artifact.status === 'streaming') {
      // Always create a streaming document object, even if content is empty
      // This ensures we have a container ready to receive streaming content
      const streamingDocument: Document = {
        id: artifact.documentId || 'streaming-doc',
        title: artifact.title || (result?.title || args?.title || 'Untitled Document'),
        kind: artifact.kind,
        content: artifact.content || '', // Use empty string if content is null/undefined
        createdAt: new Date(),
        userId: 'streaming-user'
      };
      
      console.log('[DocumentPreview] Showing streaming document:', {
        contentLength: artifact.content?.length || 0,
        title: streamingDocument.title,
        timestamp: new Date().toISOString(),
        isStreaming: true
      });
      
      // Return the streaming document view immediately
      // This bypasses any loading states or skeleton loaders
      return (
        <div className="relative w-full cursor-pointer">
          <DocumentHeader
            title={streamingDocument.title}
            kind={streamingDocument.kind}
            isStreaming={true}
          />
          <DocumentContent document={streamingDocument} />
        </div>
      );
    }
    
    // For non-streaming cases, use the original logic
    if (result) {
      return (
        <DocumentToolResult
          type="create"
          result={{ id: result.id, title: result.title, kind: result.kind }}
          isReadonly={isReadonly}
        />
      );
    }

    if (args) {
      return (
        <DocumentToolCall
          type="create"
          args={{ title: args.title }}
          isReadonly={isReadonly}
        />
      );
    }
  }

  // Important: For streaming documents, we want to show the content as it's being generated
  // rather than showing a loading skeleton
  const document: Document | null = previewDocument
    ? previewDocument
    : artifact.status === 'streaming'
      ? {
          title: artifact.title || 'Untitled Document',
          kind: artifact.kind,
          // Ensure we always have the most up-to-date content during streaming
          // This is critical for real-time text streaming
          content: artifact.content,
          id: artifact.documentId,
          createdAt: new Date(),
          userId: 'noop',
        }
      : null;
      
  // Note: We don't force visibility changes here anymore
  // This is to respect the memory about not opening artifact panels randomly
  // Instead, we ensure that when the artifact IS visible, it shows streaming content

  // Only show loading skeleton if we're fetching documents and not streaming
  if (isDocumentsFetching && artifact.status !== 'streaming') {
    return <LoadingSkeleton artifactKind={result?.kind ?? args?.kind ?? artifact.kind} />;
  }

  // If we don't have a document and we're not streaming, show loading skeleton
  if (!document) return <LoadingSkeleton artifactKind={artifact.kind} />;

  // Add debug logging to help diagnose the issue
  console.log(`[DocumentPreview] Rendering document:`, {
    documentId: document.id,
    title: document.title,
    contentLength: document.content?.length || 0,
    isStreaming: artifact.status === 'streaming',
    artifactContent: artifact.content?.length || 0
  });

  return (
    <div className="relative w-full cursor-pointer">
      <HitboxLayer
        hitboxRef={hitboxRef}
        result={result}
        setArtifact={setArtifact}
      />
      <DocumentHeader
        title={document.title}
        kind={document.kind}
        isStreaming={artifact.status === 'streaming'}
      />
      <DocumentContent document={document} />
    </div>
  );
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

  // CRITICAL: When streaming, always prioritize the artifact content which is updated in real-time
  // This ensures we show the latest content as it streams in directly from the server
  // The artifact.content is updated immediately by the data-stream-handler for each text-delta event
  const contentToShow = 
    artifact.status === 'streaming' ? 
      artifact.content || '' : 
      document.content ?? '';
      
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
