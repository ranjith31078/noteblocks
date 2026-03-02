import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { Note, Tag } from "./types";

const DATA_DIR = path.join(process.cwd(), "notes");
const DB_FILE = path.join(DATA_DIR, "notes.db");

let dbInstance: Database.Database | null = null;
let lock: Promise<void> = Promise.resolve();

/**
 * Serializes store operations to avoid concurrent read/write races.
 */
function withLock<T>(task: () => Promise<T>): Promise<T> {
  const waitingFor = lock;
  let release!: () => void;
  lock = new Promise<void>((resolve) => {
    release = resolve;
  });

  return waitingFor
    .then(task)
    .finally(() => {
      release();
    });
}

/**
 * Returns the current timestamp in ISO-8601 format.
 */
function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Trims and lowercases text for case-insensitive matching.
 */
function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Derives a stable pastel tag color from a tag name.
 */
function tagColorFromName(name: string): string {
  const normalized = name.toLowerCase();
  let hash = 0;

  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }

  const hue = hash % 360;
  return `hsl(${hue} 70% 86%)`;
}

/**
 * Ensures the SQLite schema exists before serving queries.
 */
function initSchema(db: Database.Database): void {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      color TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS note_tags (
      note_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (note_id, tag_id),
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

/**
 * Seeds a freshly created database with four small starter notes.
 */
function seedDummyNotes(db: Database.Database): void {
  const base = Date.now();
  const notes = [
    { title: "Welcome", content: "<p>This is your first note.</p>" },
    { title: "Quick Idea", content: "<p>Capture ideas in seconds.</p>" },
    { title: "Today", content: "<p>Finish one important task.</p>" },
    { title: "Reminder", content: "<p>Use #tags to organize notes.</p>" },
  ];

  const insert = db.prepare(
    "INSERT INTO notes (title, content, created_at, updated_at) VALUES (?, ?, ?, ?)"
  );

  const tx = db.transaction(() => {
    for (let i = 0; i < notes.length; i += 1) {
      const timestamp = new Date(base + i * 1000).toISOString();
      const note = notes[i];
      if (!note) {
        continue;
      }
      insert.run(note.title, note.content, timestamp, timestamp);
    }
  });

  tx();
}

/**
 * Opens the notes database and initializes schema/seed data once.
 */
function getDb(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  mkdirSync(DATA_DIR, { recursive: true });
  const shouldSeed = !existsSync(DB_FILE);

  const db = new Database(DB_FILE);
  db.pragma("foreign_keys = ON");
  initSchema(db);

  if (shouldSeed) {
    seedDummyNotes(db);
  }

  dbInstance = db;
  return db;
}

/**
 * Lists tags attached to a note ordered by tag name.
 */
function fetchTagsForNote(db: Database.Database, noteId: number): Tag[] {
  const rows = db
    .prepare(
      `
      SELECT t.id, t.name, t.color
      FROM tags t
      INNER JOIN note_tags nt ON nt.tag_id = t.id
      WHERE nt.note_id = ?
      ORDER BY t.name ASC
      `
    )
    .all(noteId) as Array<{ id: number; name: string; color: string }>;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
  }));
}

/**
 * Converts note rows into API notes with expanded tags.
 */
function mapRowsToNotes(
  db: Database.Database,
  rows: Array<{ id: number; title: string; content: string; created_at: string; updated_at: string }>
): Note[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    created_at: row.created_at,
    updated_at: row.updated_at,
    tags: fetchTagsForNote(db, row.id),
  }));
}

/**
 * Removes tags that are no longer referenced by any note.
 */
function cleanupUnusedTags(db: Database.Database): void {
  db.prepare(
    `
    DELETE FROM tags
    WHERE id NOT IN (SELECT DISTINCT tag_id FROM note_tags)
    `
  ).run();
}

/**
 * Returns the most recently updated notes.
 */
export async function getRecentNotes(limit = 4): Promise<Note[]> {
  return withLock(async () => {
    const db = getDb();
    const rows = db
      .prepare(
        `
        SELECT id, title, content, created_at, updated_at
        FROM notes
        ORDER BY updated_at DESC
        LIMIT ?
        `
      )
      .all(limit) as Array<{ id: number; title: string; content: string; created_at: string; updated_at: string }>;

    return mapRowsToNotes(db, rows);
  });
}

/**
 * Searches notes by title, content, or associated tags.
 */
export async function searchNotes(query: string): Promise<Note[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return getRecentNotes();
  }

  const needle = `%${normalize(trimmed)}%`;

  return withLock(async () => {
    const db = getDb();
    const rows = db
      .prepare(
        `
        SELECT DISTINCT n.id, n.title, n.content, n.created_at, n.updated_at
        FROM notes n
        LEFT JOIN note_tags nt ON nt.note_id = n.id
        LEFT JOIN tags t ON t.id = nt.tag_id
        WHERE lower(n.title) LIKE ?
           OR lower(n.content) LIKE ?
           OR lower(t.name) LIKE ?
        ORDER BY n.updated_at DESC
        `
      )
      .all(needle, needle, needle) as Array<{
      id: number;
      title: string;
      content: string;
      created_at: string;
      updated_at: string;
    }>;

    return mapRowsToNotes(db, rows);
  });
}

/**
 * Retrieves notes that contain the provided tag name.
 */
