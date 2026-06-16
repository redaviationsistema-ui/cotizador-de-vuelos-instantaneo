<template>
  <section class="hero-band">
    <div class="hero-copy">
      <p class="eyebrow">Red Sky Group</p>
      <h1>Reserva y cotización ejecutiva</h1>
      <p class="hero-text">
        Esta pantalla replica la lógica principal de la vista
        <code>/reserva</code> del landing: aeronave, fechas, rutas múltiples,
        cálculo por tramo, reposicionamiento y desglose comercial.
      </p>
    </div>

    <div class="hero-summary">
      <div class="metric-card">
        <span>Rutas válidas</span>
        <strong>{{ dataLoading ? "..." : validRoutes }}</strong>
      </div>
      <div class="metric-card">
        <span>Aeronave</span>
        <strong>{{ dataLoading ? "Cargando" : aircraftName || "Sin seleccionar" }}</strong>
      </div>
      <div class="metric-card">
        <span>Total estimado</span>
        <strong>{{ dataLoading ? "..." : formatCurrency(totalFinal) }}</strong>
      </div>
    </div>
  </section>
</template>

<script setup>
defineProps({
  aircraftName: {
    type: String,
    default: "",
  },
  dataLoading: {
    type: Boolean,
    default: false,
  },
  formatCurrency: {
    type: Function,
    required: true,
  },
  totalFinal: {
    type: Number,
    default: 0,
  },
  validRoutes: {
    type: Number,
    default: 0,
  },
});
</script>
