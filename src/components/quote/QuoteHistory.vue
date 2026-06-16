<template>
  <section class="history-panel">
    <div class="panel-heading">
      <h2>Cotizaciones generadas</h2>
      <p>Recupera una cotización guardada y cárgala en el formulario para editarla manualmente.</p>
    </div>

    <div v-if="!quotes.length" class="history-empty">
      Aún no hay cotizaciones guardadas en Supabase.
    </div>

    <div v-else class="history-list">
      <article v-for="quote in quotes" :key="quote.id" class="history-card">
        <div class="history-card__top">
          <div>
            <span>Cotización #{{ quote.id }}</span>
            <strong>{{ quote.full_name || "Sin nombre" }}</strong>
          </div>
          <strong>{{ formatCurrency(quote.total_estimated_price || 0) }}</strong>
        </div>

        <p>{{ quote.email || "Sin correo" }} · {{ quote.phone || "Sin teléfono" }}</p>
        <p>{{ quote.routeLabel }}</p>
        <small>{{ quote.createdAtLabel }}</small>

        <div class="history-actions">
          <button type="button" class="ghost-btn ghost-btn--accent" @click="$emit('load-quote', quote)">
            Cargar para editar
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup>
defineEmits(["load-quote"]);

defineProps({
  formatCurrency: {
    type: Function,
    required: true,
  },
  quotes: {
    type: Array,
    default: () => [],
  },
});
</script>
