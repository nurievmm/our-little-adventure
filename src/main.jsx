import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import roster from './roster.json';
import story from './story-data.json';
import { journeyMilestones, validTime } from './timeline.js';
import './style.css';

const base = import.meta.env.BASE_URL;
const classColors = {
  Paladin: '#f0a6be', Mage: '#89dbe9', Rogue: '#f8d675', Priest: '#f1ebd9', Shaman: '#8fbaff',
  Warlock: '#c9adff', Hunter: '#b9d38c', Druid: '#fbb079', Warrior: '#e8aa91',
};
const professions = {
  Alchemy: '⚗', Blacksmithing: '⚒', Cooking: '♨', Enchanting: '✦', Engineering: '⚙',
  'First Aid': '✚', Fishing: '♒', Herbalism: '❧', Leatherworking: '✂', Mining: '⛏', Skinning: '◇', Tailoring: '✂',
};
const labels = { legacy: 'Legacy unlock', boss: 'Matched boss kill', pvp: 'PvP milestone', level: 'Level reached', profession: 'Profession milestone' };
const locale = { day: 'numeric', month: 'short', timeZone: 'Asia/Jerusalem' };
const day = new Intl.DateTimeFormat('en-GB', locale);
const clock = new Intl.DateTimeFormat('en-GB', {
  ...locale, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const precise = new Intl.DateTimeFormat('en-GB', {
  ...locale, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const firstVisibleDate = Date.parse('2026-11-15T18:00:00+02:00');
const isVisibleDate = (value) => validTime(value) && Date.parse(value) >= firstVisibleDate;

function EventTime({ event }) {
  if (validTime(event.at)) {
    if (!isVisibleDate(event.at)) return null;
    const format = event.kind === 'boss' ? precise : clock;
    return <div className="event-time">{event.approximate && 'Around '}<time dateTime={event.at}>{format.format(new Date(event.at))}</time></div>;
  }
  if (!isVisibleDate(event.by)) return null;
  const end = day.format(new Date(event.by));
  const start = isVisibleDate(event.after) ? day.format(new Date(event.after)) : '';
  return <div className="event-time">
    {start && start !== end
      ? <><time dateTime={event.after}>{start}</time>–</>
      : start ? 'Around ' : 'By '}
    <time dateTime={event.by}>{end}</time>
  </div>;
}

function Portrait({ hero, full = false, labelled = false }) {
  const [unavailable, setUnavailable] = useState([]);
  const image = [full && hero.model, hero.portrait].find((url) => url && !unavailable.includes(url));
  return <div className={'character-art' + (full ? ' character-art-full' : '')}
    style={{ '--class-color': classColors[hero.className] }}>
    {image
      ? <img className={image === hero.model ? 'model' : 'avatar'} src={image}
        alt={labelled ? hero.name : ''} loading="lazy" key={image}
        onError={() => setUnavailable((old) => [...old, image])} />
      : <span className="initials" aria-hidden="true">{hero.name.split(' ').map((word) => word[0]).join('')}</span>}
  </div>;
}

function Creation({ heroes }) {
  return <section className="chapter chapter-creation" aria-labelledby="creation-title">
    <div className="scene" aria-hidden="true"><img src={base + 'art/company.jpg'} alt="" fetchPriority="high" /></div>
    <header className="chapter-heading">
      <p className="eyebrow">Character creation</p>
      <h2 id="creation-title">The company assembles</h2>
      <p className="summary">{heroes.length} adventurers joined the Side Quest Company.</p>
    </header>
    <div className="chapter-details">
      <ul className="story-grid arrivals">
        {heroes.map((hero) => <li className="arrival" key={hero.name}>
          <Portrait hero={hero} />
          <div><h3>{hero.name}</h3><p>{hero.race} · {hero.className}</p>
            <EventTime event={{ at: story.creationTimes[hero.name] ?? hero.createdAt }} />
          </div>
        </li>)}
      </ul>
    </div>
  </section>;
}

function Party({ event, byName }) {
  return <div className="story-party">
    {event.members.map((name) => <div key={name}>
      {byName.has(name) && <Portrait hero={byName.get(name)} />}
      <span>{name}</span>
    </div>)}
  </div>;
}

function PvPIllustration({ hero }) {
  const opponent = { HORDE: 'alliance', ALLIANCE: 'horde' }[hero.faction];
  return <div className="timeline-duel">
    <Portrait hero={hero} full labelled />
    {opponent && <img className="opponent" loading="lazy" src={base + 'art/rival-' + opponent + '.png'}
      alt={'Fictional ' + opponent + ' opponent'} />}
  </div>;
}

function EventDetails({ event, byName }) {
  if (event.kind === 'boss') return <>
    <Party event={event} byName={byName} />
    <p className="figure-note">{event.members.length} roster heroes with matching boss counters</p>
  </>;
  if (event.kind === 'legacy') return <>
    <p>{event.description}</p>
    <Party event={event} byName={byName} />
    <p className="figure-note">Account-wide achievement</p>
  </>;
  if (event.kind === 'pvp') return <>
    <PvPIllustration hero={event.hero} />
    <p className="figure-note">Illustrated encounter</p>
    {event.note && <p>{event.note}</p>}
  </>;
  if (event.kind === 'profession') return <div className="skill-illustration">
    <Portrait hero={event.hero} full />
    <span aria-hidden="true">{professions[event.skill] ?? '✧'}</span>
  </div>;
  const gear = event.gear?.filter(({ slot }) => ['MAIN_HAND', 'OFF_HAND', 'CHEST'].includes(slot));
  return <div className="level-illustration">
    <Portrait hero={event.hero} full />
    <div><p className="figure-note">Current character render</p>
      {gear?.length > 0 && <p className="gear">Gear at sync · {gear.map(({ name }) => name).join(' · ')}</p>}
    </div>
  </div>;
}

function Timeline({ heroes, snapshot }) {
  const byName = new Map(heroes.map((hero) => [hero.name, hero]));
  const milestones = journeyMilestones(heroes, snapshot);
  return <section className="timeline" aria-labelledby="timeline-title">
    <header className="timeline-heading">
      <h2 id="timeline-title">Milestones</h2>
      <p>Israel time. Approximate dates are placed at the end of their known range.</p>
    </header>
    <ol className="timeline-list">
      {milestones.map((event) => <li key={event.key} className={'timeline-entry entry-' + event.kind}>
        <article className="milestone">
          <header className="milestone-heading">
            <EventTime event={event} />
            <p className="eyebrow">{event.dungeon ?? labels[event.kind]}</p>
            <h3>{event.title}</h3>
            {event.hero && <p className="milestone-hero">{event.hero.name}</p>}
          </header>
          <div className="milestone-details">
            <EventDetails event={event} byName={byName} />
          </div>
        </article>
      </li>)}
    </ol>
  </section>;
}

function App() {
  const [snapshot, setSnapshot] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(base + 'characters.json', { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (Array.isArray(data?.heroes) && data.heroes.length) setSnapshot(data); })
      .catch(() => { /* The archived milestone data remains available. */ });
    return () => controller.abort();
  }, []);
  const heroes = snapshot?.heroes ?? roster;
  return <main className="journal">
    <h1 className="visually-hidden">Our Little Adventure</h1>
    <Creation heroes={heroes} />
    <Timeline heroes={heroes} snapshot={snapshot} />
    <aside className="credits">Game imagery © Blizzard Entertainment. Historical data from Battle.net and the Forever Heroes roster.</aside>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
