"use client";

import { useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Autocomplete,
  Button,
  Card,
  Container,
  Divider,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconCheck,
  IconNotebook,
  IconPaperclip,
  IconPencil,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import QuillEditor, { type QuillEditorHandle } from "@/components/QuillEditor";
import type { Note, Tag } from "@/lib/types";

const DEFAULT_FONT_SIZE = 14;
const MIN_FONT_SIZE = 11;
const MAX_FONT_SIZE = 22;
const FONT_SIZE_STEP = 1;

type QuillSize = "small" | "large" | "huge" | false;

/**
 * Wrapper around fetch that enforces JSON handling and error propagation.
 */
async function api<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

/**
 * Escapes regex metacharacters so user input is treated as literal text.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Main notes page with editor, filters, and note list rendering.
 */
export default function Page() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [opened, { open, close }] = useDisclosure(false);
  const [editorContent, setEditorContent] = useState("");
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [pendingTags, setPendingTags] = useState<Tag[]>([]);
  const [tagModalOpened, setTagModalOpened] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [recentlySelectedTagName, setRecentlySelectedTagName] = useState<string | null>(null);
  const [previewImageSrc, setPreviewImageSrc] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState<number>(DEFAULT_FONT_SIZE);
  const [noteColumnCount, setNoteColumnCount] = useState<1 | 2>(1);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const quillRef = useRef<QuillEditorHandle | null>(null);

  const modules = {
    toolbar: [
      [{ header: [1, 2, 3, 4, 5, 6, false] }],
      [{ font: [] }],
      [{ size: ["small", false, "large", "huge"] }],
      ["bold", "italic", "underline", "strike"],
      [{ color: [] }, { background: [] }],
      [{ script: "sub" }, { script: "super" }],
      [{ list: "ordered" }, { list: "bullet" }],
      [{ indent: "-1" }, { indent: "+1" }],
      [{ direction: "rtl" }],
      [{ align: [] }],
      ["blockquote", "code-block"],
      ["link", "image", "video"],
      ["clean"],
    ],
  };

  const formats = [
    "header",
    "font",
    "size",
    "bold",
    "italic",
    "underline",
    "strike",
    "color",
    "background",
    "script",
    "list",
    "indent",
    "direction",
    "align",
    "blockquote",
    "code-block",
    "link",
    "image",
    "video",
  ];

  /**
   * Loads the most recently updated notes from the backend.
   */
  async function fetchRecentNotes() {
    try {
      const recentNotes = await api<Note[]>("/api/notes");
      setNotes(recentNotes);
    } catch (error) {
      console.error("Failed to fetch recent notes:", error);
    }
  }

  /**
   * Performs text search across notes.
   */
  async function searchNotes(query: string) {
    try {
      const params = new URLSearchParams({ query });
      const matchingNotes = await api<Note[]>(`/api/notes?${params.toString()}`);
      setNotes(matchingNotes);
    } catch (error) {
      console.error("Failed to search notes:", error);
    }
  }

  /**
   * Retrieves notes scoped to a single tag.
   */
  async function fetchNotesByTag(tagName: string) {
    try {
      const params = new URLSearchParams({ tag: tagName });
      const notesByTag = await api<Note[]>(`/api/notes?${params.toString()}`);
      setNotes(notesByTag);
    } catch (error) {
      console.error("Failed to fetch notes by tag:", error);
    }
  }

  /**
   * Splits the search input into free-text query and #tag filters.
   */
  function parseSearchInput(input: string): { textQuery: string; tagFilters: string[] } {
    const matches = input.matchAll(/#([^\s#]+)/g);
    const seen = new Set<string>();
    const tags: string[] = [];

    for (const match of matches) {
      const value = (match[1] ?? "").trim();
      if (!value) {
        continue;
      }

      const normalized = value.toLowerCase();
      if (seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      tags.push(value);
    }

    const textQuery = input.replace(/#[^\s#]+/g, " ").replace(/\s+/g, " ").trim();
    return { textQuery, tagFilters: tags };
  }

  /**
   * Appends a tag token to the search bar if not already present.
   */
  function appendTagToSearch(current: string, tagName: string): string {
    const token = `#${tagName}`;
    const { tagFilters } = parseSearchInput(current);
    if (tagFilters.some((tag) => tag.toLowerCase() === tagName.toLowerCase())) {
      return current;
    }

    const base = current.trim();
    return base ? `${base} ${token}` : token;
  }

  /**
   * Highlights matching query text in a plain string using yellow marks.
   */
  function highlightPlainText(text: string, query: string): Array<string | JSX.Element> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return [text];
    }

    const regex = new RegExp(`(${escapeRegExp(trimmedQuery)})`, "gi");
    const parts = text.split(regex);

    return parts.map((part, index) => {
      if (part.toLowerCase() === trimmedQuery.toLowerCase()) {
        return (
          <mark key={`${part}-${index}`} style={{ backgroundColor: "#fde047", padding: 0, borderRadius: 2 }}>
            {part}
          </mark>
        );
      }
      return part;
    });
  }

  /**
   * Highlights matching query text inside HTML content without touching tags.
   */
  function highlightHtmlContent(html: string, query: string): string {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return html;
    }

    if (typeof DOMParser === "undefined") {
      return html;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div id="note-root">${html}</div>`, "text/html");
    const root = doc.getElementById("note-root");
    if (!root) {
      return html;
    }

    const regex = new RegExp(`(${escapeRegExp(trimmedQuery)})`, "gi");
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let currentNode = walker.nextNode();

    while (currentNode) {
      textNodes.push(currentNode as Text);
      currentNode = walker.nextNode();
    }

    for (const textNode of textNodes) {
      const textValue = textNode.nodeValue ?? "";
      regex.lastIndex = 0;
      if (!regex.test(textValue)) {
        continue;
      }

      regex.lastIndex = 0;
      const fragment = doc.createDocumentFragment();
      let lastIndex = 0;
      let match = regex.exec(textValue);

      while (match) {
        const matchText = match[0];
        const start = match.index;
        const end = start + matchText.length;

        if (start > lastIndex) {
          fragment.appendChild(doc.createTextNode(textValue.slice(lastIndex, start)));
        }

        const mark = doc.createElement("mark");
        mark.style.backgroundColor = "#fde047";
        mark.style.padding = "0";
        mark.style.borderRadius = "2px";
        mark.textContent = matchText;
        fragment.appendChild(mark);

        lastIndex = end;
        match = regex.exec(textValue);
      }

      if (lastIndex < textValue.length) {
        fragment.appendChild(doc.createTextNode(textValue.slice(lastIndex)));
      }

      textNode.parentNode?.replaceChild(fragment, textNode);
    }

    return root.innerHTML;
  }

  /**
   * Loads all tags used by notes for UI selection/filtering.
   */
  async function fetchAllTags() {
    try {
      const tags = await api<Tag[]>("/api/tags");
      setAvailableTags(tags);
    } catch (error) {
      console.error("Failed to fetch tags:", error);
    }
  }

  /**
   * Loads persisted font-size preference for note content.
   */
  async function loadFontSize() {
    try {
      const response = await api<{ value: number | null }>("/api/config/font-size");
      const saved = response.value;
      if (typeof saved !== "number" || Number.isNaN(saved)) {
        setFontSize(DEFAULT_FONT_SIZE);
        return;
      }
      setFontSize(Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, saved)));
    } catch (error) {
      console.error("Failed to load font size:", error);
      setFontSize(DEFAULT_FONT_SIZE);
    }
  }

  /**
   * Loads persisted note column preference for the list layout.
   */
  async function loadNoteColumns() {
    try {
      const response = await api<{ value: 1 | 2 | null }>("/api/config/note-columns");
      if (response.value === 1 || response.value === 2) {
        setNoteColumnCount(response.value);
      } else {
        setNoteColumnCount(1);
      }
    } catch (error) {
      console.error("Failed to load note columns:", error);
      setNoteColumnCount(1);
    }
  }

  /**
   * Updates local font-size state and persists it server-side.
   */
  async function updateFontSize(nextFontSize: number) {
    const clamped = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, nextFontSize));
    setFontSize(clamped);

    try {
      await api<{ ok: true }>("/api/config/font-size", {
        method: "PUT",
        body: JSON.stringify({ value: clamped }),
      });
    } catch (error) {
      console.error("Failed to save font size:", error);
    }
  }

  /**
   * Updates note column layout and persists the selected mode.
   */
  async function updateNoteColumnCount(nextCount: 1 | 2) {
    setNoteColumnCount(nextCount);

    try {
      await api<{ ok: true }>("/api/config/note-columns", {
        method: "PUT",
        body: JSON.stringify({ value: nextCount }),
      });
    } catch (error) {
      console.error("Failed to save note columns:", error);
    }
  }

  /**
   * Scales UI font values according to current font-size preference.
   */
  function scale(baseSize: number): string {
    return `${Math.round(((baseSize / DEFAULT_FONT_SIZE) * fontSize) * 10) / 10}px`;
  }

  /**
   * Maps pixel font size to the nearest Quill size token.
   */
  function nearestQuillSize(targetPx: number): QuillSize {
    if (targetPx <= 12) return "small";
    if (targetPx <= 16) return false;
    if (targetPx <= 20) return "large";
    return "huge";
  }

  /**
   * Applies the selected font size across the current editor content.
   */
  function applyEditorSizeForFont(fontPx: number) {
    const editor = quillRef.current?.getEditor();
    if (!editor) return;

    const size = nearestQuillSize(fontPx);
    const length = editor.getLength();
    const selection = editor.getSelection();

    editor.formatText(0, length, "size", size, "silent");

    if (selection) {
      editor.setSelection(selection.index, selection.length, "silent");
    }
  }

  /**
   * Refreshes note list based on current text and tag filters.
   */
  async function refreshNotes() {
    const { textQuery, tagFilters } = parseSearchInput(searchQuery);

    if (textQuery) {
      await searchNotes(textQuery);
      if (tagFilters.length > 0) {
        setNotes((prev) =>
          prev.filter((note) =>
            tagFilters.every((tagFilter) =>
              note.tags.some((tag) => tag.name.toLowerCase() === tagFilter.toLowerCase())
            )
          )
        );
      }
      return;
    }

    if (tagFilters.length > 0) {
      const primaryTag = tagFilters[0];
      if (!primaryTag) {
        return;
      }
      await fetchNotesByTag(primaryTag);
      if (tagFilters.length > 1) {
        const remaining = tagFilters.slice(1).map((value) => value.toLowerCase());
        setNotes((prev) =>
          prev.filter((note) =>
            remaining.every((tagFilter) =>
              note.tags.some((tag) => tag.name.toLowerCase() === tagFilter)
            )
          )
        );
      }
      return;
    }

    await fetchRecentNotes();
  }

  /**
   * Creates or updates a note and synchronizes its tags.
   */
  async function saveNote() {
    const content = editorContent || "";
    const plainText = content.replace(/<[^>]*>/g, "").trim();

    if (!title.trim() || !plainText) {
      return;
    }

    setLoading(true);
    try {
      let noteId: number;

      if (editingNote) {
        await api<{ ok: true }>(`/api/notes/${editingNote.id}`, {
          method: "PUT",
          body: JSON.stringify({ title: title.trim(), content }),
        });
        noteId = editingNote.id;
      } else {
        const created = await api<{ id: number }>("/api/notes", {
          method: "POST",
          body: JSON.stringify({ title: title.trim(), content }),
        });
        noteId = created.id;
      }

      await api<{ ok: true }>(`/api/notes/${noteId}/tags`, {
        method: "PUT",
        body: JSON.stringify({ tagNames: selectedTags.map((tag) => tag.name) }),
      });

      setTitle("");
      setEditorContent("");
      setEditingNote(null);
      setSelectedTags([]);
      await fetchAllTags();
      await refreshNotes();
      close();
    } catch (error) {
      console.error("Failed to save note:", error);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Prepares and opens the note modal for creating a new note.
   */
  function openCreateModal() {
    setEditingNote(null);
    setTitle("");
    setEditorContent("");
    setSelectedTags([]);
    open();
  }

  /**
   * Prepares and opens the note modal for editing an existing note.
   */
  function openEditModal(note: Note) {
    setEditingNote(note);
    setTitle(note.title);
    setEditorContent(note.content);
    setSelectedTags(note.tags);
    open();
  }

  /**
   * Resets modal state and closes the note editor dialog.
   */
  function closeModal() {
    setEditingNote(null);
    setTitle("");
    setEditorContent("");
    setSelectedTags([]);
    setTagModalOpened(false);
    setTagInput("");
    close();
  }

  /**
   * Deletes a note by ID and refreshes notes/tags state.
   */
  async function deleteExistingNote(id: number) {
    try {
      await api<{ ok: true }>(`/api/notes/${id}`, { method: "DELETE" });
      await refreshNotes();
      await fetchAllTags();
    } catch (error) {
      console.error("Failed to delete note:", error);
    }
  }

  /**
   * Opens delete confirmation for the chosen note.
   */
  function requestDelete(note: Note) {
    setNoteToDelete(note);
  }

  /**
   * Confirms deletion of the pending note.
   */
  async function confirmDelete() {
    if (!noteToDelete) return;
    await deleteExistingNote(noteToDelete.id);
    setNoteToDelete(null);
  }

  /**
   * Generates a deterministic display color for ad-hoc tags.
   */
  function getTagColor(name: string): string {
    const normalized = name.toLowerCase();
    let hash = 0;
    for (let i = 0; i < normalized.length; i += 1) {
      hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
    }
    const hue = hash % 360;
    return `hsl(${hue} 70% 86%)`;
  }

  /**
   * Produces readable sidebar text color from a tag background color.
   */
  function getTagLinkColor(color: string): string {
    const hslMatch = color.match(/hsl\((\d+)\s+(\d+)%\s+(\d+)%\)/i);
    if (hslMatch) {
      const h = Number(hslMatch[1]);
      const s = Math.min(95, Math.max(75, Number(hslMatch[2]) + 20));
      return `hsl(${h} ${s}% 28%)`;
    }

    return "#1f2937";
  }

  /**
   * Adds or replaces a tag in the working selection list.
   */
  function addTagToList(
    rawName: string,
    tagsList: Tag[],
    replaceTagName?: string | null
  ): { ok: boolean; next: Tag[] } {
    const tagName = rawName.trim();
    if (!tagName) return { ok: false, next: tagsList };
    if (tagName.toLowerCase() === "all") return { ok: false, next: tagsList };

    const baseList =
      replaceTagName && replaceTagName.toLowerCase() !== tagName.toLowerCase()
        ? tagsList.filter((tag) => tag.name.toLowerCase() !== replaceTagName.toLowerCase())
        : tagsList;

    if (baseList.some((tag) => tag.name.toLowerCase() === tagName.toLowerCase())) {
      return { ok: true, next: baseList };
    }

    const existingTag = availableTags.find(
      (tag) => tag.name.toLowerCase() === tagName.toLowerCase()
    );

    if (existingTag) {
      return { ok: true, next: [...baseList, existingTag] };
    }

    return {
      ok: true,
      next: [...baseList, { id: -Date.now(), name: tagName, color: getTagColor(tagName) }],
    };
  }

  /**
   * Adds a tag in the modal while keeping the modal open.
   */
  function addTagAndStayOpen(rawName: string) {
    const result = addTagToList(rawName, pendingTags, recentlySelectedTagName);
    if (!result.ok) return;
    setPendingTags(result.next);
    setTagInput("");
    setRecentlySelectedTagName(null);
  }

  /**
   * Adds a tag, commits the selection, and closes the modal.
   */
  function confirmTagAndClose(rawName: string) {
    const result = addTagToList(rawName, pendingTags, recentlySelectedTagName);
    if (!result.ok) return;
    setSelectedTags(result.next);
    setTagInput("");
    setRecentlySelectedTagName(null);
    setTagModalOpened(false);
  }

  /**
   * Loads latest tags and opens the tag-selection modal.
   */
  async function openTagModal() {
    await fetchAllTags();
    setPendingTags(selectedTags);
    setTagInput("");
    setRecentlySelectedTagName(null);
    setTagModalOpened(true);
  }

  /**
   * Removes a selected tag by name from the note editor state.
   */
  function removeTagByName(tagName: string) {
    setSelectedTags((prev) =>
      prev.filter((tag) => tag.name.toLowerCase() !== tagName.toLowerCase())
    );
  }

  /**
   * Escapes user-supplied text before embedding into HTML strings.
   */
  function escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * Reads an uploaded file and returns a data URL.
   */
  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Converts selected files into attachment links appended to editor content.
   */
  async function attachFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    try {
      const links = await Promise.all(
        Array.from(files).map(async (file) => {
          const dataUrl = await readFileAsDataUrl(file);
          const safeName = escapeHtml(file.name);
          return `<p><a href=\"${dataUrl}\" data-filename=\"${safeName}\" rel=\"noopener noreferrer\">${safeName}</a></p>`;
        })
      );
      setEditorContent((prev) => `${prev || ""}${links.join("")}`);
    } catch (error) {
      console.error("Failed to attach files:", error);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  /**
   * Handles clicks on rendered note content (links and image preview).
   */
  function handleNoteContentClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;

    const anchor = target.closest("a") as HTMLAnchorElement | null;
    if (anchor && anchor.href) {
      e.preventDefault();
      window.open(anchor.href, "_blank", "noopener,noreferrer");
      return;
    }

    if (target.tagName.toLowerCase() !== "img") return;

    const img = target as HTMLImageElement;
    if (!img.src) return;
    setPreviewImageSrc(img.src);
  }

  /**
   * Formats ISO timestamps for human-readable note metadata.
   */
  function formatDate(isoString: string): string {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  }

  useEffect(() => {
    void fetchAllTags();
    void loadFontSize();
    void loadNoteColumns();
  }, []);

  useEffect(() => {
    if (!opened) return;
    const timer = setTimeout(() => {
      applyEditorSizeForFont(fontSize);
    }, 0);
    return () => clearTimeout(timer);
  }, [opened, fontSize, editorContent]);

  useEffect(() => {
    /**
     * Keyboard shortcuts for save/create/open-tag actions.
     */
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === "Enter") {
        if (opened && !tagModalOpened) {
          e.preventDefault();
          void saveNote();
        }
        return;
      }

      if (!e.ctrlKey) return;

      const key = e.key.toLowerCase();
      if (key === "n") {
        e.preventDefault();
        openCreateModal();
        return;
      }

      if (key === "t") {
        if (!opened) {
          return;
        }
        e.preventDefault();
        void openTagModal();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [opened, tagModalOpened, title, editorContent, editingNote, selectedTags, searchQuery]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void refreshNotes();
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const tagSuggestions = availableTags
    .filter((tag) => {
      const notSelected = !pendingTags.some(
        (selectedTag) => selectedTag.name.toLowerCase() === tag.name.toLowerCase()
      );
      if (!notSelected) return false;
      if (!tagInput.trim()) return true;
      return tag.name.toLowerCase().includes(tagInput.trim().toLowerCase());
    })
    .slice(0, 8);

  const canSubmitTag = tagInput.trim().length > 0 && tagInput.trim().toLowerCase() !== "all";
  const selectedLayoutColor = "#f4a7a7";
  const unselectedLayoutColor = "#fbe5e5";

  const { textQuery: activeTextQuery, tagFilters: activeTagFilters } = parseSearchInput(searchQuery);
  const modalCreatedAt = editingNote ? formatDate(editingNote.created_at) : formatDate(new Date().toISOString());
  const modalUpdatedAt = editingNote ? formatDate(editingNote.updated_at) : formatDate(new Date().toISOString());

  return (
    <Container size={970} py="xl" mx="auto">
      <Stack gap="xs" style={{ position: "fixed", top: "14px", right: "14px", zIndex: 250 }}>
        <Group gap="xs">
          <ActionIcon
            size="lg"
            variant="light"
            color="gray"
            radius="xl"
            onClick={() => updateFontSize(fontSize - FONT_SIZE_STEP)}
            disabled={fontSize <= MIN_FONT_SIZE}
            aria-label="Decrease font size"
          >
            <Text fw={700} style={{ fontSize: "11px", lineHeight: 1 }}>
              -A
            </Text>
          </ActionIcon>
          <ActionIcon
            size="lg"
            variant="light"
            color="gray"
            radius="xl"
            onClick={() => updateFontSize(fontSize + FONT_SIZE_STEP)}
            disabled={fontSize >= MAX_FONT_SIZE}
            aria-label="Increase font size"
          >
            <Text fw={700} style={{ fontSize: "16px", lineHeight: 1 }}>
              +A
            </Text>
          </ActionIcon>
        </Group>
        <Group gap={6} justify="center">
          <ActionIcon
            variant="filled"
            radius={3}
            size="xs"
            aria-label="Single column layout"
            onClick={() => void updateNoteColumnCount(1)}
            styles={{
              root: {
                width: "10px",
                height: "10px",
                minWidth: "10px",
                minHeight: "10px",
                padding: 0,
                backgroundColor: selectedLayoutColor,
                border: "1px solid #efb3b3",
              },
            }}
          />
          <ActionIcon
            variant="filled"
            radius={3}
            size="xs"
            aria-label="Two column layout"
            onClick={() => void updateNoteColumnCount(2)}
            styles={{
              root: {
                width: "10px",
                height: "10px",
                minWidth: "10px",
                minHeight: "10px",
                padding: 0,
                backgroundColor: noteColumnCount === 2 ? selectedLayoutColor : unselectedLayoutColor,
                border: "1px solid #efb3b3",
              },
            }}
          />
        </Group>
      </Stack>

      <Modal
        opened={opened}
        onClose={closeModal}
        withCloseButton={false}
        size={1034}
        centered
        styles={{
          content: { marginInline: "auto", overflow: "visible" },
          body: { paddingBottom: "0.75rem", overflow: "visible" },
        }}
      >
        <Stack gap="sm" style={{ maxHeight: "75vh", display: "flex", flexDirection: "column" }}>
          <Group gap="sm" wrap="nowrap" align="center">
            <IconNotebook size={24} />
            <TextInput
              placeholder="Enter note title"
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
              required
              size="xl"
              style={{ flex: 1 }}
              styles={{
                input: {
                  border: "none",
                  fontSize: scale(20),
                  fontWeight: 500,
                  padding: "0.25rem 0",
                },
              }}
            />
            <ActionIcon variant="subtle" color="gray" onClick={closeModal} aria-label="Close note modal">
              <IconX size={18} />
            </ActionIcon>
          </Group>
          <Divider mt={-12} />
          <Text size="xs" c="dimmed">
            Created on {modalCreatedAt}{"\u00A0\u00A0\u00A0\u00A0"}Modified on {modalUpdatedAt}
          </Text>
          <QuillEditor
            ref={quillRef}
            className="note-editor"
            theme="snow"
            value={editorContent}
            onChange={setEditorContent}
            modules={modules}
            formats={formats}
            style={{ height: "400px", marginBottom: "50px", borderRadius: "4px" }}
            placeholder="Start typing your note..."
          />
          <Divider mt={0} />
          <Group justify="space-between" align="center" style={{ marginTop: "-9px", marginBottom: "-9px" }}>
            <Group gap="xs" style={{ flex: 1, flexWrap: "wrap" }}>
              <Text fw={700} size="sm">
                Tags:
              </Text>
              {selectedTags.map((tag) => (
                <Group
                  key={tag.name.toLowerCase()}
                  gap={4}
                  wrap="nowrap"
                  align="center"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    backgroundColor: tag.color,
                    borderRadius: "7px",
                    padding: "2px 8px",
                  }}
                >
                  <Text size="xs" c="black" style={{ lineHeight: "16px", marginTop: 0, marginBottom: 1, marginLeft: 4 }}>
                    {tag.name}
                  </Text>
                  <ActionIcon
                    variant="transparent"
                    color="dark"
                    size="xs"
                    style={{ alignSelf: "center" }}
                    aria-label={`Remove tag ${tag.name}`}
                    onClick={() => removeTagByName(tag.name)}
                  >
                    <IconX size={10} />
                  </ActionIcon>
                </Group>
              ))}
            </Group>
            <ActionIcon
              size="lg"
              variant="light"
              color="gray"
              radius="xl"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach files"
            >
              <IconPaperclip size={16} />
            </ActionIcon>
            <ActionIcon
              size="lg"
              variant="light"
              color="blue"
              radius="xl"
              onClick={() => void openTagModal()}
              aria-label="Add tag"
            >
              <IconPlus size={16} />
            </ActionIcon>
          </Group>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={(e) => void attachFiles(e.currentTarget.files)}
          />
          <Divider mt={0} />
          <Group justify="center" gap="xs">
            <ActionIcon
              color="blue"
              variant="light"
              radius="xl"
              size="lg"
              onClick={() => void saveNote()}
              disabled={loading || !title.trim() || !editorContent.replace(/<[^>]*>/g, "").trim()}
              aria-label={editingNote ? "Save changes" : "Create note"}
            >
              <IconCheck size={18} />
            </ActionIcon>
            <ActionIcon
              color="gray"
              variant="light"
              radius="xl"
              size="lg"
              onClick={closeModal}
              disabled={loading}
              aria-label="Cancel changes"
            >
              <IconX size={18} />
            </ActionIcon>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={tagModalOpened}
        onClose={() => {
          setTagModalOpened(false);
          setTagInput("");
          setPendingTags(selectedTags);
          setRecentlySelectedTagName(null);
        }}
        title={<Text fw={500} style={{ fontSize: scale(18) }}>Add tag</Text>}
        centered
        size="sm"
      >
        <Stack gap="sm">
          <Autocomplete
            placeholder="Type a tag name"
            value={tagInput}
            onChange={setTagInput}
            onOptionSubmit={(value) => {
              const result = addTagToList(value, pendingTags);
              if (!result.ok) return;
              setPendingTags(result.next);
              setTagInput(value);
              setRecentlySelectedTagName(value);
            }}
            autoFocus
            data-autofocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (canSubmitTag) {
                  confirmTagAndClose(tagInput);
                }
              }
            }}
            data={availableTags
              .map((tag) => tag.name)
              .filter((name) => {
                if (!tagInput.trim()) return true;
                return name.toLowerCase().includes(tagInput.trim().toLowerCase());
              })}
            limit={8}
          />
          <Stack gap={4}>
            {tagSuggestions.map((tag) => (
              <Button
                key={tag.id}
                variant="subtle"
                color="gray"
                justify="flex-start"
                onClick={() => addTagAndStayOpen(tag.name)}
              >
                {tag.name}
              </Button>
            ))}
          </Stack>
          <Group justify="center" gap="xs">
            <ActionIcon
              color="blue"
              variant="light"
              radius="xl"
              size="lg"
              onClick={() => confirmTagAndClose(tagInput)}
              disabled={!canSubmitTag}
              aria-label="Add tag"
            >
              <IconCheck size={16} />
            </ActionIcon>
            <ActionIcon
              color="gray"
              variant="light"
              radius="xl"
              size="lg"
              onClick={() => {
                setTagModalOpened(false);
                setTagInput("");
                setPendingTags(selectedTags);
                setRecentlySelectedTagName(null);
              }}
              aria-label="Cancel add tag"
            >
              <IconX size={16} />
            </ActionIcon>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={noteToDelete !== null} onClose={() => setNoteToDelete(null)} withCloseButton={false} centered size="sm">
        <Stack gap="md">
          <Text size="sm">Delete note "{noteToDelete?.title}"?</Text>
          <Group justify="center" gap="xs">
            <ActionIcon color="blue" variant="light" radius="xl" size="lg" onClick={() => void confirmDelete()} aria-label="Confirm delete note">
              <IconCheck size={16} />
            </ActionIcon>
            <ActionIcon color="gray" variant="light" radius="xl" size="lg" onClick={() => setNoteToDelete(null)} aria-label="Cancel delete note">
              <IconX size={16} />
            </ActionIcon>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={previewImageSrc !== null}
        onClose={() => setPreviewImageSrc(null)}
        centered
        withCloseButton={false}
        size="auto"
        styles={{ body: { padding: 0 } }}
      >
        <div style={{ maxWidth: "90vw", maxHeight: "85vh", overflow: "auto" }}>
          {previewImageSrc && (
            <img
              src={previewImageSrc}
              alt="Note attachment preview"
              style={{
                display: "block",
                maxWidth: "none",
                maxHeight: "none",
                width: "auto",
                height: "auto",
                margin: "0 auto",
              }}
            />
          )}
        </div>
      </Modal>

      <div style={{ position: "relative" }}>
        <Stack gap="xs" className="tags-sidebar">
          <Text
            component="a"
            href="#"
            size="sm"
            fw={activeTagFilters.length === 0 ? 700 : 500}
            c={activeTagFilters.length === 0 ? "blue" : "dimmed"}
            style={{ textDecoration: "none" }}
            onClick={(e) => {
              e.preventDefault();
              setSearchQuery((prev) => prev.replace(/#[^\s#]+/g, " ").replace(/\s+/g, " ").trim());
            }}
          >
            #all
          </Text>
          {availableTags.map((tag) => (
            <Text
              key={tag.id}
              component="a"
              href="#"
              size="sm"
              fw={activeTagFilters.some((value) => value.toLowerCase() === tag.name.toLowerCase()) ? 700 : 500}
              style={{ textDecoration: "none", color: getTagLinkColor(tag.color) }}
              onClick={(e) => {
                e.preventDefault();
                setSearchQuery((prev) => appendTagToSearch(prev, tag.name));
              }}
            >
              #{tag.name}
            </Text>
          ))}
        </Stack>

        <Stack gap="md" className="notes-layout">
          <Group justify="space-between" align="center">
            <TextInput
              placeholder="Search notes by title, content, or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.currentTarget.value)}
              size="md"
              radius="md"
              style={{ flex: 1 }}
              styles={{ input: { borderColor: "#eceff1", fontSize: scale(14) } }}
            />
            <ActionIcon size="lg" variant="light" color="blue" radius="xl" onClick={openCreateModal} aria-label="Create note">
              <IconPlus size={18} />
            </ActionIcon>
          </Group>

          {notes.length === 0 ? (
            <Text c="dimmed" ta="center" size="lg" mt="xl">
              {searchQuery.trim()
                ? "No matching notes found."
                : "No notes yet. Click the + button to create your first note!"}
            </Text>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: noteColumnCount === 2 ? "repeat(2, minmax(0, 1fr))" : "1fr",
                gap: "16px",
              }}
            >
              {notes.map((note) => (
                <Card key={note.id} shadow="sm" padding="lg" radius="md" withBorder style={{ borderColor: "#eceff1" }}>
                  <Group justify="space-between" mb="xs">
                    <Text fw={500} style={{ fontSize: scale(18) }}>
                      {highlightPlainText(note.title, activeTextQuery)}
                    </Text>
                    <Group gap="xs">
                      <ActionIcon color="blue" variant="light" radius="xl" onClick={() => openEditModal(note)} aria-label="Edit note">
                        <IconPencil size={18} />
                      </ActionIcon>
                      <ActionIcon color="red" variant="light" radius="xl" onClick={() => requestDelete(note)} aria-label="Delete note">
                        <IconTrash size={18} />
                      </ActionIcon>
                    </Group>
                  </Group>
                  <Text c="dimmed" mb="md" style={{ fontSize: scale(12.5) }}>
                    Modified on {formatDate(note.updated_at)}
                  </Text>
                  {note.tags.length > 0 && (
                    <Group gap="xs" mb="sm" style={{ flexWrap: "wrap" }}>
                      {note.tags.map((tag) => (
                        <Group
                          key={tag.id}
                          gap={4}
                          wrap="nowrap"
                          align="center"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            backgroundColor: tag.color,
                            borderRadius: "7px",
                            padding: "2px 8px",
                          }}
                        >
                          <Text size="xs" c="black" style={{ lineHeight: "16px", marginTop: 0, marginBottom: 1, marginLeft: 0 }}>
                            {tag.name}
                          </Text>
                        </Group>
                      ))}
                    </Group>
                  )}
                  <div
                    className="ql-editor note-content"
                    dangerouslySetInnerHTML={{ __html: highlightHtmlContent(note.content, activeTextQuery) }}
                    onClick={handleNoteContentClick}
                    style={{ fontSize: `${fontSize}px` }}
                  />
                </Card>
              ))}
            </div>
          )}
        </Stack>
      </div>
    </Container>
  );
}
