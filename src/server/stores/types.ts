import type { Submission } from "../../core/types.js";

/** One stored submission: the validated payload, its flags and the day it arrived (no time). */
export interface Row {
  study: string;
  instrument: string;
  session: string;
  order: Submission["order"];
  answers: Submission["answers"];
  delivery: Submission["delivery"];
  flags: string[];
  received_day: string;
}

export type InsertResult = "ok" | "duplicate" | "cap";

/** Per item and question: how many opted-in visitors chose each scale point (unflagged rows only). */
export interface Tally {
  study: string;
  n_sessions: number;
  items: Record<string, Record<string, { n: number; counts: number[] }>>;
}

export interface Store {
  insert(row: Row): Promise<InsertResult>;
  tally(study: string, minN: number): Promise<Tally>;
  rows(study: string): Promise<Row[]>;
  ping(): Promise<void>;
}

export interface Caps {
  /** inserts per day across all studies (default 500) */
  dailyCap?: number;
  /** inserts in total (default 20,000) */
  totalCap?: number;
}
