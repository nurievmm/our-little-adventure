import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import roster from './roster.json';
import story from './story-data.json';
import { journeyMilestones, validTime } from './timeline.js';
import { eventPainting, formations, heroPainting, painting } from './illustrations.js';
import './style.css';

const base = import.meta.env.BASE_URL;
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

function StoryArt({ art, alt = '', eager = false }) {
  if (!art) return null;
  const { key, width, height, panel, columns, rows, revision } = art;
  const src = base + 'art/paint-' + key + '.webp';
  const ratio = (width / columns) / (height / rows);
  return <div className="story-art" style={{
    '--art-ratio': ratio, '--art-columns': columns, '--art-rows': rows,
    '--art-x': panel % columns, '--art-y': Math.floor(panel / columns),
  }}>
    <img src={revision ? src + '?v=' + revision : src} alt={alt}
      width={width} height={height} loading={eager ? 'eager' : 'lazy'}
      fetchPriority={eager ? 'high' : undefined} decoding={eager ? 'auto' : 'async'} />
  </div>;
}

function Creation({ heroes }) {
  const byName = new Map(heroes.map((hero) => [hero.name, hero]));
  return <section className="chapter chapter-creation" aria-labelledby="creation-title">
    <h2 id="creation-title" className="visually-hidden">Company roster</h2>
    {formations.map(({ art, race, members }, index) => <figure key={art}
      className={'formation formation-' + art} aria-label={race}>
      <StoryArt art={painting(art)} eager={index === 0} />
      <figcaption className="formation-caption">
        <ul className="formation-members" style={{ '--party-size': members.length }}>
          {members.map((name) => {
            const hero = byName.get(name);
            return <li className="arrival" key={name}>
              <h3>{name}</h3>
              {hero && <p>{hero.race} · {hero.className}</p>}
              <EventTime event={{ at: story.creationTimes[name] ?? hero?.createdAt }} />
            </li>;
          })}
        </ul>
      </figcaption>
    </figure>)}
  </section>;
}

function Party({ event, portraits }) {
  return <div className="story-party">
    {event.members.map((name) => <div key={name}>
      {portraits && <StoryArt art={heroPainting(name, 20)} />}
      <span>{name}</span>
    </div>)}
  </div>;
}

function EventDetails({ event, hasPainting }) {
  if (event.kind === 'boss') return <>
    <Party event={event} portraits={!hasPainting} />
    <p className="figure-note">{event.members.length} roster heroes with matching boss counters</p>
  </>;
  if (event.kind === 'legacy') return <>
    <p>{event.description}</p>
    <Party event={event} portraits={!hasPainting} />
    <p className="figure-note">Account-wide achievement</p>
  </>;
  if (event.kind === 'pvp') return <>
    {hasPainting && <p className="figure-note">Illustrated encounter</p>}
    {event.note && <p>{event.note}</p>}
  </>;
  if (event.kind === 'profession') return null;
  const gear = event.gear?.filter(({ slot }) => ['MAIN_HAND', 'OFF_HAND', 'CHEST'].includes(slot));
  return gear?.length > 0
    ? <p className="gear">Gear at sync · {gear.map(({ name }) => name).join(' · ')}</p>
    : null;
}

function Scene({ event, roster }) {
  const painting = eventPainting(event, roster);
  const art = painting ?? (event.hero && heroPainting(event.hero.name, event.hero.level));
  const subject = event.hero?.name ?? event.title;
  return <article className="milestone">
    <header className="milestone-heading">
      <EventTime event={event} />
      <p className="eyebrow">{event.dungeon ?? labels[event.kind]}</p>
      <h3>{event.title}</h3>
      {event.hero && <p className="milestone-hero">{event.hero.name}</p>}
    </header>
    <div className="milestone-details">
      <StoryArt art={art} alt={'Illustration of ' + subject} />
      <EventDetails event={event} hasPainting={Boolean(painting)} />
    </div>
  </article>;
}

function Timeline({ heroes, snapshot }) {
  const byName = new Map(heroes.map((hero) => [hero.name, hero]));
  const milestones = journeyMilestones(heroes, snapshot);
  return <section className="timeline" aria-labelledby="timeline-title">
    <h2 id="timeline-title" className="visually-hidden">Adventure timeline</h2>
    <ol className="timeline-list">
      {milestones.map((event) => <li key={event.key} className={'timeline-entry entry-' + event.kind}>
        <Scene event={event} roster={byName} />
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
    <aside className="credits">Original character illustrations. Warcraft setting and background game imagery © Blizzard Entertainment. Historical data from Battle.net and the Forever Heroes roster.</aside>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
