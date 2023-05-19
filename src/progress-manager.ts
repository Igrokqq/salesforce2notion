import * as fs from 'fs';
import _ = require('lodash');
import { promisify } from 'util';

const writeFile = promisify(fs.writeFile);
const accessFile = promisify(fs.access);
const appendFile = promisify(fs.appendFile);
const readFile = promisify(fs.readFile);
const checkFile = async (path: string) => {
  try {
    await accessFile(path);

    return true;
  } catch (error) {
    return false;
  }
}

type ProgressRecord = {
  rowId: string;
}


export const saveProgress = async (path: string, data: ProgressRecord): Promise<true | never> => {
  await writeFile(path, JSON.stringify(data));

  return true;
}

export const getProgress = async (path: string): Promise<string | null> => {
  const isExist = await checkFile(path);

  if (!isExist) {
    return null;
  }

  const result = await readFile(path, {encoding: 'utf-8'});

  return _.get(result, 'rowId', null);
}
