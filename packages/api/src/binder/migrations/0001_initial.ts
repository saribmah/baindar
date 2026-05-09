import type { SqlMigration } from "../../utils/sqlite-migrations";
import { conversationsTableSql } from "../../conversation/table";
import { documentsTableSql } from "../../document/binder-table";
import { highlightsTableSql } from "../../highlight/table";
import { notesTableSql } from "../../note/table";
import { progressTableSql } from "../../progress/table";
import { shelfDocumentsTableSql, shelvesTableSql } from "../../shelf/table";
import {
  aiSessionTableSql,
  binderChunkRefsTableSql,
  binderChunkRefsTriggersSql,
  binderChunksFtsTableSql,
  metaTableSql,
} from "../tables";

// Composite initial migration. Each feature owns its own table SQL
// fragment; the binder simply assembles them in the order the FK chain
// requires (documents first, then everything that references it).
export const migration: SqlMigration = {
  id: 1,
  name: "initial",
  sql: [
    metaTableSql,
    documentsTableSql,
    shelvesTableSql,
    shelfDocumentsTableSql,
    progressTableSql,
    highlightsTableSql,
    notesTableSql,
    conversationsTableSql,
    binderChunkRefsTableSql,
    binderChunksFtsTableSql,
    binderChunkRefsTriggersSql,
    aiSessionTableSql,
  ].join("\n"),
};
