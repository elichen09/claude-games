import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { ActionError, type ServerActions } from "@/lib/games/types";
import { kvGet, kvHGetAll, kvHSet, kvSet } from "@/lib/server/kv";
import { rateLimit } from "@/lib/server/rate-limit";
import { decide } from "./analyze";
import type { Ballot, Result, RoomView, Side } from "./types";

/** Moderator passcode. Override with DECISION_ROOM_PASSCODE in the environment. */
const PASSCODE = process.env.DECISION_ROOM_PASSCODE || "eli123";
const TTL = 60 * 60 * 24 * 3; // rooms last three days
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

interface Room {
  code: string;
  createdAt: number;
  title: string;
  tournament: string;
  labels: [string, string];
  sides: [Side, Side];
  panel: number;
  modToken: string;
  revealed: boolean;
  result?: Result;
}

const roomKey = (c: string) => `dr:room:${c}`;
const ballotKey = (c: string) => `dr:ballots:${c}`;

const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim().slice(0, max) : "");
const codeOf = (v: unknown) => str(v, 8).toUpperCase().replace(/[^A-Z0-9]/g, "");
const idOf = (v: unknown) => str(v, 64).replace(/[^A-Za-z0-9_-]/g, "");

function same(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function checkPasscode(passcode: unknown, ip: string) {
  if (!rateLimit(`decision-room:pass:${ip}`, 12, 60_000).ok) throw new ActionError(429, "slow_down", "Too many tries. Wait a minute.");
  if (typeof passcode !== "string" || !same(passcode.trim(), PASSCODE)) throw new ActionError(403, "bad_passcode", "That passcode isn't right.");
}

async function loadRoom(code: string) {
  const room = code ? await kvGet<Room>(roomKey(code)) : undefined;
  if (!room) throw new ActionError(404, "no_room", "No round with that code. Check it with your moderator.");
  return room;
}

const isMod = (room: Room, token: unknown) => typeof token === "string" && token.length > 0 && same(token, room.modToken);

function view(room: Room, ballots: Record<string, Ballot>, judgeId: string, mod: boolean): RoomView {
  const list = Object.values(ballots);
  const mine = judgeId ? ballots[judgeId] : undefined;
  return {
    code: room.code, title: room.title, tournament: room.tournament, labels: room.labels, sides: room.sides, panel: room.panel,
    submitted: room.revealed && room.result ? room.result.ballots.length : list.length,
    revealed: room.revealed,
    result: room.revealed ? room.result : undefined,
    mine: mine ? { judge: mine.judge, winner: mine.winner, points: mine.points, rfd: mine.rfd } : undefined,
    judges: mod ? list.sort((a, b) => a.at - b.at).map((b) => b.judge) : undefined,
  };
}

function parseSide(v: unknown, perSide: number, label: string): Side {
  const o = obj(v);
  const code = str(o.code, 60);
  if (!code) throw new ActionError(400, "bad_round", `Add a team code for the ${label}.`);
  const names = Array.isArray(o.debaters) ? o.debaters.map((d) => str(d, 40)) : [];
  const debaters = Array.from({ length: perSide }, (_, i) => names[i] || `${label} speaker ${i + 1}`);
  return { code, debaters };
}

const actions: ServerActions = {
  /** Checks the moderator passcode before the setup form is shown. */
  unlock: ({ body, ip }) => {
    checkPasscode(obj(body).passcode, ip);
    return { ok: true };
  },

  /** Moderator sets up a round and gets a code for the judges. */
  create: async ({ body, ip }) => {
    const b = obj(body);
    checkPasscode(b.passcode, ip);
    const labels: [string, string] = b.format === "pro-con" ? ["Pro", "Con"] : ["Aff", "Neg"];
    const perSide = Math.min(2, Math.max(1, Math.round(Number(b.perSide) || 1)));
    const panel = Math.min(9, Math.max(1, Math.round(Number(b.panel) || 3)));
    const sides: [Side, Side] = [parseSide(b.sideA, perSide, labels[0]), parseSide(b.sideB, perSide, labels[1])];

    let code = "";
    for (let tries = 0; tries < 8 && !code; tries++) {
      const bytes = randomBytes(4);
      const c = Array.from(bytes, (x) => ALPHABET[x % ALPHABET.length]).join("");
      if (!(await kvGet<Room>(roomKey(c)))) code = c;
    }
    if (!code) throw new ActionError(503, "busy", "Couldn't make a room code. Try again.");

    const room: Room = {
      code, createdAt: Date.now(), title: str(b.title, 60) || "Elimination round", tournament: str(b.tournament, 80),
      labels, sides, panel, modToken: randomBytes(18).toString("base64url"), revealed: false,
    };
    await kvSet(roomKey(code), room, TTL);
    return { modToken: room.modToken, room: view(room, {}, "", true) };
  },

  /** The current state of a round. Judges see their own ballot; the moderator also sees who has voted. */
  room: async ({ body }) => {
    const b = obj(body);
    const room = await loadRoom(codeOf(b.code));
    const ballots = await kvHGetAll<Ballot>(ballotKey(room.code));
    return view(room, ballots, idOf(b.judgeId), isMod(room, b.modToken));
  },

  /** A judge (or the moderator) turns in or updates a ballot. Locked once the decision is revealed. */
  ballot: async ({ body }) => {
    const b = obj(body);
    const room = await loadRoom(codeOf(b.code));
    if (room.revealed) throw new ActionError(409, "revealed", "The decision is already out. Ballots are locked.");
    const judgeId = idOf(b.judgeId);
    if (judgeId.length < 8) throw new ActionError(400, "bad_ballot", "Missing judge id. Refresh and try again.");
    const judge = str(b.judge, 40);
    if (!judge) throw new ActionError(400, "bad_ballot", "Add your name.");
    if (b.winner !== 0 && b.winner !== 1) throw new ActionError(400, "bad_ballot", "Pick who won.");
    const rawPts = Array.isArray(b.points) ? b.points : [];
    const points = room.sides.map((side, s) => side.debaters.map((name, i) => {
      const row = Array.isArray(rawPts[s]) ? rawPts[s] : [];
      const p = Number(row[i]);
      if (!Number.isFinite(p) || p < 0 || p > 30) throw new ActionError(400, "bad_ballot", `Speaker points for ${name} must be between 0 and 30.`);
      return Math.round(p * 10) / 10;
    }));
    const rfd = text(b.rfd, 4000);
    if (rfd.length < 3) throw new ActionError(400, "bad_ballot", "Write a reason for decision.");

    const existing = await kvHGetAll<Ballot>(ballotKey(room.code));
    if (!existing[judgeId] && Object.keys(existing).length >= 15) throw new ActionError(409, "full", "This round already has the maximum number of ballots.");
    const ballot: Ballot = { judgeId, judge, winner: b.winner, points, rfd, at: existing[judgeId]?.at ?? Date.now() };
    await kvHSet(ballotKey(room.code), judgeId, ballot, TTL);
    return { ok: true };
  },

  /** Moderator only: lock the ballots and work out the decision. Calling it again returns the same result. */
  reveal: async ({ body }) => {
    const b = obj(body);
    const room = await loadRoom(codeOf(b.code));
    if (!isMod(room, b.modToken)) throw new ActionError(403, "not_mod", "Only the moderator can reveal the decision.");
    if (room.revealed && room.result) return view(room, {}, "", true);
    const ballots = Object.values(await kvHGetAll<Ballot>(ballotKey(room.code))).sort((x, y) => x.at - y.at);
    if (!ballots.length) throw new ActionError(409, "no_ballots", "No ballots yet.");
    room.result = decide(ballots, room.sides, room.labels);
    room.revealed = true;
    await kvSet(roomKey(room.code), room, TTL);
    return view(room, {}, "", true);
  },

  /** Moderator only: take the decision back and reopen ballots (for a mis-click). */
  reopen: async ({ body }) => {
    const b = obj(body);
    const room = await loadRoom(codeOf(b.code));
    if (!isMod(room, b.modToken)) throw new ActionError(403, "not_mod", "Only the moderator can reopen ballots.");
    room.revealed = false;
    room.result = undefined;
    await kvSet(roomKey(room.code), room, TTL);
    const ballots = await kvHGetAll<Ballot>(ballotKey(room.code));
    return view(room, ballots, "", true);
  },
};

export default actions;
