import { useState, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Icons } from "../icons/index.native.ts";
import { useThemeColors } from "../theme/index.native.ts";
import { color } from "../tokens/color.ts";
import { font } from "../tokens/font.ts";
import { radius } from "../tokens/radius.ts";
import type {
  ChatAction,
  ChatAttachment,
  ChatCitation,
  ChatConversationSummary,
  ChatToolCall,
  ChatToolKind,
  ChatToolResult,
  ChatToolState,
} from "./types.ts";

export type ChatAssistantHeaderProps = {
  label?: string;
  sub?: string;
  size?: "sm" | "md";
  style?: StyleProp<ViewStyle>;
};

export function ChatAssistantHeader({
  label = "Baindar",
  sub,
  size = "md",
  style,
}: ChatAssistantHeaderProps) {
  const palette = useThemeColors();
  const compact = size === "sm";
  return (
    <View style={[styles.assistantHeader, style]}>
      <View style={[styles.assistantAvatar, compact && styles.assistantAvatarSm]}>
        <Icons.Sparkles size={compact ? 12 : 14} color={color.paper[50]} />
      </View>
      <Text
        style={[styles.assistantName, compact && styles.assistantNameSm, { color: palette.fg }]}
      >
        {label}
      </Text>
      {sub && (
        <Text style={[styles.assistantSub, { color: palette.fgMuted }]} numberOfLines={1}>
          · {sub}
        </Text>
      )}
    </View>
  );
}

export type ChatUserTurnProps = {
  attachment?: ChatAttachment | null;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function ChatUserTurn({ attachment, children, style }: ChatUserTurnProps) {
  return (
    <View style={[styles.userTurn, style]}>
      <View style={styles.userStack}>
        {attachment && <ChatAttachmentBlock attachment={attachment} />}
        <View style={styles.userBubble}>
          {typeof children === "string" ? (
            <ChatMarkdown textStyle={styles.userText}>{children}</ChatMarkdown>
          ) : (
            children
          )}
        </View>
      </View>
    </View>
  );
}

export function ChatAttachmentBlock({ attachment }: { attachment: ChatAttachment }) {
  const palette = useThemeColors();
  return (
    <View
      style={[
        styles.attachment,
        {
          backgroundColor: palette.surfaceRaised,
          borderLeftColor: attachment.color ?? color.highlight.pink,
        },
      ]}
    >
      <Text style={[styles.attachmentLabel, { color: palette.fgMuted }]}>{attachment.label}</Text>
      <Text style={[styles.attachmentText, { color: palette.fgSubtle }]} numberOfLines={3}>
        {`"${attachment.text}"`}
      </Text>
    </View>
  );
}

export type ChatAssistantTurnProps = {
  sub?: string;
  label?: string;
  actions?: ReadonlyArray<ChatAction>;
  footerCitations?: ReadonlyArray<ChatCitation | string>;
  tools?: ReadonlyArray<ChatToolCall>;
  streaming?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function ChatAssistantTurn({
  sub,
  label,
  actions,
  footerCitations,
  tools,
  streaming,
  children,
  style,
}: ChatAssistantTurnProps) {
  const palette = useThemeColors();
  return (
    <View style={[styles.assistantTurn, style]}>
      <ChatAssistantHeader label={label} sub={sub} />
      {tools?.map((tool, index) => (
        <ChatToolCard key={tool.id ?? index} tool={tool} />
      ))}
      <View style={styles.assistantBody}>
        {typeof children === "string" ? (
          <ChatMarkdown textStyle={[styles.assistantText, { color: palette.fg }]}>
            {children}
          </ChatMarkdown>
        ) : (
          children
        )}
        {streaming && <View style={[styles.caret, { backgroundColor: palette.fg }]} />}
      </View>
      {footerCitations && footerCitations.length > 0 && (
        <View style={styles.footerCitations}>
          <Text style={[styles.footerLabel, { color: palette.fgMuted }]}>FROM</Text>
          {footerCitations.map((citation, index) => (
            <ChatFooterCitation key={citationKey(citation, index)} citation={citation} />
          ))}
        </View>
      )}
      {actions && actions.length > 0 && <ChatActions actions={actions} />}
    </View>
  );
}

export type ChatMarkdownProps = {
  children: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

type MarkdownBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string; level: 1 | 2 | 3 }
  | { type: "quote"; text: string }
  | { type: "code"; text: string }
  | { type: "list"; ordered: boolean; items: string[] };

export function ChatMarkdown({ children, style, textStyle }: ChatMarkdownProps) {
  const palette = useThemeColors();
  const blocks = parseMarkdownBlocks(children);
  return (
    <View style={[styles.markdown, style]}>
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return (
            <Text
              key={index}
              style={[
                styles.markdownHeading,
                block.level === 1 && styles.markdownHeading1,
                block.level === 2 && styles.markdownHeading2,
                { color: palette.fg },
              ]}
            >
              {renderInlineMarkdown(block.text, [
                styles.markdownHeadingText,
                { color: palette.fg },
              ])}
            </Text>
          );
        }
        if (block.type === "quote") {
          return (
            <View key={index} style={[styles.markdownQuote, { borderLeftColor: color.wine[100] }]}>
              <Text style={[styles.markdownQuoteText, { color: palette.fgSubtle }]}>
                {renderInlineMarkdown(block.text, [
                  styles.markdownQuoteText,
                  { color: palette.fgSubtle },
                ])}
              </Text>
            </View>
          );
        }
        if (block.type === "code") {
          return (
            <View
              key={index}
              style={[
                styles.markdownCodeBlock,
                { backgroundColor: palette.surfaceRaised, borderColor: palette.border },
              ]}
            >
              <Text style={[styles.markdownCodeText, { color: palette.fg }]}>{block.text}</Text>
            </View>
          );
        }
        if (block.type === "list") {
          return (
            <View key={index} style={styles.markdownList}>
              {block.items.map((item, itemIndex) => (
                <View key={`${index}-${itemIndex}`} style={styles.markdownListItem}>
                  <Text style={[styles.markdownListMarker, { color: palette.fgMuted }]}>
                    {block.ordered ? `${itemIndex + 1}.` : "•"}
                  </Text>
                  <Text style={[styles.markdownText, { color: palette.fg }, textStyle]}>
                    {renderInlineMarkdown(item, [
                      styles.markdownText,
                      { color: palette.fg },
                      textStyle,
                    ])}
                  </Text>
                </View>
              ))}
            </View>
          );
        }
        return (
          <Text key={index} style={[styles.markdownText, { color: palette.fg }, textStyle]}>
            {renderInlineMarkdown(block.text, [
              styles.markdownText,
              { color: palette.fg },
              textStyle,
            ])}
          </Text>
        );
      })}
    </View>
  );
}

