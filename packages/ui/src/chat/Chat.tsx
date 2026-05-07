import {
  useState,
  type ButtonHTMLAttributes,
  type FormEvent,
  type FormHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Icons } from "../icons/index.ts";
import { cx } from "../utils/cx.ts";
import type {
  ChatAction,
  ChatAttachment,
  ChatCitation,
  ChatConversationSummary,
  ChatReference,
  ChatToolCall,
  ChatToolKind,
  ChatToolResult,
  ChatToolState,
} from "./types.ts";

type DivProps = HTMLAttributes<HTMLDivElement>;

export type ChatAssistantHeaderProps = DivProps & {
  label?: string;
  sub?: string;
  size?: "sm" | "md";
};

export function ChatAssistantHeader({
  label = "Baindar",
  sub,
  size = "md",
  className,
  ...rest
}: ChatAssistantHeaderProps) {
  return (
    <div className={cx("bd-chat-assistant-header", className)} data-size={size} {...rest}>
      <span className="bd-chat-assistant-avatar" aria-hidden>
        <Icons.Sparkles size={size === "sm" ? 12 : 14} />
      </span>
      <span className="bd-chat-assistant-name">{label}</span>
      {sub && <span className="bd-chat-assistant-sub">· {sub}</span>}
    </div>
  );
}

export type ChatUserTurnProps = DivProps & {
  attachment?: ChatAttachment | null;
  references?: ReadonlyArray<ChatReference>;
  children: ReactNode;
};

export function ChatUserTurn({
  attachment,
  references,
  children,
  className,
  ...rest
}: ChatUserTurnProps) {
  return (
    <div className={cx("bd-chat-user-turn", className)} {...rest}>
      <div className="bd-chat-user-stack">
        {attachment && <ChatAttachmentBlock attachment={attachment} />}
        {references && references.length > 0 && <ChatReferenceList references={references} />}
        <div className="bd-chat-user-bubble">
          {typeof children === "string" ? <ChatMarkdown>{children}</ChatMarkdown> : children}
        </div>
      </div>
    </div>
  );
}

export function ChatReferenceList({ references }: { references: ReadonlyArray<ChatReference> }) {
  return (
    <div className="bd-chat-reference-list" aria-label="Message references">
      {references.map((reference) => (
        <ChatReferenceChip key={reference.id} reference={reference} />
      ))}
    </div>
  );
}

export function ChatReferenceChip({ reference }: { reference: ChatReference }) {
  const content = (
    <>
      <span
        aria-hidden
        className="bd-chat-reference-dot"
        style={{ background: reference.color ?? "var(--bd-accent)" }}
      />
      <span className="bd-chat-reference-main">
        <span className="bd-chat-reference-label">{reference.label}</span>
        {reference.description && (
          <span className="bd-chat-reference-description">{reference.description}</span>
        )}
      </span>
    </>
  );

  return (
    <span className="bd-chat-reference">
      {reference.onOpen ? (
        <button
          type="button"
          className="bd-chat-reference-open"
          aria-label={`Open ${reference.label}`}
          onClick={reference.onOpen}
        >
          {content}
        </button>
      ) : (
        <span className="bd-chat-reference-open">{content}</span>
      )}
      {reference.onRemove && (
        <button
          type="button"
          aria-label={`Remove ${reference.label}`}
          className="bd-chat-reference-remove"
          onClick={reference.onRemove}
        >
          <Icons.Close size={10} />
        </button>
      )}
    </span>
  );
}

export function ChatAttachmentBlock({ attachment }: { attachment: ChatAttachment }) {
  return (
    <div
      className="bd-chat-attachment"
      style={{ borderLeftColor: attachment.color ?? "var(--hl-pink)" }}
    >
      <span className="bd-chat-attachment-label">{attachment.label}</span>
      <span className="bd-chat-attachment-text">"{attachment.text}"</span>
    </div>
  );
}

export type ChatAssistantTurnProps = DivProps & {
  sub?: string;
  label?: string;
  actions?: ReadonlyArray<ChatAction>;
  footerCitations?: ReadonlyArray<ChatCitation | string>;
  tools?: ReadonlyArray<ChatToolCall>;
  streaming?: boolean;
  children: ReactNode;
};

