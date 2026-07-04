/**
 * The Notion-like body editor: BlockNote (block-based WYSIWYG) with a
 * Markdown round-trip. Content is stored as Markdown in git; the editor
 * parses it into blocks on load and serialises back on every change.
 */
import { useEffect, useRef } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

interface Props {
  /** Markdown to load. Changing `documentKey` reloads it. */
  initialMarkdown: string;
  documentKey: string;
  onMarkdownChange: (markdown: string) => void;
}

export function MarkdownEditor({ initialMarkdown, documentKey, onMarkdownChange }: Props) {
  const editor = useCreateBlockNote();
  const loadedKey = useRef<string | null>(null);

  useEffect(() => {
    if (loadedKey.current === documentKey) return;
    loadedKey.current = documentKey;
    let cancelled = false;
    // Sync in current BlockNote, async in older versions — accept both.
    void Promise.resolve(editor.tryParseMarkdownToBlocks(initialMarkdown)).then((blocks) => {
      if (!cancelled) editor.replaceBlocks(editor.document, blocks);
    });
    return () => {
      cancelled = true;
    };
  }, [editor, documentKey, initialMarkdown]);

  return (
    <BlockNoteView
      editor={editor}
      theme={matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"}
      onChange={() => {
        void Promise.resolve(editor.blocksToMarkdownLossy()).then(onMarkdownChange);
      }}
    />
  );
}
