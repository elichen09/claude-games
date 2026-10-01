/** Site-wide settings. Rename the arcade here and it changes everywhere. */
export const site = {
  name: "Offbeat Arcade",
  shortName: "Offbeat",
  tagline: "Small games where the obvious answer loses.",
  description:
    "A pixel-art arcade of quick, clever games. Start with Deep Cut: name the answer nobody else would.",
  url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
};
