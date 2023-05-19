import { Client } from '@notionhq/client';
import * as jsforce from 'jsforce';
import * as _ from 'lodash';
import { getConfig } from './config';
import Logger from './logger';
import * as ProgressManager from './progress-manager';
import { join } from 'path';

type NotionContact = Readonly<{
  company: string;
  phoneNumber: string;
  lastName: string;
}>

const config = getConfig();
const progressFilePath = join(__dirname, 'salesforce2notionprogress.json');

const notion = new Client({
  auth: config.notionAuthToken,
});

const salesforceConn = new jsforce.Connection({
  loginUrl: config.salesforceLoginUrl,
});

async function saveProgress(path: string, rowId: string) {

  Logger.log(`[Salesforce2Notion]: saving progress ${rowId} row id`);

  try {
    await ProgressManager.saveProgress(path, { rowId });

    Logger.log('[Salesforce2Notion]: progress successfully saved');
  } catch (error: any) {
    Logger.error(`[Salesforce2Notion]: progress saving failed ${error.message}`);
  }
}

const checkExistingRecord = async (params: NotionContact) => {
  const searchResults = await notion.databases.query({
    database_id: config.notionLeadDatabaseId,
    filter: {
      or: [
        {
          property: 'LastName',
          title: {
            equals: params.lastName,
          },
        },
        {
          property: 'Phone',
          phone_number: {
            equals: params.phoneNumber,
          },
        },
        {
          property: 'Company',
          rich_text: {
            equals: params.company,
          },
        },
      ],
    },
  });

  // Если найдены существующие записи, верните true
  return searchResults.results.length > 0;
};

function migrateContact(contact: NotionContact) {
  return notion.pages.create({
    parent: {
      database_id: config.notionLeadDatabaseId,
    },
    properties: {
      LastName: {
        title: [
          {
            type: 'text',
            text: {
              content: contact.lastName,
            },
          },
        ],
      },
      Phone: {
        phone_number: contact.phoneNumber,
      },
      Company: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: contact.company,
            },
          },
        ],
      },
    },
  });
}

async function migrateContactsFromSalesforceToNotion() {
  let lastRowId = await ProgressManager.getProgress(progressFilePath);
  const hasSavedProgress = !_.isEmpty(lastRowId);
  let startedFromProgressPoint = false;

  try {
    await salesforceConn.login(config.salesforceUsername, config.salesforcePassword);

    const salesforceContacts = await salesforceConn.sobject('Lead').find();

    for (const salesforceContact of salesforceContacts) {
      if (hasSavedProgress && !startedFromProgressPoint) {
        if (salesforceContact.Id === lastRowId) {
          startedFromProgressPoint = true;
        } else {
          continue;
        }
      }

      lastRowId = salesforceContact.Id;

      const contact = {
        company: _.get(salesforceContact, 'Company', null),
        phoneNumber: _.get(salesforceContact, 'Phone', null),
        lastName: _.get(salesforceContact, 'LastName', null),
      }

      Logger.log(`[Salesforce2Notion]: contact ${JSON.stringify(salesforceContact)}`);
      Logger.log(`[Salesforce2Notion]: parsedData ${JSON.stringify(contact)}`);

      const isExist = await checkExistingRecord(contact);

      if (isExist) {
        Logger.log(`[Salesforce2Notion]: contact already exists ${JSON.stringify(contact)}`);
        continue;
      }

      await migrateContact(contact);
    }

    Logger.log('[Salesforce2Notion]: migrated successfully!');
  } catch (error) {
    await saveProgress(progressFilePath, lastRowId);

    Logger.error('[Salesforce2Notion]: migration failed', error);
  }
}

migrateContactsFromSalesforceToNotion();
