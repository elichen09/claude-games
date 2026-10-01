"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { site } from "@/site.config";
import { getGame } from "@/games/registry";
import { sound } from "@/lib/sound";
import { WORLD_META, worldMeta } from "@/lib/worlds/meta";
import { useWorld } from "./WorldProvider";

export function SiteNav() {
  const path = usePathname();
  const slug = path.startsWith("/games/") ? path.split("/")[2] : null;
  const game = slug ? getGame(slug) : null;
  const { world, setWorld } = useWorld();
  const [soundOn, setSoundOn] = useState(true);
  useEffect(() => { setSoundOn(sound.enabled()); return sound.subscribe(setSoundOn); }, []);

  const nextWorld = () => {
    const i = WORLD_META.findIndex((w) => w.id === world);
    setWorld(WORLD_META[(i + 1) % WORLD_META.length].id);
    sound.unlock(); sound.click();
  };

  return (
    <nav className="sitenav" aria-label="Site">
      <Link href="/" className="brand" aria-label={`${site.name} home`}><span className="mark" />{game ? site.shortName : site.name}</Link>
      <span className="sp" />
      <button className="iconbtn" onClick={nextWorld} title="Change world"><span className="wide-only">World: </span>{worldMeta(world).name}</button>
      <button className="iconbtn" aria-pressed={soundOn} onClick={() => { sound.setEnabled(!soundOn); if (!soundOn) { sound.unlock(); sound.click(); } }}>
        Sound {soundOn ? "on" : "off"}
      </button>
    </nav>
  );
}
