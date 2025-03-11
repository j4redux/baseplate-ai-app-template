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
      }
    }
  }, [artifact.kind, id, setMetadata]);

  // Process new data stream deltas
  useEffect(() => {
    if (!dataStream?.length) return;

    const newDeltas = dataStream.slice(lastProcessedIndex.current + 1);
    lastProcessedIndex.current = dataStream.length - 1;

    (newDeltas as DataStreamDelta[]).forEach((delta: DataStreamDelta) => {
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

        switch (delta.type) {
          case 'id':
            return {
              ...baseArtifact,
              documentId: delta.content as string,
              status: 'streaming',
            };
          case 'title':
            return {
              ...baseArtifact,
              title: delta.content as string,
              status: 'streaming',
            };
          case 'kind':
            return {
              ...baseArtifact,
              kind: delta.content as ArtifactKind,
              status: 'streaming',
            };
          case 'clear':
            return {
              ...baseArtifact,
              content: '',
              status: 'streaming',
            };
          case 'finish':
            return {
              ...baseArtifact,
              status: 'idle',
            };
          default:
            return baseArtifact;
        }
      });
    });
  }, [dataStream, setArtifact, setMetadata, artifact.kind]);

  return null;
}
