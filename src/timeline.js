import story from './story-data.json';

const accountByHero = new Map(story.accounts.flatMap((group) => group.map((hero) => [hero, group[0]])));
export const accountOf = (hero) => accountByHero.get(hero) ?? hero;

const dateValue = (value) => Date.parse(value);
export const validTime = (value) => typeof value === 'string' && Number.isFinite(dateValue(value));

function archiveDate(archive, threshold, read) {
  let after;
  for (const { at, profile } of archive) {
    const value = read(profile);
    if (!Number.isFinite(value)) continue;
    if (value >= threshold) return { after, by: at };
    after = at;
  }
}

function observationsFor(hero, fetchedAt) {
  const archive = story.archive.flatMap(({ at, heroes }) => heroes[hero.name] ? [{ at, profile: heroes[hero.name] }] : []);
  const observedAt = hero.observedAt ?? fetchedAt;
  const skillsObservedAt = hero.skillsObservedAt ?? observedAt;
  const skills = Object.fromEntries((hero.skills ?? (hero.profession ? [hero.profession] : [])).map(({ name, skill }) => [name, skill]));
  if (validTime(observedAt)) archive.push({ at: observedAt, profile: { level: hero.level } });
  if (validTime(skillsObservedAt)) archive.push({ at: skillsObservedAt, profile: { skills } });
  return archive.sort((a, b) => dateValue(a.at) - dateValue(b.at));
}

function observationDate(event) {
  if (!validTime(event?.observedAt)) return {};
  return { after: event.observedAfter, by: event.observedAt };
}

function milestoneDate(historical, recorded) {
  const observed = observationDate(recorded);
  if (!historical) return observed;
  if (!observed.by) return historical;
  const by = dateValue(historical.by) <= dateValue(observed.by) ? historical.by : observed.by;
  const after = [historical.after, observed.after]
    .filter((value) => validTime(value) && dateValue(value) < dateValue(by))
    .sort((a, b) => dateValue(b) - dateValue(a))[0];
  return { after, by };
}

function timeKey(value) {
  return validTime(value) ? new Date(value).toISOString() : '';
}

function mergeTimed(source, current, keyOf) {
  const events = new Map();
  for (const event of [...source, ...(current ?? [])]) {
    const key = keyOf(event);
    if (!key) continue;
    const existing = events.get(key);
    events.set(key, {
      ...event,
      ...existing,
      members: [...new Set([...(existing?.members ?? []), ...event.members])],
    });
  }
  return events;
}

function legacyMilestones(legacy) {
  const keyOf = (event) => {
    const at = timeKey(event.at);
    return at && [accountOf(event.members[0]), event.id, at].join('/');
  };
  return [...mergeTimed(story.legacy, legacy, keyOf)]
    .filter(([, event]) => event.level !== 25 && event.cap !== 75)
    .map(([key, event]) => ({
      ...event,
      title: event.cap === 150 && event.skill ? event.skill + ' ' + event.cap : event.title,
      key: 'legacy/' + key,
      kind: 'legacy',
    }));
}

function bossMilestones(bossMatches) {
  const keyOf = (event) => {
    const at = timeKey(event.at);
    return at && event.id + '/' + at;
  };
  return [...mergeTimed(story.dungeonRuns, bossMatches, keyOf)].flatMap(([key, event]) => {
    const playerCounts = new Map();
    for (const name of event.members) {
      const player = accountOf(name);
      playerCounts.set(player, (playerCounts.get(player) ?? 0) + 1);
    }
    const members = event.members.filter((name) => playerCounts.get(accountOf(name)) === 1);
    return members.length >= 3 ? [{
      ...event, members: members.sort(), key: 'boss/' + key, kind: 'boss', title: event.boss,
    }] : [];
  });
}

