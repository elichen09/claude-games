/**
 * Turns a panel's ballots into a decision plus the stats Gary reads out.
 * Pure functions, no network: themes come from debate vocabulary in each RFD.
 */
import type { Ballot, Result, Side, SideIndex, SpeakerStat, ThemeStat } from "./types";

const THEMES: { id: string; label: string; words: string[] }[] = [
  { id: "weighing", label: "Weighing", words: ["weigh", "weighing", "weighed", "outweigh", "outweighs", "outweighed", "magnitude", "probability", "timeframe", "scope", "reversibility", "prereq", "prerequisite", "comparative", "metaweighing"] },
  { id: "framework", label: "Framework", words: ["framework", "fw", "value", "criterion", "vc", "standard", "burden", "burdens", "role of the ballot", "rob", "util", "utilitarianism", "deont"] },
  { id: "drops", label: "Dropped arguments", words: ["drop", "dropped", "drops", "conceded", "concede", "concedes", "concession", "unanswered", "no response", "never answered", "went cold", "uncontested"] },
  { id: "evidence", label: "Evidence", words: ["card", "cards", "evidence", "ev", "author", "study", "studies", "source", "sources", "empirics", "empirical", "data", "statistic", "statistics", "miscut", "paraphrase", "paraphrased"] },
  { id: "warrants", label: "Warranting", words: ["warrant", "warrants", "warranted", "warranting", "unwarranted", "explanation", "explained", "logic", "analytic", "analytics"] },
  { id: "impacts", label: "Impacts", words: ["impact", "impacts", "extinction", "harm", "harms", "lives", "death", "deaths", "nuclear", "war", "terminal", "link", "links", "uniqueness", "internal link"] },
  { id: "clash", label: "Clash & rebuttal", words: ["clash", "rebuttal", "responded", "response", "responses", "answer", "answered", "answers", "frontline", "frontlined", "frontlining", "turn", "turns", "turned", "extend", "extension", "extended", "extensions", "defense", "offense"] },
  { id: "collapse", label: "Collapse & final speeches", words: ["collapse", "collapsed", "collapsing", "summary", "final focus", "ff", "2ar", "2nr", "1ar", "nr", "2ac", "1nc", "last speech", "closing"] },
  { id: "theory", label: "Theory & progressive args", words: ["theory", "kritik", "shell", "topicality", "interp", "interpretation", "counterplan", "cp", "disad", "da", "perm", "alt", "rvi", "fairness", "education"] },
  { id: "clarity", label: "Clarity & delivery", words: ["clarity", "unclear", "spread", "spreading", "speed", "delivery", "organized", "organization", "signpost", "signposting", "flowable", "presentation", "confident", "persuasive"] },
  { id: "cx", label: "Cross-ex", words: ["cx", "crossfire", "cross-ex", "cross examination", "cross-examination", "grand cross", "questioning"] },
];

const CLOSE = ["close", "closer", "tough", "toughest", "hard", "difficult", "razor", "narrow", "narrowly", "tight", "coin flip", "split", "messy"];
const CLEAN = ["clean", "cleanly", "easy", "easily", "obvious", "decisive", "decisively", "clear win", "comfortable", "comfortably", "not close", "straightforward"];

