import Vue from 'vue';
import ListStoreHelper from '@/store/helpers/list_store/module_helpers';
import { errorToString } from '@/backend/errors';
import moment from 'moment';
import { Module } from 'vuex';
import { RootState } from '../types';

let lastTaskId = 0;

export enum TaskState {
  ERROR = 'error',
  SUCCESS = 'success',
  WARNING = 'warning',
}

export type TaskId = number;

// TODO: Indicate default values?
export interface TaskVuexState {
  title: string;
  anonymousTitle: string;
  id: TaskId;
  status: string;
  state: TaskState;
  progress: number;
  progressMax: number;
  indeterminate: Boolean;
  /** Child IDs */
  children: number[];
  complete: boolean;
  error: Error;
  errorString: string;
  /** Parent ID */
  parent: number;
  /**
   * Whether the maximum progress of this task can be determined.
   *
   * This is used to determine this task's progress from it's children
   * and is thus only used if it has children.
   *
   * Only set this to false if the total number of children that this
   * task can ever have and their maximum progress' are known.
   * If set to false then `progressMax` must also be set.
   */
  unknownMaxProgress: boolean;
  /** Whether only one child task will be running at a time. */
  sequential: boolean;
  /** Whether this task will automatically update it's parent progress and status. */
  autoUpdateParent: boolean;
  /**
   * Whether this task is at the highest level and has no parents. Root tasks are generally
   * associated with a single client action run.
   */
  isRoot: boolean;
  /** The Unix time at which this task was created. */
  startedAt?: number;
  /** The Unix time at which this task completed. */
  completedAt?: number;
}

export type TaskVuexStateOptional = Partial<TaskVuexState>;

/**
 * @typedef {Object} TaskCreateOptions_Temp
 * @property {string} [list]
 */
/** @typedef {TaskVuexState & TaskCreateOptions_Temp} TaskCreateOptions */

// TODO: Document this module. Especially the getters.
// TODO: Figure out how to use function documentation in transitional tasks module.

/**
 * Calculates a task's progress or maximum progress based on its children.
 * @param type The type of progress to get.
 * @param param.getters
 * @param param.task The the task whose progress we would like to determine.
 * @param param.id The ID of the task whose progress we would like to determine.
 */
// FIXME: Fix TSDoc descriptions not matching properties in object
// FIXME: Type getters correctly.
function getChildProgress(
  type: 'progress' | 'progressMax',
  { getters, task, id }: { getters: any; task: TaskVuexState; id: number },
) {
  let result = 0;
  let hasAutoUpdateChildren = false;
  if (!getters.complete(id) && (type === 'progress' || task.unknownMaxProgress)) {
    for (const childId of task.children) {
      /** @type {TaskVuexState} */
      const childTask = getters.getTaskById(childId);
      if (childTask.autoUpdateParent) {
        hasAutoUpdateChildren = true;
        const childTaskProgress = getters[type](childId);
        if (task.unknownMaxProgress) {
          // If task execution is not sequential, change this tasks maximum
          // and total progress on the fly.
          if (!task.sequential) {
            result += childTaskProgress;
            // Otherwise, use the first uncompleted task as the current task.
          } else if (!getters.complete(childTask.id)) {
            result = childTaskProgress;
            break;
          }
        } else if (type === 'progress') {
          result += childTaskProgress / getters.progressMax(childId);
        }
      }
    }
    if (hasAutoUpdateChildren) {
      return result;
    }
  }
  return null;
}

interface TasksState {
  /** Default task list. */
  all: number[];
  /** Client action related task IDs. */
  clientActions: number[],
  /** Tasks related to logging into a single client. */
  login: number[],
  /** Tasks used in the task viewer. */
  taskViewer: number[],
  /** Object containing tasks as values and their corresponding IDs as keys. */
  tasks: { [taskId: number]: TaskVuexState },
}

const listStoreHelper = new ListStoreHelper('tasks', 'task', 'getTaskById');