export type ChatCitationChipProps = {
  citation: ChatCitation;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function ChatCitationChip({ citation, onPress, style, textStyle }: ChatCitationChipProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.citation, style]}>
      <Text style={[styles.citationText, textStyle]}>{citationLabel(citation)}</Text>
    </Pressable>
  );
}

export type ChatToolCardProps = {
  tool: ChatToolCall;
  onToggle?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function ChatToolCard({ tool, onToggle, style }: ChatToolCardProps) {
  const palette = useThemeColors();
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
    <View
      style={[
        styles.toolCard,
        {
          backgroundColor: palette.surfaceRaised,
          borderColor: palette.border,
          opacity: tool.state === "pending" ? 0.72 : 1,
        },
        style,
      ]}
    >
      <View style={styles.toolRow}>
        <config.Icon size={14} color={palette.fgSubtle} />
        <Text style={[styles.toolTitle, { color: palette.fg }]}>{title}</Text>
        {subtitle && (
          <Text style={[styles.toolSub, { color: palette.fgSubtle }]} numberOfLines={1}>
            · {subtitle}
          </Text>
        )}
        <View style={{ flex: 1 }} />
        <ChatToolStatus state={tool.state} />
        {expandable && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={expanded ? "Collapse tool results" : "Expand tool results"}
            onPress={handleToggle}
            style={styles.toolToggle}
          >
            <Icons.Chevron
              size={11}
              color={palette.fgMuted}
              style={{ transform: [{ rotate: expanded ? "-90deg" : "90deg" }] }}
            />
          </Pressable>
        )}
      </View>
      {expanded && tool.results && tool.results.length > 0 && (
        <View
          style={[
            styles.toolResults,
            { backgroundColor: palette.surface, borderTopColor: palette.border },
          ]}
        >
          {tool.results.map((result, index) => (
            <ToolResultRow key={result.label ?? index} result={result} />
          ))}
        </View>
      )}
    </View>
  );
}

