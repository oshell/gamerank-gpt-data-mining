import dotenv from 'dotenv';
import MongoClient from '../MongoClient.mjs';
import GptClient from '../GptClient.mjs';
import genres from "../mappings/genres.mjs";

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

const getListQuery = `Tell me what's the genre of the game %GAME% published
by the studio %PUBLISHER%. Choose maxium 3 values from this array: %VALUES%.
Return the result as an Array of strings in JSON format.`;

async function fetchGenre() {
  const docs = await mongoClient.fetchAll();
  const genreString = JSON.stringify(Object.keys(genres));

  while(await docs.hasNext()) {
    const doc = await docs.next();

    const replacements = {
      '%GAME%': doc.title,
      '%PUBLISHER%': doc.publisher,
      '%VALUES%': genreString,
    };

    console.log(`Fetching genres for ${doc.title}!`);
    const query = replacePlaceholders(getListQuery, replacements);
    let genre = await gptClient.getJsonQuery(query);

    if (genre && genre.length && typeof genre[0] === "string") {
      console.log("fetching genre sucessful! Saving...");
      genre = genre.length > 10 ? genre.slice(0, 10) : genre;
      console.log(genre);
      doc.genre = genre;
      await mongoClient.updateDocument(doc);
    } else {
      console.log("Fetching genre failed.");
      console.log(genre);
    }
  }

  await mongoClient.disconnect();
}


await fetchGenre();