"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type CSSProperties,
} from "react";
import type Quill from "quill";

export interface QuillEditorHandle {
  getEditor: () => Quill | null;
}

interface QuillEditorProps {
  className?: string;
  style?: CSSProperties;
  theme?: string;
  value: string;
  onChange: (value: string) => void;
  modules?: Record<string, unknown>;
  formats?: string[];
  placeholder?: string;
}

const QuillEditor = forwardRef<QuillEditorHandle, QuillEditorProps>(
  ({ className, style, theme = "snow", value, onChange, modules, formats, placeholder }, ref) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const quillRef = useRef<Quill | null>(null);
    const onChangeRef = useRef(onChange);
    const syncingRef = useRef(false);

    useLayoutEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

    useImperativeHandle(
      ref,
      () => ({
        getEditor: () => quillRef.current,
      }),
      []
    );

    useEffect(() => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const mountContainer = container;

      let cancelled = false;

      /**
       * Lazily initializes Quill on the client and wires change events.
       */
      async function setup(): Promise<void> {
        const { default: QuillClass } = await import("quill");
        if (cancelled) {
          return;
        }

        const editorRoot = mountContainer.ownerDocument.createElement("div");
        mountContainer.appendChild(editorRoot);

        const quillOptions: Record<string, unknown> = { theme };
        if (modules) {
          quillOptions["modules"] = modules;
        }
        if (formats) {
          quillOptions["formats"] = formats;
        }
        if (placeholder) {
          quillOptions["placeholder"] = placeholder;
        }

        const quill = new QuillClass(editorRoot, quillOptions);

        quillRef.current = quill;

        if (value) {
          quill.clipboard.dangerouslyPasteHTML(value, "silent");
        }

        quill.on("text-change", () => {
          if (syncingRef.current) {
            return;
          }
          onChangeRef.current(quill.root.innerHTML);
        });
      }

      void setup();

      return () => {
        cancelled = true;
        quillRef.current = null;
        mountContainer.innerHTML = "";
      };
    }, []);

    useEffect(() => {
      const quill = quillRef.current;
      if (!quill) {
        return;
      }

      const current = quill.root.innerHTML;
      const next = value || "";
      if (current === next) {
        return;
      }

      syncingRef.current = true;
      const selection = quill.getSelection();
      if (next) {
        quill.clipboard.dangerouslyPasteHTML(next, "silent");
      } else {
        quill.setText("", "silent");
      }
      if (selection) {
        quill.setSelection(selection.index, selection.length, "silent");
      }
      syncingRef.current = false;
    }, [value]);

    return <div className={className} style={style} ref={containerRef} />;
  }
);

QuillEditor.displayName = "QuillEditor";

export default QuillEditor;
