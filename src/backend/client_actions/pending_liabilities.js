import Papa from 'papaparse';
import log from '@/transitional/log';
import store from '@/store';
import createTask from '@/transitional/tasks';
import { taskStates } from '@/store/modules/tasks';
import { taxTypes, exportFormatCodes } from '../constants';
import { clickElement, createTab, executeScript, sendMessage, tabLoaded, closeTab, runContentScript } from '../utils';
import { writeJson } from '../file_utils';

/**
 * @typedef {Object} getTotalsResponse
 * @property {number} numPages The total discovered number of pages.
 * @property {number[]} totals Array of totals whose length is equal to `numTotals`.
 * @see getTotals for more on numTotals.
 */

/**
 * Gets totals such as 'principal', 'interest', 'penalty' and 'total'.
 * @param {number} tabId The ID of the tab containing the report to get totals from.
 * @param {string[]} columns The columns that contain the totals we wish to retrieve
 * @returns {Promise.<getTotalsResponse>}
 */
function getTotals(tabId, columns) {
  return runContentScript(tabId, 'get_totals', {
    columns,
    /** The first column with a pending liability */
    startColumn: 5,
  });
}

/** Columns to get from the pending liabilities table */
const totalsColumns = [
  'principal',
  'interest',
  'penalty',
  'total',
];

/** @type {import('@/backend/constants').ClientActionObject} */
const clientAction = {
  id: 'getAllPendingLiabilities',
  name: 'Get all pending liabilities',
  requiresTaxTypes: true,
  async func({ parentTask, client: { taxTypes: taxTypeIds } }) {
    return new Promise((resolve) => {
      const promises = [];
      const totals = {};
      const retrievalErrors = {};
      parentTask.sequential = false;
      parentTask.unknownMaxProgress = false;
      parentTask.progressMax = taxTypeIds.length;
      for (const taxTypeId of taxTypeIds) {
        promises.push(new Promise(async (resolve) => {
          const taxType = taxTypes[taxTypeId];
          const task = await createTask(store, {
            title: `Get ${taxType} totals`,
            parent: parentTask.id,
            progressMax: 4,
            status: 'Opening tab',
          });

          log.log(`Generating ${taxType} report`);

          let tab = null;
          try {
            tab = await createTab('https://www.zra.org.zm/reportController.htm?actionCode=pendingLiability');
            await tabLoaded(tab.id);

            task.addStep('Selecting tax type');

            await executeScript(tab.id, 'generate_report');

            try {
              task.addStep('Generating report');

              await sendMessage(tab.id, {
                command: 'generate_report',
                taxTypeId,
              });
              // Get Totals
              await tabLoaded(tab.id);

              task.addStep('Getting totals');

              let totalsResponse = await getTotals(tab.id, totalsColumns);
              if (totalsResponse.numPages > 1) {
                // Set the current page to be the last one by clicking the "last page" button.
                await clickElement(tab.id, '#navTable>tbody>tr:nth-child(2)>td:nth-child(5)>a', 'last page button');
                totalsResponse = await getTotals(tab.id, totalsColumns);
              }
              totals[taxType] = totalsResponse.totals;
              task.state = taskStates.SUCCESS;
              resolve();
            } finally {
              log.log(`Finished generating ${taxType} report`);
            }
          } catch (error) {
            task.setError(error);
            if (error.type === 'TaxTypeNotFoundError') {
              // By default the `TaxTypeNotFoundError` contains the tax type.
              // We don't need to show the tax type in the status since it's under
              // a task which already has the tax type in it's title.
              task.errorString = 'Tax type not found';
            } else {
              retrievalErrors[taxType] = error;
            }
            log.showError(error);
            resolve();
          } finally {
            if (tab) {
              try {
                await closeTab(tab.id);
              } catch (error) {
              // If we fail to close the tab then it's probably already closed
              }
            }
            task.markAsComplete();
          }
        }));
      }
      Promise.all(promises).then(() => {
        let errorCount = 0;
        let taxTypeErrorCount = 0;
        for (const task of parentTask.children) {
          if (task.state === taskStates.ERROR) {
            if (task.error.type !== 'TaxTypeNotFoundError') {
              errorCount++;
            } else {
              taxTypeErrorCount++;
            }
          }
        }
        if (errorCount > 0) {
          parentTask.state = taskStates.ERROR;
        } else if (parentTask.children.length > 0 && taxTypeErrorCount === parentTask.children.length) {
        // If all sub tasks don't have a tax type, something probably went wrong
          parentTask.state = taskStates.WARNING;
          parentTask.status = 'No tax types found.';
        } else {
          parentTask.state = taskStates.SUCCESS;
        }


        parentTask.markAsComplete();
        const output = {
          totals: {},
          retrievalErrors,
        };
        for (const taxType of Object.values(taxTypes)) {
          output.totals[taxType] = Object.assign({}, totals[taxType]);
        }
        resolve(output);
      });
    });
  },
  hasOutput: true,
  defaultOutputFormat: exportFormatCodes.CSV,
  outputFormats: [exportFormatCodes.CSV, exportFormatCodes.JSON],
  outputFormatter(clientOutputs, format) {
    if (format === exportFormatCodes.CSV) {
      const rows = [];
      const columnOrder = totalsColumns;
      // Columns are: client identifier, ...totals, error
      const numberOfColumns = 2 + totalsColumns.length + 1;
      for (const { client, value } of clientOutputs) {
        const totalsObjects = value ? value.totals : null;
        let i = 0;
        for (const taxType of Object.values(taxTypes)) {
          let firstCol = '';
          if (i === 0) {
            firstCol = client.name ? client.name : `Client ${client.id}`;
          }
          const row = [firstCol, taxType];
          if (value && totalsObjects[taxType]) {
            const totalsObject = totalsObjects[taxType];
            const totals = [];
            for (const column of columnOrder) {
              totals.push(totalsObject[column]);
            }
            row.push(...totals);
          } else {
            for (let j = 0; j < columnOrder.length; j++) {
              row.push('');
            }
            // Indicate that this tax type had an error
            if (value && (taxType in value.retrievalErrors)) {
              row.push('!');
            }
          }
          // Fill empty columns
          while (row.length < numberOfColumns) {
            row.push('');
          }
          rows.push(row);
          i++;
        }
      }
      // TODO: Make output options configurable by user
      return Papa.unparse(rows, {
        quotes: true,
      });
    }
    return writeJson(clientOutputs);
  },
};
export default clientAction;
