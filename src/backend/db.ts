import { MongoClient } from 'mongodb';
import process from 'process';

const uri = "mongodb+srv://" + process.env.MONGO_DB_USER + ":" + process.env.MONGO_DB_PASS + "@meal-recommendation-dev.8occ3cw.mongodb.net/";
const client = new MongoClient(uri);

async function run() {
    try {
        await client.connect();
        console.log("Connected successfully to server");
    } finally {
        await client.close();
    }
}

run().catch(console.error);

export const db = client.db("meal-recommendation-dev");
