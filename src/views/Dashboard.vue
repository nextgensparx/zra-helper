<template>
  <div id="dashboard">
    <section class="dashboard-section">
      <form @submit.prevent="submit">
        <div>
          <b-field>
            <b-checkbox v-model="useCsvForClientList">
              Use CSV to add clients
            </b-checkbox>
          </b-field>
          <div
            v-if="useCsvForClientList"
            class="field"
          >
            <label class="label">Client list</label>
            <div class="control">
              <ClientListFileUpload @input="updateClients" />
            </div>
          </div>
          <SingleClientInput
            v-else
            ref="singleClientInput"
            @input="addSingleClient"
          />
          <div
            v-if="clients.length > 0"
            class="buttons"
          >
            <OpenModalButton
              label="View parsed clients"
              @click="parsedClientsViewerVisible = true"
            />
            <OpenModalButton
              title="Change and view which clients were deemed to be valid"
              label="Select valid clients"
              @click="validClientSelectorVisible = true"
            />
            <OpenModalButton
              label="Select clients"
              @click="clientSelectorVisible = true"
            />
          </div>
        </div>
        <br>
        <ClientActionSelector
          v-model="selectedClientActions"
          :disabled="selectActionsDisabled"
        />
        <ClientActionList
          v-model="selectedClientActions"
          :action-ids="selectedClientActions"
          :disabled="selectActionsDisabled"
          :inputs.sync="actionInputs"
          :input-validation-errors="inputValidationErrors"
        />
        <template v-if="anyActionsWithInvalidInputs">
          <b-message
            :closable="false"
            type="is-danger"
            has-icon
            icon-size="small"
            title="Invalid action inputs"
          >
            <ul class="bulleted-list">
              <li
                v-for="action of actionsWithInvalidInputs"
                :key="action.id"
              >
                <b>{{ action.name }}</b>
                <ul class="bulleted-list">
                  <li
                    v-for="(error, index) of inputValidationErrors[action.id]"
                    :key="index"
                  >
                    {{ error }}
                  </li>
                </ul>
              </li>
            </ul>
          </b-message>
        </template>
        <button
          :disabled="runActionsButtonDisabled"
          :title="runActionsButtonDisabledReason"
          :class="[runActionsFormInvalid ? 'is-danger' : 'is-primary']"
          class="button"
          type="submit"
        >
          Run selected action(s)
        </button>
      </form>
    </section>
    <section class="dashboard-section">
      <h3 class="title is-4">
        Log
      </h3>
      <Log />
    </section>
    <section
      v-if="zraLiteModeEnabled"
      class="dashboard-section"
    >
      <b-message
        type="is-info"
        icon-size="small"
        has-icon
        headerless
      >
        The ZRA website is in basic HTML mode until all running tasks have completed.
      </b-message>
    </section>
    <section class="dashboard-section">
      <h3 class="title is-4">
        Tasks
      </h3>
      <TaskList
        :tasks="tasks"
        :is-root="true"
      />
    </section>
    <section class="dashboard-section">
      <div v-if="runsWithFailures.length > 0">
        <b-field>
          <p class="control">
            <span class="button is-static">Run No.</span>
          </p>
          <b-select v-model="failuresRunId">
            <option
              v-for="runId in runsWithFailures"
              :key="runId"
              :value="runId"
            >
              {{ runId + 1 }}
            </option>
          </b-select>
          <p class="control">
            <button
              :disabled="clientActionsRunning"
              class="button"
              type="button"
              @click="retryFailures(failuresRunId)"
            >
              <b-icon
                icon="redo"
                size="is-small"
              />
              <span>Retry failed clients</span>
            </button>
          </p>
          <p class="control">
            <OpenModalButton
              :disabled="failuresRunId === null"
              label="View failures"
              @click="showFailures"
            />
          </p>
        </b-field>
      </div>
    </section>
    <section
      v-if="anyRunsWithOutputs"
      class="dashboard-section"
    >
      <h3 class="title is-4">
        Outputs
      </h3>
      <div
        v-for="(run, runId) in runs"
        :key="runId"
      >
        <template v-if="actionsWithOutputsInRun(run).length > 0">
          <h4
            v-if="runs.length > 1"
            class="title is-5"
          >
            Run {{ runId + 1 }}
          </h4>
          <ClientActionOutput
            v-for="actionId in actionsWithOutputsInRun(run)"
            :key="actionId"
            :run-id="runId"
            :action-id="actionId"
          />
        </template>
      </div>
    </section>

    <template v-if="clients.length > 0">
      <ClientListModal
        :client-ids="clientIds"
        :active.sync="parsedClientsViewerVisible"
        title="Parsed clients"
      >
        <template slot-scope="{ clientIds: slotClientIds }">
          <ParsedClientsViewer :client-ids="slotClientIds" />
        </template>
      </ClientListModal>
      <ClientListModal
        :client-ids="clientIds"
        :active.sync="validClientSelectorVisible"
        title="Valid client selector"
      >
        <template slot-scope="{ clientIds: slotClientIds }">
          <ClientSelector
            v-model="selectedValidClientIds"
            :client-ids="slotClientIds"
            :disabled="clientActionsRunning"
          />
        </template>
        <div slot="foot">
          <button
            class="button"
            @click="autoSelectValidClients"
          >
            Auto-select valid clients
          </button>
        </div>
      </ClientListModal>
      <ClientListModal
        :client-ids="selectedValidClientIds"
        :active.sync="clientSelectorVisible"
        title="Client selector"
      >
        <template slot-scope="{ clientIds: slotClientIds }">
          <ClientSelector
            v-model="selectedClientIds"
            :client-ids="slotClientIds"
            :disabled="clientActionsRunning"
          />
        </template>
      </ClientListModal>
    </template>
    <CardModal
      :active.sync="failuresModalVisible"
      title="Client failures"
    >
      <ClientActionFailures
        slot="body"
        :run-id="failuresRunId"
      />
    </CardModal>
  </div>
