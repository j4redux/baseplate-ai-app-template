'use client';

import useSWR from 'swr';
import { UIArtifact } from '@/components/artifact';
import { useCallback, useMemo } from 'react';
import { Suggestion } from '@/lib/db/schema';

interface ArtifactMetadata {
  readonly suggestions: Suggestion[];
  readonly messages: Array<{
    readonly id: string;
    readonly content: string;
    readonly timestamp: number;
  }>;
  // Additional metadata to maintain message consistency
  readonly originalMessageStructure?: boolean;
  readonly streamingMessageId?: string;
  readonly documentFinished?: boolean;
  readonly finalContent?: string;
  readonly messageStructureComplete?: boolean;
}

export const initialArtifactData: UIArtifact = {
  documentId: 'init',
  content: '',
  kind: 'text',
  title: '',
  status: 'idle',
  isVisible: false,
  boundingBox: {
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  },
};

type Selector<T> = (state: UIArtifact) => T;

export function useArtifactSelector<Selected>(selector: Selector<Selected>) {
  const { data: localArtifact } = useSWR<UIArtifact>('artifact', null, {
    fallbackData: initialArtifactData,
  });

  const selectedValue = useMemo(() => {
    if (!localArtifact) return selector(initialArtifactData);
    return selector(localArtifact);
  }, [localArtifact, selector]);

  return selectedValue;
}

export function useArtifact() {
  const { data: localArtifact, mutate: setLocalArtifact } = useSWR<UIArtifact>(
    'artifact',
    null,
    {
      fallbackData: initialArtifactData,
    },
  );

  const { data: localMetadata, mutate: setLocalMetadata } = useSWR<ArtifactMetadata>(
    () => localArtifact?.documentId ? `artifact-metadata-${localArtifact.documentId}` : null,
    null,
    {
      fallbackData: { suggestions: [], messages: [] },
    },
  );

  const artifact = useMemo(() => {
    return localArtifact ?? initialArtifactData;
  }, [localArtifact]);

  const metadata = useMemo(() => {
    return localMetadata ?? { suggestions: [], messages: [] };
  }, [localMetadata]);

  const setArtifact = useCallback(
    (updaterFn: UIArtifact | ((currentArtifact: UIArtifact) => UIArtifact)) => {
      return setLocalArtifact((currentArtifact) => {
        const artifactToUpdate = currentArtifact ?? initialArtifactData;
        return typeof updaterFn === 'function' ? updaterFn(artifactToUpdate) : updaterFn;
      });
    },
    [setLocalArtifact],
  );

  const setMetadata = useCallback(
    (updater: ((current: ArtifactMetadata) => ArtifactMetadata) | Partial<ArtifactMetadata>) => {
      return setLocalMetadata((current) => {
        const currentMetadata = current ?? { suggestions: [], messages: [] };
        return typeof updater === 'function'
          ? updater(currentMetadata)
          : { ...currentMetadata, ...updater };
      });
    },
    [setLocalMetadata],
  );

  return useMemo(
    () => ({
      artifact,
      metadata,
      setArtifact,
      setMetadata,
    }),
    [artifact, metadata, setArtifact, setMetadata],
  );
}
