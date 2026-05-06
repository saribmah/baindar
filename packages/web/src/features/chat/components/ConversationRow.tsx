import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { Conversation } from "@baindar/sdk";

type Props = {
  conversation: Conversation;
  active: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
};

// Single row in the conversations sidebar. Two display modes — readonly
// label or inline rename input — toggled by the row's local menu. The
// menu itself is a tiny popover with Rename / Delete; clicking outside
// closes it.
export function ConversationRow({ conversation, active, onSelect, onRename, onDelete }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conversation.title);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Sync draft when the conversation row prop changes (e.g. after a
  // server-side rename from another tab).
  useEffect(() => {
    if (!editing) setDraft(conversation.title);
  }, [conversation.title, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  // Close the menu on outside click. We rely on capture-phase mousedown
  // so the click that opens another row's menu also closes ours.
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const beginRename = () => {
    setMenuOpen(false);
    setDraft(conversation.title);
    setEditing(true);
  };

  const cancelRename = () => {
    setEditing(false);
    setDraft(conversation.title);
  };

  const submitRename = (e?: FormEvent) => {
    e?.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || trimmed === conversation.title) {
      cancelRename();
      return;
    }
    onRename(trimmed);
    setEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancelRename();
    }
  };

  const confirmAndDelete = () => {
    setMenuOpen(false);
    if (window.confirm(`Delete "${conversation.title}"? This cannot be undone.`)) {
      onDelete();
    }
  };

  if (editing) {
    return (
      <li className="px-2 py-1">
        <form onSubmit={submitRename} className="flex">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => submitRename()}
            className="flex-1 rounded border border-bd-fg-muted bg-transparent px-2 py-1 text-sm outline-none"
          />
        </form>
      </li>
    );
  }

  return (
    <li
      className={`group flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm ${
        active ? "bg-bd-bg-muted" : "hover:bg-bd-bg-muted/50"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex-1 truncate text-left"
        title={conversation.title}
      >
        {conversation.title}
      </button>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          aria-label="Conversation actions"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className={`rounded px-1 text-xs text-bd-fg-muted transition-opacity hover:text-bd-fg ${
            active || menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          ⋯
        </button>
        {menuOpen ? (
          <div className="absolute right-0 top-full z-10 mt-1 w-32 overflow-hidden rounded border border-bd-border bg-bd-bg shadow-md">
            <button
              type="button"
              onClick={beginRename}
              className="block w-full px-3 py-1.5 text-left text-xs hover:bg-bd-bg-muted"
            >
              Rename
            </button>
            <button
              type="button"
              onClick={confirmAndDelete}
              className="block w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-bd-bg-muted"
            >
              Delete
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}
