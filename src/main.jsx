import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import roster from './roster.json';
import story from './story-data.json';
import './style.css';

const base = import.meta.env.BASE_URL;
const classColors = {
  Paladin: '#f0a6be', Mage: '#89dbe9', Rogue: '#f8d675', Priest: '#f1ebd9', Shaman: '#8fbaff',
  Warlock: '#c9adff', Hunter: '#b9d38c', Druid: '#fbb079', Warrior: '#e8aa91',
};
const professions = {
  Alchemy: ['⚗', 'Brewing potions'], Blacksmithing: ['⚒', 'Working at the forge'],
  Cooking: ['♨', 'Cooking over the fire'], Enchanting: ['✦', 'Weaving an enchantment'],
  Engineering: ['⚙', 'Tinkering at the workbench'], 'First Aid': ['✚', 'Preparing bandages'],
  Fishing: ['♒', 'Casting a line'], Herbalism: ['❧', 'Gathering herbs'],
  Leatherworking: ['✂', 'Working a hide'], Mining: ['⛏', 'Breaking ore from stone'],
  Skinning: ['◇', 'Preparing hides'], Tailoring: ['✂', 'Cutting and stitching cloth'],
};
const timeFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  timeZone: 'Asia/Jerusalem', timeZoneName: 'short', hourCycle: 'h23',
});

function validTime(value) {
  return typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}

function EventTime({ value, observed = false, fallback = 'Date unavailable' }) {
  return validTime(value)
    ? <time dateTime={value}>{observed && 'First seen '}{timeFormat.format(new Date(value))}</time>
    : <span>{fallback}</span>;
}

function Portrait({ hero, full = false }) {
  const [unavailable, setUnavailable] = useState([]);
  const image = [full && hero.model, hero.portrait].find((url) => url && !unavailable.includes(url));
  return <div className={'character-art' + (full ? ' character-art-full' : '')}
    style={{ '--class-color': classColors[hero.className] }}>
    {image
      ? <img className={image === hero.model ? 'model' : 'avatar'} src={image} alt={hero.name}
        loading="lazy" key={image} onError={() => setUnavailable([...unavailable, image])} />
      : <span className="initials" aria-hidden="true">{hero.name.split(' ').map((word) => word[0]).join('')}</span>}
  </div>;
}

function Chapter({ id, title, label, image, summary, children }) {
  return <section className={'chapter chapter-' + id} aria-labelledby={id + '-title'}>
    <div className="scene" aria-hidden="true">
      <img src={base + 'art/' + image + '.jpg'} alt="" loading={id === 'creation' ? 'eager' : 'lazy'}
        fetchPriority={id === 'creation' ? 'high' : undefined} />
    </div>
    <header className="chapter-heading">
      <p className="eyebrow">{label}</p>
      <h2 id={id + '-title'}>{title}</h2>
      <p className="summary">{summary}</p>
    </header>
    <div className="chapter-details">{children}</div>
  </section>;
}

function Creation({ heroes }) {
  const arrivals = heroes.map((hero) => ({
    hero, time: story.creationTimes[hero.name] ?? hero.createdAt,
  })).sort((a, b) => (validTime(a.time) ? Date.parse(a.time) : Infinity) - (validTime(b.time) ? Date.parse(b.time) : Infinity));
  return <Chapter id="creation" title="The company assembles" label="Character creation" image="company"
    summary={heroes.length + ' adventurers joined the Side Quest Company.'}>
    <ul className="story-grid arrivals">
      {arrivals.map(({ hero, time }) => <li className="story-card arrival" key={hero.name}>
        <Portrait hero={hero} />
        <div><h3>{hero.name}</h3><p>{hero.race} · {hero.className}</p>
          <div className="event-time"><EventTime value={time} fallback="Creation time unavailable" /></div>
        </div>
      </li>)}
    </ul>
  </Chapter>;
}

function Leveling({ heroes, eventFor }) {
  return <Chapter id="levels" title="The road to 60" label="Level milestones" image="summit"
    summary="Every ten levels, with the company’s Legacy milestones along the way.">
    <div className="story-grid levelers">
      {heroes.map((hero) => {
        const reached = story.levelSteps.filter((level) => level <= hero.level || eventFor(hero, 'level-' + level));
        if (!reached.length) return null;
        return <article className="story-card level-card" key={hero.name}>
          <Portrait hero={hero} full />
          <div className="level-copy"><h3>{hero.name}</h3><p className="figure-note">Current character render</p>
            <ul className="level-steps">
              {reached.map((level) => {
                const event = eventFor(hero, 'level-' + level);
                const gear = event?.gear?.filter((item) => ['MAIN_HAND', 'OFF_HAND', 'CHEST'].includes(item.slot));
                return <li key={level}>
                  <span className="level-number">{level}</span>
                  <div><strong>{[25, 45, 60].includes(level) ? 'Legacy milestone' : 'Level reached'}</strong>
                    {event && <div className="event-time"><EventTime value={event.observedAt} observed /></div>}
                    {gear?.length > 0 && <small className="gear">Gear at sync · {gear.map((item) => item.name).join(' · ')}</small>}
                  </div>
                </li>;
              })}
            </ul>
          </div>
        </article>;
      })}
    </div>
  </Chapter>;
}

