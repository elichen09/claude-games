/*
 * Decision Room: reveal an elimination-round decision.
 *
 * The moderator (passcode) sets up the round: sides, team codes, debaters, panel size, and gets a room code.
 * Judges join with the code and turn in a winner, speaker points and an RFD. The moderator can vote too.
 * "View decision" locks the ballots, counts them, and Gary reveals the result with stats pulled from the RFDs.
 * State lives on the server (./server.ts), so everyone in the room sees the same round.
 */
import { ApiError, type GameModule } from "@/lib/games/types";
import { garySVG, playReveal, resultsHTML } from "./gary";
import type { BallotInput, RoomView, SideIndex } from "./types";
import "./style.css";

interface ModRoom { code: string; token: string; title: string; at: number }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const errMsg = (e: unknown) => (e instanceof ApiError ? (e.status === 429 && e.code === "rate_limited" ? "Too many requests. Give it a few seconds." : e.message) : "Couldn't reach the server. Check your connection.");
const cleanCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);

const game: GameModule = {
  mount(root, ctx) {
    root.classList.add("dr");
    ctx.world.follow(false);
    ctx.world.setValue(0);

    let judgeId = ctx.storage.get<string>("judgeId", "");
    if (judgeId.length < 8) {
      judgeId = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
      ctx.storage.set("judgeId", judgeId);
    }
    let passcode = "";
    let pollTimer = 0;
    let stopReveal: (() => void) | null = null;
    const stopPoll = () => { window.clearInterval(pollTimer); pollTimer = 0; };
    const poll = (fn: () => void, ms: number) => { stopPoll(); pollTimer = window.setInterval(() => { if (!document.hidden) fn(); }, ms); };

    const modRooms = () => ctx.storage.get<ModRoom[]>("modRooms", []).filter((r) => Date.now() - r.at < 3 * 864e5);
    const saveModRoom = (r: ModRoom) => ctx.storage.set("modRooms", [r, ...modRooms().filter((x) => x.code !== r.code)].slice(0, 8));
    const tokenFor = (code: string) => modRooms().find((r) => r.code === code)?.token ?? "";
    const joinLink = (code: string) => `${location.origin}/games/${ctx.slug}?room=${code}`;

    function screen(html: string) {
      stopPoll();
      root.innerHTML = html;
      window.scrollTo({ top: 0 });
    }
    function toast(msg: string) {
      const t = document.createElement("div");
      t.className = "toast"; t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 2200);
    }
    const matchup = (room: RoomView) => `<div class="dr-mini">
      <span class="s0"><small>${esc(room.labels[0])}</small> ${esc(room.sides[0].code)}</span><i>vs</i>
      <span class="s1"><small>${esc(room.labels[1])}</small> ${esc(room.sides[1].code)}</span></div>`;

    // ───────────────────────── home ─────────────────────────
    function home(prefill = "") {
      const mine = modRooms();
      screen(`
        <section class="panel dr-hero">
          <div class="dr-hero-gary">${garySVG("idle")}</div>
          <div><span class="eyebrow">Elim round reveal</span>
          <h1 class="display">Decision <em>Room</em></h1>
          <p>Judges turn in their ballots, speaker points and RFDs. When the moderator hits <b>View decision</b>, Gary reads the panel's verdict with stats from every RFD.</p></div>
        </section>
        <section class="panel">
          <span class="eyebrow">Judging?</span>
          <form class="dr-join" data-join>
            <label><span class="hint">Room code</span><input class="field dr-code-in" name="code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD" value="${esc(prefill)}" required></label>
            <label><span class="hint">Your name</span><input class="field" name="judge" maxlength="40" autocomplete="name" placeholder="Judge name" value="${esc(ctx.storage.get("judgeName", ""))}" required></label>
            <button class="go">Open ballot</button>
          </form>
          <p class="dr-err" data-err-join></p>
        </section>
        <section class="panel">
          <span class="eyebrow">Moderating?</span>
          <form class="row" data-mod>
            <input class="field dr-pass" name="pass" type="password" autocomplete="current-password" placeholder="Moderator passcode" required>
            <button class="ghost">Set up a round</button>
          </form>
          <p class="dr-err" data-err-mod></p>
          ${mine.length ? `<div class="dr-myrooms"><span class="hint">Your rounds</span>${mine.map((r) => `<button class="ghost" data-open="${r.code}"><b>${r.code}</b> ${esc(r.title)}</button>`).join("")}</div>` : ""}
        </section>`);

      const join = root.querySelector<HTMLFormElement>("[data-join]")!;
      const codeIn = join.querySelector<HTMLInputElement>("[name=code]")!;
      codeIn.oninput = () => { codeIn.value = cleanCode(codeIn.value); };
      join.onsubmit = async (e) => {
        e.preventDefault();
        ctx.sound.unlock(); ctx.sound.click();
        const code = cleanCode(codeIn.value), name = join.judge.value.trim();
        const err = root.querySelector<HTMLElement>("[data-err-join]")!;
        if (code.length !== 4) { err.textContent = "Room codes are 4 characters."; return; }
        ctx.storage.set("judgeName", name);
        const btn = join.querySelector("button")!;
        btn.disabled = true;
        try {
          const room = await ctx.api<RoomView>("room", { code, judgeId });
          judgeEnter(room);
        } catch (e) { err.textContent = errMsg(e); btn.disabled = false; }
      };

      const mod = root.querySelector<HTMLFormElement>("[data-mod]")!;
      mod.onsubmit = async (e) => {
        e.preventDefault();
        ctx.sound.unlock(); ctx.sound.click();
        const err = root.querySelector<HTMLElement>("[data-err-mod]")!;
        const btn = mod.querySelector("button")!;
        btn.disabled = true;
        try {
          await ctx.api("unlock", { passcode: mod.pass.value });
          passcode = mod.pass.value;
          setup();
        } catch (e) { err.textContent = errMsg(e); btn.disabled = false; ctx.sound.miss(); }
      };
      root.querySelectorAll<HTMLButtonElement>("[data-open]").forEach((b) => (b.onclick = () => openModRoom(b.dataset.open!)));
      if (prefill) join.judge.focus();
    }

    // ───────────────────────── moderator: set up ─────────────────────────
    function setup() {
      if (!passcode) return home();
      screen(`
        <section class="panel"><div class="row"><button class="ghost" data-back>← Back</button><span class="eyebrow">New round</span></div>
          <h2 class="display dr-h2">Set up the round</h2>
          <form class="dr-setup" data-setup>
            <div class="dr-grid2">
              <label><span class="hint">Round</span><input class="field" name="title" maxlength="60" placeholder="Quarterfinals" value="Quarterfinals"></label>
              <label><span class="hint">Tournament (optional)</span><input class="field" name="tournament" maxlength="80" placeholder="e.g. Harvard Invitational"></label>
            </div>
            <div class="dr-grid3">
              <fieldset class="dr-seg"><legend class="hint">Sides</legend>
                <label><input type="radio" name="format" value="aff-neg" checked><span>Aff / Neg</span></label>
                <label><input type="radio" name="format" value="pro-con"><span>Pro / Con</span></label></fieldset>
              <fieldset class="dr-seg"><legend class="hint">Debaters per side</legend>
                <label><input type="radio" name="perSide" value="1" checked><span>1 (LD)</span></label>
                <label><input type="radio" name="perSide" value="2"><span>2 (PF / CX)</span></label></fieldset>
              <label><span class="hint">Judges on the panel</span><select class="field" name="panel">${[1, 2, 3, 4, 5, 6, 7, 9].map((n) => `<option ${n === 3 ? "selected" : ""}>${n}</option>`).join("")}</select></label>
            </div>
            ${[0, 1].map((s) => `<fieldset class="dr-side s${s}"><legend><b data-label="${s}">${s ? "Neg" : "Aff"}</b></legend>
              <label><span class="hint">Team code</span><input class="field" name="code${s}" maxlength="60" placeholder="${s ? "Newton South CD" : "Lincoln Sudbury AB"}" required></label>
              <div class="dr-grid2"><label><span class="hint">Debater</span><input class="field" name="d${s}0" maxlength="40" placeholder="Name"></label>
              <label class="dr-d2"><span class="hint">Partner</span><input class="field" name="d${s}1" maxlength="40" placeholder="Name"></label></div></fieldset>`).join("")}
            <button class="go">Create round</button>
            <p class="dr-err" data-err></p>
          </form></section>`);
      const f = root.querySelector<HTMLFormElement>("[data-setup]")!;
      const sync = () => {
        const pc = (f.querySelector<HTMLInputElement>("[name=format]:checked")!).value === "pro-con";
        root.querySelector("[data-label='0']")!.textContent = pc ? "Pro" : "Aff";
        root.querySelector("[data-label='1']")!.textContent = pc ? "Con" : "Neg";
        const two = (f.querySelector<HTMLInputElement>("[name=perSide]:checked")!).value === "2";
        f.classList.toggle("two", two);
      };
      f.onchange = sync; sync();
      root.querySelector<HTMLButtonElement>("[data-back]")!.onclick = () => home();
      f.onsubmit = async (e) => {
        e.preventDefault();
        ctx.sound.click();
        const fd = new FormData(f);
        const g = (k: string) => String(fd.get(k) ?? "").trim();
        const perSide = Number(g("perSide"));
        const btn = f.querySelector<HTMLButtonElement>("button.go")!;
        btn.disabled = true;
        try {
          const res = await ctx.api<{ modToken: string; room: RoomView }>("create", {
            passcode, title: g("title"), tournament: g("tournament"), format: g("format"), perSide, panel: Number(g("panel")),
            sideA: { code: g("code0"), debaters: [g("d00"), g("d01")].slice(0, perSide) },
            sideB: { code: g("code1"), debaters: [g("d10"), g("d11")].slice(0, perSide) },
          });
          saveModRoom({ code: res.room.code, token: res.modToken, title: res.room.title, at: Date.now() });
          ctx.sound.reward(2);
          modRoom(res.room);
        } catch (e) { root.querySelector<HTMLElement>("[data-err]")!.textContent = errMsg(e); btn.disabled = false; }
      };
    }

    async function openModRoom(code: string) {
      try { modRoom(await ctx.api<RoomView>("room", { code, judgeId, modToken: tokenFor(code) })); }
      catch (e) { toast(errMsg(e)); }
    }

    // ───────────────────────── moderator: the room ─────────────────────────
    function modRoom(room: RoomView) {
      const token = tokenFor(room.code);
      screen(`
        <section class="panel dr-roomhead">
          <div class="row"><button class="ghost" data-back>← Home</button><div class="sp"></div><span class="eyebrow">Moderator</span></div>
          <div class="dr-codebox"><span class="hint">Judges join with code</span><b class="dr-bigcode">${room.code}</b>
            <div class="row"><code class="dr-link">${esc(joinLink(room.code))}</code><button class="ghost" data-copy>Copy link</button></div></div>
          <div><span class="eyebrow">${esc(room.title)}${room.tournament ? ` · ${esc(room.tournament)}` : ""}</span>${matchup(room)}</div>
        </section>
        <section class="panel"><div class="row"><span class="eyebrow">Ballots in</span><div class="sp"></div><b class="dr-tally" data-tally></b></div>
          <ul class="dr-judges" data-judges></ul>
          <div class="dr-actions" data-actions></div>
          <p class="dr-err" data-err></p></section>
        <section class="panel"><details class="dr-modballot"><summary class="eyebrow">Your ballot (moderator)</summary><div data-ballot></div></details></section>`);
      root.querySelector<HTMLButtonElement>("[data-back]")!.onclick = () => home();
      root.querySelector<HTMLButtonElement>("[data-copy]")!.onclick = async () => {
        try { await navigator.clipboard.writeText(joinLink(room.code)); toast("Link copied"); } catch { toast(joinLink(room.code)); }
      };
      const ballotHost = root.querySelector<HTMLElement>("[data-ballot]")!;
      let current = room;
      let formShownFor = "";

      const render = (r: RoomView) => {
        current = r;
        const judges = r.judges ?? [];
        root.querySelector<HTMLElement>("[data-tally]")!.textContent = `${r.submitted} / ${r.panel}`;
        const slots = Math.max(r.panel, judges.length);
        root.querySelector<HTMLElement>("[data-judges]")!.innerHTML = Array.from({ length: slots }, (_, i) => judges[i]
          ? `<li class="in">✓ ${esc(judges[i])}</li>` : `<li class="wait"><span class="spinner"></span> waiting…</li>`).join("");
        const acts = root.querySelector<HTMLElement>("[data-actions]")!;
        if (r.revealed) {
          acts.innerHTML = `<button class="go" data-replay>Replay the reveal</button><button class="ghost" data-results>Results</button><button class="ghost" data-reopen>Reopen ballots</button><button class="ghost" data-new>New round</button>`;
          acts.querySelector<HTMLButtonElement>("[data-replay]")!.onclick = () => reveal(r, false);
          acts.querySelector<HTMLButtonElement>("[data-results]")!.onclick = () => reveal(r, true);
          acts.querySelector<HTMLButtonElement>("[data-new]")!.onclick = () => (passcode ? setup() : home());
          acts.querySelector<HTMLButtonElement>("[data-reopen]")!.onclick = async () => {
            if (!confirm("Take the decision back and reopen ballots? Judges will be able to edit again.")) return;
            try { render(await ctx.api<RoomView>("reopen", { code: r.code, modToken: token })); } catch (e) { setErr(e); }
          };
        } else {
          acts.innerHTML = `<button class="go dr-viewbtn" data-view ${r.submitted ? "" : "disabled"}>View decision</button>`;
          acts.querySelector<HTMLButtonElement>("[data-view]")!.onclick = async (ev) => {
            const btn = ev.currentTarget as HTMLButtonElement;
            if (current.submitted < current.panel && !confirm(`Only ${current.submitted} of ${current.panel} ballots are in. Reveal anyway?`)) return;
            ctx.sound.unlock();
            btn.disabled = true;
            try {
              const done = await ctx.api<RoomView>("reveal", { code: r.code, modToken: token });
              render(done);
              reveal(done, false);
            } catch (e) { setErr(e); btn.disabled = false; }
          };
        }
        const key = `${r.revealed}:${r.mine ? 1 : 0}`;
        if (key !== formShownFor) {
          formShownFor = key;
          if (r.revealed) ballotHost.innerHTML = `<p class="note">Ballots are locked.</p>`;
          else ballotForm(ballotHost, r, r.mine, "Moderator", async () => { root.querySelector<HTMLDetailsElement>(".dr-modballot")!.open = false; refresh(); });
        }
      };
      const setErr = (e: unknown) => { root.querySelector<HTMLElement>("[data-err]")!.textContent = e ? errMsg(e) : ""; };
      const refresh = async () => {
        try { render(await ctx.api<RoomView>("room", { code: current.code, judgeId, modToken: token })); setErr(""); }
        catch (e) { if (!(e instanceof ApiError && e.code === "rate_limited")) setErr(e); }
      };
      if (!token) root.querySelector<HTMLElement>("[data-err]")!.textContent = "This browser doesn't have the moderator key for this round.";
      render(room);
      poll(refresh, 3000);
    }

    function reveal(room: RoomView, instant: boolean) {
      if (!room.result) return;
      stopReveal?.();
      stopReveal = playReveal(ctx, room, room.result, { instant, onClose: () => { stopReveal = null; } });
      ctx.storage.set(`seen:${room.code}`, true);
    }

    // ───────────────────────── ballot form (judges and moderator) ─────────────────────────
    function ballotForm(host: HTMLElement, room: RoomView, mine: BallotInput | undefined, defaultName: string, onDone: () => void) {
      let pick: SideIndex | null = mine ? mine.winner : null;
      const name = mine?.judge ?? (defaultName || ctx.storage.get("judgeName", ""));
      host.innerHTML = `<form class="dr-ballot" novalidate>
        <label><span class="hint">Judge name</span><input class="field" name="judge" maxlength="40" value="${esc(name)}" required></label>
        <div><span class="hint">I vote for</span><div class="dr-picks">${[0, 1].map((s) => `<button type="button" class="dr-pick s${s}" data-w="${s}" aria-pressed="${pick === s}">
          <small>${esc(room.labels[s])}</small><b>${esc(room.sides[s].code)}</b></button>`).join("")}</div></div>
        <div><span class="hint">Speaker points (0–30)</span><div class="dr-ptsgrid">${[0, 1].map((s) => room.sides[s].debaters.map((d, i) => `
          <label class="s${s}"><span>${esc(d)}</span><input class="field" type="number" inputmode="decimal" min="0" max="30" step="0.1" placeholder="28.5" data-s="${s}" data-i="${i}" value="${mine?.points[s]?.[i] ?? ""}"></label>`).join("")).join("")}</div></div>
        <label><span class="hint">Reason for decision</span><textarea class="field dr-rfdin" name="rfd" rows="6" maxlength="4000" placeholder="Where did you vote and why? What did the winning side do that the other didn't?">${esc(mine?.rfd ?? "")}</textarea></label>
        <button class="go">${mine ? "Update ballot" : "Submit ballot"}</button>
        <p class="dr-err" data-err></p></form>`;
      const f = host.querySelector<HTMLFormElement>("form")!;
      f.querySelectorAll<HTMLButtonElement>(".dr-pick").forEach((b) => (b.onclick = () => {
        ctx.sound.unlock(); ctx.sound.click();
        pick = Number(b.dataset.w) as SideIndex;
        f.querySelectorAll<HTMLButtonElement>(".dr-pick").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      }));
      f.onsubmit = async (e) => {
        e.preventDefault();
        const err = f.querySelector<HTMLElement>("[data-err]")!;
        const judge = f.judge.value.trim();
        if (!judge) { err.textContent = "Add your name."; return; }
        if (pick === null) { err.textContent = "Pick who won."; return; }
        const points: number[][] = [[], []];
        for (const inp of f.querySelectorAll<HTMLInputElement>("[data-s]")) {
          const v = Number(inp.value);
          if (inp.value.trim() === "" || !Number.isFinite(v) || v < 0 || v > 30) { err.textContent = "Give every debater speaker points between 0 and 30."; inp.focus(); return; }
          points[+inp.dataset.s!][+inp.dataset.i!] = v;
        }
        const rfd = f.rfd.value.trim();
        if (rfd.length < 3) { err.textContent = "Write a reason for decision."; return; }
        const btn = f.querySelector<HTMLButtonElement>("button.go")!;
        btn.disabled = true;
        try {
          await ctx.api("ballot", { code: room.code, judgeId, judge, winner: pick, points, rfd });
          if (defaultName !== "Moderator") ctx.storage.set("judgeName", judge);
          ctx.sound.reward(1);
          toast(mine ? "Ballot updated" : "Ballot submitted");
          onDone();
        } catch (e) { err.textContent = errMsg(e); btn.disabled = false; ctx.sound.miss(); }
      };
    }

    // ───────────────────────── judges ─────────────────────────
    function judgeEnter(room: RoomView) {
      if (room.revealed) return judgeResults(room);
      if (room.mine) return judgeWait(room);
      judgeBallot(room);
    }

    function judgeBallot(room: RoomView) {
      screen(`<section class="panel"><div class="row"><button class="ghost" data-back>← Leave</button><div class="sp"></div><span class="eyebrow">Room ${room.code}</span></div>
        <span class="eyebrow">${esc(room.title)}${room.tournament ? ` · ${esc(room.tournament)}` : ""}</span>${matchup(room)}</section>
        <section class="panel"><span class="eyebrow">Your ballot</span><div data-ballot></div></section>`);
      root.querySelector<HTMLButtonElement>("[data-back]")!.onclick = () => home();
      ballotForm(root.querySelector<HTMLElement>("[data-ballot]")!, room, room.mine, ctx.storage.get("judgeName", ""), async () => {
        try { judgeEnter(await ctx.api<RoomView>("room", { code: room.code, judgeId })); } catch { judgeWait(room); }
      });
      // Notice if the moderator reveals while this judge is still writing.
      poll(async () => {
        try { const r = await ctx.api<RoomView>("room", { code: room.code, judgeId }); if (r.revealed) judgeResults(r, true); } catch { /* keep writing */ }
      }, 8000);
    }

    function judgeWait(room: RoomView) {
      const m = room.mine!;
      screen(`<section class="panel dr-waiting">
          <div class="dr-hero-gary">${garySVG("idle")}</div>
          <div><span class="eyebrow">Room ${room.code} · ${esc(room.title)}</span>
          <h2 class="display dr-h2">Ballot in.</h2>
          <p>You voted <b class="s${m.winner}">${esc(room.labels[m.winner])} · ${esc(room.sides[m.winner].code)}</b>. Gary will reveal the decision when the moderator is ready.</p>
          <p class="hint" data-count></p>
          <div class="row"><button class="ghost" data-edit>Edit my ballot</button><button class="ghost" data-back>Leave</button></div></div>
        </section>`);
      const count = root.querySelector<HTMLElement>("[data-count]")!;
      const show = (r: RoomView) => { count.innerHTML = `<span class="spinner"></span> ${r.submitted} of ${r.panel} ballots in`; };
      show(room);
      root.querySelector<HTMLButtonElement>("[data-edit]")!.onclick = async () => {
        try { const r = await ctx.api<RoomView>("room", { code: room.code, judgeId }); if (r.revealed) judgeResults(r, true); else judgeBallot(r); }
        catch (e) { toast(errMsg(e)); }
      };
      root.querySelector<HTMLButtonElement>("[data-back]")!.onclick = () => home();
      poll(async () => {
        try { const r = await ctx.api<RoomView>("room", { code: room.code, judgeId }); if (r.revealed) judgeResults(r, true); else show(r); } catch { /* try again next tick */ }
      }, 4000);
    }

    function judgeResults(room: RoomView, live = false) {
      const r = room.result!;
      screen(`<section class="panel"><div class="row"><button class="ghost" data-back>← Home</button><div class="sp"></div><span class="eyebrow">Room ${room.code}</span></div>
          <span class="eyebrow">${esc(room.title)}${room.tournament ? ` · ${esc(room.tournament)}` : ""}</span>
          <h2 class="display dr-h2">${esc(r.headline)}</h2>
          <div class="row"><button class="go" data-replay>Watch the reveal</button></div></section>
        ${resultsHTML(room, r)}`);
      root.querySelector<HTMLButtonElement>("[data-back]")!.onclick = () => home();
      root.querySelector<HTMLButtonElement>("[data-replay]")!.onclick = () => reveal(room, false);
      if (live && !ctx.storage.get(`seen:${room.code}`, false)) reveal(room, false);
    }

    const pre = cleanCode(new URLSearchParams(location.search).get("room") ?? "");
    home(pre);

    return () => {
      stopPoll();
      stopReveal?.();
      root.classList.remove("dr");
      root.innerHTML = "";
    };
  },
};

export default game;
