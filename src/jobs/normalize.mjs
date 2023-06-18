import dotenv from 'dotenv';
import MongoClient from '../MongoClient.mjs';
import genreMapping from "../mappings/genres.mjs"
import publisherMapping from "../mappings/publisher.mjs"
import fs from "fs";

dotenv.config();

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


async function fetchDistinct(field) {
  const values = await mongoClient.fetchDistinct(field);
  fs.writeFile("./values.js", JSON.stringify(values), {}, () => {});
  await mongoClient.disconnect();
}

function getMappedValue(fieldValue, mapping) {
  let value = fieldValue;
  Object.keys(mapping).forEach(key => {
    const valueMap = mapping[key];
    if (valueMap.includes(fieldValue)) {
      value = key
    } 
  })

  return value;
}


async function normalize(field, mapping) {
  const docs = await mongoClient.fetchAll();

  while(await docs.hasNext()) {
    const doc = await docs.next();
    let fieldValue = doc[field];
    if (Array.isArray(fieldValue)) {
      fieldValue = fieldValue[0];
    }

    const normalized = getMappedValue(fieldValue, mapping);
    if (doc[field] !== normalized) {
      console.log(`${doc[field]} to ${normalized}`)
      doc[field] = normalized;
      await mongoClient.updateDocument(doc);
    }
  }

  await mongoClient.disconnect();
}

async function setYears() {
  const docs = await mongoClient.fetchAll();

  while(await docs.hasNext()) {
    const doc = await docs.next();
    let fieldValue = doc["releaseDate"];
    if (Array.isArray(fieldValue)) {
      fieldValue = fieldValue[0];
    }

    let year = null;
    const regex = /[\d]{4}/g;
    const matches = fieldValue.match(regex);
    if (matches) {
      year = parseInt(matches[0]);
    }

      doc["publishYear"] = year;
      await mongoClient.updateDocument(doc);
 
  }

  await mongoClient.disconnect();
}

// normalize("genre", genreMapping);
// normalize("publisher", publisherMapping);
setYears("releaseDate");