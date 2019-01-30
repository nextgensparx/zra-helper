import Papa from 'papaparse';
import log from '@/transitional/log';
import store from '@/store';
import createTask from '@/transitional/tasks';
import { taskStates } from '@/store/modules/tasks';
import { taxTypes } from '../constants';
import { clickElement, createTab, executeScript, sendMessage, tabLoaded, closeTab } from '../utils';

/**
 * @typedef {Object} getTotalsResponse
 * @property {number} numberOfPages The total discovered number of pages.
 * @property {number[]} totals Array of totals whose length is equal to `numTotals`.
 * @see getTotals for more on numTotals.
 */

/**
 * Gets totals such as 'principal', 'interest', 'penalty' and 'total'.
 * @param {number} tabId The ID of the tab containing the report to get totals from.
 * @param {number} numTotals Total number of pending liabilities including the grand total.
 * @returns {Promise.<getTotalsResponse>}
 */
async function getTotals(tabId, numTotals) {
  await executeScript(tabId, { file: 'get_totals.js' });
  const totalsResponse = await sendMessage(tabId, {
    command: 'getTotals',
    numTotals,
    /** The first column with a pending liability */
    startColumn: 5,
  });
  return totalsResponse;
}

/** @type {import('./base').ClientActionObject} */
const clientAction = {
  id: 'getAllPendingLiabilities',
  name: 'Get all pending liabilities',
  func({ client, parentTask, output }) {
    return new Promise((resolve) => {
      const promises = [];
      /** Total number of pending liabilities including the grand total */
      const numTotals = 4;
      const totals = {};
      parentTask.sequential = false;
      parentTask.unknownMaxProgress = false;
      parentTask.progressMax = Object.keys(taxTypes).length;
      for (const taxTypeId of Object.keys(taxTypes)) {
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

            await executeScript(tab.id, { file: 'generate_report.js' });

            try {
              task.addStep('Generating report');

              await sendMessage(tab.id, {
                command: 'generateReport',
                taxTypeId,
              });
              // Get Totals
              await tabLoaded(tab.id);

              task.addStep('Getting totals');

              let totalsResponse = await getTotals(tab.id, numTotals);
              if (totalsResponse.numberOfPages > 1) {
              // Set the current page to be the last one by clicking the "last page" button.
                await clickElement(tab.id, '#navTable>tbody>tr:nth-child(2)>td:nth-child(5)>a', 'last page button');
                totalsResponse = await getTotals(tab.id, numTotals);
              }
              totals[taxType] = totalsResponse.totals;
              task.state = taskStates.SUCCESS;
              task.status = '';
              resolve();
            } finally {
              log.log(`Finished generating ${taxType} report`);
            }
          } catch (error) {
            resolve();
            task.state = taskStates.ERROR;
            task.error = error;
            if (error.type === 'TaxTypeNotFoundError') {
            // By default the `TaxTypeNotFoundError` contains the tax type.
            // We don't need to show the tax type in the status since it's under
            // a task which already has the tax type in it's title.
              task.status = 'Tax type not found';
            } else {
              task.setErrorAsStatus();
            }
            log.showError(error);
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

        const rows = [];
        let i = 0;
        for (const taxType of Object.values(taxTypes)) {
          let firstCol = '';
          if (i === 0) {
            firstCol = client.name;
          }
          if (totals[taxType]) {
            rows.push([firstCol, taxType, ...totals[taxType]]);
          } else {
            const cols = [firstCol, taxType];
            for (let j = 0; j < numTotals; j++) {
              cols.push('');
            }
            rows.push(cols);
          }
          i++;
        }
        // TODO: Make output options configurable by user
        output.addRow(Papa.unparse(rows, {
          quotes: true,
        }));
        parentTask.markAsComplete();
        resolve();
      });
    });
  },
};
export default clientAction;