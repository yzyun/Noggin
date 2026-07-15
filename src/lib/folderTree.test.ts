import { describe, expect, it } from "vitest";
import { buildFolderTree } from "./folderTree";

describe("buildFolderTree", () => {
  it("nests a/b/c into three levels", () => {
    const tree = buildFolderTree(["a/b/c"]);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ name: "a", path: "a" });
    expect(tree[0].children[0]).toMatchObject({ name: "b", path: "a/b" });
    expect(tree[0].children[0].children[0]).toMatchObject({ name: "c", path: "a/b/c" });
  });

  it("merges shared prefixes instead of duplicating nodes", () => {
    const tree = buildFolderTree(["math/algebra", "math/calculus", "math"]);
    expect(tree).toHaveLength(1);
    expect(tree[0].children.map((c) => c.name)).toEqual(["algebra", "calculus"]);
  });

  it("sorts siblings alphabetically at every level", () => {
    const tree = buildFolderTree(["zoo", "alpha", "midway/z", "midway/a"]);
    expect(tree.map((n) => n.name)).toEqual(["alpha", "midway", "zoo"]);
    expect(tree[1].children.map((n) => n.name)).toEqual(["a", "z"]);
  });

  it("returns an empty forest for no folders", () => {
    expect(buildFolderTree([])).toEqual([]);
  });
});