function Workbench({ heroes, eventFor, recorded }) {
  const work = heroes.flatMap((hero) => {
    const skills = new Map((hero.skills ?? (hero.profession ? [hero.profession] : [])).map((item) => [item.name, item.skill]));
    for (const event of recorded.get(hero.characterId) ?? []) {
      const match = /^(.+)-(75|150|225|300)$/.exec(event.kind);
      if (match && professions[match[1]]) skills.set(match[1], Math.max(skills.get(match[1]) ?? 0, Number(match[2])));
    }
    return [...skills].filter(([, skill]) => skill >= story.professionCaps[0])
      .map(([name, skill]) => ({ hero, name, skill }));
  });
  if (!work.length) return null;
  return <Chapter id="trades" title="At the workbench" label="Profession capstones" image="trades"
    summary="The company’s gathering, crafting, and secondary professions reached these skill caps.">
    <div className="story-grid workshops">
      {work.map(({ hero, name, skill }) => {
        const [symbol, action] = professions[name] ?? ['✧', name];
        return <article className="story-card workshop" key={hero.name + '/' + name}>
          <div className="craft-scene">
            <Portrait hero={hero} full />
            <span className="craft-prop" aria-hidden="true">{symbol}</span>
            <span className="figure-note">{action} · Illustration</span>
          </div>
          <div className="craft-copy"><h3>{name}</h3><p>{hero.name}</p>
            <ul className="capstones">{story.professionCaps.filter((cap) => cap <= skill).map((cap) => {
              const event = eventFor(hero, name + '-' + cap);
              return <li key={cap}><strong>{cap}</strong>{event && <small><EventTime value={event.observedAt} observed /></small>}</li>;
            })}</ul>
          </div>
        </article>;
      })}
    </div>
  </Chapter>;
}

function Dungeons({ heroes }) {
  const party = new Map(heroes.map((hero) => [hero.name, hero]));
  const runs = story.dungeonRuns.filter((run) => run.dungeon && validTime(run.completedAt) &&
    new Set(run.members.filter((name) => party.has(name))).size >= 3)
    .sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt));
  if (!runs.length) return null;
  return <Chapter id="dungeons" title="Through the dungeon gates" label="Dungeon clears" image="trades"
    summary="Completed runs with at least three heroes from the company.">
    <div className="story-grid">
      {runs.map((run) => <article className="story-card run" key={run.id}>
        <h3>{run.dungeon}</h3><div className="event-time"><EventTime value={run.completedAt} /></div>
        <ul className="party">{[...new Set(run.members)].map((name) => <li key={name}>{party.has(name) &&
          <Portrait hero={party.get(name)} />}{name}</li>)}</ul>
        {run.note && <p>{run.note}</p>}
      </article>)}
    </div>
  </Chapter>;
}

function PvP({ heroes, eventFor }) {
  const fighters = heroes.filter((hero) => hero.honorableKills > 0 || eventFor(hero, 'first-pvp'));
  if (!fighters.length) return null;
  return <Chapter id="pvp" title="First blood" label="First honorable kills" image="battleground"
    summary="The first honorable PvP kill for each of these heroes. The duels are illustrated with fictional opponents.">
    <div className="story-grid fights">
      {fighters.map((hero) => {
        const opponent = { HORDE: 'alliance', ALLIANCE: 'horde' }[hero.faction];
        return <article className="story-card fight" key={hero.name}>
          <div className="duel">
            <Portrait hero={hero} full />
            {opponent && <img className="opponent" loading="lazy" src={base + 'art/rival-' + opponent + '.png'}
              alt={'Fictional ' + opponent + ' opponent'} />}
          </div>
          <div className="fight-copy"><h3>{hero.name}</h3><p>First honorable kill</p>
            <div className="event-time"><EventTime value={eventFor(hero, 'first-pvp')?.observedAt} observed /></div>
          </div>
        </article>;
      })}
    </div>
  </Chapter>;
}

function App() {
  const [snapshot, setSnapshot] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(base + 'characters.json', { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (Array.isArray(data?.heroes) && data.heroes.length) setSnapshot(data); })
      .catch(() => { /* The opening roster remains available if a sync is unavailable. */ });
    return () => controller.abort();
  }, []);
  const heroes = snapshot?.heroes ?? roster;
  const events = snapshot?.milestones ?? [];
  const byKey = new Map(events.map((event) => [event.key, event]));
  const recorded = new Map();
  for (const event of events) {
    const [characterId, kind] = event.key.split('/');
    const id = Number(characterId);
    if (!recorded.has(id)) recorded.set(id, []);
    recorded.get(id).push({ ...event, kind });
  }
  const eventFor = (hero, kind) => byKey.get(hero.characterId + '/' + kind);
  const mounts = events.filter((event) => event.key.endsWith('/first-mount'));

  return <main className="journal">
    <h1 className="visually-hidden">Our Little Adventure</h1>
    <Creation heroes={heroes} />
    <Leveling heroes={heroes} eventFor={eventFor} />
    <Dungeons heroes={heroes} />
    <Workbench heroes={heroes} eventFor={eventFor} recorded={recorded} />
    <PvP heroes={heroes} eventFor={eventFor} />
    {mounts.length > 0 && <Chapter id="mounts" title="First mounts" label="Collection milestones" image="company"
      summary="A first mount for these adventurers.">
      <div className="story-grid">{mounts.map((event) => <article className="story-card run" key={event.key}>
        <h3>{event.name}</h3><p>{event.text}</p><div className="event-time"><EventTime value={event.observedAt} observed /></div>
      </article>)}</div>
    </Chapter>}
    <aside className="credits">Game screenshots and character renders © Blizzard Entertainment. PvP opponents are fictional illustrations.</aside>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
