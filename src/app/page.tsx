import Link from "next/link";
import { site } from "@/site.config";
import { listedGames } from "@/games/registry";
import { worldMeta } from "@/lib/worlds/meta";

export default function Home() {
  const games = listedGames();
  return (
    <>
      <div className="skyspace" />
      <section className="panel hub-hero">
        <span className="eyebrow">{games.filter((g) => g.status === "live").length} game{games.length === 1 ? "" : "s"} · more on the way</span>
        <h1 className="display">{site.name}</h1>
        <p>{site.tagline} Pick a game below. Your world, sound and scores follow you between games.</p>
        <span className="hint">▼ scroll down to sink in ▼</span>
      </section>
      <section className="games" aria-label="Games">
        {games.map((g) => {
          const live = g.status === "live";
          const inner = (
            <>
              <div className="cover" style={{ background: worldMeta(g.coverWorld).swatch }}><b>{g.title}</b></div>
              <div className="body">
                <span>{g.tagline}</span>
                <div className="tags">
                  {!live && <span>Coming soon</span>}
                  {(g.badges || []).concat(g.tags).map((t) => <span key={t}>{t}</span>)}
                </div>
                {live && <span className="go" style={{ justifySelf: "start" }}>Play</span>}
              </div>
            </>
          );
          return live ? (
            <Link key={g.slug} href={`/games/${g.slug}`} className="gamecard chip">{inner}</Link>
          ) : (
            <div key={g.slug} className="gamecard chip" aria-disabled="true">{inner}</div>
          );
        })}
      </section>
      <footer className="footer"><span>{site.name}</span><span>Pixel worlds · no account needed</span></footer>
    </>
  );
}
