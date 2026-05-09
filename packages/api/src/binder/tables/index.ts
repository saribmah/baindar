// Tables that remain binder-scoped after the feature-table relocation:
// per-feature schemas (documents, shelves, progress, highlights, notes,
// conversations) live next to their feature modules. Only meta, ai-session,
// and the cross-binder FTS index belong purely to BinderDO.

export * from "./ai-session";
export * from "./meta";
export * from "./search";
