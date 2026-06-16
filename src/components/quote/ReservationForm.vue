<template>
  <form class="quote-form" @submit.prevent="$emit('submit')">
    <div class="form-row">
      <div class="form-group">
        <label>Tipo de vuelo</label>
        <select v-model="form.flightType" :class="{ invalid: errors.flightType }">
          <option value="">Selecciona</option>
          <option value="Private Jet">Jet privado</option>
          <option value="Helicopter">Helicóptero</option>
          <option value="Air Ambulance">Ambulancia aérea</option>
          <option value="Cargo">Carga</option>
        </select>
      </div>

      <div class="form-group">
        <label>Tipo de ruta</label>
        <select :value="routeType" :class="{ invalid: errors.routeType }" @change="$emit('update:routeType', $event.target.value)">
          <option value="">Selecciona</option>
          <option value="NATIONAL">Nacional</option>
          <option value="INTERNATIONAL">Internacional</option>
        </select>
      </div>
    </div>

    <div v-if="routes.length">
      <div class="form-group">
        <label>Aeronave</label>

        <div v-if="selectedAircraft && !allowAircraftChange" class="aircraft-display-card">
          <div class="aircraft-header">
            <div class="aircraft-name">{{ selectedAircraft.name }}</div>
            <button type="button" class="ghost-btn" @click="$emit('update:allow-aircraft-change', true)">
              Cambiar
            </button>
          </div>

          <div class="aircraft-meta">
            <div>
              <span>Capacidad</span>
              <strong>{{ selectedAircraft.capacity_passengers }} pax</strong>
            </div>
            <div>
              <span>Tipo</span>
              <strong>{{ selectedAircraft.aircraft_type }}</strong>
            </div>
            <div>
              <span>Base</span>
              <strong>{{ selectedAircraft.home_base }}</strong>
            </div>
          </div>
        </div>

        <select
          v-else
          v-model="routes[0].aircraft_id"
          :class="{ invalid: errors['aircraft_0'] }"
          @change="$emit('update:allow-aircraft-change', false)"
        >
          <option value="">Selecciona aeronave</option>
          <option v-for="aircraft in filteredFleet" :key="aircraft.id" :value="aircraft.id">
            {{ aircraft.name }} - {{ aircraft.capacity_passengers }} pax - Base: {{ aircraft.home_base }}
          </option>
        </select>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Fecha de salida</label>
          <input
            v-model="routes[0].start_date"
            type="datetime-local"
            :class="{ invalid: errors['start_0'], blocked: isBlocked(routes[0].start_date, routes[0].aircraft_id) }"
          />
          <small v-if="isBlocked(routes[0].start_date, routes[0].aircraft_id)" class="error-text">
            Esta aeronave no está disponible en la fecha seleccionada.
          </small>
        </div>

        <div class="form-group">
          <label>Fecha de regreso</label>
          <input
            v-model="routes[0].end_date"
            type="datetime-local"
            :min="routes[0].start_date"
            :class="{ invalid: errors['end_0'], blocked: isBlocked(routes[0].end_date, routes[0].aircraft_id) }"
          />
        </div>
      </div>
    </div>

    <div v-if="routeType">
      <div v-for="(route, index) in routes" :key="route.id" class="route-block">
        <div class="route-heading">
          <h3>Ruta {{ index + 1 }}</h3>
          <span v-if="billableBreakdowns[index]?.ready" class="route-cost">
            {{ formatCurrency(billableBreakdowns[index].total) }}
          </span>
        </div>

        <template v-if="routeType === 'NATIONAL'">
          <div class="form-row">
            <div class="form-group">
              <label>Estado de origen</label>
              <select v-model="route.fromState">
                <option value="">Selecciona estado</option>
                <option v-for="state in states" :key="state" :value="state">{{ state }}</option>
              </select>
            </div>

            <div class="form-group">
              <label>Ciudad de origen</label>
              <select v-model="route.fromCity" :disabled="!route.fromState">
                <option value="">Selecciona ciudad</option>
                <option v-for="city in citiesByState(route.fromState)" :key="city" :value="city">{{ city }}</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>Aeropuerto de origen</label>
            <select v-model="route.fromAirport" :disabled="!route.fromCity">
              <option value="">Selecciona aeropuerto</option>
              <option
                v-for="airport in airportsByCity(null, route.fromState, route.fromCity)"
                :key="getAirportOptionValue(airport)"
                :value="getAirportOptionValue(airport)"
              >
                {{ airport.aeropuerto }}
              </option>
            </select>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Estado de destino</label>
              <select v-model="route.toState">
                <option value="">Selecciona estado</option>
                <option v-for="state in states" :key="state" :value="state">{{ state }}</option>
              </select>
            </div>

            <div class="form-group">
              <label>Ciudad de destino</label>
              <select v-model="route.toCity" :disabled="!route.toState">
                <option value="">Selecciona ciudad</option>
                <option v-for="city in citiesByState(route.toState)" :key="city" :value="city">{{ city }}</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>Aeropuerto de destino</label>
            <select v-model="route.toAirport" :disabled="!route.toCity">
              <option value="">Selecciona aeropuerto</option>
              <option
                v-for="airport in airportsByCity(null, route.toState, route.toCity)"
                :key="getAirportOptionValue(airport)"
                :value="getAirportOptionValue(airport)"
              >
                {{ airport.aeropuerto }}
              </option>
            </select>
          </div>
        </template>

        <template v-else>
          <div class="form-row">
            <div class="form-group">
              <label>País de origen</label>
              <select v-model="route.fromCountry">
                <option value="">Selecciona país</option>
                <option v-for="country in countries" :key="country" :value="country">{{ country }}</option>
              </select>
            </div>

            <div class="form-group">
              <label>Ciudad de origen</label>
              <select v-model="route.fromCity" :disabled="!route.fromCountry">
                <option value="">Selecciona ciudad</option>
                <option v-for="city in citiesByCountry(route.fromCountry)" :key="city" :value="city">{{ city }}</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>Aeropuerto de origen</label>
            <select v-model="route.fromAirport" :disabled="!route.fromCity">
              <option value="">Selecciona aeropuerto</option>
              <option
                v-for="airport in airportsByCity(route.fromCountry, null, route.fromCity)"
                :key="getAirportOptionValue(airport)"
                :value="getAirportOptionValue(airport)"
              >
                {{ airport.aeropuerto }}
              </option>
            </select>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>País de destino</label>
              <select v-model="route.toCountry">
                <option value="">Selecciona país</option>
                <option v-for="country in countries" :key="country" :value="country">{{ country }}</option>
              </select>
            </div>

            <div class="form-group">
              <label>Ciudad de destino</label>
              <select v-model="route.toCity" :disabled="!route.toCountry">
                <option value="">Selecciona ciudad</option>
                <option v-for="city in citiesByCountry(route.toCountry)" :key="city" :value="city">{{ city }}</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>Aeropuerto de destino</label>
            <select v-model="route.toAirport" :disabled="!route.toCity">
              <option value="">Selecciona aeropuerto</option>
              <option
                v-for="airport in airportsByCity(route.toCountry, null, route.toCity)"
                :key="getAirportOptionValue(airport)"
                :value="getAirportOptionValue(airport)"
              >
                {{ airport.aeropuerto }}
              </option>
            </select>
          </div>
        </template>

        <div class="form-row">
          <div class="form-group compact">
            <label>Pasajeros</label>
            <input
              v-model.number="route.passengers"
              type="number"
              min="1"
              :max="selectedAircraft?.capacity_passengers || 1"
            />
          </div>
        </div>
      </div>

      <div class="route-actions">
        <button type="button" class="ghost-btn" @click="$emit('add-route')">
          + Agregar otra ruta
        </button>
        <button
          v-if="routes.length > 1 && !returnToBaseEnabled"
          type="button"
          class="ghost-btn"
          @click="$emit('close-at-base')"
        >
          Cerrar en base inicial
        </button>
        <button
          v-if="returnToBaseEnabled"
          type="button"
          class="ghost-btn"
          @click="$emit('reopen-routes')"
        >
          Seguir agregando rutas
        </button>
        <button
          v-if="routes.length > 1"
          type="button"
          class="danger-btn"
          @click="$emit('remove-route', routes.length - 1)"
        >
          - Quitar última ruta
        </button>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Nombre completo</label>
        <input v-model="form.name" :class="{ invalid: errors.name }" />
      </div>

      <div class="form-group">
        <label>Correo electrónico</label>
        <input v-model="form.email" type="email" :class="{ invalid: errors.email }" />
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Teléfono</label>
        <input v-model="form.phone" :class="{ invalid: errors.phone }" />
      </div>
    </div>

    <div class="conversion-card">
      <div class="conversion-card__eyebrow">Cotización lista</div>
      <h3>Tu estimado está listo para continuar</h3>
      <p>
        Completa esta solicitud para asegurar disponibilidad de aeronave y
        desbloquear la cotización completa de tu reserva.
      </p>
      <div class="conversion-card__meta">
        <span class="conversion-pill">Disponibilidad limitada</span>
        <span class="conversion-pill conversion-pill--accent">Precio válido por 15 minutos</span>
      </div>
    </div>

    <button class="primary-btn" type="submit" :disabled="loading">
      {{ loading ? "Enviando..." : "Confirmar disponibilidad y ver cotización" }}
    </button>
    <small v-if="submitErrorMessage" class="error-text form-submit-error">
      {{ submitErrorMessage }}
    </small>
  </form>
