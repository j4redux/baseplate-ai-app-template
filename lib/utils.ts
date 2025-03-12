import type {
  CoreAssistantMessage,
  CoreToolMessage,
  Message,
  TextStreamPart,
  ToolInvocation,
  ToolSet,
} from 'ai';

interface TextProcessingOptions {
  readonly preserveNewlines?: boolean;
  readonly preserveSpaces?: boolean;
  readonly preserveMarkdownHeadings?: boolean;
}

// Helper function to ensure temperature values are properly formatted with bold markdown
// This ensures consistent formatting of temperature values with proper spacing
export function formatTemperatures(text: string): string {
  // First, make sure we fix any spacing issues with temperature values
  let result = text
    // Fix spacing in temperatures with decimal points (e.g., "15. 9°C" -> "15.9°C")
    .replace(/(\d+)\.(\s*)(\d+)(\s*)°([CF])/g, '$1.$3°$5');
  
  // Handle temperature ranges (e.g., "10-11°C" -> "**10-11°C**")
  result = result.replace(/(\d+[\.\d]*)-(\d+[\.\d]*)°([CF])/g, '**$1-$2°$3**');
  
  // Handle regular temperature values (make sure not to process already formatted ranges)
  result = result
    .replace(/(?<!\*\*)\b(\d+\.\d+)°([CF])\b(?!\*\*)/g, '**$1°$2**')
    .replace(/(?<!\*\*)\b(\d+)°([CF])\b(?!\*\*)/g, '**$1°$2**');
    
  return result;
}

