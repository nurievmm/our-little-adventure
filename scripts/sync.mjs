import { readFile, writeFile } from 'node:fs/promises';

const roster = JSON.parse(await readFile(new URL('../src/roster.json', import.meta.url)));
const target = new URL('../public/characters.json', import.meta.url);
const nameOf = (value) => typeof value === 'string' ? value : value?.en_GB ?? value?.en_US;
const apiOrigin = 'https://eu.api.blizzard.com';
const crafting = new Set(['Alchemy', 'Blacksmithing', 'Enchanting', 'Engineering', 'Leatherworking', 'Tailoring']);

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

async function profileData(path, token) {
  const url = new URL(path, apiOrigin);
  url.searchParams.set('namespace', 'profile-forever-eu');
  url.searchParams.set('locale', 'en_GB');
  const response = await request(url, { headers: { Authorization: 'Bearer ' + token } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(path + ' returned HTTP ' + response.status);
  return response.json();
}

async function optionalProfileData(path, token) {
  try {
    return await profileData(path, token);
  } catch (error) {
    console.warn('Skipped optional endpoint ' + path + ': ' + error.message);
    return null;
  }
}

function readProfessions(payload) {
  return (payload.primaries ?? []).flatMap((entry) => {
    const name = nameOf(entry.profession?.name);
    const skill = entry.skill_points ?? Math.max(0, ...(entry.tiers ?? []).map((tier) => tier.skill_points ?? 0));
    return name && Number.isFinite(skill) ? [{ name, skill }] : [];
  });
}

function readMounts(payload) {
  return (payload.mounts ?? []).flatMap((entry) => {
    const mount = entry.mount ?? entry;
    const name = nameOf(mount.name);
    return mount.id && name ? [{ id: mount.id, name }] : [];
  });
}

async function refresh(entry, previous, token) {
  const slug = encodeURIComponent(entry.name.toLowerCase().replaceAll(' ', '-'));
  const path = '/profile/wow/character/' + slug;
  const profile = await profileData(path, token);
  if (!profile || !Number.isInteger(profile.level) || !Number.isInteger(profile.id)) {
    console.warn('Profile unavailable for ' + entry.name + '.');
    return { hero: previous ?? entry, refreshed: false };
  }
  const prior = previous?.characterId === profile.id ? previous : undefined;
  const [media, professions, mounts] = await Promise.all([
    optionalProfileData(path + '/character-media', token),
    optionalProfileData(path + '/professions', token),
    optionalProfileData(path + '/collections/mounts', token),
  ]);
  const portrait = media?.assets?.find((asset) => asset.key === 'avatar')?.value;
  const skills = professions ? readProfessions(professions) : prior?.skills;
  const hero = {
    ...entry,
    characterId: profile.id,
    level: profile.level,
    race: nameOf(profile.race?.name) ?? entry.race,
    className: nameOf(profile.character_class?.name) ?? entry.className,
    portrait: typeof portrait === 'string' && portrait.startsWith('https://render.worldofwarcraft.com/') ? portrait : prior?.portrait,
    skills,
    profession: skills?.toSorted((first, second) => second.skill - first.skill)[0] ?? prior?.profession ?? entry.profession,
    mounts: mounts ? readMounts(mounts) : prior?.mounts,
  };
  return { hero, refreshed: true };
}

function transitions(previous, current) {
  if (!previous?.characterId || previous.characterId !== current.characterId) return [];
  const events = [];
  for (const threshold of [25, 45, 60]) {
    if (previous.level < threshold && current.level >= threshold) events.push(['level-' + threshold, 'reached level ' + threshold + '.']);
  }
  if (previous.skills && current.skills) {
    for (const { name, skill } of current.skills.filter((entry) => crafting.has(entry.name))) {
      const oldSkill = previous.skills.find((entry) => entry.name === name)?.skill ?? 0;
      for (const threshold of [150, 225, 300]) {
        if (oldSkill < threshold && skill >= threshold) events.push([name + '-' + threshold, 'reached ' + threshold + ' in ' + name + '.']);
      }
    }
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
        return await refresh(entry, prior, token);
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
    for (const [kind, text] of transitions(byName.get(hero.name), hero)) {
      const key = hero.characterId + '/' + kind;
      if (!seen.has(key)) {
        seen.add(key);
        observed.push({ key, name: hero.name, text, observedAt: fetchedAt });
      }
    }
  }
  await writeFile(target, JSON.stringify({ version: 1, fetchedAt, syncedCount, heroes, milestones: [...observed, ...milestones] }, null, 2) + '\n');
  console.log('Refreshed ' + syncedCount + '/' + roster.length + ' profiles and observed ' + observed.length + ' new milestones.');
}

await sync();