</template>

<script setup>
defineEmits([
  "add-route",
  "close-at-base",
  "remove-route",
  "reopen-routes",
  "submit",
  "update:allow-aircraft-change",
  "update:routeType",
]);

defineProps({
  airportsByCity: {
    type: Function,
    required: true,
  },
  allowAircraftChange: {
    type: Boolean,
    default: false,
  },
  billableBreakdowns: {
    type: Array,
    default: () => [],
  },
  citiesByCountry: {
    type: Function,
    required: true,
  },
  citiesByState: {
    type: Function,
    required: true,
  },
  countries: {
    type: Array,
    default: () => [],
  },
  errors: {
    type: Object,
    default: () => ({}),
  },
  filteredFleet: {
    type: Array,
    default: () => [],
  },
  form: {
    type: Object,
    required: true,
  },
  formatCurrency: {
    type: Function,
    required: true,
  },
  getAirportOptionValue: {
    type: Function,
    required: true,
  },
  isBlocked: {
    type: Function,
    required: true,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  routeType: {
    type: String,
    default: "NATIONAL",
  },
  routes: {
    type: Array,
    default: () => [],
  },
  returnToBaseEnabled: {
    type: Boolean,
    default: false,
  },
  selectedAircraft: {
    type: Object,
    default: null,
  },
  states: {
    type: Array,
    default: () => [],
  },
  submitErrorMessage: {
    type: String,
    default: "",
  },
});
</script>
