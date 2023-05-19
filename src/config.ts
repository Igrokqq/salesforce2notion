import { config as loadEnv } from 'dotenv';

loadEnv();

export const getConfig = () => {
  return {
    notionAuthToken: process.env.NOTION_AUTH_TOKEN,
    salesforceLoginUrl: process.env.SALESFORCE_LOGIN_URL,
    salesforceUsername: process.env.SALESFORCE_USER,
    salesforcePassword: process.env.SALESFORCE_PASS,
    notionLeadDatabaseId: process.env.NOTION_LEAD_DATABASE_ID,
  }
}
