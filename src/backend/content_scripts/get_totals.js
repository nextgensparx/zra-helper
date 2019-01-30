import { errorToJson } from '../errors';
import { getElement } from './helpers/elements';

/**
 * @param {Object} message
 * @param {string} message.command
 * @param {number} message.startColumn The first column containing a total.
 * @param {number} message.numTotals The number of columns containing totals.
 */
function listener(message) {
  return new Promise((resolve) => {
    if (message.command === 'getTotals') {
      try {
        const numRecordsEl = getElement('#navTable>tbody>tr:nth-child(1)>td.Label3', 'number of records');
        /**
         * String that contains the number of records.
         * For example: "Displaying 21 to 21 of 21 records."
         */
        const numRecordsString = numRecordsEl.innerText;
        const matches = numRecordsString.match(/Displaying (\d+) to (\d+) of (\d+) records\./i);
        if (matches && matches.length === 4) {
          const recordsPerPage = 20;
          const numberOfPages = Math.ceil(matches[3] / recordsPerPage);

          // Check if grand total row exists
          if (document.querySelector('#rprtDataTable>tbody>tr.rprtDataTableGrandTotalRow')) {
            const totals = [];
            for (let i = message.startColumn; i < message.startColumn + message.numTotals; i++) {
              let cellValue = getElement(
                `#rprtDataTable>tbody>tr.rprtDataTableGrandTotalRow>td:nth-child(${i})`,
                `column ${i} in grand total row`,
              ).innerText;
              cellValue = cellValue.replace(/\n\n/g, '');
              totals.push(cellValue);
            }
            resolve({
              numberOfPages,
              totals,
            });
          } else if (document.querySelector('#rsltTableHtml>table>tbody>tr:nth-child(2)>td>center.Label3')) {
            // Check if the element that contains "No data found" exists

            // Generate an array of totals that are all zero.
            const totals = [];
            for (let i = 0; i < message.numTotals; i++) {
              totals.push(0);
            }
            resolve({
              numberOfPages,
              totals,
            });
          } else {
            resolve({
              numberOfPages,
              totals: [],
            });
          }
        } else {
          // TODO: Consider making this a custom error
          throw new Error('Invalid record number string.');
        }
      } catch (error) {
        resolve({ error: errorToJson(error) });
      }
    }
  });
}
browser.runtime.onMessage.addListener(listener);