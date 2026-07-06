// Folder-path helpers shared by the questions filter panel and the notes
// sidebar: build a tree out of "a/b/c" paths.

export interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
}

export function buildFolderTree(folders: string[]): FolderNode[] {
  const roots: FolderNode[] = [];
  for (const folder of folders) {
    let level = roots;
    let acc = "";
    for (const part of folder.split("/")) {
      acc = acc ? `${acc}/${part}` : part;
      let node = level.find((n) => n.path === acc);
      if (!node) {
        node = { name: part, path: acc, children: [] };
        level.push(node);
        level.sort((a, b) => a.name.localeCompare(b.name));
      }
      level = node.children;
    }
  }
  return roots;
}
