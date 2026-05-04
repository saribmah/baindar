import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Icons } from "../icons/index.ts";

const html = (node: React.ReactNode) => renderToStaticMarkup(<>{node}</>);

describe("Icons", () => {
  test("default size and color", () => {
    expect(html(<Icons.Search />)).toMatchSnapshot();
  });

  test("custom size and color", () => {
    expect(
      html(<Icons.Sparkles size={26} color="var(--wine-700)" strokeWidth={2} />),
    ).toMatchSnapshot();
  });

  test("aria-labeled (non-decorative)", () => {
    expect(html(<Icons.Bookmark aria-label="Bookmark this passage" />)).toMatchSnapshot();
  });

  test("complete set count", () => {
    expect(Object.keys(Icons).length).toBe(32);
  });
});
