// Review counts shown outside the Review screen (sidebar badge). Refreshed
// whenever the bank or a card changes; cheap enough to just re-query.

import { create } from "zustand";
import { ipc, type ReviewStats } from "../lib/ipc";
import { todayStartIso, type CardRow } from "../domain/srs";

interface ReviewStore {
  stats: ReviewStats | null;
  /** Schedule card per question id — review status on question rows. */
  cards: Map<string, CardRow>;
  refresh(): Promise<void>;
}

export const useReview = create<ReviewStore>((set) => ({
  stats: null,
  cards: new Map(),
  async refresh() {
    try {
      const now = new Date();
      const [stats, all] = await Promise.all([
        ipc.reviewStats(now.toISOString(), todayStartIso(now)),
        ipc.allCards(),
      ]);
      set({ stats, cards: new Map(all.map((e) => [e.question.id, e.card])) });
    } catch {
      /* vault closed mid-flight */
    }
  },
}));
