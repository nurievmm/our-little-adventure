import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import roster from './roster.json';
import './style.css';

const base = import.meta.env.BASE_URL;
const source = 'https://kochurovvs.github.io/forever-heroes/';
const chapters = [
  { id: 'company', label: 'The company', icon: '✦' },
  { id: 'legacy', label: 'Level milestones', icon: '✧' },
  { id: 'trades', label: 'Crafting milestones', icon: '✿' },
];
const colors = { Paladin: '#f0a6be', Mage: '#89dbe9', Rogue: '#f8d675', Priest: '#f1ebd9', Shaman: '#8fbaff', Warlock: '#c9adff', Hunter: '#b9d38c', Druid: '#fbb079', Warrior: '#e8aa91' };
const crafting = new Set(['Alchemy', 'Blacksmithing', 'Enchanting', 'Engineering', 'Leatherworking', 'Tailoring']);
const dateLabel = (value) => new Intl.DateTimeFormat('en', {
  dateStyle: 'medium', timeZone: 'UTC',
}).format(new Date(value));

function useJourney() {
  const [active, setActive] = useState('');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const hero = document.querySelector('.hero');
    const sections = chapters.map(({ id }) => document.getElementById(id));
    let frame = 0;
    function update() {
      frame = 0;
      const distance = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(distance > 0 ? Math.min(1, Math.max(0, window.scrollY / distance)) : 0);
      hero.style.setProperty('--hero-scroll', Math.min(80, window.scrollY * 0.14) + 'px');
      const readingLine = window.innerHeight * 0.45;
      const current = sections.findLast((section) => section.getBoundingClientRect().top <= readingLine);
      setActive(current?.id ?? '');
      for (const section of sections) {
        const bounds = section.getBoundingClientRect();
        section.classList.toggle('in-view', bounds.top < window.innerHeight * 0.88 && bounds.bottom > window.innerHeight * 0.13);
      }
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    const resize = new ResizeObserver(schedule);
    resize.observe(document.body);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    update();
    return () => {
      resize.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
    };
  }, []);
  return { active, progress };
}

function Expand({ id, label, children }) {
  const [open, setOpen] = useState(false);
  const buttonId = id + '-toggle';
  return <>
    <button type="button" className="expand" id={buttonId} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      {label}<span className="expand-icon" aria-hidden="true">{open ? '−' : '+'}</span>
    </button>
    <div id={id} className={'details' + (open ? ' is-open' : '')} role="region" aria-labelledby={buttonId} aria-hidden={!open} inert={!open}>
      <div className="details-inner">{children}</div>
    </div>
  </>;
}

function Chapter({ id, index, title, subtitle, description, art, alt, children }) {
  return <section id={id} className={'chapter chapter-' + id} aria-labelledby={id + '-title'}>
    <div className="chapter-marker" aria-hidden="true">{chapters[index].icon}</div>
    <div className="chapter-card">
      <div className="chapter-art"><img src={base + 'art/' + art + '.jpg'} alt={alt} loading="lazy" width="960" height="540" /></div>
      <div className="chapter-copy">
        <p className="eyebrow chapter-label">{subtitle}</p>
        <h3 id={id + '-title'}>{title}</h3>
        <p className="chapter-description">{description}</p>
        {children}
      </div>
    </div>
  </section>;
}

function Portrait({ hero }) {
  const [failed, setFailed] = useState(false);
  return <div className="portrait" style={{ '--class-color': colors[hero.className] }}>
    {hero.portrait && !failed
      ? <img src={hero.portrait} alt="" loading="lazy" onError={() => setFailed(true)} />
      : <span aria-hidden="true">{hero.name.split(' ').map((word) => word[0]).join('')}</span>}
  </div>;
}

function Roster({ heroes }) {
  return <ul className="roster">
    {heroes.map((hero) => <li key={hero.name}>
      <Portrait key={hero.portrait} hero={hero} />
      <div><strong>{hero.name}</strong><small>{hero.race} · {hero.className}</small>
      {hero.profession && <small>{hero.profession.name} · {hero.profession.skill}</small>}</div>
      <span className="level" aria-label={'Level ' + hero.level}>{hero.level}</span>
    </li>)}
  </ul>;
}

function MilestoneDates({ events }) {
  if (!events.length) return null;
  return <ul className="milestones">{events.map((event) => (
    <li key={event.key}><strong>{event.name}</strong> {event.text}
      <small>First observed {dateLabel(event.observedAt)}</small>
    </li>
  ))}</ul>;
}

function Legacy({ heroes, milestones }) {
  const reached = [25, 45, 60].map((level) => ({
    level, qualifying: heroes.filter((hero) => hero.level >= level),
  })).filter(({ qualifying }) => qualifying.length);
  return <>
    <div className="thresholds">
      {reached.map(({ level, qualifying }) => <div key={level}>
        <strong>{level}</strong><span>{qualifying.length} {qualifying.length === 1 ? 'hero' : 'heroes'} reached</span>
      </div>)}
    </div>
    <Expand id="level-details" label="See who reached each milestone">
      <ul className="milestones">{reached.map(({ level, qualifying }) => (
        <li key={level}><strong>Level {level}</strong><small>{qualifying.map((hero) => hero.name).join(' · ')}</small></li>
      ))}</ul>
      <MilestoneDates events={milestones.filter((event) => event.key.includes('/level-'))} />
      <a href="https://worldofwarcraft.blizzard.com/en-us/news/24307383">About Forever’s Legacy system</a>
    </Expand>
  </>;
}