export function ChatAssistantTurn({
  sub,
  label,
  actions,
  footerCitations,
  tools,
  streaming,
  children,
  className,
  ...rest
}: ChatAssistantTurnProps) {
  return (
    <div className={cx("bd-chat-assistant-turn", className)} {...rest}>
      <ChatAssistantHeader label={label} sub={sub} />
      {tools?.map((tool, index) => (
        <ChatToolCard key={tool.id ?? index} tool={tool} />
      ))}
      <div className="bd-chat-assistant-body">
        {typeof children === "string" ? <ChatMarkdown>{children}</ChatMarkdown> : children}
        {streaming && <span className="bd-chat-caret" aria-hidden />}
      </div>
      {footerCitations && footerCitations.length > 0 && (
        <div className="bd-chat-footer-citations" aria-label="Sources">
          <span className="bd-chat-footer-citations-label">FROM</span>
          {footerCitations.map((citation, index) => (
            <ChatFooterCitation key={citationKey(citation, index)} citation={citation} />
          ))}
        </div>
      )}
      {actions && actions.length > 0 && <ChatActions actions={actions} />}
    </div>
  );
}

export function ChatStreamingTurn({ children }: { children: ReactNode }) {
  return (
    <ChatAssistantTurn sub="streaming" streaming actions={[]}>
      {children}
    </ChatAssistantTurn>
  );
}

export type ChatMarkdownProps = DivProps & {
  children: string;
};

const markdownComponents: Components = {
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
};

