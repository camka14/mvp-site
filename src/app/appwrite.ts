import { Client, Account, Databases, ID, TablesDB } from "appwrite";

const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!);

const account = new Account(client);
const tablesDB = new TablesDB(client);

export { client, account, tablesDB as databases, ID };
