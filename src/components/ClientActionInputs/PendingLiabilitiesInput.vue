<template>
  <div>
    <!-- eslint-disable max-len -->
    <b-checkbox
      v-model="input.downloadPages"
      title="Whether the pending liability pages should be downloaded as proof that the collected pending liability amounts are accurate."
      :disabled="disabled"
    >
      Download pages
    </b-checkbox>
    <b-checkbox
      v-if="input.downloadPages"
      v-model="input.downloadEmptyPages"
      title="Whether the pending liability pages of tax types with no pending liabilities should be downloaded."
      :disabled="disabled"
    >
      Download empty pages
    </b-checkbox>
    <!-- eslint-enable max-len -->
    <div class="columns">
      <div class="column">
        <TaxTypeSelect
          v-model="input.totalsTaxTypeIds"
          label="Tax types for totals"
          :validation-rules="!input.downloadPages ? 'required' : ''"
          name="pending_liability_totals_tax_types"
          :disabled="disabled"
          :multiple="true"
        />
      </div>
      <div
        v-if="input.downloadPages"
        class="column"
      >
        <TaxTypeSelect
          v-model="input.downloadsTaxTypeIds"
          label="Tax types for pages to download"
          name="pending_liability_page_downloads_tax_types"
          :disabled="disabled"
          :multiple="true"
        />
      </div>
    </div>
  </div>
</template>

<script>
import TaxTypeSelect from '@/components/fields/TaxTypeSelect.vue';
import ClientActionInputMixin from './mixin';
import GetAllPendingLiabilitiesClientAction from '@/backend/client_actions/pending_liabilities';

export default {
  name: 'ClientActionsPendingLabilitiesInput',
  components: {
    TaxTypeSelect,
  },
  mixins: [ClientActionInputMixin(GetAllPendingLiabilitiesClientAction)],
};
</script>
