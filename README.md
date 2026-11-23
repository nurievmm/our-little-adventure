# Our Little Adventure

An illustrated, scroll-driven WoW Forever journal for the Side Quest Company. The opening roster comes from the [company’s roster](https://kochurovvs.github.io/forever-heroes/#rows).

## Local development

Run `npm ci` and `npm run dev`. The opening roster is bundled for local development. Run `npm run build` to build the static site into `dist/`.

## GitHub Pages

Select **GitHub Actions** under **Settings → Pages → Build and deployment**. Add the Actions repository secrets `BATTLENET_CLIENT_ID` and `BATTLENET_CLIENT_SECRET`. The *Publish the adventure* workflow runs on pushes to `main`, on manual dispatch, and daily.

The workflow fetches public EU character profiles, portraits, mount collections, and profession skill from Battle.net. It uses the last published snapshot to record first-observed changes to Legacy levels, crafting skill, and the first collected mount. Earlier milestones have no inferred date. If the API returns no usable profiles, the last published version stays online.

Chapter screenshots are from Blizzard Entertainment’s [World of Warcraft: Forever press kit](https://blizzard.gamespress.com/wowforeverreveal).
