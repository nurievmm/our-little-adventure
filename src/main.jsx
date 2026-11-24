import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import roster from './roster.json';
import { journeyMilestones, validTime } from './timeline.js';
import { eventPainting, formations, heroPainting, painting } from './illustrations.js';
import { useReadingPosition } from './useReadingPosition.js';
import './style.css';

const base = import.meta.env.BASE_URL;
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

function Creation() {
  return <section className="chapter chapter-creation" aria-labelledby="creation-title">
    <h2 id="creation-title" className="visually-hidden">Company roster</h2>
    {formations.map(({ art, race, members }, index) => <figure key={art} data-reading-stop={'formation/' + art}
      className={'formation formation-' + art} aria-label={race}>
      <StoryArt art={painting(art)} eager={index === 0} />
      <figcaption className="formation-caption">
        <ul className="formation-members" style={{ '--party-size': members.length }}>
          {members.map((name, index) => <li className="arrival" key={name} style={{ '--arrival-order': index }}>
            <h3>{name}</h3>
          </li>)}
        </ul>
      </figcaption>
    </figure>)}
  </section>;
}

function Party({ event, portraits }) {
  return <div className="story-party">
    {event.members.map((name, index) => <div key={name} style={{ '--arrival-order': index }}>
      {portraits && <StoryArt art={heroPainting(name, 20)} />}
      <span>{name}</span>
    </div>)}
  </div>;
}

function EventDetails({ event, hasPainting }) {
  if (event.kind === 'boss' || event.kind === 'legacy') return <>
    {event.kind === 'legacy' && event.id !== 62031 && event.description && <p>{event.description}</p>}
    <Party event={event} portraits={!hasPainting} />
  </>;
  if (event.kind !== 'level') return null;
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
      {event.dungeon && <p className="eyebrow">{event.dungeon}</p>}
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
      {milestones.map((event) => <li key={event.key} data-reading-stop={event.key} className={'timeline-entry entry-' + event.kind}>
        <div className="scene-backdrop" aria-hidden="true" />
        <Scene event={event} roster={byName} />
      </li>)}
    </ol>
  </section>;
}

function App() {
  const [snapshot, setSnapshot] = useState(undefined);
  const journal = useReadingPosition(snapshot !== undefined);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    fetch(base + 'characters.json', { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .catch(() => null)
      .then((data) => {
        if (active) setSnapshot(Array.isArray(data?.heroes) && data.heroes.length ? data : null);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);
  const heroes = snapshot?.heroes ?? roster;
  return <main className="journal" ref={journal}>
    <h1 className="visually-hidden">Our Little Adventure</h1>
    <Creation />
    <Timeline heroes={heroes} snapshot={snapshot} />
    <aside className="credits">Original character illustrations. Warcraft setting and background game imagery © Blizzard Entertainment. Historical data from Battle.net and the Forever Heroes roster.</aside>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
