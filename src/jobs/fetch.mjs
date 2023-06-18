import dotenv from 'dotenv';
import MongoClient from '../MongoClient.mjs';
import GptClient from '../GptClient.mjs';

dotenv.config();

const gptApiKey = process.env.OPENAI_API_KEY;
const dbPassword = process.env.MONGO_DB_ATLAS_PW;

const dbName = 'games-reviews';
const collectionName = 'games';
const collectionNameCache = 'gpt-query-cache';
const collectionNameErrors = 'gpt-query-errors';
const uidKeys = ['title', 'publisher'];
// Replace the following with your MongoDB Atlas connection string
const dbUri = `mongodb+srv://admin:${dbPassword}@game-cluster.9wxad.mongodb.net/?retryWrites=true&w=majority`;

const mongoClient = new MongoClient(
  dbName,
  dbPassword,
  dbUri,
  collectionName,
  collectionNameCache,
  collectionNameErrors,
  uidKeys
);
const gptClient = new GptClient(gptApiKey, mongoClient);

const replacePlaceholders = (str, replacements) => {
  return str.replace(/%\w+%/g, function (all) {
    return replacements[all] || all;
  });
};

const platforms = [
  { platform: 'PS4', releaseYear: 2013 },
  { platform: 'Switch', releaseYear: 2017 },
  { platform: 'XBOX SERIES X', releaseYear: 2020 },
  { platform: 'PS5', releaseYear: 2020 },
  { platform: 'PC', releaseYear: 2013 },
];

const currentYear = 2022;

const getListQuery = `Give me a list of the 13 best games on %PLATFORM%
released in %RELEASE_YEAR%. Return the
list as an array in JSON format, where each game is an object with the
properties title, publisher, releaseDate, genre, platforms and tags. platforms
is an array of strings specifying on which platforms the game can be played,
tags should be an array of strings with words associated to the game, such as
its game type, art style and genre. Make sure the response is valid JSON format
and properties use quotes.`;

async function fetch() {
  for (let index = 0; index < platforms.length; index++) {
    const platform = platforms[index];
    for (let year = platform.releaseYear; year <= currentYear; year++) {
      const replacements = {
        '%PLATFORM%': platform.platform,
        '%RELEASE_YEAR%': year,
      };

      console.log(`Fetching entries for ${platform.platform}, ${year}.`);
      const query = replacePlaceholders(getListQuery, replacements);

      const cached = await mongoClient.checkCache(query);
      if (cached) continue;

      const games = await gptClient.getJsonQuery(query);
      for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
        const game = games[gameIndex];
        console.log("game:", gameIndex)
        if (game.hasOwnProperty('title')) {
          await mongoClient.createDocument(game);
        }
      }

      if (games.length) {
        const cacheDoc = {
          query,
          games,
        };
  
        await mongoClient.createCache(cacheDoc);
      }
    }
  }
}

fetch();
