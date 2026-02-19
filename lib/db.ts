import { MongoClient } from 'mongodb';

if (!process.env.MONGO_DB_USER || !process.env.MONGO_DB_PASS) {
  throw new Error('Invalid/Missing environment variable: "MONGO_DB_USER" or "MONGO_DB_PASS"');
}

const uri = "mongodb+srv://" + process.env.MONGO_DB_USER + ":" + process.env.MONGO_DB_PASS + "@meal-recommendation-dev.8occ3cw.mongodb.net/";
const options = {};

let client;
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === 'development') {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  let globalWithMongo = global as typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>;
  };

  if (!globalWithMongo._mongoClientPromise) {
    client = new MongoClient(uri, options);
    globalWithMongo._mongoClientPromise = client.connect();
  }
  clientPromise = globalWithMongo._mongoClientPromise;
} else {
  // In production mode, it's best to not use a global variable.
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

// Export a module-scoped MongoClient promise. By doing this in a
// separate module, the client can be shared across functions.
export default clientPromise;