/**
 * Battery discovery: every folder under `src/pages/` holding a `_meta.ts`
 * is a battery. The folder name is its address. The Shelf and the Switcher
 * both read `batteries`; there is no central list.
 */
export type BatteryMeta = { name: string; blurb: string };
export type Battery = BatteryMeta & { slug: string; href: string };

export function collectBatteries(modules: Record<string, BatteryMeta>, base: string): Battery[] {
  const root = base.endsWith("/") ? base : `${base}/`;
  return Object.entries(modules)
    .map(([path, { name, blurb }]) => {
      const slug = path.split("/").at(-2)!;
      return { slug, href: `${root}${slug}/`, name, blurb };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

export const batteries: Battery[] = collectBatteries(
  import.meta.glob<BatteryMeta>("../pages/*/_meta.ts", { eager: true }),
  import.meta.env.BASE_URL,
);
