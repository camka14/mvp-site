import { Client, Account, ID, TablesDB, Functions, Storage, Avatars } from "appwrite";

const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!);

const account = new Account(client);
const tablesDB = new TablesDB(client);
const functions = new Functions(client);
const storage = new Storage(client);
const avatars = new Avatars(client);

export { client, account, tablesDB as databases, ID, functions, storage, avatars };
