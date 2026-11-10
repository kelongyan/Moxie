import { describe, expect, it } from "vitest";
import { parseMoxieUri } from "./plugin-uri";

describe("parseMoxieUri", () => {
  it("names the plugin and gives it the path and query", () => {
    expect(
      parseMoxieUri("moxie://catvinci.zotero/item?key=AB12&page=3"),
    ).toEqual({
      kind: "plugin",
      plugin: "catvinci.zotero",
      path: "/item",
      query: { key: "AB12", page: "3" },
    });
  });

  it("decodes the path, and gives / when there is none", () => {
    const path = (link: string) => {
      const uri = parseMoxieUri(link);
      return uri?.kind === "plugin" ? uri.path : null;
    };
    expect(path("moxie://a.b/clip%20this")).toBe("/clip this");
    expect(path("moxie://a.b")).toBe("/");
  });

  it("reads a command link: the command, and its query", () => {
    expect(parseMoxieUri("moxie://command/jane.count.run?scope=all")).toEqual(
      {
        kind: "command",
        command: "jane.count.run",
        query: { scope: "all" },
      },
    );
    expect(parseMoxieUri("moxie://command/")).toBeNull();
    expect(parseMoxieUri("moxie://command/a b")).toBeNull();
  });

  it("takes nothing that isn't a link it knows", () => {
    expect(parseMoxieUri("https://a.b/x")).toBeNull();
    expect(parseMoxieUri("moxie://noperiod/x")).toBeNull();
    expect(parseMoxieUri("not a url")).toBeNull();
  });
});
