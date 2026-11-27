import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import roster from './roster.json';
import { journeyMilestones, validTime } from './timeline.js';
import { eventPainting, formations, heroPainting, painting } from './illustrations.js';
import { useReadingPosition } from './useReadingPosition.js';
import { useSceneMotion } from './useSceneMotion.js';
import './style.css';

const base = import.meta.env.BASE_URL;
const sceneRatio = 3 / 2;
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
  if (event.hideDate) return null;
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

const panelRatio = ({ width, height, columns, rows }) => (width / columns) / (height / rows);

function StoryArt({ art, alt = '', eager = false, framed = false }) {
  if (!art) return null;
  const { key, width, height, panel, columns, rows, revision } = art;
  const src = base + 'art/paint-' + key + '.webp';
  const ratio = panelRatio(art);
  // Ignore small rounding differences in the source dimensions.
  const needsBleed = framed && Math.abs(ratio / sceneRatio - 1) >= .01;
  const narrow = ratio < sceneRatio;
  const image = {
    src: revision ? src + '?v=' + revision : src,
    width, height, loading: eager ? 'eager' : 'lazy', decoding: eager ? 'auto' : 'async',
  };
  return <div className="story-art" style={{
    '--art-ratio': ratio, '--art-columns': columns, '--art-rows': rows,
    '--art-x': panel % columns, '--art-y': Math.floor(panel / columns),
    '--art-feather-direction': narrow ? 'to right' : 'to bottom',
  }}>
    {needsBleed && <div className="story-art-bleed" data-axis={narrow ? 'inline' : 'block'} aria-hidden="true">
      <div className="story-art-panel"><img {...image} alt="" /></div>
      <div className="story-art-panel"><img {...image} alt="" /></div>
    </div>}
    <div className="story-art-panel">
      <img {...image} alt={alt} fetchPriority={eager ? 'high' : undefined} />
    </div>
  </div>;
}

function Creation() {
  return <section className="chapter chapter-creation" aria-labelledby="creation-title">
    <h2 id="creation-title" className="visually-hidden">Company roster</h2>
    {formations.map(({ art, race, members }, index) => {
      const portrait = painting(art);
      return <figure key={art} data-reading-stop={'formation/' + art}
        className={'formation formation-' + art} aria-label={race}>
        <div className="scene-backdrop" aria-hidden="true"><StoryArt art={portrait} /></div>
        <StoryArt art={portrait} eager={index === 0} framed />
        <figcaption className="formation-caption">
          <ul className="formation-members" style={{ '--party-size': members.length }}>
            {members.map((name) => <li className="arrival" key={name}>
              <h3>{name}</h3>
            </li>)}
          </ul>
        </figcaption>
      </figure>;
    })}
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
  if (event.kind === 'boss' || event.kind === 'legacy') {
    const showDescription = event.kind === 'legacy' && event.id !== 62031
      && event.description && !/^Reached \d+ skill in /i.test(event.description);
    return <>
      {showDescription && <p>{event.description}</p>}
      <Party event={event} portraits={!hasPainting} />
    </>;
  }
  if (event.kind !== 'level' || event.key === 'Lioren Aurelith/level/30') return null;
  const gear = event.gear?.filter(({ slot }) => ['MAIN_HAND', 'OFF_HAND', 'CHEST'].includes(slot));
  return gear?.length > 0
    ? <p className="gear">Gear at sync · {gear.map(({ name }) => name).join(' · ')}</p>
    : null;
}

function MilestoneScreenshot({ screenshot, title }) {
  const dialog = useRef(null);
  const startedOnBackdrop = useRef(false);
  const [viewed, setViewed] = useState(false);
  const { file, alt, width, height } = screenshot;
  const source = base + file;

  function openScreenshot() {
    setViewed(true);
    dialog.current.showModal();
  }

  function isBackdrop(event) {
    if (event.target !== event.currentTarget) return false;
    const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
    return event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom;
  }

  function closeOnBackdrop(event) {
    if (startedOnBackdrop.current && isBackdrop(event)) event.currentTarget.close();
    startedOnBackdrop.current = false;
  }

  return <>
    <button className="screenshot-trigger" type="button" aria-haspopup="dialog" onClick={openScreenshot}>
      View screenshot
    </button>
    <dialog className="screenshot-dialog" ref={dialog} aria-label={'Screenshot after ' + title}
      onPointerDown={(event) => { startedOnBackdrop.current = isBackdrop(event); }}
      onClick={closeOnBackdrop}>
      <div className="screenshot-toolbar">
        <form method="dialog"><button type="submit">Close</button></form>
      </div>
      {viewed && <img src={source} alt={alt} width={width} height={height} />}
    </dialog>
  </>;
}

function Scene({ event, roster }) {
  const painting = eventPainting(event, roster);
  const art = painting ?? (event.hero && heroPainting(event.hero.name, event.hero.level));
  const subject = event.hero?.name ?? event.title;
  return <article className="milestone">
    <div className="scene-backdrop" aria-hidden="true">
      <StoryArt art={art} />
    </div>
    <div className="milestone-frame">
      <StoryArt art={art} alt={'Illustration of ' + subject} framed />
      <div className="milestone-copy">
        <header className="milestone-heading">
          <EventTime event={event} />
          {event.dungeon && <p className="eyebrow">{event.dungeon}</p>}
          <h3>{event.title}</h3>
          {event.hero && <p className="milestone-hero">{event.hero.name}</p>}
        </header>
        <div className="milestone-details">
          <EventDetails event={event} hasPainting={Boolean(painting)} />
          {event.screenshot && <MilestoneScreenshot screenshot={event.screenshot} title={event.title} />}
        </div>
      </div>
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
        <Scene event={event} roster={byName} />
      </li>)}
    </ol>
  </section>;
}

function App() {
  const [snapshot, setSnapshot] = useState(undefined);
  const ready = snapshot !== undefined;
  const journal = useReadingPosition(ready);
  useSceneMotion(journal, ready);
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
  return <main className="journal" ref={journal} style={{ '--frame-ratio': sceneRatio }}>
    <h1 className="visually-hidden">Our Little Adventure</h1>
    <Creation />
    <Timeline heroes={heroes} snapshot={snapshot} />
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
