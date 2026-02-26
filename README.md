# Notes MVP

A note-taking web app with a daily **Review Today** focus mode. Built with Next.js (App Router), TypeScript, and Tailwind CSS.

## Prerequisites

- **Node.js** 18.18 or later (recommend 20.x LTS)
- **npm** (comes with Node.js)

## Setup

1. **Clone or open the project** (if you haven’t already):

   ```bash
   cd notes-mvp
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Start the development server**:

   ```bash
   npm run dev
   ```

4. **Open in the browser**:

   - [http://localhost:3000](http://localhost:3000)

## Routes

| Route    | Description                    |
| -------- | ------------------------------ |
| `/`      | Home with links to Notes/Review |
| `/notes` | Notes list and quick add       |
| `/review`| Review Today focus mode        |

## Scripts

| Command       | Description              |
| ------------- | ------------------------ |
| `npm run dev` | Start dev server (port 3000) |
| `npm run build` | Production build        |
| `npm run start` | Run production server   |
| `npm run lint`  | Run ESLint              |

## Tech stack

- **Next.js 15** (App Router)
- **TypeScript** (strict)
- **Tailwind CSS** for styling
- **React 19**

Phase 1 is single-user; database (Postgres/Supabase) and Prisma will be added in a follow-up step.
