# Getting Started Guide: Building a New Application with Baseplate

This guide provides step-by-step instructions for creating a new application using Baseplate as your starting point. Baseplate is an open-source AI chatbot template built with Next.js and the AI SDK.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Setting Up Your Development Environment](#setting-up-your-development-environment)
3. [Project Configuration](#project-configuration)
4. [Understanding the Project Structure](#understanding-the-project-structure)
5. [Customizing Your Application](#customizing-your-application)
6. [Adding New Features](#adding-new-features)
7. [Testing](#testing)
8. [Deployment](#deployment)
9. [Troubleshooting](#troubleshooting)

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or later)
- **pnpm** (v10.6.2 or later) - Baseplate uses pnpm as its package manager
- **Git** (for version control)
- A code editor (VS Code recommended)

You'll also need accounts with the following services:

- **OpenAI** or another AI provider for chat functionality
- **Cloudinary** for file storage
- **Postgres database** (Neon recommended)

## Setting Up Your Development Environment

### Step 1: Clone the Repository

```bash
git clone https://github.com/yourusername/your-new-project.git
cd your-new-project
```

### Step 2: Install Dependencies

```bash
pnpm install
```

### Step 3: Set Up Environment Variables

1. Copy the `.env.example` file to `.env.local`:

```bash
cp .env.example .env.local
```

2. Fill in the required environment variables in `.env.local`:

```
# OpenAI API Key
OPENAI_API_KEY="your-openai-api-key"

# Fireworks AI API Key (optional for reasoning models)
FIREWORKS_API_KEY="your-fireworks-api-key"

# Authentication Secret
AUTH_SECRET="your-generated-secret"

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME="your-cloudinary-cloud-name"
CLOUDINARY_API_KEY="your-cloudinary-api-key"
CLOUDINARY_API_SECRET="your-cloudinary-api-secret"

# Postgres Database URL
POSTGRES_URL="your-postgres-connection-string"
```

### Step 4: Set Up the Database

Run the database migration to set up your schema:

```bash
pnpm db:migrate
```

### Step 5: Start the Development Server

```bash
pnpm dev
```

Your application should now be running at [http://localhost:3000](http://localhost:3000).

## Understanding the Project Structure

Baseplate follows a well-organized structure:

- `/app` - Next.js App Router pages and layouts
  - `/(auth)` - Authentication-related routes
  - `/(chat)` - Chat interface and functionality
- `/artifacts` - Document and artifact system components
- `/components` - Reusable UI components
- `/hooks` - Custom React hooks
- `/lib` - Utility functions and core functionality
  - `/db` - Database schema and utilities
  - `/auth` - Authentication logic
- `/public` - Static assets
- `/docs` - Documentation files

## Customizing Your Application

### Modifying the UI

1. **Theme Customization**:
   - Edit `tailwind.config.ts` to modify the color scheme and design tokens
   - Update `app/globals.css` for global styles

2. **Layout Changes**:
   - Modify `app/layout.tsx` to change the main application layout
   - Edit components in the `/components` directory to customize UI elements

### Changing the Chat Interface

1. **Message Components**:
   - The main chat interface is in `/app/(chat)/chat/[id]/page.tsx`
   - Message components are in `/components/message.tsx`

2. **AI Model Configuration**:
   - Update model settings in `/lib/models.ts`
   - Modify prompt templates in `/lib/prompts.ts`

## Document System Integration

Baseplate includes a sophisticated document system with three lifecycle phases:

1. **Document Creation (Streaming Phase)**
   - Initiated through the DocumentPreview component
   - Real-time content updates via data-stream-handler

2. **Document Completion**
   - Transitions from 'streaming' status to 'idle'
   - Document data persists after streaming completes

3. **Document Viewing/Editing**
   - Expandable interface for toggling between preview and full editor
   - Specialized editors for different document types

To customize document behavior:
- Modify `/components/document-preview.tsx` for preview appearance
- Edit document content components in `/artifacts` directory

## Adding New Features

### Adding a New Page

1. Create a new directory in the `/app` folder for your route
2. Add a `page.tsx` file with your page component
3. Implement the necessary UI components and functionality

Example for adding a settings page:

```tsx
// app/settings/page.tsx
import { Settings } from '@/components/settings'

export default function SettingsPage() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-4">Settings</h1>
      <Settings />
    </div>
  )
}
```

### Adding a New API Endpoint

1. Create a new route handler in the `/app/api` directory
2. Implement the necessary logic for your API endpoint

Example for adding a user preferences API:

```tsx
// app/api/preferences/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch user preferences from database
  const preferences = await db.query.userPreferences.findFirst({
    where: { userId: session.user.id }
  })

  return NextResponse.json({ preferences })
}
```

## Testing

Baseplate includes Playwright for end-to-end testing:

1. **Running Tests**:

```bash
pnpm test
```

2. **Adding New Tests**:
   - Create test files in the `/tests` directory
   - Follow the existing test patterns for consistency

## Deployment

### Deploying to Vercel

1. Push your code to a GitHub repository
2. Import the project in Vercel
3. Configure the environment variables in the Vercel dashboard
4. Deploy your application

### Other Deployment Options

For other platforms, ensure you:
1. Build the application: `pnpm build`
2. Set up the necessary environment variables
3. Configure the database connection
4. Start the application: `pnpm start`

## Troubleshooting

### Common Issues

1. **Database Connection Errors**:
   - Verify your `POSTGRES_URL` is correct
   - Ensure your database is running and accessible
   - Run `pnpm db:migrate` to ensure schema is up to date

2. **API Key Issues**:
   - Check that all API keys are correctly set in `.env.local`
   - Verify API key permissions and rate limits

3. **Build Errors**:
   - Run `pnpm lint` to check for linting issues
   - Clear `.next` directory and node_modules: `rm -rf .next node_modules && pnpm install`

### Getting Help

If you encounter issues not covered in this guide:
1. Check the official Next.js and AI SDK documentation
2. Search for similar issues in the repository's issue tracker
3. Consult the community forums or discussion boards

---

This guide should help you get started with building your application using Baseplate. As you develop your project, remember to follow best practices for code organization, performance, and user experience.
