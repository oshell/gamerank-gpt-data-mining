import dotenv from 'dotenv';
import MongoClient from '../MongoClient.mjs';
import fetch from 'node-fetch';
import fs from 'fs';

dotenv.config();

const dbPassword = process.env.MONGO_DB_ATLAS_PW;

const clientId = process.env.TWITCH_CLIENT_ID;
const igdbBaseApiUrl = 'https://api.igdb.com/v4';
const clientSecret = process.env.TWITCH_CLIENT_SECRET;
const igdbAuthUrl = `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`;

const dbName = 'games-reviews';
const collectionName = 'games';
const collectionNameCache = 'gpt-query-cache';
const collectionNameErrors = 'gpt-query-errors';
const uidKeys = ['title', 'publisher'];
// Replace the following with your MongoDB Atlas connection string
const dbUri = `mongodb+srv://admin:${dbPassword}@game-cluster.9wxad.mongodb.net/?retryWrites=true&w=majority`;

/** @var MongoClient */
const mongoClient = new MongoClient(
  dbName,
  dbPassword,
  dbUri,
  collectionName,
  collectionNameCache,
  collectionNameErrors,
  uidKeys
);

// required to not hit rate limits (4 per sec)
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchInfo() {
  const docs = await mongoClient.fetchAll();

  const response = await fetch(igdbAuthUrl, {
    method: 'POST',
  }).then((res) => res.json());

  const authToken = response['access_token'];

  while (await docs.hasNext()) {
    try {
      const doc = await docs.next();
      let title = doc['title'];
      if (doc["igdbId"]) {
        console.log("Existing. Skipping...");
        continue;
      }
      console.log(`Fetching info for: ${title}`);
      let endpoint = '/games';
      let requestUrl = `${igdbBaseApiUrl}${endpoint}`;
      let result = await fetch(requestUrl, {
        method: 'POST',
        body: `fields *; search "${title}";`,
        headers: {
          'Client-ID': clientId,
          Authorization: `Bearer ${authToken}`,
        },
      }).then((res) => res.json());
      await sleep(400);
  
      if (!result.length) {
        console.log(`No match. Skipping.`);
        continue;
      }

      const game = result[0];
      console.log(`Search Result: ${game.name}`);
      doc['igdbId'] = game['id'];
      doc['igdbName'] = game['name'];
      doc['aggregatedRating'] = game['aggregated_rating'];
      doc['similarGames'] = game['similar_games'];

      // fetch cover
      endpoint = '/covers';
      requestUrl = `${igdbBaseApiUrl}${endpoint}`;
      result = await fetch(requestUrl, {
        method: 'POST',
        body: `fields *; where id = ${game.cover};`,
        headers: {
          'Client-ID': clientId,
          Authorization: `Bearer ${authToken}`,
        },
      }).then((res) => res.json());
      await sleep(1000);

      const cover = result[0];
      const coverUrl = `https://images.igdb.com/igdb/image/upload/t_cover_big/${cover.image_id}.jpg`;
      doc['cover'] = coverUrl;

      // fetch screenshots
      endpoint = '/screenshots';
      requestUrl = `${igdbBaseApiUrl}${endpoint}`;
      const screenshotIds = game.screenshots.join(',');
      result = await fetch(requestUrl, {
        method: 'POST',
        body: `fields *; where id = (${screenshotIds});`,
        headers: {
          'Client-ID': clientId,
          Authorization: `Bearer ${authToken}`,
        },
      }).then((res) => res.json());
      await sleep(1000);

      const screenshots = [];
      result.forEach((ss) => {
        const screenshot = {
          original: `https://images.igdb.com/igdb/image/upload/t_original/${ss.image_id}.jpg`,
          thumb: `https://images.igdb.com/igdb/image/upload/t_cover_big/${ss.image_id}.jpg`,
        };
        screenshots.push(screenshot);
      });
      sleep(1000);

      doc['screenshots'] = screenshots;

      console.log(`Updating mongodb.`);
      await mongoClient.updateDocument(doc);
    } catch (error) {
      console.log(`Error: skipping...`);
      continue;
    }
  }

  await mongoClient.disconnect();
}

fetchInfo();
