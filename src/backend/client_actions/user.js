import store from '@/store';
import log from '@/transitional/log';
import createTask from '@/transitional/tasks';
import { taskStates } from '@/store/modules/tasks';
import { clickElement, createTab, executeScript, tabLoaded, closeTab, runContentScript } from '@/backend/utils';

/** @typedef {import('@/backend/constants').Client} Client */

/**
 * Creates a new tab, logs in and then closes the tab
 * @param {Object} payload
 * @param {Client} payload.client
 * @param {number} payload.parentTaskId
 * @param {boolean} [payload.keepTabOpen] Whether the logged in tab should be kept open after logging in.
 * @returns {Promise.<number>} The ID of the logged in tab.
 * @throws {import('@/backend/errors').ExtendedError}
 */
export async function login({ client, parentTaskId, keepTabOpen = false }) {
  const task = await createTask(store, {
    title: 'Login',
    parent: parentTaskId,
    progressMax: 7,
    status: 'Opening tab',
  });

  log.setCategory('login');
  log.log(`Logging in client "${client.name}"`);
  let tabId = null;
  try {
    const tab = await createTab('https://www.zra.org.zm');
    tabId = tab.id;
    task.addStep('Waiting for tab to load');
    try {
      await tabLoaded(tab.id);
      task.addStep('Navigating to login page');
      // Navigate to login page
      await clickElement(
        tab.id,
        // eslint-disable-next-line max-len
        '#leftMainDiv>tbody>tr:nth-child(2)>td>div>div>div:nth-child(2)>table>tbody>tr:nth-child(1)>td:nth-child(1)>ul>li>a',
        'go to login button',
      );
      task.addStep('Waiting for login page to load');
      await tabLoaded(tab.id);
      task.addStep('Logging in');
      // OCRAD should be imported in login.js but work with webpack
      await executeScript(tab.id, 'ocrad', true);
      // Actually login
      await runContentScript(tab.id, 'login', {
        client,
        maxCaptchaRefreshes: 10,
      });
      task.addStep('Waiting for login to complete');
      await tabLoaded(tab.id);
      task.addStep('Checking if login was successful');
      await runContentScript(tab.id, 'check_login', { client });
      task.state = taskStates.SUCCESS;
      log.log(`Done logging in "${client.name}"`);
      return tab.id;
    } finally {
      if (!keepTabOpen) {
        // Don't need to wait for the tab to close to carry out logged in actions
        // TODO: Catch tab close errors
        closeTab(tab.id);
      }
    }
  } catch (error) {
    if (keepTabOpen && tabId !== null) {
      // TODO: Catch tab close errors
      closeTab(tabId);
    }
    task.setError(error);
    throw error;
  } finally {
    task.markAsComplete();
  }
}

/**
 * Creates a new tab, logs out and then closes the tab
 * @param {Object} payload
 * @param {number} payload.parentTaskId
 * @param {number} [payload.loggedInTabId]
 * @returns {Promise}
 */
export async function logout({ parentTaskId, loggedInTabId = null }) {
  const task = await createTask(store, {
    title: 'Logout',
    parent: parentTaskId,
    unknownMaxProgress: false,
    progressMax: 3,
    status: 'Opening tab',
  });

  log.setCategory('logout');
  log.log('Logging out');
  try {
    let tabId = loggedInTabId;
    if (loggedInTabId === null) {
      const tab = await createTab('https://www.zra.org.zm/main.htm?actionCode=showHomePageLnclick');
      tabId = tab.id;
    }
    try {
      task.addStep('Initiating logout');
      // Click logout button
      await clickElement(tabId, '#headerContent>tbody>tr>td:nth-child(3)>a:nth-child(23)', 'logout button');
      task.addStep('Waiting to finish logging out');
      task.state = taskStates.SUCCESS;
      log.log('Done logging out');
    } finally {
      // Note: The tab automatically closes after pressing logout
      // TODO: Catch tab close errors
      closeTab(tabId);
    }
  } catch (error) {
    task.setError(error);
    throw error;
  } finally {
    task.markAsComplete();
  }
}

/**
 * Logs in a client and retries if already logged in as another client
 * @param {Object} payload
 * @param {Client} payload.client
 * @param {number} payload.parentTaskId
 * @param {number} payload.maxAttempts The maximum number of times an attempt should be made to login to a client.
 * @param {boolean} [payload.keepTabOpen] Whether the logged in tab should be kept open.
 * @returns {Promise.<number>} The ID of the logged in tab.
 */
export async function robustLogin({
  client, parentTaskId, maxAttempts, keepTabOpen = false,
}) {
  const task = await createTask(store, {
    title: 'Robust login',
    parent: parentTaskId,
    unknownMaxProgress: false,
    // After every login attempt except the last one, we logout.
    // So if the maximum number of login attempts is 3, we login 3 times but only logout 2 times.
    // Thus the total number of tasks would be 3 + (3-1) = 5
    progressMax: maxAttempts + (maxAttempts - 1),
  });
  let attempts = 0;
  let run = true;
  try {
    let loggedInTabId = null;
    /* eslint-disable no-await-in-loop */
    while (run) {
      try {
        if (attempts > 0) {
          task.status = 'Logging in again';
        } else {
          task.status = 'Logging in';
        }
        loggedInTabId = await login({ client, parentTaskId: task.id, keepTabOpen });
        run = false;
      } catch (error) {
        if (error.type === 'LoginError' && error.code === 'WrongClient' && attempts + 1 < maxAttempts) {
          log.setCategory('login');
          log.showError(error, true);
          task.status = 'Logging out';
          await logout({ parentTaskId: task.id });
          run = true;
        } else {
          throw error;
        }
      }
      attempts++;
    }
    /* eslint-enable no-await-in-loop */
    task.state = taskStates.SUCCESS;
    return loggedInTabId;
  } catch (error) {
    task.setError(error);
    throw error;
  } finally {
    task.markAsComplete();
  }
}