const STOP = new Set(("a about above after again against all also am an and any are aren't as at be because been before being below between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself let's me more most mustn't my myself no nor not of off on once only or other ought our ours ourselves out over own same shan't she she'd she'll she's should shouldn't so some such than that that's the their theirs them themselves then there there's these they they'd they'll they're they've this those through to too under until up very was wasn't we we'd we'll we're we've were weren't what what's when when's where where's which while who who's whom why why's with won't would wouldn't you you'd you'll you're you've your yours yourself yourselves just really think thought because like well much many even still though thing things lot round debate debater debaters ballot vote voted voting decision rfd side sides team teams speech speeches argument arguments arg args point points made make makes made going gonna get got also both either neither one two three first second third last lastly overall basically pretty very good great nice better best way ultimately reason reasons since given gave give gives able win won wins winning lose lost loses losing aff neg pro con affirmative negative judge judges said says say saying didnt doesnt dont isnt wasnt cant wouldnt couldnt shouldnt im ive youre theyre thats theres whats").split(" "));

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9'\- ]+/g, " ");
const tokens = (s: string) => norm(s).split(/\s+/).map((t) => t.replace(/'s$/, "").replace(/^[-']+|[-']+$/g, "")).filter(Boolean);
const has = (text: string, toks: Set<string>, word: string) => (word.includes(" ") || word.includes("-") ? ` ${norm(text).replace(/\s+/g, " ")} `.includes(` ${word} `) : toks.has(word));
const fmt = (n: number) => (Number.isInteger(n) ? n.toFixed(0) : String(Math.round(n * 100) / 100));
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const spoken = (n: number) => ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"][n] ?? String(n);
const listNames = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

function sentences(text: string) {
  return text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/).map((s) => s.trim()).filter((s) => s.length >= 12);
}

/** The sentence from these ballots that names the most decision vocabulary: the best one-line summary of why. */
function pickLine(ballots: Ballot[]) {
  let best: { judge: string; text: string; score: number } | undefined;
  for (const b of ballots) {
    for (const s of sentences(b.rfd)) {
      const toks = new Set(tokens(s));
      let score = 0;
      for (const t of THEMES) for (const w of t.words) if (has(s, toks, w)) score += 1;
      if (/\b(because|since|so|which is why|that's why|therefore)\b/i.test(s)) score += 1.5;
      if (/\b(i vote|voted|vote for|i affirm|i negate|the ballot|decision)\b/i.test(s)) score += 1;
      score -= Math.max(0, s.length - 220) / 60;
      if (!best || score > best.score) best = { judge: b.judge, text: s, score };
    }
  }
  if (!best) {
    const b = ballots.find((x) => x.rfd.trim());
    if (b) best = { judge: b.judge, text: b.rfd.trim(), score: 0 };
  }
  if (!best) return undefined;
  const text = best.text.length > 240 ? best.text.slice(0, 237).replace(/\s+\S*$/, "") + "…" : best.text;
  return { judge: best.judge, text };
}

export function decide(ballots: Ballot[], sides: [Side, Side], labels: [string, string]): Result {
  const n = ballots.length;
  const tally: [number, number] = [0, 0];
  for (const b of ballots) tally[b.winner]++;

  // Speaker points
  const speakers: SpeakerStat[] = [];
  const teamAvg: [number, number] = [0, 0];
  ([0, 1] as SideIndex[]).forEach((s) => {
    sides[s].debaters.forEach((name, i) => {
      const pts = ballots.map((b) => b.points[s]?.[i]).filter((p): p is number => typeof p === "number" && Number.isFinite(p));
      const avg = pts.length ? pts.reduce((a, b) => a + b, 0) / pts.length : 0;
      speakers.push({ name, side: s, avg: Math.round(avg * 100) / 100, high: pts.length ? Math.max(...pts) : 0, low: pts.length ? Math.min(...pts) : 0 });
      teamAvg[s] += avg;
    });
  });
  teamAvg[0] = Math.round(teamAvg[0] * 100) / 100;
  teamAvg[1] = Math.round(teamAvg[1] * 100) / 100;
  speakers.sort((a, b) => b.avg - a.avg);

  let winner: SideIndex | null;
  let method: Result["method"] = "ballots";
  if (tally[0] !== tally[1]) winner = tally[0] > tally[1] ? 0 : 1;
  else if (teamAvg[0] !== teamAvg[1]) { winner = teamAvg[0] > teamAvg[1] ? 0 : 1; method = "points"; }
  else { winner = null; method = "even"; }

  const hi = Math.max(tally[0], tally[1]), lo = Math.min(tally[0], tally[1]);
  const unanimous = winner !== null && method === "ballots" && lo === 0;
  const squirrels = winner === null ? [] : ballots.filter((b) => b.winner !== winner).map((b) => b.judge);
  const lowPointWin = winner !== null && method === "ballots" && teamAvg[winner] < teamAvg[winner === 0 ? 1 : 0];

  let headline: string;
  if (winner === null) headline = `It's a ${hi}–${lo} split. Dead even, ballots and speaks.`;
  else if (method === "points") headline = `It's a ${hi}–${lo} split, and speaks break it for the ${labels[winner]} from ${sides[winner].code}`;
  else headline = `It was a ${hi}–${lo} for the ${labels[winner]} from ${sides[winner].code}`;

  // Themes: how many RFDs touch each one, and how many of those came from the winner's ballots.
  const parsed = ballots.map((b) => ({ b, toks: new Set(tokens(b.rfd)) }));
  const themes: ThemeStat[] = THEMES.map((t) => {
    const hits = parsed.filter(({ b, toks }) => t.words.some((w) => has(b.rfd, toks, w)));
    return { id: t.id, label: t.label, count: hits.length, forWinner: hits.filter(({ b }) => b.winner === winner).length };
  }).filter((t) => t.count > 0).sort((a, b) => b.count - a.count || b.forWinner - a.forWinner);

  // Keywords: words that show up in the most RFDs, minus filler and the names of the people in the round.
  const own = new Set([...sides.flatMap((s) => [...tokens(s.code), ...s.debaters.flatMap(tokens)]), ...labels.flatMap(tokens), ...ballots.flatMap((b) => tokens(b.judge))]);
  const themeWords = new Set(THEMES.flatMap((t) => t.words));
  const df = new Map<string, number>();
  for (const { toks } of parsed) for (const w of toks) {
    if (w.length < 4 || STOP.has(w) || own.has(w) || /^\d/.test(w) || themeWords.has(w)) continue;
    df.set(w, (df.get(w) || 0) + 1);
  }
  const minDf = n >= 3 ? 2 : 1;
  const keywords = [...df].filter(([, c]) => c >= minDf).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map(([word, count]) => ({ word, count }));

  let closeVotes = 0, cleanVotes = 0;
  for (const { b, toks } of parsed) {
    if (CLEAN.some((w) => has(b.rfd, toks, w))) cleanVotes++;
    else if (CLOSE.some((w) => has(b.rfd, toks, w))) closeVotes++;
  }
  const closeness: Result["closeness"] = closeVotes + cleanVotes === 0 ? null : closeVotes > cleanVotes ? "close" : cleanVotes > closeVotes ? "clean" : "mixed";

  const winBallots = winner === null ? ballots : ballots.filter((b) => b.winner === winner);
  const keyLine = pickLine(winBallots);
  const dissent = winner === null ? [] : ballots.filter((b) => b.winner !== winner);
  const dissentLine = dissent.length ? pickLine(dissent) : undefined;
  const words = ballots.map((b) => tokens(b.rfd).length);
  const avgRfdWords = n ? Math.round(words.reduce((a, b) => a + b, 0) / n) : 0;

  // Gary's read-out
  const g: string[] = [];
  if (winner === null) g.push("Same ballots, same speaks. I've judged a lot of rounds and I've never seen this. Get the tab room.");
  else if (method === "points") g.push(`Ballots split ${hi}–${lo}, so speaker points settle it: the ${labels[winner]} averaged ${fmt(teamAvg[winner])} to ${fmt(teamAvg[winner === 0 ? 1 : 0])}.`);
  else if (unanimous && n > 1) g.push(`${spoken(n)[0].toUpperCase() + spoken(n).slice(1)} ballots, zero dissent. Not a squirrel on this panel.`);
  else if (n === 1) g.push(`One judge, one ballot, one very nervous room.`);
  else g.push(`${listNames(squirrels)} ${squirrels.length === 1 ? "squirreled" : "dissented"}: ${plural(squirrels.length, "ballot")} for the ${labels[winner === 0 ? 1 : 0]}.`);

  // Lead with what the winning ballots talked about.
  const byWin = themes.slice().sort((a, b) => b.forWinner - a.forWinner || b.count - a.count);
  const top = byWin[0];
  const winCount = winner === null ? n : tally[winner];
  if (top && n > 0) {
    const label = top.label.toLowerCase();
    if (top.count === n && n > 1) g.push(`Every RFD on this panel talked about ${label}. That's where the round was won.`);
    else if (winner !== null && top.forWinner >= 2) g.push(`${top.label} decided this one: ${top.forWinner} of the ${labels[winner]}'s ${winCount} ballots leaned on it.`);
    else if (top.count >= 2) g.push(`${top.label} came up in ${top.count} of ${n} RFDs.`);
    else g.push(`The RFD went straight to ${label}.`);
    const next = byWin[1];
    if (next && next.count >= 2) g.push(`${next.label} came up in ${next.count} RFDs too.`);
  }
  const drops = themes.find((t) => t.id === "drops");
  if (drops && drops.id !== top?.id && drops.id !== byWin[1]?.id) g.push(`Dropped arguments came up in ${plural(drops.count, "RFD")}. Answer everything, people.`);
  if (winner !== null && method === "ballots") {
    const lose = winner === 0 ? 1 : 0;
    if (lowPointWin) g.push(`Low-point win! The ${labels[winner]} took it with fewer speaks (${fmt(teamAvg[winner])} vs ${fmt(teamAvg[lose])}).`);
    else if (teamAvg[winner] > teamAvg[lose]) g.push(`The ${labels[winner]} took the speaks too, ${fmt(teamAvg[winner])} to ${fmt(teamAvg[lose])}.`);
  }
  const best = speakers[0];
  if (best && best.avg > 0) {
    const tied = speakers.filter((s) => s.avg === best.avg);
    if (tied.length > 1) g.push(`Top speaks are tied at ${fmt(best.avg)}: ${listNames(tied.map((s) => s.name))}.`);
    else g.push(`Top speaker: ${best.name} (${sides[best.side].code}) with a ${fmt(best.avg)} average.`);
  }
  const who = n === 1 ? "The judge" : "The judges";
  if (closeness === "close") g.push(`${who} called it close. Hold your heads up.`);
  else if (closeness === "clean") g.push(`${who} didn't think it was close.`);
  if (avgRfdWords >= 150) g.push(`RFDs averaged ${avgRfdWords} words. This panel had things to say.`);

  return { headline, winner, tally, method, unanimous, squirrels, lowPointWin, teamAvg, speakers, themes, keywords, keyLine, dissentLine, closeness, avgRfdWords, garyLines: g, ballots };
}
