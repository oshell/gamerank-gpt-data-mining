import { ChatGPTAPI } from 'chatgpt'
import MongoClient from './MongoClient.mjs';

export default class GptClient {
    /**
     * 
     * @param {string} apiKey 
     * @param {MongoClient} mongoClient 
     */
    constructor(apiKey, mongoClient) {
        this.apiKey = apiKey;
        this.api = new ChatGPTAPI({ apiKey });
        this.mongoClient = mongoClient;
    }

    async runQuery(query, messageId) {
        const params = {};
        if (messageId) {
            params.parentMessageId = messageId;
        }
        const res = await this.api.sendMessage(query, params);
        return res;
    }

    async getJsonQuery(query) {
        let result = await this.runQuery(query);
        let lastChar = result.text.slice(-1);
        let answer = result.text;

        const maxExtensions = 2;
        let extensions = 0;

        while (lastChar !== ']' && extensions < maxExtensions) {
            console.log("Extending query...");
            let validJson = false;
            try {
                JSON.parse(answer);
                validJson = true;
            } catch(e) {
                validJson = false;
            }

            if (validJson) {
                console.log("Error: wrong JSON format. ChatGPT return object instead of array.");
                return [];
            }
            extensions++;
            result = await this.runQuery("continue", result.id);
            const firstCharExt = result.text.charAt(0);

            if (firstCharExt === "," && lastChar !== '"') {
                answer += `"`;
            }
            answer += result.text;
            lastChar = answer.slice(-1);
        }

        let jsonResult = [];
      
        try {
          jsonResult = JSON.parse(answer);
        } catch(error) {
            console.log("Error: Parsing failed!")
            await this.mongoClient.cacheError(query, answer, error.message);
        }
      
        return jsonResult;
      }
}