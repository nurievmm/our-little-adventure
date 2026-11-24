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
  return [...mergeTimed(story.legacy, legacy, keyOf)].map(([key, event]) => ({
    ...event, key: 'legacy/' + key, kind: 'legacy',
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
    const match = /^(.+)-(75|150|225|300)$/.exec(event.key.slice(prefix.length));
    if (match) skillNames.add(match[1]);
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
        key: hero.name + '/' + skill + '/' + cap, kind: 'profession', hero, skill,
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

export function journeyMilestones(heroes, snapshot) {
  const records = new Map((snapshot?.milestones ?? []).map((event) => [event.key, event]));
  const legacy = legacyMilestones(snapshot?.legacy);
  const bosses = bossMilestones(snapshot?.bossMatches);
  const events = [...legacy, ...bosses, ...heroes.flatMap((hero) => powerMilestones(hero, snapshot, records, legacy))];
  function order(event) {
    const anchor = event.at ?? event.by;
    return validTime(anchor) ? dateValue(anchor) : Infinity;
  }
  return events.sort((a, b) => order(a) - order(b) || a.title.localeCompare(b.title));
}
