<template>
  <CardModal
    :active.sync="showClientListModal"
    width="100%"
  >
    <template slot="head">
      <p class="modal-card-title">{{ `${title} (${clients.length})` }}</p>
      <b-input
        ref="search"
        v-model="internalSearch"
        type="search"
        placeholder="Search clients..."
        icon="search"
      />
    </template>
    <template slot="body">
      <template v-if="shownClientIds.length > 0">
        <template v-if="internalSearch.length > 0">
          <p>Found {{ shownClientIds.length }} client(s) matching your query</p>
        </template>
        <slot :client-ids="shownClientIds" />
      </template>
      <section
        v-else
        class="section"
      >
        <EmptyMessage
          icon="frown"
          message="No clients found that match your query"
        />
      </section>
    </template>
    <slot
      slot="foot"
      name="foot"
    />
  </CardModal>
</template>

<script>
import CardModal from '@/components/CardModal.vue';
import EmptyMessage from '@/components/EmptyMessage.vue';
import clientIdMixin from '@/mixins/client_ids';

// FIXME: Get rid of lag when opening and closing modal.
// The lag is due to the modal being re-created every time it is opened.
export default {
  name: 'ClientListModal',
  components: {
    CardModal,
    EmptyMessage,
  },
  mixins: [clientIdMixin],
  props: {
    clientIds: {
      type: Array,
      default: () => [],
      required: true,
    },
    active: {
      type: Boolean,
      default: false,
    },
    title: {
      type: String,
      default: 'Clients',
    },
    buttonLabel: {
      type: String,
      default: '',
    },
    search: {
      type: String,
      default: '',
    },
    /** Fields to check when searching for clients. */
    searchFields: {
      type: Array,
      default: () => ['name', 'username'],
    },
  },
  data() {
    return {
      internalSearch: '',
      showClientListModal: false,
    };
  },
  computed: {
    searchableClientData() {
      return this.clients.map((client) => {
        const data = {};
        for (const field of this.searchFields) {
          data[field] = client[field].toLowerCase();
        }
        return data;
      });
    },
    lowerCaseSearchStr() {
      return this.internalSearch.toLowerCase();
    },
    shownClients() {
      if (this.internalSearch) {
        const q = this.lowerCaseSearchStr;
        const matches = [];
        for (let i = 0; i < this.searchableClientData.length; i++) {
          const client = this.searchableClientData[i];
          for (const field of this.searchFields) {
            if (client[field].includes(q)) {
              matches.push(this.clients[i]);
              break;
            }
          }
        }
        return matches;
      }
      return this.clients;
    },
    shownClientIds() {
      return this.shownClients.map(client => client.id);
    },
  },
  watch: {
    search(value) {
      this.internalSearch = value;
    },
    active(value) {
      this.showClientListModal = value;
    },
    showClientListModal(value) {
      this.$emit('update:active', value);
      if (value) {
        // If the modal is open, focus the search input
        this.$nextTick(() => {
          this.$refs.search.focus();
        });
      }
    },
  },
};
</script>
