import dotenv from 'dotenv';
import MongoClient from '../MongoClient.mjs';
import GptClient from '../GptClient.mjs';
import tags from "../mappings/tags.mjs";

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

const gptClient = new GptClient(gptApiKey, mongoClient);


const replacePlaceholders = (str, replacements) => {
  return str.replace(/%\w+%/g, function (all) {
    return replacements[all];
  });
};

const getListQuery = `Give me a list of tags, associated with the game %GAME% published
by the studio %PUBLISHER%. Return the result as an array of strings in JSON format. The 
result should be sorted from most relevant to least relevant.
Make sure the response is valid JSON. Choose maximum of 5 tags 
amd only choose values that are characteristic for the game and only 
use values from this array: %VALUES%. A game can never have the tags Platformer and RPG or FPS at the same time.`;

async function review() {
  const docs = await mongoClient.fetchAll();
  const tagString = JSON.stringify(tags);;

  while(await docs.hasNext()) {
    const doc = await docs.next();

    if (doc.tags.length > 4) {
      continue;
    }

    const replacements = {
      '%GAME%': doc.title,
      '%PUBLISHER%': doc.publisher,
      '%VALUES%': tagString,
    };

    console.log(`Fetching tags for ${doc.title}!`);
    const query = replacePlaceholders(getListQuery, replacements);
    let tags = await gptClient.getJsonQuery(query);

    if (tags && tags.length && typeof tags[0] === "string") {
      console.log("fetching Tags sucessful! Saving...");
      tags = tags.length > 10 ? tags.slice(0, 10) : tags;
      console.log(tags);
      doc.tags = tags;
      await mongoClient.updateDocument(doc);
    } else {
      console.log("Fetching tags failed.");
      console.log(tags);
    }
  }

  await mongoClient.disconnect();
}

async function checkReviewed() {
  const docs = await mongoClient.fetchAll();
  let games = 0;
  let reviewed = 0;
  while(await docs.hasNext()) {
    const doc = await docs.next();
    games++;
    if (doc.review) {
      reviewed++;
    }
  }

  await mongoClient.disconnect();
  console.log("games: ", games);
  console.log("reviewed: ", reviewed);
}

await checkReviewed();
await review();
