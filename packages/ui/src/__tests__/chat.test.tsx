import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatComposer, ChatUserTurn } from "../chat/index.ts";

const html = (node: React.ReactNode) => renderToStaticMarkup(<>{node}</>);

describe("Chat references", () => {
  test("user turn renders references outside message text", () => {
    const output = html(
      <ChatUserTurn
        references={[
          {
            id: "passage:1",
            label: "Maintenance",
            description: "Keep the gasket seated",
          },
        ]}
      >
        Explain this.
      </ChatUserTurn>,
    );

    expect(output).toContain("Maintenance");
    expect(output).toContain("Keep the gasket seated");
    expect(output).toContain("Explain this.");
    expect(output.indexOf("Maintenance")).toBeLessThan(output.indexOf("Explain this."));
  });

  test("composer renders removable reference tags", () => {
    const output = html(
      <ChatComposer
        value=""
        onValueChange={() => {}}
        onSubmit={() => {}}
        references={[
          {
            id: "note:1",
            label: "Note · Whole book",
            description: "Document-level thought",
            onRemove: () => {},
          },
        ]}
      />,
    );

    expect(output).toContain("Note · Whole book");
    expect(output).toContain("Remove Note · Whole book");
  });
});