export async function getNotesByTag(tagName: string): Promise<Note[]> {
  const trimmed = tagName.trim();
  if (!trimmed) {
    return getRecentNotes();
  }

  return withLock(async () => {
    const db = getDb();
    const rows = db
      .prepare(
        `
        SELECT DISTINCT n.id, n.title, n.content, n.created_at, n.updated_at
        FROM notes n
        INNER JOIN note_tags nt ON nt.note_id = n.id
        INNER JOIN tags t ON t.id = nt.tag_id
        WHERE lower(t.name) = lower(?)
        ORDER BY n.updated_at DESC
        `
      )
      .all(trimmed) as Array<{
      id: number;
      title: string;
      content: string;
      created_at: string;
      updated_at: string;
    }>;

    return mapRowsToNotes(db, rows);
  });
}

/**
 * Lists all tags sorted alphabetically.
 */
export async function getAllTags(): Promise<Tag[]> {
  return withLock(async () => {
    const db = getDb();
    const rows = db
      .prepare("SELECT id, name, color FROM tags ORDER BY name ASC")
      .all() as Array<{ id: number; name: string; color: string }>;

    return rows.map((row) => ({ id: row.id, name: row.name, color: row.color }));
  });
}

/**
 * Creates a new note and returns its generated ID.
 */
export async function createNote(title: string, content: string): Promise<number> {
  const noteTitle = title.trim();
  const noteContent = content.trim();

  if (!noteTitle || !noteContent) {
    throw new Error("Title and content cannot be empty");
  }

  return withLock(async () => {
    const db = getDb();
    const timestamp = nowIso();

    const result = db
      .prepare("INSERT INTO notes (title, content, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run(noteTitle, content, timestamp, timestamp);

    return Number(result.lastInsertRowid);
  });
}

/**
 * Updates an existing note's title/content and modified timestamp.
 */
export async function updateNote(id: number, title: string, content: string): Promise<void> {
  const noteTitle = title.trim();
  const noteContent = content.trim();

  if (!noteTitle || !noteContent) {
    throw new Error("Title and content cannot be empty");
  }

  await withLock(async () => {
    const db = getDb();
    const result = db
      .prepare("UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ?")
      .run(noteTitle, content, nowIso(), id);

    if (result.changes === 0) {
      throw new Error("Note not found");
    }
  });
}

/**
 * Deletes a note by ID and prunes unused tags.
 */
export async function deleteNote(id: number): Promise<void> {
  await withLock(async () => {
    const db = getDb();
    db.prepare("DELETE FROM notes WHERE id = ?").run(id);
    cleanupUnusedTags(db);
  });
}

/**
 * Replaces all tags on a note, creating missing tags as needed.
 */
export async function setNoteTags(noteId: number, tagNames: string[]): Promise<void> {
  await withLock(async () => {
    const db = getDb();

    const noteExists = db
      .prepare("SELECT COUNT(1) AS count FROM notes WHERE id = ?")
      .get(noteId) as { count: number };

    if (noteExists.count === 0) {
      throw new Error("Note not found");
    }

    const deduped: string[] = [];
    for (const rawName of tagNames) {
      const trimmed = rawName.trim();
      if (!trimmed) {
        continue;
      }

      if (!deduped.some((name) => normalize(name) === normalize(trimmed))) {
        deduped.push(trimmed);
      }
    }

    const tx = db.transaction(() => {
      const upsertTag = db.prepare("INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)");
      const findTag = db.prepare("SELECT id FROM tags WHERE name = ? COLLATE NOCASE");
      const deleteMappings = db.prepare("DELETE FROM note_tags WHERE note_id = ?");
      const insertMapping = db.prepare("INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)");

      deleteMappings.run(noteId);

      for (const tagName of deduped) {
        upsertTag.run(tagName, tagColorFromName(tagName));
        const tagRow = findTag.get(tagName) as { id: number } | undefined;
        if (!tagRow) {
          continue;
        }
        insertMapping.run(noteId, tagRow.id);
      }

      db.prepare("UPDATE notes SET updated_at = ? WHERE id = ?").run(nowIso(), noteId);
      cleanupUnusedTags(db);
    });

    tx();
  });
}

/**
 * Reads the persisted UI font size preference.
 */
export async function getFontSize(): Promise<number | null> {
  return withLock(async () => {
    const db = getDb();
    const row = db
      .prepare("SELECT value FROM config WHERE key = 'ui_font_size'")
      .get() as { value: string } | undefined;

    if (!row) {
      return null;
    }

    const parsed = Number(row.value);
    return Number.isFinite(parsed) ? parsed : null;
  });
}

/**
 * Persists the UI font size preference.
 */
export async function setFontSize(value: number): Promise<void> {
  await withLock(async () => {
    const db = getDb();
    db.prepare(
      `
      INSERT INTO config (key, value) VALUES ('ui_font_size', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `
    ).run(String(value));
  });
}

/**
 * Reads the persisted note list column layout preference.
 */
export async function getNoteColumns(): Promise<1 | 2 | null> {
  return withLock(async () => {
    const db = getDb();
    const row = db
      .prepare("SELECT value FROM config WHERE key = 'ui_note_columns'")
      .get() as { value: string } | undefined;

    if (!row) {
      return null;
    }

    const parsed = Number(row.value);
    if (parsed === 1 || parsed === 2) {
      return parsed;
    }

    return null;
  });
}

/**
 * Persists the note list column layout preference.
 */
export async function setNoteColumns(value: 1 | 2): Promise<void> {
  await withLock(async () => {
    const db = getDb();
    db.prepare(
      `
      INSERT INTO config (key, value) VALUES ('ui_note_columns', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `
    ).run(String(value));
  });
}
