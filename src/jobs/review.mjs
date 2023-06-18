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

function isRpgStyle(genre) {
  const substrings = [
    "rpg", "role", "adventure"
  ]
  const isMatch = new RegExp(substrings.join("|"), "i").test(genre);
  return isMatch;
}

const replacePlaceholders = (str, replacements) => {
  return str.replace(/%\w+%/g, function (all) {
    return replacements[all];
  });
};

const getListQuery = `Imagine you are a writer of a gaming review website.
Your style is casual and funny. Write an review of the game %GAME% published
by %PUBLISHER%. Return the result as an array of objects in JSON format,
where each object describes a section of the review. 
Each object should have the properties headline, paragraph and rating.
The sections should include %SECTIONS%.%RPGADD%%ADDITION% Rating is a value
from 1 to 100 where 100 is the best. Make sure the response is valid JSON.`;

const generalSections = `gameplay, graphics`;
const rpgSections = `world, story, ${generalSections}`;
const rpgAddition = ` The sections world and story should at least have 200 words.`
const addition = ` The sections intro and gameplay should at least have 100 words.`

async function fetchDistinct(field) {
  const docs = await mongoClient.fetchDistinct(field);
  await mongoClient.disconnect();
}

async function review() {
  const docs = await mongoClient.fetchAll();

  while(await docs.hasNext()) {
    const doc = await docs.next();

    if (doc.review) {
      console.log(`Review exists (${doc.title}). Checking next.`);
      continue;
    }
    const isRpg = isRpgStyle(doc.genre);
    const sections = isRpg ? rpgSections : generalSections;
    const reviewSections = `intro, ${sections}`;
    const rpgPlaceHolder = isRpg ? rpgAddition : "";
   
    const replacements = {
      '%GAME%': doc.title,
      '%PUBLISHER%': doc.publisher,
      '%SECTIONS%': reviewSections,
      '%RPGADD%': rpgPlaceHolder,
      '%ADDITION%': addition,
    };

    console.log(`Fetching review for ${doc.title}!`);
    const query = replacePlaceholders(getListQuery, replacements);

    const review = await gptClient.getJsonQuery(query);

    if (review && review.length) {
      console.log("Review sucessful! Saving...");
    } else {
      console.log("Review failed.");
      console.log(review);
    }

    doc.review = review;
    await mongoClient.updateDocument(doc);
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