export function processText(text: string, options: TextProcessingOptions = {}): string {
  const { 
    preserveNewlines = false, 
    preserveSpaces = false,
    preserveMarkdownHeadings = false 
  } = options;
  
  // First, normalize all whitespace while preserving intentional newlines
  let processed = text
    .replace(/[\t\f\r ]+/g, ' ')
    .trim();

  if (preserveMarkdownHeadings) {
    // For documents, preserve markdown structure and formatting
    processed = processed
      // Normalize markdown headings
      .replace(/^(#{1,6})([^\s#])/gm, '$1 $2')
      // Ensure proper list formatting
      .replace(/^(\d+)\.(\s*)/gm, '$1. ')
      .replace(/^([*-])\s*/gm, '$1 ')
      // Preserve intentional line breaks
      .replace(/\n{3,}/g, '\n\n');
  } else {
    // For chat messages, simplify formatting
    processed = processed
      // Normalize lists without affecting other content
      .replace(/^(\d+)\.(\s*)/gm, '$1. ')
      .replace(/^([*-])\s*/gm, '$1 ');
    
    // Handle newlines
    if (!preserveNewlines) {
      // Convert all newlines to spaces if not preserving newlines
      processed = processed.replace(/\n+/g, ' ');
    }
    // When preserveNewlines is true, we leave the newlines intact
  }

  // Handle sentence spacing consistently
  if (preserveNewlines) {
    // When preserving newlines, only normalize spaces while keeping newlines intact
    processed = processed
      .replace(/([.!?])(?!["'.])/g, '$1 ')
      // Replace multiple spaces with a single space, but preserve newlines
      .replace(/[^\S\n]+/g, ' ')
      .trim();
  } else {
    // Standard whitespace normalization when not preserving newlines
    processed = processed
      .replace(/([.!?])(?!["'.])/g, '$1 ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  // Fix spacing issues in common technical terms with periods
  processed = processed
    .replace(/Next\. js/g, 'Next.js')
    .replace(/Node\. js/g, 'Node.js')
    .replace(/Type\. ?Script/g, 'TypeScript')
    .replace(/Java\. ?Script/g, 'JavaScript')
    .replace(/React\. ?js/g, 'React.js')
    .replace(/Vue\. ?js/g, 'Vue.js')
    .replace(/(\d+)\. (\d+)\. (\d+)/g, '$1.$2.$3'); // Fix version numbers like 1. 2. 3
    


  return processed;
}

interface MessageContent {
  readonly type: 'text' | 'tool-call' | 'tool-result' | 'reasoning';
  readonly text?: string;
  readonly toolCallId?: string;
  readonly toolName?: string;
  readonly args?: Record<string, unknown>;
  readonly reasoning?: string;
  readonly result?: unknown;
}
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

import type { Message as DBMessage, Document } from '@/lib/db/schema';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ApplicationError extends Error {
  info: string;
  status: number;
}

export const fetcher = async (url: string) => {
  const res = await fetch(url);

  if (!res.ok) {
    const error = new Error(
      'An error occurred while fetching the data.',
    ) as ApplicationError;

    error.info = await res.json();
    error.status = res.status;

    throw error;
  }

  return res.json();
};

export function getLocalStorage(key: string) {
  if (typeof window !== 'undefined') {
    return JSON.parse(localStorage.getItem(key) || '[]');
  }
  return [];
}

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function addToolMessageToChat({
  toolMessage,
  messages,
}: {
  toolMessage: CoreToolMessage;
  messages: Array<Message>;
}): Array<Message> {
  return messages.map((message) => {
    if (message.toolInvocations) {
      return {
        ...message,
        toolInvocations: message.toolInvocations.map((toolInvocation) => {
          const toolResult = toolMessage.content.find(
            (tool) => tool.toolCallId === toolInvocation.toolCallId,
          );

          if (toolResult) {
            return {
              ...toolInvocation,
              state: 'result',
              result: toolResult.result,
            };
          }

          return toolInvocation;
        }),
      };
    }

    return message;
  });
}

export function convertToUIMessages(
  messages: readonly DBMessage[],
): Message[] {
  return messages.reduce<Message[]>((chatMessages, message) => {
    if (message.role === 'tool') {
      return addToolMessageToChat({
        toolMessage: message as CoreToolMessage,
        messages: chatMessages,
      });
    }

    const processContent = (content: MessageContent[]): {
      text: string;
      reasoning?: string;
      toolInvocations: ToolInvocation[];
    } => {
      const textParts: string[] = [];
      const toolInvocations: ToolInvocation[] = [];
      let reasoning: string | undefined;

      // Process text parts first to ensure complete sentences before tool calls
      const processedText = content
        .filter((part): part is MessageContent & { type: 'text'; text: string } =>
          part.type === 'text' && typeof part.text === 'string'
        )
        .map(part => processText(part.text, {
          preserveNewlines: true,
          preserveMarkdownHeadings: true,
          preserveSpaces: true
        }))
        .join('\n\n');
      
      // Process tool calls and reasoning after text is properly formatted
      content.forEach((part) => {
        switch (part.type) {
          case 'tool-call':
            if (part.toolCallId && part.toolName) {
              toolInvocations.push({
                state: 'call',
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                args: part.args ?? {},
              });
            }
            break;
          case 'reasoning':
            if (part.reasoning) {
              reasoning = part.reasoning;
            }
            break;
        }
      });

      const text = processedText;

      return { text, reasoning, toolInvocations };
    };

    const { text, reasoning, toolInvocations } = typeof message.content === 'string'
      ? { 
          text: processText(message.content, {
            preserveNewlines: true,
            preserveMarkdownHeadings: true,
            preserveSpaces: true
          }), 
          reasoning: undefined, 
          toolInvocations: [] 
        }
      : processContent(message.content as MessageContent[]);

    chatMessages.push({
      id: message.id,
      role: message.role as Message['role'],
      content: text,
      reasoning,
      toolInvocations,
    });

    return chatMessages;
  }, []);
}

type ResponseMessageWithoutId = CoreToolMessage | CoreAssistantMessage;
type ResponseMessage = ResponseMessageWithoutId & { id: string };

export function sanitizeResponseMessages({
  messages,
  reasoning,
}: {
  messages: Array<ResponseMessage>;
  reasoning: string | undefined;
}) {
  const toolResultIds: Array<string> = [];

  for (const message of messages) {
    if (message.role === 'tool') {
      for (const content of message.content) {
        if (content.type === 'tool-result') {
          toolResultIds.push(content.toolCallId);
        }
      }
    }
  }

  const messagesBySanitizedContent = messages.map((message) => {
    if (message.role !== 'assistant') return message;

    if (typeof message.content === 'string') return message;

    const sanitizedContent = message.content.filter((content) =>
      content.type === 'tool-call'
        ? toolResultIds.includes(content.toolCallId)
        : content.type === 'text'
          ? content.text.length > 0
          : true,
    );

    if (reasoning) {
      // @ts-expect-error: reasoning message parts in sdk is wip
      sanitizedContent.push({ type: 'reasoning', reasoning });
    }

    return {
      ...message,
      content: sanitizedContent,
    };
  });

  return messagesBySanitizedContent.filter(
    (message) => message.content.length > 0,
  );
}

export function sanitizeUIMessages(messages: Array<Message>): Array<Message> {
  const messagesBySanitizedToolInvocations = messages.map((message) => {
    if (message.role !== 'assistant') return message;

    if (!message.toolInvocations) return message;

    const toolResultIds: Array<string> = [];

    for (const toolInvocation of message.toolInvocations) {
      if (toolInvocation.state === 'result') {
        toolResultIds.push(toolInvocation.toolCallId);
      }
    }

    const sanitizedToolInvocations = message.toolInvocations.filter(
      (toolInvocation) =>
        toolInvocation.state === 'result' ||
        toolResultIds.includes(toolInvocation.toolCallId),
    );

    return {
      ...message,
      toolInvocations: sanitizedToolInvocations,
    };
  });

  return messagesBySanitizedToolInvocations.filter(
    (message) =>
      message.content.length > 0 ||
      (message.toolInvocations && message.toolInvocations.length > 0),
  );
}

export function getMostRecentUserMessage(messages: Array<Message>) {
  const userMessages = messages.filter((message) => message.role === 'user');
  return userMessages.at(-1);
}

export function getDocumentTimestampByIndex(
  documents: Array<Document>,
  index: number,
) {
  if (!documents) return new Date();
  if (index > documents.length) return new Date();

  return documents[index].createdAt;
}
