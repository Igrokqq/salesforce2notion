import { Client } from '@notionhq/client';
import { PageObjectResponse, QueryDatabaseResponse } from '@notionhq/client/build/src/api-endpoints';
import * as jsforce from 'jsforce';
import * as _ from 'lodash';
import { join } from 'path';
import * as ProgressManager from './progress-manager';
import Logger from './logger';
import { getConfig } from './config';

const config = getConfig();
const progressFilePath = join(__dirname, 'notion2salesforceprogress.json');

const notion = new Client({
  auth: config.notionAuthToken,
});

const salesforceConn = new jsforce.Connection({
  loginUrl: config.salesforceLoginUrl,
});

async function isContactExistInSalesforce(phone: string, lastName: string) {
  const query = `SELECT Id FROM Lead WHERE LastName = '${lastName}' AND Phone = '${phone}' LIMIT 1`;
  const result = await salesforceConn.query(query);

  return result.totalSize > 0;
}

function getSalesforceErrorMessageFromResult(result: jsforce.ErrorResult): string {
  return result.errors.reduce((messages: string[], error: jsforce.Error) => {
    messages.push(error.message);
    return messages;
  }, []).join(',');
}

async function saveProgress(path: string, rowId: string) {

  Logger.log(`[Notion2Salesforce]: saving progress ${rowId} row id`);

  try {
    await ProgressManager.saveProgress(path, { rowId });

    Logger.log('[Notion2Salesforce]: progress successfully saved');
  } catch (error: any) {
    Logger.error(`[Notion2Salesforce]: progress saving failed ${error.message}`);
  }
}

async function migrateContactsFromNotionToSalesforce() {
  let lastRowId = await ProgressManager.getProgress(progressFilePath);
  const hasSavedProgress = !_.isEmpty(lastRowId);
  let startedFromProgressPoint = false;

  try {
    const notionContacts: QueryDatabaseResponse = await notion.databases.query({
      database_id: config.notionLeadDatabaseId,
    });
    await salesforceConn.login(config.salesforceUsername, config.salesforcePassword);

    for (const contact of notionContacts.results as PageObjectResponse[]) {
      if (hasSavedProgress && !startedFromProgressPoint) {
        if (contact.id === lastRowId) {
          startedFromProgressPoint = true;
        } else {
          continue;
        }
      }

      lastRowId = contact.id;

      const lastName = _.get(contact.properties.LastName, 'title[0].text.content', null);
      const phoneNumber = _.get(contact.properties.Phone, 'phone_number', null);
      const company = _.get(contact.properties.Company, 'rich_text[0].text.content', null);

      Logger.log(`[Notion2Salesforce]: contact ${JSON.stringify(contact.properties)}`);
      Logger.log(`[Notion2Salesforce]: parsedData ${JSON.stringify({ lastName, phoneNumber, company })}`);

      if (_.isEmpty(lastName) || _.isEmpty(phoneNumber) || _.isEmpty(company)) {
        Logger.log(`[Notion2Salesforce]: some row values are missing ${JSON.stringify(contact.properties)}`);
        continue;
      }

      const isExist = await isContactExistInSalesforce(phoneNumber, lastName);

      if (isExist) {
        Logger.log(`[Notion2Salesforce]: contact already exists ${JSON.stringify(contact.properties)}`);
        continue;
      }

      const result: jsforce.ErrorResult | jsforce.RecordResult = await salesforceConn.sobject('Lead').create({
        LastName: lastName,
        Company: company,
        Phone: phoneNumber,
      });

      if (!_.isEmpty((result as jsforce.ErrorResult).errors)) {
        const errorMessage = getSalesforceErrorMessageFromResult(result as jsforce.ErrorResult);

        throw new Error(`[Notion2Salesforce]: contact creation failed ${errorMessage}`);
      }
    }

    Logger.log('[Notion2Salesforce]: migrated successfully!');
  } catch (error) {
    await saveProgress(progressFilePath, lastRowId);

    Logger.error('[Notion2Salesforce]: migration failed', error);
  }
}

migrateContactsFromNotionToSalesforce();
