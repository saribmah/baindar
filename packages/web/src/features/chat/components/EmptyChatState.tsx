type Props = {
  onCreate: () => void;
};

// Right-pane content when no conversation is selected. Shown both on
// first visit (no conversations) and after the user deletes their last
// thread. The "+ New" button here is the primary call-to-action; the
// sidebar's button is the same action but secondary by placement.
export function EmptyChatState({ onCreate }: Props) {
  return (
    <main className="flex flex-1 items-center justify-center bg-bd-bg text-bd-fg">
      <div className="flex flex-col items-center gap-3">
        <p className="text-sm text-bd-fg-muted">No conversation selected.</p>
        <button
          type="button"
          onClick={onCreate}
          className="rounded border border-bd-border px-4 py-2 text-sm hover:bg-bd-bg-muted"
        >
          + Start a new conversation
        </button>
      </div>
    </main>
  );
}
