import artwork from './artwork.json';

export const formations = [
  { art: 'undead', race: 'Undead', members: ['Allison Burgerrs', 'Chipson Bomfrey', 'Classic Schmosby'] },
  { art: 'skyborne', race: 'Windshaper Skyborne', members: ['Lailah Shemesh', 'Lioren Aurelith'] },
  { art: 'tauren', race: 'Tauren', members: ['Dargor Springhill'] },
  { art: 'orcs-trolls', race: 'Orcs and trolls', members: ['Aloy Cosem', 'Edou Khil', 'Graag Gogkhilghak'] },
];

const dungeonPaintings = {
  '15027/2026-11-12T22:38:55.000Z': 'ragefire-1',
  '63570/2026-11-16T21:22:07.000Z': 'deadmines',
  '15027/2026-11-19T20:00:56.000Z': 'ragefire-2',
  '63571/2026-11-19T21:37:11.000Z': 'lordaeron-1',
  '15028/2026-11-20T22:42:26.000Z': 'wailing-caverns',
  '63571/2026-11-20T23:45:52.000Z': 'lordaeron-2',
  '1092/2026-11-23T20:09:17.000Z': 'shadowfang',
};

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function painting(key, panel = 0) {
  const source = artwork[key];
  if (!source) return;
  return { ...source, key, panel };
}

export function heroPainting(name, level = 10) {
  const key = slug(name);
  if (key === 'chipson-bomfrey' && level >= 30 && level < 40) {
    const intermediate = painting('chipson-level30');
    if (intermediate) return intermediate;
  }
  const panel = level >= 30 ? 2 : level >= 20 ? 1 : 0;
  return painting(key, panel);
}

function professionPainting(hero, skill) {
  const key = 'work-' + slug(hero.name);
  const panel = artwork[key]?.skills?.indexOf(skill) ?? -1;
  return panel < 0 ? undefined : painting(key, panel);
}

export function eventPainting(event, roster) {
  if (event.kind === 'boss') {
    const timestamp = new Date(event.at).toISOString();
    return painting(dungeonPaintings[event.id + '/' + timestamp]);
  }
  if (event.kind === 'pvp') return painting('pvp-' + slug(event.hero.name));
  if (event.kind === 'level') return heroPainting(event.hero.name, event.level);
  if (event.kind === 'profession') return professionPainting(event.hero, event.skill);
  if (event.id === 62031) return painting('spelunker');
  const heroes = event.members.map((name) => roster.get(name)).filter(Boolean);
  if (event.skill) return heroes.map((hero) => professionPainting(hero, event.skill)).find(Boolean);
  const hero = heroes.find(({ className }) => className === event.className) ?? heroes[0];
  return hero && heroPainting(hero.name, event.level ?? 20);
}