export function ChatToolStatus({ state }: { state: ChatToolState }) {
  if (state === "success") {
    return (
      <View style={[styles.status, styles.statusSuccess]}>
        <Icons.Check size={9} color={color.status.success} strokeWidth={2.4} />
      </View>
    );
  }
  if (state === "error") {
    return (
      <View style={[styles.status, styles.statusError]}>
        <Text style={styles.statusErrorText}>!</Text>
      </View>
    );
  }
  return <View style={[styles.status, state === "running" ? styles.statusRunning : null]} />;
}

export type ChatComposerProps = {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  context?: ChatAttachment | null;
  suggestions?: ReadonlyArray<string>;
  disabled?: boolean;
  submitting?: boolean;
  onClearContext?: () => void;
  onSuggestionPress?: (suggestion: string) => void;
  style?: StyleProp<ViewStyle>;
};

export function ChatComposer({
  value,
  onValueChange,
  onSubmit,
  placeholder = "Ask about anything in the book...",
  context,
  suggestions,
  disabled,
  submitting,
  onClearContext,
  onSuggestionPress,
  style,
}: ChatComposerProps) {
  const palette = useThemeColors();
  const canSend = value.trim().length > 0 && !disabled && !submitting;

  return (
    <View style={[styles.composer, style]}>
      {suggestions && suggestions.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.suggestions}>
            {suggestions.map((suggestion) => (
              <Pressable
                key={suggestion}
                accessibilityRole="button"
                style={[styles.suggestion, { borderColor: palette.borderStrong }]}
                onPress={() => onSuggestionPress?.(suggestion)}
              >
                <Text style={[styles.suggestionText, { color: palette.fgSubtle }]}>
                  {suggestion}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
      <View
        style={[
          styles.composerBox,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        {context && (
          <View
            style={[
              styles.composerContext,
              {
                backgroundColor: palette.surfaceRaised,
                borderLeftColor: context.color ?? color.highlight.pink,
              },
            ]}
          >
            <Text style={[styles.composerContextLabel, { color: palette.fgMuted }]}>
              {context.label}
            </Text>
            <Text
              style={[styles.composerContextText, { color: palette.fgSubtle }]}
              numberOfLines={1}
            >
              {`"${context.text}"`}
            </Text>
            {onClearContext && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove attached passage"
                onPress={onClearContext}
              >
                <Icons.Close size={11} color={palette.fgMuted} />
              </Pressable>
            )}
          </View>
        )}
        <View style={styles.composerRow}>
          <TextInput
            value={value}
            editable={!disabled && !submitting}
            multiline
            placeholder={placeholder}
            placeholderTextColor={palette.fgMuted}
            style={[styles.composerInput, { color: palette.fg }]}
            onChangeText={onValueChange}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Voice input" disabled>
            <Icons.Mic size={16} color={palette.fgMuted} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            disabled={!canSend}
            style={[styles.send, { backgroundColor: canSend ? palette.action : palette.border }]}
            onPress={() => {
              if (canSend) onSubmit(value.trim());
            }}
          >
            <Icons.Send size={14} color={canSend ? palette.actionFg : palette.fgMuted} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export type ChatThreadProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function ChatThread({ children, style }: ChatThreadProps) {
  return <View style={[styles.thread, style]}>{children}</View>;
}

export type ChatPanelHeaderProps = {
  label?: string;
  sub?: string;
  onClose?: () => void;
  onMore?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function ChatPanelHeader({
  label = "Baindar",
  sub,
  onClose,
  onMore,
  style,
}: ChatPanelHeaderProps) {
  const palette = useThemeColors();
  return (
    <View style={[styles.panelHeader, { borderBottomColor: palette.border }, style]}>
      <ChatAssistantHeader label={label} sub={sub} size="sm" />
      <View style={{ flex: 1 }} />
      {onMore && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Conversation actions"
          onPress={onMore}
        >
          <Icons.MoreVertical size={16} color={palette.fgSubtle} />
        </Pressable>
      )}
      {onClose && (
        <Pressable accessibilityRole="button" accessibilityLabel="Close chat" onPress={onClose}>
          <Icons.Close size={14} color={palette.fgSubtle} />
        </Pressable>
      )}
    </View>
  );
}

export type ChatConversationListItemProps = {
  conversation: ChatConversationSummary;
  active?: boolean;
  moreLabel?: string;
  onMore?: () => void;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function ChatConversationListItem({
  conversation,
  active,
  moreLabel = "Conversation actions",
  onMore,
  onPress,
  style,
}: ChatConversationListItemProps) {
  const palette = useThemeColors();
  return (
    <View
      style={[
        styles.conversationRow,
        { borderBottomColor: palette.border },
        active && { backgroundColor: palette.surfaceRaised },
        style,
      ]}
    >
      <Pressable accessibilityRole="button" onPress={onPress} style={styles.conversationRowMain}>
        <View style={styles.conversationAvatar}>
          <Icons.Sparkles size={14} color={color.wine[700]} />
        </View>
        <View style={styles.conversationMain}>
          <View style={styles.conversationTitleLine}>
            <Text style={[styles.conversationTitle, { color: palette.fg }]} numberOfLines={2}>
              {conversation.title}
            </Text>
            {conversation.pinned && (
              <Text style={[styles.pin, { color: palette.fgSubtle }]}>PINNED</Text>
            )}
          </View>
          {(conversation.source || conversation.when || conversation.turnCount !== undefined) && (
            <Text style={[styles.conversationMeta, { color: palette.fgMuted }]} numberOfLines={1}>
              {[conversation.source, conversation.when, turnCountLabel(conversation.turnCount)]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          )}
          {conversation.preview && (
            <Text
              style={[styles.conversationPreview, { color: palette.fgSubtle }]}
              numberOfLines={2}
            >
              {`"${conversation.preview}"`}
            </Text>
          )}
        </View>
      </Pressable>
      {onMore && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={moreLabel}
          onPress={onMore}
          style={styles.conversationMore}
        >
          <Icons.MoreVertical size={16} color={palette.fgMuted} />
        </Pressable>
      )}
    </View>
  );
}

function ChatActions({ actions }: { actions: ReadonlyArray<ChatAction> }) {
  const palette = useThemeColors();
  return (
    <View style={styles.actions}>
      {actions.map((action) => (
        <Pressable
          key={action.label}
          accessibilityRole="button"
          style={styles.action}
          onPress={action.onPress}
        >
          {action.icon}
          <Text style={[styles.actionText, { color: palette.fgMuted }]}>{action.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function ChatFooterCitation({ citation }: { citation: ChatCitation | string }) {
  const palette = useThemeColors();
  return (
    <View style={[styles.footerCitation, { borderColor: palette.border }]}>
      <View style={styles.footerCitationDot} />
      <Text style={[styles.footerCitationText, { color: palette.fgSubtle }]}>
        {typeof citation === "string" ? citation : (citation.label ?? citationLabel(citation))}
      </Text>
    </View>
  );
}

function ToolResultRow({ result }: { result: ChatToolResult }) {
  const palette = useThemeColors();
  return (
    <View style={styles.toolResult}>
      {result.label && (
        <Text style={[styles.toolResultLabel, { color: palette.fgMuted }]}>{result.label}</Text>
      )}
      <Text style={[styles.toolResultText, { color: palette.fgSubtle }]}>{`"${result.text}"`}</Text>
    </View>
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

function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let code: string[] | null = null;

  const flushParagraph = () => {
    const text = paragraph.join(" ").trim();
    if (text) blocks.push({ type: "paragraph", text });
    paragraph = [];
  };

  const flushList = () => {
    if (list && list.items.length > 0) blocks.push({ type: "list", ...list });
    list = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      flushParagraph();
      flushList();
      if (code) {
        blocks.push({ type: "code", text: code.join("\n").trimEnd() });
        code = null;
      } else {
        code = [];
      }
      continue;
    }

    if (code) {
      code.push(line);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      const marks = heading[1] ?? "#";
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        level: marks.length as 1 | 2 | 3,
        text: heading[2] ?? "",
      });
      continue;
    }

    const unordered = /^[-*+]\s+(.+)$/.exec(trimmed);
    const ordered = /^\d+[.)]\s+(.+)$/.exec(trimmed);
    if (unordered || ordered) {
      flushParagraph();
      const nextOrdered = ordered !== null;
      if (!list || list.ordered !== nextOrdered) flushList();
      list ??= { ordered: nextOrdered, items: [] };
      list.items.push((ordered?.[1] ?? unordered?.[1] ?? "").trim());
      continue;
    }

    const quote = /^>\s?(.+)$/.exec(trimmed);
    if (quote) {
      flushParagraph();
      flushList();
      blocks.push({ type: "quote", text: quote[1] ?? "" });
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  if (code) blocks.push({ type: "code", text: code.join("\n").trimEnd() });
  return blocks;
}

function renderInlineMarkdown(text: string, fallbackStyle?: StyleProp<TextStyle>) {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const token = match[0];
    const content = token.replace(/^(`|\*\*|__|\*|_)/, "").replace(/(`|\*\*|__|\*|_)$/, "");

    if (token.startsWith("`")) {
      nodes.push(
        <Text key={`${match.index}-code`} style={[styles.markdownInlineCode, fallbackStyle]}>
          {content}
        </Text>,
      );
    } else if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(
        <Text key={`${match.index}-strong`} style={styles.markdownStrong}>
          {content}
        </Text>,
      );
    } else {
      nodes.push(
        <Text key={`${match.index}-em`} style={styles.markdownEmphasis}>
          {content}
        </Text>,
      );
    }
    cursor = match.index + token.length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes.length > 0 ? nodes : text;
}

const styles = StyleSheet.create({
  thread: {
    flex: 1,
  },
  assistantHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  assistantAvatar: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: color.wine[700],
  },
  assistantAvatarSm: {
    width: 22,
    height: 22,
  },
  assistantName: {
    fontFamily: font.nativeFamily.ui,
    fontSize: 13,
    fontWeight: "600",
  },
  assistantNameSm: {
    fontSize: 12,
  },
  assistantSub: {
    flexShrink: 1,
    fontFamily: font.nativeFamily.mono,
    fontSize: 11,
  },
  userTurn: {
    alignItems: "flex-end",
    marginBottom: 24,
  },
  userStack: {
    maxWidth: "86%",
    alignItems: "flex-end",
    gap: 6,
  },
  userBubble: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 4,
    backgroundColor: color.paper[900],
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  userText: {
    color: color.paper[50],
    fontFamily: font.nativeFamily.ui,
    fontSize: 14,
    lineHeight: 20,
  },
  attachment: {
    borderLeftWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  attachmentLabel: {
    marginBottom: 2,
    fontFamily: font.nativeFamily.ui,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  attachmentText: {
    fontFamily: font.nativeFamily.reading,
    fontSize: 13,
    fontStyle: "italic",
    lineHeight: 20,
  },
  assistantTurn: {
    marginBottom: 28,
  },
  assistantBody: {
    alignItems: "flex-start",
  },
  assistantText: {
    fontFamily: font.nativeFamily.reading,
    fontSize: 15,
    lineHeight: 25,
  },
  markdown: {
    width: "100%",
    gap: 8,
  },
  markdownText: {
    fontFamily: font.nativeFamily.reading,
    fontSize: 15,
    lineHeight: 25,
  },
  markdownHeading: {
    marginTop: 8,
    fontFamily: font.nativeFamily.display,
    fontWeight: "600",
    lineHeight: 24,
  },
  markdownHeading1: {
    fontSize: 21,
  },
  markdownHeading2: {
    fontSize: 18,
  },
  markdownHeadingText: {
    fontFamily: font.nativeFamily.display,
    fontWeight: "600",
  },
  markdownQuote: {
    borderLeftWidth: 2,
    paddingLeft: 12,
  },
  markdownQuoteText: {
    fontFamily: font.nativeFamily.reading,
    fontSize: 14,
    fontStyle: "italic",
    lineHeight: 22,
  },
  markdownList: {
    gap: 6,
  },
  markdownListItem: {
    flexDirection: "row",
    gap: 8,
  },
  markdownListMarker: {
    width: 18,
    fontFamily: font.nativeFamily.ui,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 23,
    textAlign: "right",
  },
  markdownCodeBlock: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  markdownCodeText: {
    fontFamily: font.nativeFamily.mono,
    fontSize: 12,
    lineHeight: 18,
  },
  markdownInlineCode: {
    borderRadius: 4,
    backgroundColor: color.paper[200],
    fontFamily: font.nativeFamily.mono,
    fontSize: 12,
  },
  markdownStrong: {
    fontWeight: "700",
  },
  markdownEmphasis: {
    fontStyle: "italic",
  },
  caret: {
    width: 9,
    height: 18,
    marginLeft: 3,
    marginTop: 4,
    borderRadius: 1,
  },
  citation: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: color.wine[100],
    borderRadius: 5,
    backgroundColor: color.wine[50],
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  citationText: {
    color: color.wine[700],
    fontFamily: font.nativeFamily.ui,
    fontSize: 11,
    fontWeight: "700",
  },
  footerCitations: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  footerLabel: {
    marginRight: 4,
    fontFamily: font.nativeFamily.ui,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  footerCitation: {
    height: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
  },
  footerCitationDot: {
    width: 4,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: color.wine[700],
  },
  footerCitationText: {
    fontFamily: font.nativeFamily.ui,
    fontSize: 11,
    fontWeight: "600",
  },
  actions: {
    marginTop: 12,
    marginLeft: -8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  action: {
    height: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
  },
  actionText: {
    fontFamily: font.nativeFamily.ui,
    fontSize: 11,
    fontWeight: "600",
  },
  toolCard: {
    marginBottom: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderRadius: 12,
  },
  toolRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  toolTitle: {
    fontFamily: font.nativeFamily.ui,
    fontSize: 12,
    fontWeight: "600",
  },
  toolSub: {
    flexShrink: 1,
    fontFamily: font.nativeFamily.mono,
    fontSize: 11,
  },
  status: {
    width: 8,
    height: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: color.paper[300],
  },
  statusRunning: {
    width: 12,
    height: 12,
    borderWidth: 1.5,
    borderColor: color.wine[700],
    backgroundColor: "transparent",
  },
  statusSuccess: {
    width: 14,
    height: 14,
    borderWidth: 1,
    borderColor: "#9fd2a8",
    backgroundColor: "#eef8f0",
  },
  statusError: {
    width: 14,
    height: 14,
    borderWidth: 1,
    borderColor: "#e4a0a1",
    backgroundColor: "#fbeeee",
  },
  statusErrorText: {
    color: color.status.error,
    fontSize: 10,
    fontWeight: "800",
  },
  toolToggle: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  toolResults: {
    gap: 8,
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  toolResult: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 6,
  },
  toolResultLabel: {
    fontFamily: font.nativeFamily.mono,
    fontSize: 10,
    lineHeight: 15,
  },
  toolResultText: {
    flex: 1,
    fontFamily: font.nativeFamily.reading,
    fontSize: 12,
    fontStyle: "italic",
    lineHeight: 18,
  },
  composer: {
    width: "100%",
    gap: 10,
  },
  suggestions: {
    flexDirection: "row",
    gap: 6,
    paddingRight: 12,
  },
  suggestion: {
    height: 28,
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
  },
  suggestionText: {
    fontFamily: font.nativeFamily.ui,
    fontSize: 12,
    fontWeight: "600",
  },
  composerBox: {
    gap: 10,
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
  },
  composerContext: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderLeftWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  composerContextLabel: {
    fontFamily: font.nativeFamily.ui,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  composerContextText: {
    flex: 1,
    fontFamily: font.nativeFamily.reading,
    fontSize: 12,
    fontStyle: "italic",
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  composerInput: {
    minHeight: 32,
    maxHeight: 108,
    flex: 1,
    paddingHorizontal: 6,
    paddingVertical: 4,
    fontFamily: font.nativeFamily.ui,
    fontSize: 14,
    lineHeight: 21,
  },
  send: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  conversationRow: {
    flexDirection: "row",
    alignItems: "stretch",
    borderBottomWidth: 1,
  },
  conversationRowMain: {
    flex: 1,
    flexDirection: "row",
    gap: 12,
    paddingVertical: 14,
  },
  conversationMore: {
    width: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  conversationAvatar: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: color.wine[50],
  },
  conversationMain: {
    flex: 1,
    gap: 3,
  },
  conversationTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  conversationTitle: {
    flex: 1,
    fontFamily: font.nativeFamily.display,
    fontSize: 15,
    fontWeight: "500",
    lineHeight: 19,
  },
  pin: {
    borderRadius: radius.pill,
    fontFamily: font.nativeFamily.ui,
    fontSize: 9,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  conversationMeta: {
    fontFamily: font.nativeFamily.ui,
    fontSize: 11,
  },
  conversationPreview: {
    fontFamily: font.nativeFamily.reading,
    fontSize: 12,
    fontStyle: "italic",
    lineHeight: 17,
  },
});
