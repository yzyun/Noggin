// Review counts shown outside the Review screen (sidebar badge). Refreshed
// whenever the bank or a card changes; cheap enough to just re-query.

import { create } from "zustand";
import { ipc, type ReviewStats } from "../lib/ipc";
import { todayStartIso } from "../domain/srs";

interface ReviewStore {
  stats: ReviewStats | null;
  refresh(): Promise<void>;
}

export const useReview = create<ReviewStore>((set) => ({
  stats: null,
  async refresh() {
    try {
      const now = new Date();
      set({ stats: await ipc.reviewStats(now.toISOString(), todayStartIso(now)) });
    } catch {
      /* vault closed mid-flight */
    }
  },
}));
