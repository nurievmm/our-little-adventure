import { readFile, writeFile } from 'node:fs/promises';

const roster = JSON.parse(await readFile(new URL('../src/roster.json', import.meta.url)));
const { levelSteps, professionCaps, legacy: legacySeeds } = JSON.parse(await readFile(new URL('../src/story-data.json', import.meta.url)));
const target = new URL('../public/characters.json', import.meta.url);
const nameOf = (value) => typeof value === 'string' ? value : value?.en_GB ?? value?.en_US;
const apiOrigin = 'https://eu.api.blizzard.com';
const renderUrl = (value) => typeof value === 'string' && value.startsWith('https://render.worldofwarcraft.com/') ? value : undefined;

async function request(url, options) {
  return fetch(url, { signal: AbortSignal.timeout(20000), redirect: 'error', ...options });
}

async function previousSnapshot() {
  if (process.env.PREVIOUS_SNAPSHOT_URL) {
    const response = await request(process.env.PREVIOUS_SNAPSHOT_URL);
    if (response.status === 404) return {};
    if (!response.ok) throw new Error('Previous snapshot returned HTTP ' + response.status);
    const data = await response.json();
    if (data.version !== 1 || !Array.isArray(data.heroes) || !Array.isArray(data.milestones)) {
      throw new Error('Previous snapshot could not be validated.');
    }
    return data;
  }
  try {
    return JSON.parse(await readFile(target));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function accessToken() {
  const { BATTLENET_CLIENT_ID: id, BATTLENET_CLIENT_SECRET: secret } = process.env;
  if (!id || !secret) throw new Error('Both Battle.net repository secrets are required.');
  const response = await request('https://oauth.battle.net/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(id + ':' + secret).toString('base64') },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  });
  if (!response.ok) throw new Error('Battle.net authentication returned HTTP ' + response.status);
  const { access_token: token } = await response.json();
  if (typeof token !== 'string' || !token) throw new Error('Battle.net returned no access token.');
  return token;
}

async function profileData(path, token, scope = 'profile') {
  const url = new URL(path, apiOrigin);
  url.searchParams.set('namespace', scope + '-forever-eu');
  url.searchParams.set('locale', 'en_GB');
  const response = await request(url, { headers: { Authorization: 'Bearer ' + token } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(path + ' returned HTTP ' + response.status);
  return response.json();
}

async function optionalProfileData(path, token, scope) {
  try {
    return await profileData(path, token, scope);
  } catch (error) {
    console.warn('Skipped optional endpoint ' + path + ': ' + error.message);
    return null;
  }
}

function readProfessions(payload) {
  return [...(payload.primaries ?? []), ...(payload.secondaries ?? [])].flatMap((entry) => {
    const name = nameOf(entry.profession?.name);
    const skill = entry.skill_points ?? Math.max(0, ...(entry.tiers ?? []).map((tier) => tier.skill_points ?? 0));
    return name && Number.isFinite(skill) ? [{ name, skill }] : [];
  });
}

function readEquipment(payload) {
  return (payload.equipped_items ?? []).flatMap((item) => {
    const name = nameOf(item.name);
    const slot = item.slot?.type;
    return slot && name ? [{ slot, name }] : [];
  });
}

function timestamp(value) {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const date = new Date(value < 1e12 ? value * 1000 : value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function statistics(node) {
  return [...(node.statistics ?? []),
    ...[...(node.categories ?? []), ...(node.sub_categories ?? [])].flatMap(statistics)];
}

function readBosses(payload, name) {
  if (!payload) return [];
  return statistics(payload).flatMap((stat) => {
    const match = /^(.+?) kills? \((.+)\)$/i.exec(nameOf(stat.name) ?? '');
    const at = timestamp(stat.last_updated_timestamp);
    return match && stat.quantity > 0 && Number.isInteger(stat.id) && at
      ? [{ id: stat.id, boss: match[1], dungeon: match[2], at, members: [name] }]
      : [];
  });
}

function readAchievements(payload, name) {
  return (payload?.achievements ?? []).flatMap((entry) => {
    const at = timestamp(entry.completed_timestamp);
    const title = nameOf(entry.achievement?.name);
    return at && title && Number.isInteger(entry.id) && !/^Explore /i.test(title)
      ? [{ id: entry.id, title, at, members: [name] }] : [];
  });
}

async function legacyDefinitions(entries, previous, token) {
  const seeds = Object.fromEntries(legacySeeds.map(({ id, description, skill, cap, level, className }) =>
    [id, { description, skill, cap, level, className }]));
  const catalog = { ...previous, ...seeds };
  const unknown = [...new Set(entries.map((entry) => entry.id))].filter((id) => !(id in catalog));
  for (let offset = 0; offset < unknown.length; offset += 6) {
    await Promise.all(unknown.slice(offset, offset + 6).map(async (id) => {
      const detail = await optionalProfileData('/data/wow/achievement/' + id, token, 'static');
      if (!detail) return;
      if (!detail.is_account_wide || !detail.reward_description) {
        catalog[id] = null;
        return;
      }
      const description = nameOf(detail.description) ?? '';
      const skill = /Reach (\d+) skill in (.+?) for the first time/i.exec(description);
      const level = /Reach level (\d+) for the first time on a[n]? (.+?)\.?$/i.exec(description);
      catalog[id] = {
        description,
        ...(skill && { skill: skill[2], cap: Number(skill[1]) }),
        ...(level && { level: Number(level[1]), className: level[2] }),
      };
    }));
  }
  return catalog;
}

function mergeEvidence(previous, observations, keyOf = (event) => event.id + '/' + event.at) {
  const events = new Map();
  for (const event of [...(previous ?? []), ...observations]) {
    const key = keyOf(event);
    const current = events.get(key);
    events.set(key, { ...event, ...current, members: [...new Set([...(current?.members ?? []), ...event.members])].sort() });
  }
  return [...events.values()].sort((a, b) => a.at.localeCompare(b.at) || a.id - b.id);
}

function readMounts(payload) {
  return (payload.mounts ?? []).flatMap((entry) => {
    const mount = entry.mount ?? entry;
    const name = nameOf(mount.name);
    return mount.id && name ? [{ id: mount.id, name }] : [];
  });
}

async function refresh(entry, previous, token, fetchedAt) {
  const slug = encodeURIComponent(entry.name.toLowerCase().replaceAll(' ', '-'));
  const path = '/profile/wow/character/' + slug;
  const profile = await profileData(path, token);
  if (!profile || !Number.isInteger(profile.level) || !Number.isInteger(profile.id)) {
    console.warn('Profile unavailable for ' + entry.name + '.');
    return { hero: previous ?? entry, refreshed: false };
  }
  const prior = previous?.characterId === profile.id ? previous : undefined;
  const [media, professions, mounts, equipment, pvp, achievements, counters] = await Promise.all([
    optionalProfileData(path + '/character-media', token),
    optionalProfileData(path + '/professions', token),
    optionalProfileData(path + '/collections/mounts', token),
    optionalProfileData(path + '/equipment', token),
    optionalProfileData(path + '/pvp-summary', token),
    optionalProfileData(path + '/achievements', token),
    optionalProfileData(path + '/achievements/statistics', token),
  ]);
  const asset = (key) => renderUrl(media?.assets?.find((entry) => entry.key === key)?.value);
  const skills = professions ? readProfessions(professions) : prior?.skills;
  const hero = {
    ...entry,
    characterId: profile.id,
    level: profile.level,
    race: nameOf(profile.race?.name) ?? entry.race,
    className: nameOf(profile.character_class?.name) ?? entry.className,
    portrait: asset('avatar') ?? prior?.portrait,
    model: asset('main-sd-raw') ?? asset('main-raw') ?? prior?.model,
    faction: profile.faction?.type ?? prior?.faction,
    createdAt: timestamp(profile.character_creation_timestamp ?? profile.created_timestamp) ?? prior?.createdAt,
    observedAt: fetchedAt,
    skillsObservedAt: professions ? fetchedAt : prior?.skillsObservedAt,
    pvpObservedAt: Number.isInteger(pvp?.honorable_kills) ? fetchedAt : prior?.pvpObservedAt,
    gear: equipment ? readEquipment(equipment) : prior?.gear,
    honorableKills: Number.isInteger(pvp?.honorable_kills) ? pvp.honorable_kills : prior?.honorableKills,
    skills,
    profession: skills?.toSorted((first, second) => second.skill - first.skill)[0] ?? prior?.profession ?? entry.profession,
    mounts: mounts ? readMounts(mounts) : prior?.mounts,
  };
  return {
    hero, refreshed: true,
    bosses: readBosses(counters, entry.name),
    achievements: readAchievements(achievements, entry.name),
  };
}

function transitions(previous, current) {
  if (!previous?.characterId || previous.characterId !== current.characterId) return [];
  const events = [];
  for (const threshold of levelSteps) {
    if (previous.level < threshold && current.level >= threshold) {
      events.push(['level-' + threshold, 'reached level ' + threshold + '.', current.gear, previous.observedAt]);
    }
  }
  if (previous.skills && current.skills) {
    for (const { name, skill } of current.skills) {
      const oldSkill = previous.skills.find((entry) => entry.name === name)?.skill;
      if (!Number.isFinite(oldSkill)) continue;
      for (const threshold of professionCaps) {
        if (oldSkill < threshold && skill >= threshold) events.push([name + '-' + threshold, 'reached ' + threshold + ' in ' + name + '.', undefined, previous.skillsObservedAt]);
      }
    }
  }
  if (previous.honorableKills === 0 && current.honorableKills > 0) {
    events.push(['first-pvp', 'recorded a first honorable kill.', undefined, previous.pvpObservedAt]);
  }
  if (previous.mounts?.length === 0 && current.mounts?.length) {
    const text = current.mounts.length === 1 ? 'added a first mount, ' + current.mounts[0].name + '.' : 'added mounts to their collection.';
    events.push(['first-mount', text]);
  }
  return events;
}

async function sync() {
  const [token, previous] = await Promise.all([accessToken(), previousSnapshot()]);
  const byName = new Map(previous.heroes?.map((hero) => [hero.name, hero]));
  const fetchedAt = new Date().toISOString();
  const results = [];
  // Keep the number of simultaneous profile and optional requests bounded.
  for (let offset = 0; offset < roster.length; offset += 4) {
    results.push(...await Promise.all(roster.slice(offset, offset + 4).map(async (entry) => {
      const prior = byName.get(entry.name);
      try {
        return await refresh(entry, prior, token, fetchedAt);
      } catch (error) {
        console.warn('Retaining previous data for ' + entry.name + ': ' + error.message);
        return { hero: prior ?? entry, refreshed: false };
      }
    })));
  }
  const syncedCount = results.filter((entry) => entry.refreshed).length;
  if (!syncedCount) throw new Error('Battle.net returned no usable WoW Forever profiles.');
  const heroes = results.map((entry) => entry.hero);
  const milestones = previous.milestones ?? [];
  const seen = new Set(milestones.map((event) => event.key));
  const observed = [];
  for (const hero of heroes) {
    for (const [kind, text, gear, after] of transitions(byName.get(hero.name), hero)) {
      const key = hero.characterId + '/' + kind;
      if (!seen.has(key)) {
        seen.add(key);
        observed.push({ key, name: hero.name, text, observedAt: fetchedAt, observedAfter: after, gear });
      }
    }
  }
  const achievements = results.flatMap((entry) => entry.achievements ?? []);
  const legacyCatalog = await legacyDefinitions(achievements, previous.legacyCatalog, token);
  const legacy = mergeEvidence(previous.legacy, achievements.flatMap((entry) =>
    legacyCatalog[entry.id] ? [{ ...entry, ...legacyCatalog[entry.id] }] : []
  ), (entry) => [entry.members[0], entry.id, entry.at].join('/'));
  const bossMatches = mergeEvidence(previous.bossMatches, results.flatMap((entry) => entry.bosses ?? []));
  const snapshot = {
    version: 1, fetchedAt, syncedCount, heroes, milestones: [...observed, ...milestones],
    legacy, legacyCatalog, bossMatches,
  };
  await writeFile(target, JSON.stringify(snapshot, null, 2) + '\n');
  console.log('Refreshed ' + syncedCount + '/' + roster.length + ' profiles and observed ' + observed.length + ' new milestones.');
}

// This deployment publishes the archived morning snapshot.
const archivedSnapshot = JSON.parse(await readFile(target, 'utf8'));
if (archivedSnapshot.version !== 1 || !Array.isArray(archivedSnapshot.heroes)) {
  throw new Error('Invalid morning snapshot.');
}
console.log('Publishing the archived snapshot from ' + archivedSnapshot.fetchedAt);
