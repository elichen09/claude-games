/** Shapes shared by the Decision Room client and server. */

export type SideIndex = 0 | 1;

export interface Side {
  /** Team code as it appears on the pairing, e.g. "Lincoln Sudbury AB". */
  code: string;
  debaters: string[];
}

/** What everyone in the room can see. */
export interface RoomView {
  code: string;
  title: string;
  tournament: string;
  /** e.g. ["Aff", "Neg"] or ["Pro", "Con"]. */
  labels: [string, string];
  sides: [Side, Side];
  panel: number;
  submitted: number;
  revealed: boolean;
  result?: Result;
  /** The caller's own ballot, when they've sent one. */
  mine?: BallotInput;
  /** Moderator only: who has turned in a ballot (names, not votes). */
  judges?: string[];
}

export interface BallotInput {
  judge: string;
  winner: SideIndex;
  /** points[side][debater] */
  points: number[][];
  rfd: string;
}

export interface Ballot extends BallotInput { judgeId: string; at: number }

export interface SpeakerStat { name: string; side: SideIndex; avg: number; high: number; low: number }
export interface ThemeStat { id: string; label: string; count: number; forWinner: number }

export interface Result {
  headline: string;
  winner: SideIndex | null;
  tally: [number, number];
  /** "ballots" = more ballots; "points" = tied ballots, broken on speaks; "even" = dead even. */
  method: "ballots" | "points" | "even";
  unanimous: boolean;
  /** Judges who voted against the winner. */
  squirrels: string[];
  lowPointWin: boolean;
  teamAvg: [number, number];
  speakers: SpeakerStat[];
  themes: ThemeStat[];
  keywords: { word: string; count: number }[];
  keyLine?: { judge: string; text: string };
  dissentLine?: { judge: string; text: string };
  closeness: "close" | "clean" | "mixed" | null;
  avgRfdWords: number;
  garyLines: string[];
  ballots: Ballot[];
}
