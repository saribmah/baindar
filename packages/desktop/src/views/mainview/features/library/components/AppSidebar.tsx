import { useEffect, useState, type ComponentType } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Button, IconButton, Icons, Wordmark } from "@baindar/ui";
import type { Shelf } from "@baindar/sdk";
import { ProfileMenuButton } from "../../profile";
import { UploadDropTarget } from "./UploadDropTarget";
import { shelfPath } from "../utils/shelf";

type IconComponent = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

type NavItem = {
  icon: IconComponent;
  name: string;
  to?: string;
  count?: number;
};

export function AppSidebar({
  totalCount,
  highlightsCount,
  notesCount,
  conversationsCount = 0,
  reader,
  uploading,
  onUpload,
  shelves,
  activeShelfId,
  onCreateShelf,
}: {
  totalCount: number;
  highlightsCount: number;
  notesCount?: number;
  conversationsCount?: number;
  reader: string;
  uploading: boolean;
  onUpload: (file: File) => void;
  shelves?: ReadonlyArray<Shelf> | null;
  activeShelfId?: string | null;
  onCreateShelf?: () => void;
}) {
  const [shelvesOpen, setShelvesOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const customShelfCount =
    typeof shelves?.length === "number" ? Math.max(shelves.length - 2, 0) : null;

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

  const items: NavItem[] = [
    { icon: Icons.Home, name: "Home", to: "/dashboard" },
    { icon: Icons.Library, name: "Library", to: "/library", count: totalCount },
    { icon: Icons.Sparkles, name: "Conversations", count: conversationsCount },
    { icon: Icons.Highlight, name: "Highlights", to: "/highlights", count: highlightsCount },
    { icon: Icons.Note, name: "Notes", to: "/notes", count: notesCount },
  ];

  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-30 inline-flex h-10 w-10 items-center justify-center rounded-full border border-bd-border bg-bd-bg text-bd-fg shadow-sm transition-colors hover:bg-bd-surface-hover lg:hidden"
      >
        <Icons.Menu size={20} color="currentColor" />
      </button>

      {mobileOpen && (
        <div
          aria-hidden="true"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      )}

      <aside
        className={[
          "fixed inset-y-0 left-0 z-50 flex w-[260px] shrink-0 flex-col gap-5 border-r border-bd-border bg-bd-bg px-[18px] py-6 shadow-xl transition-transform duration-200 ease-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "lg:static lg:z-auto lg:w-[230px] lg:translate-x-0 lg:shadow-none",
        ].join(" ")}
        aria-label="Primary navigation"
      >
        <div className="flex items-center justify-between lg:block">
          <Wordmark size="md" />
          <IconButton
            aria-label="Close menu"
            size="sm"
            onClick={() => setMobileOpen(false)}
            className="lg:hidden"
          >
            <Icons.Close size={18} />
          </IconButton>
        </div>

        <UploadDropTarget uploading={uploading} onFile={onUpload}>
          {({ browse }) => (
            <Button
              size="md"
              iconStart={<Icons.Plus size={16} />}
              onClick={(event) => {
                event.stopPropagation();
                browse();
              }}
              className="w-full justify-start"
            >
              {uploading ? "Uploading..." : "Add to library"}
            </Button>
          )}
        </UploadDropTarget>

        <nav className="flex flex-col gap-0.5" aria-label="Primary">
          {items.map((item) => (
            <SidebarNavItem key={item.name} item={item} />
          ))}
        </nav>

        <div className="h-px bg-bd-border" />

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mb-2.5 flex items-center justify-between px-1">
            <button
              type="button"
              onClick={() => setShelvesOpen((open) => !open)}
              aria-expanded={shelvesOpen}
              className="t-label-s flex items-center gap-1.5 rounded-md border-0 bg-transparent px-2 py-1 text-bd-fg-muted hover:text-bd-fg-subtle"
            >
              <span
                className="inline-flex items-center justify-center transition-transform"
                style={{ transform: shelvesOpen ? "rotate(0deg)" : "rotate(-90deg)" }}
              >
                <Icons.Chevron size={11} color="currentColor" />
              </span>
              SHELVES
              {customShelfCount !== null && ` · ${customShelfCount}`}
            </button>
            {onCreateShelf && (
              <button
                type="button"
                aria-label="Create shelf"
                className="flex h-6 w-6 items-center justify-center rounded-full border-0 bg-transparent text-bd-fg-subtle hover:bg-bd-surface-hover"
                onClick={onCreateShelf}
              >
                <Icons.Plus size={13} color="currentColor" />
              </button>
            )}
          </div>

          {shelvesOpen && (
            <div className="flex flex-col gap-0.5">
              {(shelves ?? []).map((shelf, index) => (
                <SidebarShelfItem
                  key={shelf.id}
                  shelf={shelf}
                  index={index}
                  activeShelfId={activeShelfId}
                />
              ))}
              {shelves === null && (
                <div className="px-3 py-2 text-[13px] text-bd-fg-muted">Loading shelves...</div>
              )}
              {shelves && shelves.length <= 2 && onCreateShelf && (
                <button
                  type="button"
                  className="flex items-center gap-2.5 rounded-md border-0 bg-transparent px-3 py-2 text-left text-bd-accent hover:bg-bd-surface-hover"
                  onClick={onCreateShelf}
                >
                  <Icons.Plus size={13} color="currentColor" />
                  <span className="t-body-m text-[13px] font-semibold">New shelf</span>
                </button>
              )}
            </div>
          )}
        </div>

        <ProfileMenuButton reader={reader} />
      </aside>
    </>
  );
}

