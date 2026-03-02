# noteblocks

Noteblocks is a self-hosted notes app built with Next.js.

## Data Storage (SQLite)

- Notes are stored in a local SQLite database at `notes/notes.db` (created automatically on first run).
- The app initializes the schema on startup and seeds a few starter notes when the database is first created.
- Note metadata and settings are also stored in SQLite (`notes`, `tags`, `note_tags`, and `config` tables).
- To back up your data, copy the `notes/` directory.

## Installation

1. Install dependencies:

```bash
npm install
```

2. Start the development server:

```bash
npm run dev
```

3. Open http://localhost:3000 in your browser.

## Run in Production

1. Build the app:

```bash
npm run build
```

2. Start the production server:

```bash
npm run start
```

3. Open http://localhost:3000 in your browser.