</template>

<script lang="ts">
import ClientListFileUpload from '@/components/Clients/ClientListFileUpload.vue';
import SingleClientInput from '@/components/Clients/SingleClientInput.vue';
import ClientListModal from '@/components/Clients/ClientListModal.vue';
import ParsedClientsViewer from '@/components/Clients/ParsedClientsViewer.vue';
import ClientSelector from '@/components/Clients/ClientSelector.vue';
import OpenModalButton from '@/components/OpenModalButton.vue';
import TaskList from '@/components/tasks/TaskList.vue';
import Log from '@/components/TheLog.vue';
import ClientActionOutput from '@/components/ClientActionOutputs/ClientActionOutput.vue';
import ClientActionSelector from '@/components/ClientActionSelector.vue';
import ClientActionList from '@/components/ClientActionList.vue';
import CardModal from '@/components/CardModal.vue';
import ClientActionFailures from '@/components/ClientActionFailures.vue';
import { mapState, mapGetters } from 'vuex';
import { validateClient } from '../backend/client_file_reader';
import { getUniqueClients } from '@/store/modules/clients';
import ClientListDialog from '@/components/dialogs/ClientListDialog.vue';
import { Validator } from 'vee-validate';
import { validateObject } from '@/validation/utils';

const inputValidator = new Validator();

