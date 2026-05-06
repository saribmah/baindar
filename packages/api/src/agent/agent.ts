import { Instance } from "../instance";

// Typed accessor for the ChatAgent Durable Object binding. Feature code
// (e.g. Conversation.remove) goes through this instead of reading
// `Instance.env.ChatAgent` directly — same pattern as Config.* and the
// document Processor: only Config / storage / dedicated bindings
// modules touch `Instance.env`.
export namespace Agent {
  // Wipe the chat DO's persisted state. Calls the agents framework's
  // built-in `destroy()` — which drops every Agents-SDK table, clears
  // alarms, and aborts the isolate. Used when a conversation is
  // deleted so the row in D1 and the DO's storage go away together.
  // Idempotent at the binding level — calling it on a never-activated
  // DO instance is a no-op.
  export const destroy = async (conversationId: string): Promise<void> => {
    const namespace = Instance.env.ChatAgent;
    const id = namespace.idFromName(conversationId);
    const stub = namespace.get(id);
    await stub.destroy();
  };
}
