// Question/note identity: ULIDs — sortable by creation time, no coordination
// needed, safe to generate anywhere (app, importer, external scraper).

import { ulid } from "ulid";

export function newId(): string {
  return ulid();
}