function Trades({ heroes, milestones }) {
  const achievements = new Map();
  for (const hero of [...roster, ...heroes]) {
    const skills = hero.skills ?? (hero.profession ? [hero.profession] : []);
    for (const { name, skill } of skills) {
      const key = hero.name + '/' + name;
      if (crafting.has(name) && skill >= 150 && skill > (achievements.get(key)?.skill ?? 0)) {
        achievements.set(key, { hero: hero.name, name, skill });
      }
    }
  }
  const makers = [...achievements.values()].sort((first, second) => second.skill - first.skill);
  return <Expand id="craft-details" label="See crafting achievements">
    <ul className="milestones">{makers.map(({ hero, name, skill }) => (
      <li key={hero + name}><strong>{hero}</strong><small>{name} · {skill} skill</small></li>
    ))}</ul>
    <MilestoneDates events={milestones.filter((event) => crafting.has(event.key.split('/')[1]?.split('-')[0]))} />
  </Expand>;
}

function App() {
  const [snapshot, setSnapshot] = useState(null);
  const { active, progress } = useJourney();
  useEffect(() => {
    const controller = new AbortController();
    fetch(base + 'characters.json', { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (Array.isArray(data?.heroes) && data.heroes.length) setSnapshot(data); })
      .catch(() => { /* The opening roster remains available if a sync is unavailable. */ });
    return () => controller.abort();
  }, []);
  const heroes = snapshot?.heroes ?? roster;
  const lead = heroes.reduce((highest, hero) => hero.level > highest.level ? hero : highest);

  return <>
    <a href="#journey" className="skip">Skip to the journey</a>
    <header className="topbar">
      <div className="topbar-content">
        <a href="#top" className="wordmark"><span aria-hidden="true">✦</span> Our Little Adventure</a>
        <nav aria-label="Chapter navigation">
          {chapters.map((chapter) => <a key={chapter.id} href={'#' + chapter.id} aria-current={chapter.id === active ? 'location' : undefined}>{chapter.label}</a>)}
        </nav>
      </div>
      <div className="scroll-progress" aria-hidden="true" style={{ transform: 'scaleX(' + progress + ')' }} />
    </header>

    <main id="top">
      <section className="hero" aria-labelledby="page-title">
        <img className="hero-art" src={base + 'art/valley.jpg'} alt="" fetchPriority="high" />
        <div className="hero-shade" />
        <div className="hero-inner">
          <p className="eyebrow hero-label"><span aria-hidden="true">✦</span> Side Quest Company <span className="divider" aria-hidden="true"></span> WoW Forever</p>
          <h1 id="page-title">Our little<br/><em>adventure.</em></h1>
          <p>Thirteen heroes and a long road through Azeroth. This is the story of the milestones we’ve reached together.</p>
          <a className="start" href="#journey">Start the journey</a>
        </div>
        <span className="hero-note" aria-hidden="true">✦ &nbsp; AZEROTH, EU</span>
      </section>

      <div className="journal" id="journey">
        <div className="journal-heading"><p className="eyebrow">The company journal</p><h2>Along the way</h2></div>
        <div className="chapters">
          <Chapter id="company" index={0} title="The company assembles" subtitle="The opening roster"
            description="Thirteen heroes make up the Side Quest Company. Here’s who joined the adventure, from Undead and Tauren to the Skyborne."
            art="company" alt="World of Warcraft: Forever characters gathered around a campfire">
            <div className="inline-facts"><span>{heroes.length} heroes</span><span>{new Set(heroes.map((hero) => hero.className)).size} classes</span><span>EU region</span></div>
            <Expand id="company-details" label="Meet the heroes"><Roster heroes={heroes} /></Expand>
          </Chapter>
          <Chapter id="legacy" index={1} title="Level 25 and beyond" subtitle="Legacy progression"
            description={lead.name + ' has reached level ' + lead.level + '. Level 25 marked the company’s first class Legacy threshold.'}
            art="summit" alt="Mount Hyjal in World of Warcraft: Forever">
            <Legacy heroes={heroes} milestones={snapshot?.milestones ?? []} />
          </Chapter>
          <Chapter id="trades" index={2} title="A craft worth keeping" subtitle="Profession milestones"
            description="The company’s crafters have already reached 150 skill and beyond. Their workbenches tell another part of the story."
            art="trades" alt="Orgrimmar in World of Warcraft: Forever">
            <Trades heroes={heroes} milestones={snapshot?.milestones ?? []} />
          </Chapter>
        </div>
        {snapshot?.milestones.some((event) => event.key.endsWith('/first-mount')) && (
          <section className="journal-notes" aria-labelledby="mount-notes">
            <h2 id="mount-notes">First mounts</h2>
            <MilestoneDates events={snapshot.milestones.filter((event) => event.key.endsWith('/first-mount'))} />
          </section>
        )}
      </div>
    </main>
    <footer>
      <div><span aria-hidden="true">✦</span> Side Quest Company <span>·</span> An unofficial WoW Forever journal <a href="https://blizzard.gamespress.com/wowforeverreveal">Screenshots by Blizzard Entertainment</a></div>
      <div>{snapshot?.fetchedAt ? 'Battle.net snapshot · ' + dateLabel(snapshot.fetchedAt) + ' · ' + snapshot.syncedCount + '/' + heroes.length + ' profiles refreshed' : 'Opening roster · Nov 23, 2026'} <a href={source + '#rows'}>Roster source</a></div>
    </footer>
  </>;
}

createRoot(document.getElementById('root')).render(<App />);
