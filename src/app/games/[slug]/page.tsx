import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GAMES, getGame } from "@/games/registry";
import { GameHost } from "@/components/GameHost";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return GAMES.filter((g) => g.status !== "soon").map((g) => ({ slug: g.slug }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const game = getGame((await params).slug);
  if (!game) return {};
  return { title: game.title, description: game.description, openGraph: { title: game.title, description: game.description } };
}

export default async function GamePage({ params }: Props) {
  const { slug } = await params;
  const game = getGame(slug);
  if (!game || game.status === "soon") notFound();
  return (
    <>
      <GameHost slug={slug} />
      <noscript><div className="panel">{game.title} needs JavaScript to run.</div></noscript>
    </>
  );
}