export function ChatMarkdown({ children, className, ...rest }: ChatMarkdownProps) {
  return (
    <div className={cx("bd-chat-markdown", className)} {...rest}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

export type ChatErrorTurnProps = {
  title?: string;
  message?: string;
  retryLabel?: string;
  dismissLabel?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
};

export function ChatErrorTurn({
  title = "Connection lost halfway through",
  message = "Baindar could not finish the answer. Try again and the existing context will stay in place.",
  retryLabel = "Retry",
  dismissLabel = "Dismiss",
  onRetry,
  onDismiss,
}: ChatErrorTurnProps) {
  return (
    <div className="bd-chat-error-turn">
      <ChatAssistantHeader sub="couldn't finish" />
      <div className="bd-chat-error-card">
        <span className="bd-chat-error-mark" aria-hidden>
          !
        </span>
        <div className="bd-chat-error-body">
          <span className="bd-chat-error-title">{title}</span>
          <p>{message}</p>
          <div className="bd-chat-error-actions">
            {onRetry && (
              <button
                type="button"
                className="bd-btn bd-btn-pill bd-btn-secondary bd-btn-sm"
                onClick={onRetry}
              >
                <Icons.Reply size={11} />
                {retryLabel}
              </button>
            )}
            {onDismiss && (
              <button
                type="button"
                className="bd-btn bd-btn-pill bd-btn-ghost bd-btn-sm"
                onClick={onDismiss}
              >
                {dismissLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export type ChatCitationProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  citation: ChatCitation;
};

export function ChatCitationChip({ citation, className, ...rest }: ChatCitationProps) {
  return (
    <button type="button" className={cx("bd-chat-citation", className)} {...rest}>
      {citationLabel(citation)}
    </button>
  );
}

export type ChatToolCardProps = DivProps & {
  tool: ChatToolCall;
  onToggle?: () => void;
};

export function ChatToolCard({ tool, onToggle, className, ...rest }: ChatToolCardProps) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const config = toolConfig(tool.kind);
  const expanded = tool.expanded ?? localExpanded;
  const expandable = tool.state === "success" && (tool.results?.length ?? 0) > 0;
  const subtitle = toolSubtitle(tool);
  const title = tool.title ?? config.label;

  const handleToggle = () => {
    onToggle?.();
    if (tool.expanded === undefined) setLocalExpanded((value) => !value);
  };

  return (
    <div className={cx("bd-chat-tool-card", className)} data-state={tool.state} {...rest}>
      <div className="bd-chat-tool-row">
        <config.Icon size={14} className="bd-chat-tool-icon" />
        <span className="bd-chat-tool-title">{title}</span>
        {subtitle && <span className="bd-chat-tool-sub">· {subtitle}</span>}
        <span className="bd-chat-tool-spacer" />
        <ChatToolStatus state={tool.state} />
        {expandable && (
          <button
            type="button"
            aria-label={expanded ? "Collapse tool results" : "Expand tool results"}
            aria-expanded={expanded}
            className="bd-chat-tool-toggle"
            onClick={handleToggle}
          >
            <Icons.Chevron size={11} />
          </button>
        )}
      </div>
      {expanded && tool.results && tool.results.length > 0 && (
        <div className="bd-chat-tool-results">
          {tool.results.map((result, index) => (
            <ToolResultRow key={result.label ?? index} result={result} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatToolStatus({ state }: { state: ChatToolState }) {
  return <span className="bd-chat-tool-status" data-state={state} aria-label={state} />;
}

export type ChatComposerProps = Omit<FormHTMLAttributes<HTMLFormElement>, "onSubmit"> & {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  context?: ChatAttachment | null;
  references?: ReadonlyArray<ChatReference>;
  suggestions?: ReadonlyArray<string>;
  disabled?: boolean;
  submitting?: boolean;
  sendLabel?: string;
  onClearContext?: () => void;
  onSuggestionPress?: (suggestion: string) => void;
};

export function ChatComposer({
  value,
  onValueChange,
  onSubmit,
  placeholder = "Ask about anything in the book...",
  context,
  references,
  suggestions,
  disabled,
  submitting,
  sendLabel = "Send",
  onClearContext,
  onSuggestionPress,
  className,
  ...rest
}: ChatComposerProps) {
  const canSend = value.trim().length > 0 && !disabled && !submitting;

  const submitValue = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!canSend) return;
    onSubmit(value.trim());
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitValue();
    }
  };

  return (
    <form className={cx("bd-chat-composer", className)} onSubmit={submitValue} {...rest}>
      {suggestions && suggestions.length > 0 && (
        <div className="bd-chat-suggestions">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="bd-chat-suggestion"
              onClick={() => onSuggestionPress?.(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
      <div className="bd-chat-composer-box">
        {context && (
          <div
            className="bd-chat-composer-context"
            style={{ borderLeftColor: context.color ?? "var(--hl-pink)" }}
          >
            <span className="bd-chat-composer-context-label">{context.label}</span>
            <span className="bd-chat-composer-context-text">"{context.text}"</span>
            {onClearContext && (
              <button type="button" aria-label="Remove attached passage" onClick={onClearContext}>
                <Icons.Close size={11} />
              </button>
            )}
          </div>
        )}
        {references && references.length > 0 && <ChatReferenceList references={references} />}
        <div className="bd-chat-composer-row">
          <textarea
            value={value}
            disabled={disabled || submitting}
            placeholder={placeholder}
            rows={1}
            className="bd-chat-composer-input"
            onChange={(event) => onValueChange(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
          />
          <button type="button" className="bd-chat-composer-icon" aria-label="Voice input" disabled>
            <Icons.Mic size={16} />
          </button>
          <button
            type="submit"
            className="bd-chat-composer-send"
            disabled={!canSend}
            aria-label={sendLabel}
          >
            <Icons.Send size={14} />
          </button>
        </div>
      </div>
    </form>
  );
}

export type ChatThreadProps = DivProps & {
  children: ReactNode;
};

export function ChatThread({ children, className, ...rest }: ChatThreadProps) {
  return (
    <div className={cx("bd-chat-thread", className)} {...rest}>
      {children}
    </div>
  );
}

export type ChatPanelHeaderProps = DivProps & {
  label?: string;
  sub?: string;
  onClose?: () => void;
  onMore?: () => void;
};

export function ChatPanelHeader({
  label = "Baindar",
  sub,
  onClose,
  onMore,
  className,
  ...rest
}: ChatPanelHeaderProps) {
  return (
    <header className={cx("bd-chat-panel-header", className)} {...rest}>
      <ChatAssistantHeader label={label} sub={sub} size="sm" />
      <span className="bd-chat-panel-header-spacer" />
      {onMore && (
        <button type="button" aria-label="Conversation actions" onClick={onMore}>
          <Icons.MoreVertical size={16} />
        </button>
      )}
      {onClose && (
        <button type="button" aria-label="Close chat" onClick={onClose}>
          <Icons.Close size={14} />
        </button>
      )}
    </header>
  );
}

export type ChatConversationListItemProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  conversation: ChatConversationSummary;
  active?: boolean;
  moreLabel?: string;
  onMore?: () => void;
};

export function ChatConversationListItem({
  conversation,
  active,
  className,
  moreLabel = "Conversation actions",
  onMore,
  ...rest
}: ChatConversationListItemProps) {
  return (
    <div
      className={cx(
        "bd-chat-conversation-row",
        active && "bd-chat-conversation-row-active",
        className,
      )}
    >
      <button type="button" className="bd-chat-conversation-row-main" {...rest}>
        <span className="bd-chat-conversation-avatar" aria-hidden>
          <Icons.Sparkles size={16} />
        </span>
        <span className="bd-chat-conversation-main">
          <span className="bd-chat-conversation-title-line">
            <span className="bd-chat-conversation-title">{conversation.title}</span>
            {conversation.pinned && <span className="bd-chat-conversation-pin">PINNED</span>}
          </span>
          {(conversation.source || conversation.when || conversation.turnCount !== undefined) && (
            <span className="bd-chat-conversation-meta">
              {[conversation.source, conversation.when, turnCountLabel(conversation.turnCount)]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
          {conversation.preview && (
            <span className="bd-chat-conversation-preview">"{conversation.preview}"</span>
          )}
        </span>
      </button>
      {onMore && (
        <button
          type="button"
          className="bd-chat-conversation-more"
          aria-label={moreLabel}
          onClick={(event) => {
            event.stopPropagation();
            onMore();
          }}
        >
          <Icons.MoreVertical size={16} />
        </button>
      )}
    </div>
  );
}

function ChatActions({ actions }: { actions: ReadonlyArray<ChatAction> }) {
  return (
    <div className="bd-chat-actions">
      {actions.map((action) => (
        <button key={action.label} type="button" onClick={action.onPress}>
          {action.icon}
          {action.label}
        </button>
      ))}
    </div>
  );
}

function ChatFooterCitation({ citation }: { citation: ChatCitation | string }) {
  return (
    <span className="bd-chat-footer-citation">
      <span aria-hidden />
      {typeof citation === "string" ? citation : (citation.label ?? citationLabel(citation))}
    </span>
  );
}

function ToolResultRow({ result }: { result: ChatToolResult }) {
  return (
    <div className="bd-chat-tool-result">
      {result.label && <span>{result.label}</span>}
      <p>"{result.text}"</p>
    </div>
  );
}

type ToolConfig = {
  label: string;
  Icon: typeof Icons.Sparkles;
};

function toolConfig(kind: ChatToolKind | undefined): ToolConfig {
  switch (kind) {
    case "searchBook":
      return { Icon: Icons.Search, label: "Searched the book" };
    case "lookup":
      return { Icon: Icons.Quote, label: "Looked up passage" };
    case "searchLibrary":
      return { Icon: Icons.Library, label: "Searched your library" };
    case "webSearch":
      return { Icon: Icons.Share, label: "Searched the web" };
    case "summarize":
      return { Icon: Icons.Note, label: "Generated a summary" };
    case "runPython":
      return { Icon: Icons.Code, label: "Ran analysis" };
    case "notes":
      return { Icon: Icons.Note, label: "Searched notes" };
    case "highlights":
      return { Icon: Icons.Highlight, label: "Searched highlights" };
    case "documents":
      return { Icon: Icons.Library, label: "Listed documents" };
    case "generic":
    default:
      return { Icon: Icons.Sparkles, label: "Used a tool" };
  }
}

function toolSubtitle(tool: ChatToolCall): string | null {
  if (tool.state === "pending") return "Queued";
  if (tool.state === "running") return tool.query ? `"${tool.query}"` : "Working...";
  if (tool.state === "success") return tool.query ? `"${tool.query}"` : null;
  if (tool.state === "error") return tool.error ?? "Failed";
  return null;
}

function citationLabel(citation: ChatCitation): string {
  if (citation.label) return citation.label;
  if (citation.page !== undefined && citation.chapter !== undefined) {
    return `p.${citation.page}·${citation.chapter}`;
  }
  if (citation.page !== undefined) return `p.${citation.page}`;
  if (citation.chapter !== undefined) return `ch.${citation.chapter}`;
  return "source";
}

function citationKey(citation: ChatCitation | string, index: number): string {
  if (typeof citation === "string") return `${citation}-${index}`;
  return citation.id ?? citation.label ?? `${citation.page ?? "source"}-${index}`;
}

function turnCountLabel(turnCount: number | undefined): string | null {
  if (turnCount === undefined) return null;
  return `${turnCount} ${turnCount === 1 ? "turn" : "turns"}`;
}