const vuexModule: Module<TasksState, RootState> = {
  namespaced: true,
  // TODO: Group lists under one property
  state: {
    all: [],
    clientActions: [],
    login: [],
    taskViewer: [],
    tasks: {},
  },
  getters: {
    getTaskById: state => id => state.tasks[id],
    /** Array of task IDs of completed tasks used in watcher that updates task completion time. */
    completedTasks: (state, getters) => {
      const taskIds = Object.keys(state.tasks);
      return taskIds.filter(taskId => getters.complete(taskId));
    },
    ...listStoreHelper.itemGetters({
      hasParent: ({ task }) => task.parent !== null,
      parent: ({ getters, task }) => getters.getTaskById(task.parent),
      hasChildren: ({ task }) => task.children.length > 0,
      children: ({ getters, task }) => task.children.map(childId => getters.getTaskById(childId)),
      childStateCounts: ({ getters, id }) => {
        const stateCounts = {};
        for (const task of getters.children(id)) {
          if (task.state) {
            if (!stateCounts[task.state]) stateCounts[task.state] = 0;
            stateCounts[task.state] += 1;
          }
        }
        return stateCounts;
      },
      childStateString: ({ getters, id }) => {
        const stateStrings = [];
        const childStateCounts = getters.childStateCounts(id);
        for (const state of Object.keys(childStateCounts)) {
          const count = childStateCounts[state];
          stateStrings.push(`${count} ${state}(s)`);
        }
        return stateStrings.join(', ');
      },
      complete: ({ getters, id, task }) => {
        if (getters.hasChildren(id)) {
          let complete = true;
          let hasAutoUpdateChildren = false;
          for (const childTask of getters.children(id)) {
            if (childTask.autoUpdateParent) {
              hasAutoUpdateChildren = true;
              if (!getters.complete(childTask.id)) {
                complete = false;
                break;
              }
            }
          }
          if (hasAutoUpdateChildren) {
            return complete;
          }
        }
        return task.complete;
      },
      progress: ({ getters, id, task }) => {
        if (getters.hasChildren(id)) {
          const progress = getChildProgress('progress', { getters, task, id });
          if (progress !== null) {
            return progress;
          }
        }
        return task.progress;
      },
      progressMax: ({ getters, id, task }) => {
        if (getters.hasChildren(id) && task.unknownMaxProgress) {
          const progressMax = getChildProgress('progressMax', { getters, task, id });
          if (progressMax !== null) {
            return progressMax;
          }
        }
        return task.progressMax;
      },
      duration: ({ task }) => {
        if (task.completedAt !== null && task.startedAt !== null) {
          const ms = task.completedAt - task.startedAt;
          const duration = moment.duration(ms);
          return Math.floor(duration.asHours()) + moment.utc(ms).format(':mm:ss.SSS');
        }
        return null;
      },
    }),
  },
  mutations: {
    /**
     * Adds a task object to the state.
     * @param {any} state
     * @param {Object} payload
     * @param {number} payload.id
     * @param {TaskVuexState} payload.task
     */
    create(state, { id, task }) {
      Vue.set(state.tasks, id, task);
    },
    batchCreate(state, tasks) {
      Object.assign(state.tasks, tasks);
    },
    /**
     * Adds a particular task to a certain list. Mainly used for the top-level list of tasks.
     * @param {any} state
     * @param {Object} payload
     * @param {number} payload.id
     * @param {string} payload.name The name of the list to add this task to.
     */
    addToList(state, { id, name = 'all' }) {
      state[name].push(id);
    },
    clearList(state, { name }) {
      state[name] = [];
    },
    removeTasks(state, { ids }) {
      for (const id of ids) {
        Vue.delete(state.tasks, id);
      }
    },
    /**
     * Adds several child tasks to a task.
     * @param {any} state
     * @param {Object} payload
     * @param {number} payload.id The ID of the task to add child tasks to.
     * @param {number[]} payload.children The IDs of the child tasks to add.
     */
    addChildren(state, { id, children }) {
      for (const child of children) {
        state.tasks[id].children.push(child);
      }
    },
    /**
     * Sets a task's state.
     * @param {any} state
     * @param {Object} payload
     * @param {number} payload.id
     * @param {TaskState} payload.value The task state
     */
    setState(state, { id, value }) {
      if (Object.values(TaskState).includes(value)) {
        Vue.set(state.tasks[id], 'state', value);
      } else {
        const validStates = `['${Object.values(TaskState).join("', '")}']`;
        // eslint-disable-next-line max-len
        throw new Error(
          `Cannot set task state to invalid value, '${value}'. Task state must be one of the following: ${validStates}`,
        );
      }
    },
    /**
     * Sets a task's error and human readable version of that error.
     * @param {any} state
     * @param {Object} payload
     * @param {number} payload.id
     * @param {Error} payload.value The error
     */
    setError(state, { id, value }) {
      Vue.set(state.tasks[id], 'error', value);
      Vue.set(state.tasks[id], 'errorString', errorToString(value));
    },
    addDownload(state, { id, downloadId }) {
      state.tasks[id].downloadIds.push(downloadId);
    },
    ...listStoreHelper.itemMutations([
      'title',
      'anonymousTitle',
      'status',
      'progress',
      'progressMax',
      'children',
      'complete',
      'errorString',
      'parent',
      'unknownMaxProgress',
      'sequential',
      'autoUpdateParent',
      'indeterminate',
      'startedAt',
      'completedAt',
    ]),
  },
  actions: {
    /**
     * Creates a new task and returns its ID.
     * @returns The newly-created task's ID.
     */
    create({ commit, rootState }: ActionContext, data: TaskVuexStateOptional = { list: 'all' }): number {
      const task = Object.assign({
        id: lastTaskId,
        title: '',
        status: '',
        state: null,
        progress: 0,
        progressMax: 1,
        indeterminate: false,
        children: [],
        complete: false,
        error: null,
        errorString: '',
        parent: null,
        unknownMaxProgress: true,
        sequential: true,
        autoUpdateParent: true,
        isRoot: false,
        startedAt: null,
        completedAt: null,
        downloadIds: [],
      }, data);
      if (!('anonymousTitle' in task)) {
        task.anonymousTitle = task.title;
      }
      const { id } = task;
      if (rootState.config.debug.calculateTaskDuration) {
        task.startedAt = Date.now();
      }
      commit('create', { id, task });
      lastTaskId += 1;

      if (task.parent === null) {
        commit('addToList', { id, name: data.list });
      } else {
        commit('addChildren', { id: task.parent, children: [id] });
      }

      return id;
    },
    /**
     * @param {import('vuex').ActionContext} context
     * @param {Object} payload
     * @param {number} payload.id
     * @param {number} payload.time
     */
    setTaskCompletionTime({ commit }, { id, time }) {
      commit('setCompletedAt', { id, value: time });
    },
    /**
     * Marks this task as complete and sets its progress to the maximum value.
     * @param {import('vuex').ActionContext} context
     * @param {Object} payload
     * @param {number} payload.id
     */
    markAsComplete({ commit, getters }, { id }) {
      commit('setComplete', { id, value: true });
      commit('setProgress', { id, value: getters.progressMax(id) });
      commit('setStatus', { id, value: '' });
    },
    /**
     * Sets this task's error to the provided one, its state to ERROR and its status to one based
     * on the error.
     * @param {import('vuex').ActionContext} context
     * @param {Object} payload
     * @param {number} payload.id
     * @param {any} payload.error
     */
    setError({
      commit, rootState, dispatch,
    }, { id, error }) {
      commit('setError', { id, value: error });
      commit('setState', { id, value: TaskState.ERROR });
      if (rootState.config.debug.showTaskErrorsInConsole) {
        dispatch('logError', { id });
      }
    },
    /**
     * @param {import('vuex').ActionContext} context
     * @param {Object} payload
     * @param {number} payload.id
     */
    logError({ rootState, getters }, { id }) {
      if (rootState.config.debug.showTaskErrorsInConsole) {
        const task = getters.getTaskById(id);
        if (task.state === TaskState.ERROR) {
          /* eslint-disable no-console */
          console.groupCollapsed(`${task.id} = ${task.title}`);
          console.dir(task.error);
          console.groupEnd();
          /* eslint-enable no-console */
        }
      }
    },
    /**
     * Logs tasks errors adn their descendants' errors.
     * @param {import('vuex').ActionContext} context
     * @param {Object} payload
     * @param {number[]} payload.tasks
     */
    logTaskErrors({ getters, dispatch }, { tasks }) {
      for (const taskId of tasks) {
        dispatch('logError', { id: taskId });
        const task = getters.getTaskById(taskId);
        dispatch('logTaskErrors', { tasks: task.children });
      }
    },
    /**
     * Logs the errors of all tasks directly or indirectly under a list.
     * @param {import('vuex').ActionContext} context
     * @param {Object} payload
     * @param {string} payload.list
     */
    logErrorsOfTaskList({ state, dispatch }, { list }) {
      dispatch('logTaskErrors', { tasks: state[list] });
    },
    /**
     * Increments progress and sets status.
     * @param {import('vuex').ActionContext} context
     * @param {Object} payload
     * @param {number} payload.id
     * @param {TaskState} payload.status
     * @param {number} [payload.increment=1] The amount to increment progress by.
     */
    addStep({ commit, getters }, { id, status, increment = 1 }) {
      commit('setProgress', { id, value: getters.progress(id) + increment });
      commit('setStatus', { id, value: status });
    },
    /**
     * Sets this task's state based on its children.
     * - all children error then error
     * - any child error then warning
     * - else success
     * @param {import('vuex').ActionContext} context
     * @param {Object} payload
     * @param {number} payload.id
     */
    setStateBasedOnChildren({ commit, getters }, { id }) {
      const childStateCounts = getters.childStateCounts(id);
      const children = getters.children(id);
      let state;
      if (childStateCounts[TaskState.ERROR] === children.length) {
        state = TaskState.ERROR;
      } else if (childStateCounts[TaskState.ERROR] > 0 || childStateCounts[TaskState.WARNING] > 0) {
        state = TaskState.WARNING;
      } else {
        state = TaskState.SUCCESS;
      }
      commit('setState', { id, value: state });
    },
    /**
     * Sets this tasks error to be the same as it's child's error if it only has one child.
     * @param {import('vuex').ActionContext} context
     * @param {Object} payload
     * @param {number} payload.id
     */
    async setErrorBasedOnChildren({ getters, dispatch }, { id }) {
      const children = getters.children(id);
      if (children.length === 1) {
        const childTask = children[0];
        await dispatch('setError', { id, error: childTask.error });
      }
    },
    addDownload({ commit }, { id, downloadId }) {
      commit('addDownload', { id, downloadId });
    },
  },
};
export default vuexModule;
