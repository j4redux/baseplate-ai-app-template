# Message Streaming and Document Display Improvements

This document captures our learnings and implementation details for improving message streaming and document display in the Baseplate application. These improvements focus on ensuring a consistent user experience between initial streaming and post-refresh states.

## Problem Statement

We identified several inconsistencies in how document-related messages were displayed:

1. **Message Splitting**: After page refresh, single cohesive messages containing document content would split into multiple messages, breaking the flow and visual continuity.

2. **Formatting Inconsistencies**: Text formatting (line breaks, paragraph spacing) would change between streaming and post-refresh states.

3. **Document Preview Rendering**: Document previews would sometimes revert to simpler states after streaming completed.

## Core Solutions

### 1. Message Merging Logic

We implemented a two-pass approach in the `convertToUIMessages` function:

```typescript
// First pass: Process messages normally
const processedMessages = messages.reduce<Message[]>((chatMessages, message) => {
  // Standard message processing...
}, []);

// Second pass: Identify and merge document-related messages
const result: Message[] = [];
let i = 0;

while (i < processedMessages.length) {
  const current = processedMessages[i];
  
  // Check if this is an assistant message that might be part of a document flow
  if (current.role === 'assistant') {
    // Look ahead to see if the next message is also from the assistant and contains document tools
    const next = i < processedMessages.length - 1 ? processedMessages[i + 1] : null;
    
    // Check if we should merge these messages
    const shouldMerge = next && 
                        next.role === 'assistant' && 
                        (hasDocumentTools(current) || hasDocumentTools(next));
    
    if (shouldMerge) {
      // Create a merged message with combined content and tool invocations
      const mergedMessage: Message = {
        ...current,
        content: combineContent(current.content, next.content),
        toolInvocations: [
          ...(current.toolInvocations || []),
          ...(next.toolInvocations || [])
        ]
      };
      
      result.push(mergedMessage);
      i += 2; // Skip the next message since we merged it
    } else {
      // No need to merge, add the current message as is
      result.push(current);
      i++;
    }
  } else {
    // Not an assistant message, add as is
    result.push(current);
    i++;
  }
}
```

### 2. Content Formatting Consistency

We enhanced the `combineContent` function to maintain consistent formatting:

```typescript
function combineContent(content1: string, content2: string): string {
  if (!content1) return content2 || '';
  if (!content2) return content1 || '';
  
  // Normalize line breaks in both contents
  const normalizedContent1 = content1.trim().replace(/\n{3,}/g, '\n\n');
  const normalizedContent2 = content2.trim().replace(/\n{3,}/g, '\n\n');
  
  // Check for document creation patterns that should be kept on the same line
  const documentIntroPattern = /Let me create a document for you with a structured essay on this topic\./i;
  
  // If content2 starts with "I've created" and content1 ends with document intro,
  // we want to keep them on the same line for consistent formatting
  if (normalizedContent1.match(documentIntroPattern) && 
      normalizedContent2.trim().startsWith("I've created")) {
    // Join without paragraph break to match streaming format
    return normalizedContent1 + ' ' + normalizedContent2;
  }
  
  // For other cases, add proper spacing between contents
  return normalizedContent1 + (normalizedContent1.endsWith('\n\n') ? '' : '\n\n') + normalizedContent2;
}
```

### 3. Document Preview Consistency

We ensured consistent document preview rendering by:

1. Building a consistent document object early in the component using `useMemo`
2. Prioritizing data sources: actual document > artifact data > result data
3. Using helper functions to maintain consistent UI rendering

## Document Lifecycle Understanding

The document system has three primary phases:

1. **Document Creation (Streaming Phase)**
   - Initiated through the DocumentPreview component
   - Real-time content updates via data-stream-handler
   - UI displays streaming content when artifact is not expanded
   - Simple "Creating..." message shown when artifact is expanded

2. **Document Completion**
   - Transitions from 'streaming' status to 'idle'
   - Document data persists after streaming completes
   - Full document interface remains visible in message area when not expanded
   - DocumentToolResult shows in message area when expanded

3. **Document Viewing/Editing**
   - Expandable interface allows toggling between preview and full editor
   - DocumentContent component renders based on document type
   - Editor components provide specialized interfaces for different document types

## Key Technical Decisions

### 1. Message Processing Strategy

- **Targeted Approach**: Instead of trying to merge all kinds of messages, we specifically identify and merge document-related messages.
- **Simple Logic**: The code looks for consecutive assistant messages where at least one contains document tools, then merges them into a single message.
- **Minimal Changes**: This approach doesn't require changes to how messages are stored in the database or how they're processed during streaming.

### 2. Document Data Persistence

- Modified document object creation to not depend on streaming status
- Ensures document content remains available after streaming completes

### 3. Consistent Interface Elements

- Full document preview interface includes:
  - Document header with title and type icon
  - Content area with scrollable document content
  - Expansion capability via click handler

## Best Practices for Future Development

1. **Message Consistency**
   - Always consider both streaming and post-refresh states when modifying message processing
   - Test changes with both new conversations and after page refreshes
   - Be cautious when splitting messages, as it may affect document rendering

2. **Document Rendering**
   - Maintain a consistent document object structure throughout the lifecycle
   - Use a case-based approach to determine what to render based on document state
   - Consider expansion state when deciding what to render

3. **Data Flow**
   - Ensure clear data flow: Messages → Document references → Document preview → Full document interface
   - Maintain document state using the artifact system
   - Coordinate state between message interface and document editor

## Debugging Tips

When troubleshooting message or document display issues:

1. Compare the message structure during streaming vs. after refresh
2. Check for inconsistencies in how content is joined or split
3. Verify that document references are maintained correctly
4. Ensure that the document preview renders consistently in all states

## Future Improvements

Potential areas for future enhancement:

1. More robust pattern detection for different types of document-related messages
2. Enhanced formatting preservation for complex document structures
3. Optimized message merging for performance with large conversation histories
4. Improved handling of multi-part document responses
