# AI-CHATBOT DEVELOPMENT GUIDE

## Commands
- `pnpm dev` - Run development server (with Turbo)
- `pnpm build` - Build production app (runs DB migration first)
- `pnpm lint` - Run Next.js linter and Biome linter
- `pnpm lint:fix` - Fix linting issues automatically
- `pnpm format` - Run Biome formatter
- `pnpm test` - Run all Playwright tests
- `pnpm exec playwright test tests/chat.test.ts` - Run specific test file
- `pnpm exec playwright test -g "test name"` - Run specific test by name

## Code Style
- TypeScript with strict typing throughout
- Formatting: 2 spaces, 80 char line width, single quotes, semicolons
- JSX: Double quotes for attributes, fragment syntax preferred
- Imports: No unused imports, use array literals
- Components: React Server Components by default
- State: Server actions with 'use server' directive
- Validation: Zod for form/data validation
- Error handling: Try/catch with structured error objects
- Database: Drizzle ORM with prepared queries

## Naming Conventions
- Components: PascalCase (ChatHeader.tsx)
- Hooks: camelCase with use prefix (useArtifact.ts)
- Utils: camelCase (utils.ts)
- Server actions: camelCase with descriptive verbs
- Types/interfaces: PascalCase, descriptive nouns
- Tests: Descriptive sentences, grouped by feature

## Architecture
- Next.js app router with (auth) and (chat) route groups
- UI components in /components
- Shared logic in /lib
- AI providers configured in lib/ai
- API endpoints in app/api
- Database schema in lib/db