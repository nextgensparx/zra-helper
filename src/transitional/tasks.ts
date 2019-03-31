import { getListItemStore } from '@/store/helpers/list_store';
import log from '@/transitional/log';

/** @typedef {import('vuex').Store} VuexStore */

/**
 * Gets a task's ListItemStore from an ID.
 * @param {VuexStore} store
 * @param {number} id
 * @returns {import('@/store/helpers/list_store').ListItemStore}
 */
function taskFromId(store, id) {
  return getListItemStore(store, {
    id,
    namespace: 'tasks',
    list: 'tasks',
  });
}

/**
 * @typedef {import('@/store/modules/tasks').TaskState} TaskState
 * @typedef {import('@/store/modules/tasks').TaskCreateOptions} TaskCreateOptions
 */

/**
 * @typedef {function} Task.setError
 * @param {Error} error
 */

/**
 * @typedef {function} Task.addStep
 * @param {string} status
 * @param {number} increment
 */

/**
 * @typedef {function} Task.addDownload
 * @param {number} downloadId
 */

/**
 * @typedef TaskObject.Temp
 * @property {boolean} hasParent
 * @property {TaskObject} parent
 * @property {boolean} hasChildren
 * @property {TaskObject[]} children
 * @property {Object.<TaskState, number>} childStateCounts
 * Total number of child states per state type
 * @property {string} childStateString
 * @property {boolean} complete
 * @property {number} progress
 * @property {number} progressMax
 *
 * @property {function} markAsComplete
 * @property {Task.setError} setError
 * @property {Task.addStep} addStep
 * @property {Task.addDownload} addDownload
 * @property {function} setStateBasedOnChildren
 * @property {function} setErrorBasedOnChildren
 */

/**
 * @typedef {import('@/store/modules/tasks').TaskVuexState} TaskVuexState
 */

/**
 * @typedef {TaskVuexState & TaskObject.Temp} TaskObject
 * Wrapper around the task Vuex module to make it compatible with legacy code.
 */

class Task {
  constructor() {
    this.listStoreTask = null;
  }

  /**
   * Creates a new task.
   * @param {VuexStore} store
   * @param {TaskCreateOptions} data
   */
  async init(store, data) {
    const id = await store.dispatch('tasks/create', data);
    this.listStoreTask = taskFromId(store, id);
    return new Proxy(this, {
      /**
       * @param {Task} obj
       * @param {string} prop
       */
      get(obj, prop) {
        /**
         * TODO: Find a less hacky way to prevent the Proxy from overriding actual properties and
         * methods.
         */
        if (
          typeof prop === 'string'
          && prop !== 'addStep'
          && prop !== 'setError'
          && prop !== 'addDownload'
          && prop !== 'listStoreTask'
        ) {
          return obj.listStoreTask[prop];
        }
        return Reflect.get(...arguments); // eslint-disable-line prefer-rest-params
      },
      /**
       * @param {Task} obj
       * @param {string} prop
       * @param {*} value
       */
      set(obj, prop, value) {
        obj.listStoreTask[prop] = value;
        return true;
      },
    });
  }

  setError(error) {
    this.listStoreTask.setError({ error });
  }

  addStep(status, increment = null) {
    const options = { status };
    if (increment !== null) {
      options.increment = increment;
    }
    this.listStoreTask.addStep(options);
  }

  addDownload(downloadId) {
    this.listStoreTask.addDownload({ downloadId });
  }
}

/**
 * TODO: Document this
 * @param {VuexStore} store
 * @param {TaskCreateOptions} data
 * @returns {Promise.<TaskObject>}
 */
export default async function createTask(store, data) {
  try {
    const task = new Task();
    const taskProxy = await task.init(store, data);
    return taskProxy;
  } catch (error) {
    log.showError(error);
    throw error;
  }
}