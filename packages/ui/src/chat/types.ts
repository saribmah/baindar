import type { ReactNode } from "react";

export type ChatToolKind =
  | "searchBook"
  | "lookup"
  | "searchLibrary"
  | "webSearch"
  | "summarize"
  | "runPython"
  | "notes"
  | "highlights"
  | "documents"
  | "generic";

export type ChatToolState = "pending" | "running" | "success" | "error";

export type ChatAttachment = {
  label: string;
  text: string;
  color?: string;
};

export type ChatReference = {
  id: string;
  label: string;
  description?: string;
  color?: string;
  onOpen?: () => void;
  onRemove?: () => void;
};

export type ChatCitation = {
  id?: string;
  label?: string;
  page?: string | number;
  chapter?: string | number;
};

export type ChatAction = {
  label: string;
  icon?: ReactNode;
  onPress?: () => void;
};

export type ChatToolResult = {
  label?: string;
  text: string;
};

export type ChatToolCall = {
  id?: string;
  kind?: ChatToolKind;
  title?: string;
  state: ChatToolState;
  query?: string;
  error?: string;
  expanded?: boolean;
  results?: ReadonlyArray<ChatToolResult>;
};

export type ChatConversationSummary = {
  id: string;
  title: string;
  source?: string | null;
  when?: string;
  preview?: string | null;
  turnCount?: number;
  pinned?: boolean;
};