function SidebarNavItem({ item }: { item: NavItem }) {
  const Icon = item.icon;
  const body = (active: boolean) => (
    <>
      <Icon size={18} color={active ? "var(--bd-fg)" : "var(--bd-fg-subtle)"} />
      <span className="t-label-m flex-1">{item.name}</span>
      {item.count !== undefined && (
        <span className="font-mono text-[11px] text-bd-fg-muted">{item.count}</span>
      )}
    </>
  );

  if (item.to) {
    return (
      <NavLink
        to={item.to}
        end={item.to === "/library"}
        className={({ isActive }) =>
          [
            "flex items-center gap-2.5 rounded-md px-3 py-2 text-left no-underline transition-colors",
            isActive
              ? "bg-bd-surface-raised text-bd-fg"
              : "text-bd-fg-subtle hover:bg-bd-surface-hover",
          ].join(" ")
        }
      >
        {({ isActive }) => body(isActive)}
      </NavLink>
    );
  }

  return (
    <button
      type="button"
      className="flex items-center gap-2.5 rounded-md border-0 bg-transparent px-3 py-2 text-left text-bd-fg-subtle transition-colors hover:bg-bd-surface-hover"
    >
      {body(false)}
    </button>
  );
}

function SidebarShelfItem({
  shelf,
  index,
  activeShelfId,
}: {
  shelf: Shelf;
  index: number;
  activeShelfId?: string | null;
}) {
  const smart = shelf.kind === "smart";
  return (
    <NavLink
      to={shelfPath(shelf)}
      className={({ isActive }) =>
        [
          "flex items-center gap-2.5 rounded-md px-3 py-2 text-left no-underline transition-colors",
          index === 2 ? "mt-1 border-t border-bd-border pt-3" : "",
          isActive || activeShelfId === shelf.id
            ? "bg-bd-surface-raised text-bd-fg"
            : "text-bd-fg-subtle hover:bg-bd-surface-hover",
        ].join(" ")
      }
    >
      {({ isActive }) => {
        const active = isActive || activeShelfId === shelf.id;
        return (
          <>
            {smart ? (
              <span className="font-mono text-[9px] text-bd-fg-muted">—</span>
            ) : (
              <Icons.Bookmark
                size={13}
                color={active ? "var(--bd-accent)" : "var(--bd-fg-muted)"}
              />
            )}
            <span
              className={[
                "t-body-m min-w-0 flex-1 truncate text-[13px]",
                active ? "font-semibold" : "",
              ].join(" ")}
            >
              {shelf.name}
            </span>
            <span className="font-mono text-[11px] text-bd-fg-muted">{shelf.itemCount}</span>
          </>
        );
      }}
    </NavLink>
  );
}
