<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal-card">
      <div class="modal-header">
        <div>
          <p class="eyebrow">Red Sky Group</p>
          <h2>Cotización ejecutiva de vuelo</h2>
          <p class="hero-text">Resumen para {{ form.name || "Cliente" }}.</p>
        </div>
        <div class="modal-side">
          <span class="status-pill">{{ isInternationalFlight ? "Internacional" : "Nacional" }}</span>
          <div class="timer-box">
            <span>Válido por</span>
            <strong>{{ quoteValidityLabel }}</strong>
          </div>
          <button type="button" class="ghost-btn" @click="$emit('close')">Cerrar</button>
        </div>
      </div>

      <div class="modal-body">
        <div class="modal-grid">
          <div class="summary-card">
            <span>Pasajero</span>
            <strong>{{ form.name || "Cliente" }}</strong>
            <small>{{ form.email || "Sin correo registrado" }}</small>
          </div>
          <div class="summary-card">
            <span>Teléfono</span>
            <strong>{{ form.phone || "-" }}</strong>
            <small>Contacto</small>
          </div>
          <div class="summary-card">
            <span>Rutas</span>
            <strong>{{ billableRoutes.length }}</strong>
            <small>Incluye reposicionamiento si aplica</small>
          </div>
        </div>

        <div class="quote-list">
          <article
            v-for="(route, index) in billableRoutes"
            :key="`modal-${route.id || index}-${route.positioningType || 'customer'}`"
            class="quote-row"
          >
            <div class="quote-row__top">
              <strong>{{ getAircraftName(route.aircraft_id) || aircraftName || "Aeronave" }}</strong>
              <span>{{ formatCurrency(billableBreakdowns[index]?.total || 0) }}</span>
            </div>
            <p>
              {{ route.fromAirport || "-" }} → {{ route.toAirport || "-" }}
              · {{ (billableBreakdowns[index]?.hours || 0).toFixed(2) }} h
              · {{ (billableBreakdowns[index]?.miles || 0).toFixed(0) }} nm
            </p>
          </article>
        </div>

        <div v-if="operationalRouteLabel" class="route-chain-card">
          <span>Ruta operativa total</span>
          <strong>{{ operationalRouteLabel }}</strong>
          <small v-if="positioningSummary">{{ positioningSummary }}</small>
        </div>

        <div class="totals-card">
          <div><span>Vuelo</span><strong>{{ formatCurrency(flightDisplayTotal) }}</strong></div>
          <div><span>Pernocta</span><strong>{{ formatCurrency(overnightTotal) }}</strong></div>
          <div><span>Gastos operativos</span><strong>{{ formatCurrency(operationalExpenses) }}</strong></div>
          <div><span>Subtotal</span><strong>{{ formatCurrency(subtotal) }}</strong></div>
          <div class="total-final"><span>Total estimado</span><strong>{{ formatCurrency(totalFinal) }}</strong></div>
        </div>

        <div class="modal-actions">
          <button type="button" class="ghost-btn" @click="$emit('close')">Seguir editando</button>
          <button type="button" class="ghost-btn ghost-btn--accent" @click="$emit('download')">
            Descargar PDF
          </button>
          <button type="button" class="ghost-btn" :disabled="loading" @click="$emit('email')">
            {{ loading ? "Procesando..." : "Enviar PDF por correo" }}
          </button>
          <button type="button" class="primary-btn primary-btn--inline" :disabled="loading" @click="$emit('save')">
            {{ loading ? "Procesando..." : "Guardar cotización en Supabase" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";

defineEmits(["close", "download", "email", "save"]);

const props = defineProps({
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
  form: {
    type: Object,
    required: true,
  },
  formatCurrency: {
    type: Function,
    required: true,
  },
  getAircraftName: {
    type: Function,
    required: true,
  },
  isInternationalFlight: {
    type: Boolean,
    default: false,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  operationalExpenses: {
    type: Number,
    default: 0,
  },
  overnightTotal: {
    type: Number,
    default: 0,
  },
  quoteValidityLabel: {
    type: String,
    default: "15:00",
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

const operationalRouteLabel = computed(() => {
  if (!props.billableRoutes.length) return "";

  const segments = props.billableRoutes.reduce((chain, route, index) => {
    const from = route?.fromAirport || "-";
    const to = route?.toAirport || "-";

    if (index === 0) chain.push(from);
    chain.push(to);

    return chain;
  }, []);

  return segments.join(" → ");
});

const positioningSummary = computed(() => {
  const positioningRoutes = props.billableRoutes.filter((route) => route?.positioning);
  if (!positioningRoutes.length) return "";

  return positioningRoutes
    .map((route) => {
      const label = route.positioningType === "return_to_base" ? "Regreso a base" : "Reposicionamiento";
      return `${label}: ${route.fromAirport || "-"} → ${route.toAirport || "-"}`;
    })
    .join(" · ");
});
</script>