export default {
  name: 'DashboardView',
  $_veeValidate: {
    validator: 'new',
  },
  components: {
    ClientListFileUpload,
    SingleClientInput,
    ClientListModal,
    ParsedClientsViewer,
    ClientSelector,
    OpenModalButton,
    TaskList,
    Log,
    ClientActionOutput,
    ClientActionSelector,
    ClientActionList,
    CardModal,
    ClientActionFailures,
  },
  data() {
    return {
      selectedClientIds: [],
      selectedValidClientIds: [],
      selectedClientActions: [],
      parsedClientsViewerVisible: false,
      clientSelectorVisible: false,
      validClientSelectorVisible: false,
      failuresRunId: null,
      failuresModalVisible: false,
      actionInputs: {},
      useCsvForClientList: true,
      /**
       * Action input validation errors of actions with invalid inputs stored by action ID.
       * @type {Object.<string, string[]>}
       */
      inputValidationErrors: {},
      anyActionsWithInvalidInputs: false,
      /** Set to true after a failed submit and then false after a successful one. */
      submittedActionsFormWasInvalid: false,
    };
  },
  computed: {
    ...mapState({
      tasks: state => state.tasks.clientActions,
      clientsObj: state => state.clients.all,
    }),
    ...mapState(['zraLiteModeEnabled']),
    ...mapState('clientActions', {
      clientActionsObject: 'actions',
      runs: 'runs',
      instancesByActionId: 'instancesByActionId',
      currentRunId: 'currentRunId',
    }),
    ...mapGetters('clients', ['getClientById']),
    ...mapGetters('clientActions', [
      'getAnyRetryableFailures',
      'runsWithFailures',
      'getActionById',
    ]),
    ...mapGetters('clientActions', {
      clientActionsRunning: 'running',
    }),
    currentRunFailed() {
      return this.runsWithFailures.includes(this.currentRunId);
    },
    clients() {
      return Object.values(this.clientsObj);
    },
    clientIds() {
      return Object.keys(this.clientsObj);
    },
    noActionsSelected() {
      return this.selectedClientActions.length === 0;
    },
    // TODO: Validate form using VeeValidate
    runActionsButtonDisabled() {
      return (
        this.noActionsSelected || this.selectedClientIds.length === 0 || this.clientActionsRunning
      );
    },
    runActionsButtonDisabledReason() {
      if (this.clientActionsRunning) {
        return 'Some client actions are still running. Please wait for them to finish before running some more.';
      }
      let reason = '';
      if (this.noActionsSelected && this.selectedClientIds.length === 0) {
        reason += 'Please select some clients and some actions to run on them.';
      } else if (this.selectedClientIds.length === 0) {
        reason += 'Please select some clients to run actions on.';
      } else if (this.noActionsSelected) {
        reason += 'Please select some actions to run on the clients first.';
      }
      return reason;
    },
    selectActionsDisabled() {
      return this.clientActionsRunning;
    },
    shouldPromptToRetryFailures() {
      return this.$store.state.config.promptRetryActions;
    },
    showTaskErrorsInConsole() {
      return this.$store.state.config.debug.showTaskErrorsInConsole;
    },
    anyRunsWithOutputs() {
      for (const run of this.runs) {
        if (this.actionsWithOutputsInRun(run).length > 0) {
          return true;
        }
      }
      return false;
    },
    /** @type {import('@/backend/client_actions/base').ClientActionObject[]} */
    actionsWithInvalidInputs() {
      return Object.keys(this.inputValidationErrors).map(actionId => this.getActionById(actionId));
    },
    runActionsFormInvalid() {
      return this.anyActionsWithInvalidInputs;
    },
  },
  watch: {
    clientIds() {
      // Remove all the selected clients which no longer exist.
      this.removeInvalidClientsFromList('selectedValidClientIds', (id) => {
        const client = this.getClientById(id);
        return !client;
      });
      // Note: selectedValidClientIds doesn't need to be updated when clientIds changes as it
      // will automatically change to remove any that were removed from selectedValidClientIds.
    },
    selectedValidClientIds(validIds) {
      // Remove any previously selected client IDs that no longer exist in selectedValidClientIds.
      this.removeInvalidClientsFromList('selectedClientIds', id => !validIds.includes(id));
    },
    clientActionsRunning(running) {
      if (!running && this.currentRunFailed) {
        if (this.shouldPromptToRetryFailures) {
          this.$dialog.confirm({
            message: 'Some actions failed to run. Would you like to retry those that failed?',
            onConfirm: () => {
              this.retryFailures(this.currentRunId);
            },
            confirmText: 'Retry failed actions',
            cancelText: 'Cancel',
          });
        }
        this.failuresRunId = this.currentRunId;
      }
    },
    showTaskErrorsInConsole(show) {
      if (show) {
        this.$store.dispatch('tasks/logErrorsOfTaskList', { list: 'clientActions' });
      }
    },
    actionInputs: {
      async handler() {
        if (this.submittedActionsFormWasInvalid) {
          await this.validateActionInputs();
        }
      },
      deep: true,
    },
  },
  methods: {
    async validateActionInputs() {
      let valid = true;
      this.inputValidationErrors = {};
      await Promise.all(
        Object.keys(this.actionInputs).map(async (actionId) => {
          /** @type {import('@/backend/client_actions/base').ClientActionObject} */
          const action = this.getActionById(actionId);
          if ('inputValidation' in action) {
            const actionInput = this.actionInputs[actionId];
            const validationErrors = await validateObject(
              inputValidator,
              actionInput,
              action.inputValidation,
              true,
            );
            if (validationErrors.length > 0) {
              valid = false;
              this.inputValidationErrors[actionId] = validationErrors;
            }
          }
        }),
      );
      this.anyActionsWithInvalidInputs = !valid;
      return valid;
    },
    async submit() {
      if (this.runActionsButtonDisabled) return;

      this.submittedActionsFormWasInvalid = true;
      const valid = await this.validateActionInputs();
      if (!valid) {
        return;
      }
      this.submittedActionsFormWasInvalid = false;

      await this.$store.dispatch('clientActions/runSelectedActionsOnAllClients', {
        actionIds: this.selectedClientActions,
        clientIds: this.selectedClientIds,
        allClientIds: this.clientIds,
        actionInputs: this.actionInputs,
      });
    },
    /**
     * Removes clients that are no longer valid from a list.
     * @param list The name of the list to remove clients from.
     * @param test
     * Function that, given the ID of a client, decides whether said client should be removed.
     */
    removeInvalidClientsFromList(list: string, test: (id: number) => boolean) {
      for (let i = this[list].length - 1; i >= 0; i--) {
        const id = this[list][i];
        const shouldRemove = test(id);
        if (shouldRemove) {
          this[list].splice(i);
        }
      }
    },
    autoSelectValidClients() {
      const clients = this.clientIds.map(id => this.getClientById(id));
      const response = getUniqueClients(clients);
      if (response.invalidUsernames.length > 0) {
        const props = {
          title: 'Warning',
          confirmMessage:
            'Duplicate clients with different passwords were detected. The following clients will not be run because of this:',
          type: 'is-warning',
          hasIcon: true,
          clients: response.invalidClients,
        };
        this.$modal.open({
          component: ClientListDialog,
          hasModalCard: true,
          props,
        });
      }
      let selectedClients = response.uniqueClients;
      selectedClients = selectedClients.filter(client => client.valid);
      this.selectedValidClientIds = selectedClients.map(client => client.id);
    },
    async updateClients(clients) {
      await this.$store.dispatch('clients/update', clients);

      // Select all non-duplicated clients by default
      this.autoSelectValidClients();
      this.selectedClientIds = this.selectedValidClientIds;
    },
    async addSingleClient(client) {
      const valid = await this.$refs.singleClientInput.$validator.validate();
      if (valid) {
        const clientCopy = Object.assign({}, client);
        const validationResult = validateClient(client);
        Object.assign(clientCopy, validationResult);
        await this.updateClients([clientCopy]);
      }
    },
    async retryFailures(runId) {
      await this.$store.dispatch('clientActions/retryFailures', { runId });
    },
    showFailures() {
      this.failuresModalVisible = true;
    },
    actionsWithOutputsInRun(run) {
      const actionIds = Object.keys(run.instancesByActionId);
      return actionIds.filter(id => this.clientActionsObject[id].hasOutput);
    },
  },
};
</script>