function powerMilestones(hero, snapshot, records, legacy) {
  const prefix = hero.characterId + '/';
  const archive = observationsFor(hero, snapshot?.fetchedAt);
  const events = [];
  const coveredLevel = (level) => legacy.some((entry) => entry.level === level &&
    entry.className === hero.className && entry.members.includes(hero.name));
  for (const level of story.levelSteps) {
    const recorded = records.get(prefix + 'level-' + level);
    const historical = archiveDate(archive, level, (profile) => profile.level);
    if ((!historical && hero.level < level && !recorded) || coveredLevel(level)) continue;
    events.push({
      ...milestoneDate(historical, recorded),
      key: hero.name + '/level/' + level, kind: 'level', hero, level, title: 'Level ' + level,
      gear: recorded?.gear,
    });
  }
  const skillNames = new Set(archive.flatMap(({ profile }) => Object.keys(profile.skills ?? {})));
  for (const { name } of hero.skills ?? (hero.profession ? [hero.profession] : [])) skillNames.add(name);
  for (const event of records.values()) {
    if (!event.key.startsWith(prefix)) continue;
    const suffix = event.key.slice(prefix.length);
    const separator = suffix.lastIndexOf('-');
    if (separator > 0 && story.professionCaps.includes(Number(suffix.slice(separator + 1)))) {
      skillNames.add(suffix.slice(0, separator));
    }
  }
  for (const skill of skillNames) {
    for (const cap of story.professionCaps) {
      const recorded = records.get(prefix + skill + '-' + cap);
      const historical = archiveDate(archive, cap, (profile) => profile.skills?.[skill]);
      const currentSkill = (hero.skills ?? (hero.profession ? [hero.profession] : [])).find((item) => item.name === skill)?.skill;
      if (!historical && !recorded && !(currentSkill >= cap)) continue;
      if (legacy.some((entry) => entry.skill === skill && entry.cap === cap && entry.members.includes(hero.name))) continue;
      events.push({
        ...milestoneDate(historical, recorded),
        key: hero.name + '/' + skill + '/' + cap, kind: 'profession', hero, skill, cap,
        title: skill + ' ' + cap,
      });
    }
  }
  const pvp = records.get(prefix + 'first-pvp');
  const backfill = story.pvpDates[hero.name];
  if (backfill || pvp || hero.honorableKills > 0) {
    events.push({
      ...(backfill ?? (pvp ? observationDate(pvp) : { by: hero.pvpObservedAt ?? snapshot?.fetchedAt })),
      key: hero.name + '/pvp', kind: 'pvp', hero, title: 'First honorable kill',
    });
  }
  return events;
}

function sortMilestones(events) {
  const tracks = new Map();
  const entries = events.map((event) => {
    const date = event.at ?? event.by;
    const order = validTime(date) ? dateValue(date) : Infinity;
    const name = event.hero?.name ?? (event.members?.length === 1 ? event.members[0] : undefined);
    const threshold = event.skill ? event.cap : event.level;
    const track = name && Number.isFinite(threshold) ? JSON.stringify([name, event.skill ?? null]) : undefined;
    const entry = { event, date, order, track, threshold };
    if (track) {
      if (!tracks.has(track)) tracks.set(track, []);
      tracks.get(track).push(entry);
    }
    return entry;
  });

  // Reaching a higher threshold establishes a latest possible date for lower ones.
  for (const track of tracks.values()) {
    track.sort((a, b) => b.threshold - a.threshold);
    let upperBound;
    for (const entry of track) {
      if (upperBound && !validTime(entry.event.at) && entry.order > upperBound.order) {
        const { after } = entry.event;
        entry.date = upperBound.date;
        entry.order = upperBound.order;
        entry.event = {
          ...entry.event, by: entry.date,
          after: validTime(after) && dateValue(after) < entry.order ? after : undefined,
        };
      }
      if (entry.order < (upperBound?.order ?? Infinity)) upperBound = entry;
    }
  }

  return entries.sort((a, b) =>
    a.order - b.order ||
    (a.track ?? a.event.title).localeCompare(b.track ?? b.event.title) ||
    (a.threshold ?? 0) - (b.threshold ?? 0) ||
    a.event.title.localeCompare(b.event.title)
  ).map(({ event }) => event);
}

export function journeyMilestones(heroes, snapshot) {
  const records = new Map((snapshot?.milestones ?? []).map((event) => [event.key, event]));
  const legacy = legacyMilestones(snapshot?.legacy);
  const bosses = bossMilestones(snapshot?.bossMatches);
  const events = [...legacy, ...bosses, ...heroes.flatMap((hero) => powerMilestones(hero, snapshot, records, legacy))];
  const ordered = new Map(sortMilestones(events).map((event) => [event.key, event]));
  const curated = [];
  for (const { key, by, hideDate } of story.timelineOrder) {
    const event = ordered.get(key);
    if (!event) continue;
    ordered.delete(key);
    curated.push({
      ...event,
      ...(by && { by, after: undefined }),
      ...(hideDate && { hideDate }),
    });
  }
  return [...curated, ...ordered.values()];
}
