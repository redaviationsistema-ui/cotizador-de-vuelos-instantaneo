<template>
  <aside class="quote-side">
    <div class="quote-panel">
      <div class="panel-heading">
        <h2>Resumen operativo</h2>
        <p>Desglose en tiempo real basado en la misma lógica de la vista de reserva.</p>
      </div>

      <div class="summary-card">
        <span>Ruta fiscal</span>
        <strong>{{ isInternationalFlight ? "Internacional" : "Nacional" }}</strong>
        <small>{{ aircraftName || "Selecciona una aeronave" }}</small>
      </div>

      <div class="summary-editor">
        <div>
          <span>Edicion manual</span>
          <small>
            {{
              manualSummary.enabled
                ? "Los importes de este panel se están sobrescribiendo manualmente."
                : "Usando cálculo automático de la cotización."
            }}
          </small>
        </div>
        <div class="summary-editor__actions">
          <button type="button" class="ghost-btn" @click="$emit('toggle-manual-summary')">
            {{ manualSummary.enabled ? "Volver a automático" : "Editar manualmente" }}
          </button>
          <button
            v-if="manualSummary.enabled"
            type="button"
            class="danger-btn"
            @click="$emit('reset-manual-summary')"
          >
            Limpiar manual
          </button>
        </div>
      </div>

      <div class="quote-list">
        <article
          v-for="(route, index) in billableRoutes"
          :key="`${route.id || index}-${route.positioningType || 'customer'}`"
          class="quote-row"
        >
          <div class="quote-row__top">
            <strong>{{ route.fromAirport || "-" }} → {{ route.toAirport || "-" }}</strong>
            <span>{{ formatCurrency(billableBreakdowns[index]?.total || 0) }}</span>
          </div>
          <p>
            {{
              route.positioning
                ? route.positioningType === "return_to_base"
                  ? "Regreso a base"
                  : "Reposicionamiento"
                : "Ruta del cliente"
            }}
            · {{ (billableBreakdowns[index]?.hours || 0).toFixed(2) }} h
            · {{ (billableBreakdowns[index]?.miles || 0).toFixed(0) }} nm
          </p>
        </article>
      </div>

      <div class="totals-card">
        <div>
          <span>Vuelo</span>
          <strong v-if="!manualSummary.enabled">{{ formatCurrency(flightDisplayTotal) }}</strong>
          <input
            v-else
            class="summary-edit-input"
            :value="manualSummary.flight"
            type="number"
            min="0"
            step="1"
            @input="$emit('update-manual-summary', { key: 'flight', value: $event.target.value })"
          />
        </div>
        <div>
          <span>Pernocta</span>
          <strong v-if="!manualSummary.enabled">{{ formatCurrency(overnightTotal) }}</strong>
          <input
            v-else
            class="summary-edit-input"
            :value="manualSummary.overnight"
            type="number"
            min="0"
            step="1"
            @input="$emit('update-manual-summary', { key: 'overnight', value: $event.target.value })"
          />
        </div>
        <div>
          <span>Gastos operativos</span>
          <strong v-if="!manualSummary.enabled">{{ formatCurrency(operationalExpenses) }}</strong>
          <input
            v-else
            class="summary-edit-input"
            :value="manualSummary.expenses"
            type="number"
            min="0"
            step="1"
            @input="$emit('update-manual-summary', { key: 'expenses', value: $event.target.value })"
          />
        </div>
        <div>
          <span>Subtotal</span>
          <strong v-if="!manualSummary.enabled">{{ formatCurrency(subtotal) }}</strong>
          <input
            v-else
            class="summary-edit-input"
            :value="manualSummary.subtotal"
            type="number"
            min="0"
            step="1"
            @input="$emit('update-manual-summary', { key: 'subtotal', value: $event.target.value })"
          />
        </div>
        <div class="total-final">
          <span>Total estimado</span>
          <strong v-if="!manualSummary.enabled">{{ formatCurrency(totalFinal) }}</strong>
          <input
            v-else
            class="summary-edit-input summary-edit-input--total"
            :value="manualSummary.total"
            type="number"
            min="0"
            step="1"
            @input="$emit('update-manual-summary', { key: 'total', value: $event.target.value })"
          />
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup>
defineEmits(["reset-manual-summary", "toggle-manual-summary", "update-manual-summary"]);

defineProps({
  aircraftName: {
    type: String,
    default: "",
  },
  billableBreakdowns: {
    type: Array,
    default: () => [],
  },
  billableRoutes: {
    type: Array,
    default: () => [],
  },
  flightDisplayTotal: {
    type: Number,
    default: 0,
  },
  formatCurrency: {
    type: Function,
    required: true,
  },
  isInternationalFlight: {
    type: Boolean,
    default: false,
  },
  manualSummary: {
    type: Object,
    required: true,
  },
  operationalExpenses: {
    type: Number,
    default: 0,
  },
  overnightTotal: {
    type: Number,
    default: 0,
  },
  subtotal: {
    type: Number,
    default: 0,
  },
  totalFinal: {
    type: Number,
    default: 0,
  },
});
</script>
