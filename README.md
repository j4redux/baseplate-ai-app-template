# Baseplate: AI App Template

<p align="center">
  A flexible, production-ready AI application template with Artifacts support, built with Next.js and the AI SDK.
</p>

<p align="center">
  <a href="#features"><strong>Features</strong></a> ·
  <a href="#ai-capabilities"><strong>AI Capabilities</strong></a> ·
  <a href="#quick-start"><strong>Quick Start</strong></a> ·
  <a href="#implementation-guides"><strong>Implementation Guides</strong></a> ·
  <a href="#core-concepts"><strong>Core Concepts</strong></a> ·
  <a href="#use-cases"><strong>Use Cases</strong></a>
</p>
<br/>

<p align="center">
  <img src="demo.gif" alt="Baseplate Demo" width="800">
</p>
<br/>

## Features

- **Modern Web Framework**

  - [Next.js](https://nextjs.org) App Router for optimized routing and performance
  - React Server Components (RSCs) for improved rendering efficiency
  - Server Actions for secure server-side operations

- **AI Integration Layer**

  - [AI SDK](https://sdk.vercel.ai/docs) providing unified API for LLM interactions
  - Streaming response handling with real-time UI updates
  - Multi-model support: OpenAI, Anthropic (Claude), Fireworks, and more
  - Prompt management system for consistent AI interactions

- **Document System Architecture**

  - Complete document lifecycle management (creation, streaming, completion)
  - Specialized editors for different content types (text, code, spreadsheets)
  - Expandable document interface with preview and full editing modes

- **Polished UI Framework**

  - [shadcn/ui](https://ui.shadcn.com) with [Tailwind CSS](https://tailwindcss.com) for responsive design
  - Accessible component primitives from [Radix UI](https://radix-ui.com)
  - Dark/light mode support with theme customization

- **Production-Ready Infrastructure**
  - [Postgres](https://neon.tech) for structured data storage
  - [Cloudinary](https://cloudinary.com) for media and file management
  - [NextAuth.js](https://github.com/nextauthjs/next-auth) for secure authentication

## AI Capabilities

Baseplate provides a flexible foundation for building various AI-powered applications:

- **Conversational Interfaces**

  - Multi-turn dialogue management with context preservation
  - Message streaming for real-time responses
  - Support for different conversation styles and personalities

- **Document Processing**

  - AI-generated content with specialized rendering
  - Real-time document creation and editing
  - Support for multiple document formats (text, code, data)

- **Advanced Model Capabilities**

  - **OpenAI Integration**

    - GPT-4o and other OpenAI models with vision capabilities
    - Function calling for tool integration
    - JSON mode for structured outputs

  - **Claude Integration**
    - Support for latest Claude models (3.5 Sonnet, 3.7 Sonnet)
    - Extended thinking mode for complex reasoning tasks (Claude 3.7 Sonnet)
    - Extended output capabilities up to 128K tokens (Claude 3.7 Sonnet)
    - Computer use capabilities for agentic workflows (Claude 3.7 Sonnet)
    - Multi-modal input with advanced image understanding
    - PDF document analysis and processing
    - Cache control for optimized token usage
    - Tool usage for external system interactions

- **Extensible Architecture**
  - Tool calling framework for AI-triggered actions
  - Streaming data handlers for real-time updates
  - Artifact system for managing AI-generated content

## Quick Start

### Prerequisites

- **Node.js** (v18 or later)
- **pnpm** (v10.6.2 or later)
- **Git** (for version control)
- **VS Code** or another code editor

### Required Service Accounts

- **AI Provider**: OpenAI API key (or Anthropic/Claude API key)
- **Storage**: Cloudinary account for file management
- **Database**: Postgres database (Neon recommended)

### One-Minute Setup

```bash
# Clone repository
git clone https://github.com/j4redux/baseplate-next.git project-name
cd project-name

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your API keys

# Initialize database
pnpm db:migrate

# Start development server
pnpm dev
```

Your AI application will be running at [http://localhost:3000](http://localhost:3000).

### Environment Configuration

Edit `.env.local` with your service credentials:

```env
# AI Provider API Keys
OPENAI_API_KEY="your-openai-api-key"      # For OpenAI models
ANTHROPIC_API_KEY="your-anthropic-api-key" # For direct Claude API access
FIREWORKS_API_KEY="your-fireworks-api-key" # Alternative for Claude models via Fireworks

# Security
AUTH_SECRET="generate-with-openssl-rand-base64-32"

# File Storage
CLOUDINARY_CLOUD_NAME="your-cloud-name"
CLOUDINARY_API_KEY="your-api-key"
CLOUDINARY_API_SECRET="your-api-secret"

# Database
POSTGRES_URL="postgres://user:password@host:port/database"
```

## Implementation Guides

### Project Architecture

```
baseplate/
├── app/                  # Next.js application routes
│   ├── (auth)/           # Authentication flows
│   └── (chat)/           # Chat interface and messaging
├── artifacts/            # Document system components
│   ├── document-content.tsx  # Content rendering
│   └── document-header.tsx   # Document headers
├── components/           # UI components
│   ├── document-preview.tsx  # Document preview in messages
│   └── message.tsx       # Message rendering system
├── hooks/                # React hooks
│   └── use-artifact.ts   # Artifact state management
├── lib/                  # Core utilities
│   ├── auth/             # Authentication logic
│   ├── db/               # Database schema and queries
│   ├── models.ts         # AI model configurations
│   └── prompts.ts        # Prompt templates
└── public/               # Static assets
```

### Key Files for AI Implementation

- **`lib/models.ts`**: Configure AI models and parameters
- **`lib/prompts.ts`**: Define system prompts and templates
- **`components/message.tsx`**: Customize message rendering
- **`artifacts/document-content.tsx`**: Modify document display
- **`hooks/use-artifact.ts`**: Manage artifact state

### Claude Integration Patterns

#### Basic Text Generation

```typescript
// app/api/chat/route.ts
import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { prompt } = await req.json();

  const stream = await streamText({
    model: anthropic("claude-3-5-sonnet-20240620"),
    prompt,
    maxTokens: 1000,
  });

  return new NextResponse(stream);
}
```

#### Extended Thinking for Complex Tasks

```typescript
// Using Claude's extended thinking capabilities
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

async function generateWithExtendedThinking() {
  const response = await generateText({
    model: anthropic("claude-3-7-sonnet-20250219"),
    prompt:
      "Analyze the implications of quantum computing on modern cryptography.",
    maxTokens: 4000,
    anthropicOptions: {
      thinking: {
        type: "enabled",
        budgetTokens: 8000, // Allocate tokens for thinking process
      },
    },
  });

  return response;
}

export async function generateWithThinking(prompt: string) {
  const { text, reasoning } = await generateText({
    model: anthropic("claude-3-7-sonnet-20250219"),
    prompt,
    providerOptions: {
      anthropic: {
        thinking: { type: "enabled", budgetTokens: 12000 },
      },
    },
  });

  return {
    result: text,
    reasoning, // Access Claude's reasoning process
  };
}
```

#### Multi-modal Input Processing

```typescript
// Handling image inputs with Claude
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import fs from "fs";

export async function analyzeImage(imageBuffer: Buffer, question: string) {
  const result = await generateText({
    model: anthropic("claude-3-5-sonnet-20240620"),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: question },
          {
            type: "image",
            data: imageBuffer.toString("base64"),
            mimeType: "image/jpeg",
          },
        ],
      },
    ],
  });

  return result.text;
}
```

#### PDF Document Analysis

```typescript
// Analyzing PDF documents with Claude
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import fs from "fs";

export async function analyzePDF(pdfPath: string, question: string) {
  const pdfBuffer = fs.readFileSync(pdfPath);

  const result = await generateText({
    model: anthropic("claude-3-5-sonnet-20241022"),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: question },
          {
            type: "file",
            data: pdfBuffer,
            mimeType: "application/pdf",
          },
        ],
      },
    ],
  });

  return result.text;
}
```

#### Computer Use for Agentic Workflows

```typescript
// Using Claude's computer use capabilities for agentic tasks
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

export async function executeWithComputerUse(task: string, data: any) {
  const result = await generateText({
    model: anthropic("claude-3-7-sonnet-20250219"),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `${task}\n\nHere's the data to work with: ${JSON.stringify(
              data
            )}`,
          },
        ],
      },
    ],
    maxTokens: 4000,
    anthropicOptions: {
      tools: [
        {
          name: "computer",
          description:
            "Use a virtual computer to create visualizations, analyze data, and perform complex tasks",
        },
      ],
      // Can be combined with extended thinking for complex tasks
      thinking: {
        type: "enabled",
        budgetTokens: 8000,
      },
    },
  });

  return result;
}
```

#### Extended Output Capabilities (Beta)

```typescript
// Using Claude's extended output capabilities for long-form content
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

export async function generateLongFormContent(topic: string) {
  const result = await generateText({
    model: anthropic("claude-3-7-sonnet-20250219"),
    messages: [
      {
        role: "user",
        content: `Write a comprehensive guide about ${topic}. Include detailed sections, examples, and best practices.`,
      },
    ],
    maxTokens: 32000, // Can go up to 128K with beta feature
    anthropicOptions: {
      betas: ["output-128k-2025-02-19"], // Enable extended output capability
      thinking: {
        type: "enabled",
        budgetTokens: 16000, // Larger thinking budget for complex content
      },
    },
  });

  return result;
}
```

## Core Concepts

### Document Lifecycle System

The document system is central to Baseplate's AI content generation capabilities:

```mermaid
graph LR
    A[AI Generation] --> B[Streaming Phase]
    B --> C[Document Completion]
    C --> D[Viewing/Editing]
```

1. **Document Creation (Streaming Phase)**

   - Content is generated in real-time by the AI
   - `DocumentPreview` component shows streaming updates
   - UI displays "Creating..." when artifact is expanded

2. **Document Completion**

   - Status transitions from 'streaming' to 'idle'
   - Document data persists in the application state
   - Full document interface remains visible in message area

3. **Document Viewing/Editing**
   - Interface toggles between preview and full editor modes
   - `DocumentContent` renders based on document type
   - Specialized editors provide type-specific interfaces

### Message-Document Integration

Documents are tightly integrated with the messaging interface:

- Documents are created as part of message responses
- Messages maintain references to documents via result IDs
- The `useArtifact` hook coordinates state between messages and documents

### AI Provider Capabilities Matrix

| Capability             | OpenAI (GPT-4o) | Claude 3.5 Sonnet | Claude 3.7 Sonnet |
| ---------------------- | --------------- | ----------------- | ----------------- |
| Text Generation        | Yes             | Yes               | Yes               |
| Vision/Image Analysis  | Yes             | Yes               | Yes               |
| Function Calling       | Yes             | Yes               | Yes               |
| JSON Mode              | Yes             | Yes               | Yes               |
| Extended Thinking      | No              | No                | Yes               |
| Extended Output (128K) | No              | No                | Yes               |
| Computer Use           | No              | No                | Yes               |
| PDF Analysis           | No              | Yes               | Yes               |
| Cache Control          | No              | Yes               | Yes               |

### Claude Implementation Best Practices

1. **Model Selection Guidelines**

   - Use Claude 3.7 Sonnet for tasks requiring:
     - Complex reasoning with extended thinking
     - Agentic workflows with computer use
     - Long-form content generation (up to 128K tokens)
     - Advanced tool use and integration
   - Use Claude 3.5 Sonnet for:
     - Balanced performance and cost efficiency
     - PDF document analysis and processing
     - Standard vision and multi-modal tasks
   - Use Claude 3 Opus for highest quality outputs when speed is less critical

2. **Optimizing Token Usage**

   - Implement cache control for repetitive prompts
   - Configure appropriate thinking budgets based on task complexity:
     - 4K-8K tokens for moderate complexity
     - 16K-32K tokens for highly complex tasks
   - Structure prompts efficiently to minimize token consumption
   - Be aware of context window calculations with extended thinking

3. **Multi-modal Implementation**

   - Convert images to base64 for vision capabilities
   - Ensure proper MIME type specification
   - Consider image resolution and size limitations
   - Use appropriate file formats for document analysis

4. **Extended Thinking Implementation**
   - Enable thinking with `thinking: { type: 'enabled', budgetTokens: N }`
   - Access reasoning process in responses for transparency
   - Consider streaming for real-time visibility into thinking process
   - Combine with computer use for advanced agentic capabilities

### AI Model Configuration

Baseplate supports multiple AI providers through a unified configuration system:

```typescript
// lib/models.ts
import { Anthropic } from "@ai-sdk/anthropic";
import { OpenAI } from "@ai-sdk/openai";

export const models = {
  // OpenAI models
  "gpt-4o": {
    provider: "openai",
    model: "gpt-4o",
    temperature: 0.7,
  },

  // Claude models
  "claude-3-5-sonnet": {
    provider: "anthropic",
    model: "claude-3-5-sonnet-20240620",
    temperature: 0.7,
  },
  "claude-3-7-sonnet": {
    provider: "anthropic",
    model: "claude-3-7-sonnet-20250219",
    temperature: 0.7,
  },
};

// Direct SDK integration example
export const openaiConfig = {
  standard: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).chat("gpt-4o"),
  vision: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).chat(
    "gpt-4o-vision"
  ),
};

export const claudeConfig = {
  // Claude 3.7 Sonnet - Latest model with extended thinking and computer use
  sonnet37: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).chat(
    "claude-3-7-sonnet-20250219",
    {
      // Enable extended thinking for complex reasoning
      thinking: {
        type: "enabled",
        budgetTokens: 8000, // Allocate tokens for thinking process
      },
      // Optional: Enable extended output (beta) for long-form content
      // betas: ['output-128k-2025-02-19'],
      // maxTokens: 32000, // Can go up to 128K tokens with beta feature

      // Optional: Enable computer use for agentic workflows
      tools: [
        {
          name: "computer",
          description:
            "Use a virtual computer to create visualizations, analyze data, and perform complex tasks",
        },
      ],
    }
  ),

  // Claude 3.5 Sonnet - Balanced performance with vision and PDF capabilities
  sonnet35: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).chat(
    "claude-3-5-sonnet-20240620",
    {
      // Configure for PDF analysis
      fileFormats: ["pdf"],
    }
  ),

  // Claude 3 Opus - Best for complex reasoning tasks
  opus: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).chat(
    "claude-3-opus-20240229"
  ),
};
```

## Use Cases

Baseplate can be adapted for various AI application scenarios:

### 1. AI Document Generator

Create an application that generates different types of documents:

```typescript
// Example: Adding a new document type
// 1. Create a new document type in artifacts/types.ts
export type SpreadsheetDocument = {
  type: 'spreadsheet';
  data: Array<Array<string | number>>;
  headers?: string[];
};

// 2. Add a renderer in artifacts/document-content.tsx
case 'spreadsheet':
  return <SpreadsheetEditor data={document.data} headers={document.headers} />;
````

### 2. Multi-Model Assistant

Implement an assistant that uses different models for different tasks:

```typescript
// Example: Adding model selection to chat interface
// lib/models.ts - Add model definitions
export const models = {
  "gpt-4o": {
    /* config */
  },
  "claude-3-opus": {
    /* config */
  },
  "claude-3-sonnet": {
    /* config */
  },
};

// components/model-selector.tsx - Create a model selector component
export function ModelSelector({ onSelect }) {
  return (
    <Select onValueChange={onSelect}>
      <SelectItem value="gpt-4o">GPT-4o (General)</SelectItem>
      <SelectItem value="claude-3-opus">Claude 3 Opus (Detailed)</SelectItem>
      <SelectItem value="claude-3-sonnet">Claude 3 Sonnet (Fast)</SelectItem>
    </Select>
  );
}
```

### 3. AI-Powered Knowledge Base

Build a knowledge management system with AI-generated content:

```typescript
// Example: Creating a knowledge base article endpoint
// app/api/kb/create/route.ts
import { OpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const { topic, context } = await req.json();
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const result = await streamText({
    model: openai.chat("gpt-4o"),
    messages: [
      {
        role: "system",
        content: "Create a knowledge base article on the given topic.",
      },
      { role: "user", content: `Topic: ${topic}\nContext: ${context}` },
    ],
  });

  // Store in database
  await db.insert(kbArticles).values({
    topic,
    content: result.text,
    createdAt: new Date(),
  });

  return Response.json({ success: true, articleId: result.id });
}
```

### 4. Specialized Claude Implementation

Optimize Baseplate specifically for Claude models:

```typescript
// Example: Configuring for Claude 3.7 Sonnet with extended capabilities
// lib/claude-advanced.ts
import { Anthropic } from "@anthropic-ai/sdk";

export const claudeAdvanced = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function generateWithExtendedCapabilities(
  prompt: string,
  options: {
    extendedThinking?: boolean;
    extendedOutput?: boolean;
    computerUse?: boolean;
  }
) {
  const response = await claudeAdvanced.messages.create({
    model: "claude-3-7-sonnet-20250219",
    max_tokens: options.extendedOutput ? 32000 : 4000,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    // Configure extended thinking if enabled
    thinking: options.extendedThinking
      ? {
          type: "enabled",
          budget_tokens: 16000,
        }
      : undefined,
    // Configure computer use if enabled
    tools: options.computerUse
      ? [
          {
            name: "computer",
            description: "Use a virtual computer to perform tasks",
          },
        ]
      : undefined,
    // Enable extended output beta if requested
    betas: options.extendedOutput ? ["output-128k-2025-02-19"] : undefined,
  });

  return {
    content: response.content,
    thinking: response.thinking,
    usage: response.usage,
  };
}
```

```typescript
// lib/claude-config.ts
import { Anthropic } from "@ai-sdk/anthropic";

export const claudeConfig = {
  // Claude 3.7 Sonnet - Latest model with extended thinking and computer use
  "claude-3-7-sonnet": {
    provider: "anthropic",
    model: "claude-3-7-sonnet-20250219",
    temperature: 0.7,
    // Extended thinking configuration
    thinking: {
      type: "enabled",
      budgetTokens: 8000,
    },
    // For extended output (beta)
    // betas: ['output-128k-2025-02-19'],
    // maxTokens: 32000,
  },

  // Claude 3.5 Sonnet - Balanced performance and capabilities
  "claude-3-5-sonnet": {
    provider: "anthropic",
    model: "claude-3-5-sonnet-20240620",
    temperature: 0.7,
  },

  // Claude 3 Opus - Best for complex reasoning and detailed outputs
  opus: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).chat(
    "claude-3-opus-20240229"
  ),

  // Claude 3 Sonnet - Balanced performance and speed
  sonnet: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).chat(
    "claude-3-sonnet-20240229"
  ),

  // Claude 3 Haiku - Fastest response times
  haiku: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).chat(
    "claude-3-haiku-20240307"
  ),
};

// Claude-optimized system prompts
export const claudePrompts = {
  chatbot: `You are Claude, an AI assistant by Anthropic. You are helpful, harmless, and honest.`,
  documentGenerator: `You are a document creation assistant. Create well-structured, comprehensive documents based on user requests.`,
  codeAssistant: `You are a coding assistant. Provide clear, efficient, and well-documented code solutions.`,
};
```

## Deployment & Operations

### Quick Deployment

```bash
# Build for production
pnpm build

# Deploy to Vercel
vercel --prod
```

### Testing & Quality Assurance

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm exec playwright test tests/chat.spec.ts

# Lint codebase
pnpm lint
```

## Troubleshooting

### Common Issues & Solutions

| Issue                            | Solution                                                         |
| -------------------------------- | ---------------------------------------------------------------- |
| **Claude API errors**            | Verify ANTHROPIC_API_KEY is correct and has sufficient quota     |
| **Document streaming issues**    | Check network connection and ensure proper stream handling       |
| **Database connection failures** | Verify POSTGRES_URL format and database accessibility            |
| **UI rendering problems**        | Clear browser cache or rebuild with `rm -rf .next && pnpm build` |

### Performance Optimization

- Use `claude-3-haiku` for faster response times in chat interfaces
- Implement client-side caching for frequently accessed data
- Consider edge deployment for reduced latency

## Resources

- [AI SDK Documentation](https://sdk.vercel.ai/docs)
- [Claude API Documentation](https://docs.anthropic.com/claude/reference/getting-started-with-the-api)
- [Next.js Documentation](https://nextjs.org/docs)
