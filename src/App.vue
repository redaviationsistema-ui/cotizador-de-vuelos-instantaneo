<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import QuoteHero from "./components/quote/QuoteHero.vue";
import QuoteHistory from "./components/quote/QuoteHistory.vue";
import QuoteModal from "./components/quote/QuoteModal.vue";
import QuoteSidebar from "./components/quote/QuoteSidebar.vue";
import ReservationForm from "./components/quote/ReservationForm.vue";
import { supabase } from "./supabase";
import { calculateAircraftQuote } from "./utils/flightQuoteCalculator";
import { generateReservationPDF } from "./utils/pdfGenerator";

const airportsNational = ref([]);
const airportsInternational = ref([]);
const aircraftFleet = ref([]);
const savedQuotes = ref([]);
const reservations = ref([]);
const blockedDates = ref([]);
const dataLoading = ref(true);
const dataLoadError = ref("");

const norm = (value) =>
  (value || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const form = reactive({
  name: "",
  email: "",
  phone: "",
  flightType: "",
  exchangeRate: 17.2,
  ivaRate: 0.16,
});

const routeType = ref("NATIONAL");
const loading = ref(false);
const hydratingSavedQuote = ref(false);
const errorMessage = ref("");
const showQuoteModal = ref(false);
const currentView = ref("builder");
const returnToBaseEnabled = ref(false);
const validationMessage = ref("");
const allowAircraftChange = ref(false);
const errors = ref({});
const nextId = ref(2);
const manualSummary = reactive({
  enabled: false,
  flight: "",
  overnight: "",
  expenses: "",
  subtotal: "",
  total: "",
});

const emptyRoute = () => ({
  id: nextId.value++,
  fromCountry: "",
  fromState: "",
  fromCity: "",
  fromAirport: "",
  toCountry: "",
  toState: "",
  toCity: "",
  toAirport: "",
  passengers: 1,
  aircraft_id: null,
  start_date: "",
  end_date: "",
});

const routes = ref([emptyRoute()]);

const formatQuoteDate = (value) => {
  if (!value) return "Sin fecha";

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const toDateTimeLocalValue = (value) => {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 16);
  }

  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

const getAirportDetailsByCode = (code) =>
  allAirports.value.find(
    (airport) => norm(airport.iata) === norm(code) || norm(airport.icao || "") === norm(code),
  ) || null;

const buildRouteLabel = (quoteRoutes = []) => {
  if (!quoteRoutes.length) return "Sin rutas";

  const chain = [];

  quoteRoutes.forEach((route, index) => {
    const from = route.from_airport || "-";
    const to = route.to_airport || "-";

    if (index === 0) chain.push(from);
    chain.push(to);
  });

  return chain.join(" → ");
};

const fetchSavedQuotes = async () => {
  const { data, error } = await supabase
    .from("quotes")
    .select(`
      id,
      full_name,
      email,
      phone,
      flight_type,
      total_estimated_price,
      created_at,
      quote_routes (
        id,
        from_airport,
        to_airport,
        passengers,
        aircraft_id,
        estimated_price,
        start_date,
        end_date
      )
    `)
    .order("created_at", { ascending: false, nullsFirst: false });

  if (error) throw error;

  savedQuotes.value = (data || []).map((quote) => {
    const sortedRoutes = [...(quote.quote_routes || [])].sort((left, right) => Number(left.id) - Number(right.id));

    return {
      ...quote,
      quote_routes: sortedRoutes,
      routeLabel: buildRouteLabel(sortedRoutes),
      createdAtLabel: formatQuoteDate(quote.created_at),
    };
  });
};

const loadSupabaseData = async () => {
  dataLoading.value = true;
  dataLoadError.value = "";

  try {
    const [
      { data: national, error: nationalError },
      { data: international, error: internationalError },
      { data: fleet, error: fleetError },
      { data: blocked, error: blockedError },
      { data: reservationRows, error: reservationsError },
      ,
    ] = await Promise.all([
      supabase.from("aeropuertos_mexico").select("*"),
      supabase.from("airports_geo").select("*"),
      supabase.from("aircraft_fleet").select("*").eq("is_active", true),
      supabase.from("blocked_dates").select("*"),
      supabase
        .from("reservations")
        .select("aircraft_id, start_datetime, end_datetime, status")
        .in("status", ["pending", "confirmed"]),
      fetchSavedQuotes(),
    ]);

    if (nationalError) throw nationalError;
    if (internationalError) throw internationalError;
    if (fleetError) throw fleetError;
    if (blockedError) throw blockedError;
    if (reservationsError) throw reservationsError;

    airportsNational.value = national || [];
    airportsInternational.value = international || [];
    aircraftFleet.value = fleet || [];
    blockedDates.value = blocked || [];
    reservations.value = reservationRows || [];
  } catch (error) {
    console.error(error);
    dataLoadError.value = "No se pudo cargar la información de Supabase.";
  } finally {
    dataLoading.value = false;
  }
};

onMounted(() => {
  loadSupabaseData();
});

const allAirports = computed(() => [
  ...airportsNational.value.map((airport) => ({
    source: "NATIONAL",
    aeropuerto: airport.AEROPUERTO,
    iata: airport.IATA,
    ciudad: airport.CIUDAD,
    estado: airport.ESTADO,
    country: "MEXICO",
    lat: airport.LATITUDE,
    lng: airport.LONGITUDE,
  })),
  ...airportsInternational.value.map((airport) => ({
    source: "INTERNATIONAL",
    aeropuerto: airport.AEROPUERTO,
    iata: airport.IATA,
    ciudad: airport.CIUDAD,
    country: airport.COUNTRY,
    lat: airport.LATITUDE,
    lng: airport.LONGITUDE,
  })),
]);

const states = computed(() =>
  [...new Set(airportsNational.value.map((airport) => airport.ESTADO))].sort(),
);

const countries = computed(() =>
  [...new Set(airportsInternational.value.map((airport) => airport.COUNTRY))].sort(),
);

const citiesByState = (state) =>
  [...new Set(
    airportsNational.value
      .filter((airport) => norm(airport.ESTADO) === norm(state))
      .map((airport) => airport.CIUDAD),
  )].sort();

const citiesByCountry = (country) =>
  [...new Set(
    airportsInternational.value
      .filter((airport) => norm(airport.COUNTRY) === norm(country))
      .map((airport) => airport.CIUDAD),
  )].sort();

const airportsByCity = (country, state, city) => {
  if (!city) return [];

  if (routeType.value === "NATIONAL") {
    return allAirports.value.filter(
      (airport) =>
        airport.source === "NATIONAL" &&
        norm(airport.estado) === norm(state) &&
        norm(airport.ciudad) === norm(city),
    );
  }

  return allAirports.value.filter(
    (airport) =>
      norm(airport.country) === norm(country) &&
      norm(airport.ciudad) === norm(city),
  );
};

const getAirportOptionValue = (airport) => airport?.iata || airport?.IATA || "";

const filteredFleet = computed(() => {
  if (!form.flightType) return aircraftFleet.value;

  const map = {
    "Private Jet": "Jet Ejecutivo",
    Helicopter: "Helicóptero",
    "Air Ambulance": "Jet Ejecutivo",
    Cargo: "Turbohélice",
  };

  return aircraftFleet.value.filter(
    (aircraft) => aircraft.aircraft_type === map[form.flightType],
  );
});

const selectedAircraft = computed(() =>
  aircraftFleet.value.find(
    (aircraft) => String(aircraft.id) === String(routes.value[0]?.aircraft_id),
  ) || null,
);

const getAircraftById = (id) =>
  aircraftFleet.value.find((aircraft) => String(aircraft.id) === String(id)) || null;

const getAircraftName = (id) => getAircraftById(id)?.name || "";

const getPrimaryAircraftId = () => routes.value[0]?.aircraft_id || null;
const getRouteAircraftId = (route) => route?.aircraft_id || getPrimaryAircraftId();

const getRouteAirport = (airportName) =>
  allAirports.value.find(
    (airport) => norm(airport.iata) === norm(airportName) || norm(airport.aeropuerto) === norm(airportName),
  );

const getAircraftBaseAirport = (aircraftId) => {
  const aircraft = getAircraftById(aircraftId);
  if (!aircraft) return null;

  return (
    allAirports.value.find((airport) => norm(airport.iata) === norm(aircraft.home_base)) ||
    allAirports.value.find(
      (airport) =>
        norm(airport.ciudad) === norm(aircraft.ciudad) &&
        norm(airport.estado || "") === norm(aircraft.estado || ""),
    ) ||
    null
  );
};

const isSameAirportLocation = (leftAirport, rightAirport) => {
  if (!leftAirport || !rightAirport) return false;

  return (
    norm(leftAirport.iata) === norm(rightAirport.iata) ||
    (norm(leftAirport.ciudad) === norm(rightAirport.ciudad) &&
      norm(leftAirport.estado || "") === norm(rightAirport.estado || "") &&
      norm(leftAirport.country || "") === norm(rightAirport.country || ""))
  );
};

const findAirportForRoute = (route, direction) => {
  const airportValue = direction === "from" ? route.fromAirport : route.toAirport;
  const city = direction === "from" ? route.fromCity : route.toCity;
  const state = direction === "from" ? route.fromState : route.toState;
  const country = direction === "from" ? route.fromCountry : route.toCountry;

  return (
    allAirports.value.find(
      (airport) =>
        norm(airport.iata) === norm(airportValue) || norm(airport.aeropuerto) === norm(airportValue),
    ) ||
    allAirports.value.find(
      (airport) =>
        norm(airport.ciudad) === norm(city) &&
        norm(airport.estado || "") === norm(state || "") &&
        norm(airport.country || "") === norm(country || ""),
    ) ||
    null
  );
};

const getRouteNights = (route) => {
  if (!route.start_date || !route.end_date) return 0;
  return Math.max(0, (new Date(route.end_date) - new Date(route.start_date)) / 86400000);
};

const isInternationalFlight = computed(() => {
  if (routeType.value === "INTERNATIONAL") return true;

  return routes.value.some((route) => {
    const from = getRouteAirport(route.fromAirport);
    const to = getRouteAirport(route.toAirport);
    if (!from || !to) return false;
    return norm(from.country) !== norm(to.country);
  });
});

const validRoutes = computed(() =>
  routes.value.filter(
    (route) =>
      Number(route.passengers) > 0 &&
      getRouteAircraftId(route) &&
      route.fromAirport &&
      route.toAirport,
  ),
);

const totalOvernightNights = computed(() =>
  validRoutes.value.reduce((sum, route) => sum + getRouteNights(route), 0),
);

const buildPositioningRoute = (aircraftId, fromAirport, toAirport, positioningType) => ({
  aircraft_id: aircraftId,
  fromAirport,
  toAirport,
  passengers: 1,
  start_date: "",
  end_date: "",
  positioning: true,
  positioningType,
});

const billableRoutes = computed(() => {
  if (!validRoutes.value.length) return [];

  const firstRoute = validRoutes.value[0];
  const lastRoute = validRoutes.value[validRoutes.value.length - 1];
  const aircraftBase = getAircraftBaseAirport(firstRoute.aircraft_id);
  if (!aircraftBase?.iata) return [...validRoutes.value];

  const nextRoutes = [];

  if (!isSameAirportLocation(findAirportForRoute(firstRoute, "from"), aircraftBase)) {
    nextRoutes.push(
      buildPositioningRoute(firstRoute.aircraft_id, aircraftBase.iata, firstRoute.fromAirport, "repositioning"),
    );
  }

  nextRoutes.push(...validRoutes.value);

  if (!isSameAirportLocation(findAirportForRoute(lastRoute, "to"), aircraftBase)) {
    nextRoutes.push(
      buildPositioningRoute(firstRoute.aircraft_id, lastRoute.toAirport, aircraftBase.iata, "return_to_base"),
    );
  }

  return nextRoutes;
});

const currentQuote = computed(() => {
  const aircraft = selectedAircraft.value;
  if (!aircraft || !validRoutes.value.length) return null;

  const firstRoute = validRoutes.value[0];
  const lastRoute = validRoutes.value[validRoutes.value.length - 1];
  const firstOrigin = firstRoute.fromAirport;
  const finalDestination = lastRoute.toAirport;

  return calculateAircraftQuote({
    aircraft,
    airports: allAirports.value.map((airport) => ({
      iata: airport.iata,
      icao: airport.icao,
      latitude: airport.lat,
      longitude: airport.lng,
      name: airport.aeropuerto,
      city: airport.ciudad,
      state: airport.estado,
      country: airport.country,
    })),
    originCode: firstOrigin,
    destinationCode: finalDestination,
    passengers: Math.max(...validRoutes.value.map((route) => Number(route.passengers) || 0), 1),
    exchangeRate: form.exchangeRate,
    taxRate: form.ivaRate,
    overnightNights: totalOvernightNights.value,
    routeType: isInternationalFlight.value ? "Internacional" : "Nacional",
    includeTax: true,
    includeRepositioning: true,
    includeReturnToBase: true,
  });
});

const routeEstimates = computed(() =>
  validRoutes.value.map((route) =>
    calculateAircraftQuote({
      aircraft: selectedAircraft.value,
      airports: allAirports.value.map((airport) => ({
        iata: airport.iata,
        icao: airport.icao,
        latitude: airport.lat,
        longitude: airport.lng,
        name: airport.aeropuerto,
        city: airport.ciudad,
        state: airport.estado,
        country: airport.country,
      })),
      originCode: route.fromAirport,
      destinationCode: route.toAirport,
      passengers: route.passengers,
      exchangeRate: form.exchangeRate,
      taxRate: form.ivaRate,
      overnightNights: getRouteNights(route),
      routeType: isInternationalFlight.value ? "Internacional" : "Nacional",
      includeTax: false,
      includeRepositioning: false,
      includeReturnToBase: false,
    }),
  ),
);

const billableBreakdowns = computed(() =>
  (currentQuote.value?.legs || []).map((leg) => ({
    ready: true,
    flightCost: leg.eteMinutes
      ? (leg.eteMinutes / 60) * (currentQuote.value?.hourlyRate || 0)
      : 0,
    overnightCost: 0,
    operationalCost: 0,
    nights: 0,
    total: leg.eteMinutes
      ? (leg.eteMinutes / 60) * (currentQuote.value?.hourlyRate || 0)
      : 0,
    hours: leg.realHours || 0,
    billableHours: leg.eteMinutes ? leg.eteMinutes / 60 : 0,
    miles: leg.distanceNm || 0,
    label: leg.label,
    type: leg.type,
    realTime: leg.realTime || "0:00",
  })),
);

const flightCostTotal = computed(() => currentQuote.value?.flightCost || 0);
const overnightTotal = computed(() => currentQuote.value?.overnightCost || 0);
const operationalExpenses = computed(() => currentQuote.value?.airportFees || 0);
const landingHandlingFees = computed(() => 0);
const fuelSurcharge = computed(() => 0);
const subtotal = computed(() => currentQuote.value?.subtotal || 0);
const iva = computed(() => currentQuote.value?.iva || 0);
const totalFinal = computed(() => currentQuote.value?.totalUsd || 0);
const totalMxn = computed(() => currentQuote.value?.totalMxn || 0);

const getSummaryValue = (key, fallback) => {
  if (!manualSummary.enabled) return Number(fallback || 0);
  return toNumber(manualSummary[key], Number(fallback || 0));
};

const displayedFlightTotal = computed(() => getSummaryValue("flight", flightCostTotal.value + iva.value));
const displayedOvernightTotal = computed(() => getSummaryValue("overnight", overnightTotal.value));
const displayedOperationalExpenses = computed(() => getSummaryValue("expenses", operationalExpenses.value));
const displayedSubtotal = computed(() => getSummaryValue("subtotal", subtotal.value));
const displayedTotalFinal = computed(() => getSummaryValue("total", totalFinal.value));

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const formatCurrency = (value) => currency.format(Number(value || 0));

const submitErrorMessage = computed(() => validationMessage.value || errorMessage.value);

const syncManualSummaryWithQuote = () => {
  manualSummary.flight = String(Math.round(flightCostTotal.value + iva.value));
  manualSummary.overnight = String(Math.round(overnightTotal.value));
  manualSummary.expenses = String(Math.round(operationalExpenses.value));
  manualSummary.subtotal = String(Math.round(subtotal.value));
  manualSummary.total = String(Math.round(totalFinal.value));
};

const toggleManualSummary = () => {
  if (!manualSummary.enabled) {
    syncManualSummaryWithQuote();
  }

  manualSummary.enabled = !manualSummary.enabled;
};

const updateManualSummary = ({ key, value }) => {
  manualSummary[key] = value;

  if (!manualSummary.enabled) return;

  const overnightValue = toNumber(manualSummary.overnight, displayedOvernightTotal.value);
  const expensesValue = toNumber(manualSummary.expenses, displayedOperationalExpenses.value);
  const taxRate = toNumber(form.ivaRate, 0.16);

  if (key === "total") {
    const totalValue = toNumber(value, displayedTotalFinal.value);
    const adjustedFlight = Math.max(totalValue - overnightValue - expensesValue, 0);
    const adjustedSubtotal = totalValue / (1 + taxRate);

    manualSummary.flight = String(Math.round(adjustedFlight));
    manualSummary.subtotal = String(Math.round(adjustedSubtotal));
    manualSummary.total = String(Math.round(totalValue));
    return;
  }

  if (key === "flight" || key === "overnight" || key === "expenses") {
    const flightValue = toNumber(manualSummary.flight, displayedFlightTotal.value);
    const recalculatedTotal = flightValue + overnightValue + expensesValue;
    const recalculatedSubtotal = recalculatedTotal / (1 + taxRate);

    manualSummary.subtotal = String(Math.round(recalculatedSubtotal));
    manualSummary.total = String(Math.round(recalculatedTotal));
    return;
  }

  if (key === "subtotal") {
    const subtotalValue = toNumber(value, displayedSubtotal.value);
    const recalculatedTotal = subtotalValue * (1 + taxRate);
    const adjustedFlight = Math.max(recalculatedTotal - overnightValue - expensesValue, 0);

    manualSummary.flight = String(Math.round(adjustedFlight));
    manualSummary.total = String(Math.round(recalculatedTotal));
  }
};

const resetManualSummary = () => {
  manualSummary.enabled = false;
  manualSummary.flight = "";
  manualSummary.overnight = "";
  manualSummary.expenses = "";
  manualSummary.subtotal = "";
  manualSummary.total = "";
};

const resetRouteCollection = () => {
  nextId.value = 2;
  routes.value = [emptyRoute()];
  returnToBaseEnabled.value = false;
  resetManualSummary();
};

const resetQuoteBuilder = () => {
  form.name = "";
  form.email = "";
  form.phone = "";
  form.flightType = "";
  form.exchangeRate = 17.2;
  form.ivaRate = 0.16;
  routeType.value = "NATIONAL";
  allowAircraftChange.value = false;
  errorMessage.value = "";
  validationMessage.value = "";
  errors.value = {};
  showQuoteModal.value = false;
  resetRouteCollection();
};

const hydrateRouteFromAirport = (target, direction, airport) => {
  if (!airport) return;

  if (direction === "from") {
    target.fromAirport = airport.iata || "";
    target.fromCity = airport.ciudad || "";
    target.fromState = airport.estado || "";
    target.fromCountry = airport.source === "NATIONAL" ? "" : airport.country || "";
    return;
  }

  target.toAirport = airport.iata || "";
  target.toCity = airport.ciudad || "";
  target.toState = airport.estado || "";
  target.toCountry = airport.source === "NATIONAL" ? "" : airport.country || "";
};

const loadSavedQuote = (quote) => {
  hydratingSavedQuote.value = true;
  form.name = quote.full_name || "";
  form.email = quote.email || "";
  form.phone = quote.phone || "";
  form.flightType = quote.flight_type || "";
  form.exchangeRate = 17.2;
  form.ivaRate = 0.16;

  resetRouteCollection();

  const savedRoutes = quote.quote_routes || [];
  if (!savedRoutes.length) return;

  const firstOriginAirport = getAirportDetailsByCode(savedRoutes[0].from_airport);
  const hasInternationalAirport = savedRoutes.some((route) => {
    const fromAirport = getAirportDetailsByCode(route.from_airport);
    const toAirport = getAirportDetailsByCode(route.to_airport);
    return fromAirport?.source === "INTERNATIONAL" || toAirport?.source === "INTERNATIONAL";
  });

  routeType.value =
    hasInternationalAirport || (firstOriginAirport?.country && norm(firstOriginAirport.country) !== "MEXICO")
      ? "INTERNATIONAL"
      : "NATIONAL";

  routes.value = savedRoutes.map((savedRoute, index) => {
    const nextRoute = {
      ...emptyRoute(),
      passengers: Number(savedRoute.passengers || 1),
      aircraft_id: savedRoute.aircraft_id || null,
      start_date: toDateTimeLocalValue(savedRoute.start_date),
      end_date: toDateTimeLocalValue(savedRoute.end_date),
    };

    const fromAirport = getAirportDetailsByCode(savedRoute.from_airport);
    const toAirport = getAirportDetailsByCode(savedRoute.to_airport);

    hydrateRouteFromAirport(nextRoute, "from", fromAirport);
    hydrateRouteFromAirport(nextRoute, "to", toAirport);

    return nextRoute;
  });

  allowAircraftChange.value = false;
  currentView.value = "builder";
  errorMessage.value = "";
  validationMessage.value = `Cotización #${quote.id} cargada. Ya puedes editarla manualmente.`;
  hydratingSavedQuote.value = false;

  nextTick(() => {
    const savedTotal = toNumber(quote.total_estimated_price, displayedTotalFinal.value);
    const currentOvernight = toNumber(overnightTotal.value, 0);
    const currentExpenses = toNumber(operationalExpenses.value, 0);
    const taxMultiplier = 1 + toNumber(form.ivaRate, 0.16);
    const derivedSubtotal = savedTotal / taxMultiplier;
    const derivedFlightDisplay = Math.max(savedTotal - currentOvernight - currentExpenses, 0);

    manualSummary.enabled = true;
    manualSummary.flight = String(Math.round(derivedFlightDisplay));
    manualSummary.overnight = String(Math.round(currentOvernight));
    manualSummary.expenses = String(Math.round(currentExpenses));
    manualSummary.subtotal = String(Math.round(derivedSubtotal));
    manualSummary.total = String(Math.round(savedTotal));
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
};

const syncLastRouteDestinationToHomeBase = () => {
  if (!returnToBaseEnabled.value || routes.value.length <= 1) return;
  const lastRoute = routes.value[routes.value.length - 1];
  const firstRoute = routes.value[0];

  lastRoute.toCountry = firstRoute.fromCountry || "";
  lastRoute.toState = firstRoute.fromState || "";
  lastRoute.toCity = firstRoute.fromCity || "";
  lastRoute.toAirport = firstRoute.fromAirport || "";
};

const addRoute = () => {
  const last = routes.value[routes.value.length - 1];
  routes.value.push({
    ...emptyRoute(),
    fromCountry: last.toCountry || "",
    fromState: last.toState || "",
    fromCity: last.toCity || "",
    fromAirport: last.toAirport || "",
    passengers: last.passengers || 1,
    aircraft_id: last.aircraft_id || routes.value[0]?.aircraft_id || null,
  });
};

const closeAtBase = () => {
  if (returnToBaseEnabled.value) return;
  const last = routes.value[routes.value.length - 1];
  const first = routes.value[0];

  routes.value.push({
    ...emptyRoute(),
    fromCountry: last.toCountry || "",
    fromState: last.toState || "",
    fromCity: last.toCity || "",
    fromAirport: last.toAirport || "",
    toCountry: first.fromCountry || "",
    toState: first.fromState || "",
    toCity: first.fromCity || "",
    toAirport: first.fromAirport || "",
    passengers: last.passengers || 1,
    aircraft_id: routes.value[0]?.aircraft_id || null,
  });

  returnToBaseEnabled.value = true;
};

const reopenRoutes = () => {
  if (!returnToBaseEnabled.value) return;
  routes.value.pop();
  returnToBaseEnabled.value = false;
};

const removeRoute = (index) => {
  if (routes.value.length <= 1) return;
  if (returnToBaseEnabled.value && index === routes.value.length - 1) {
    returnToBaseEnabled.value = false;
  }
  routes.value.splice(index, 1);
};

const isBlocked = (date, aircraftId) => {
  if (!date || !aircraftId) return false;

  const selectedDay = new Date(date).toISOString().split("T")[0];
  const reservationBlocked = reservations.value.some((reservation) => {
    if (String(reservation.aircraft_id) !== String(aircraftId)) return false;
    const startDay = new Date(reservation.start_datetime).toISOString().split("T")[0];
    const endDay = new Date(reservation.end_datetime).toISOString().split("T")[0];
    return selectedDay >= startDay && selectedDay <= endDay;
  });

  if (reservationBlocked) return true;

  return blockedDates.value.some((block) => {
    if (String(block.aircraft_id) !== String(aircraftId)) return false;
    const startDay = new Date(block.start_date || block.start_datetime).toISOString().split("T")[0];
    const endDay = new Date(block.end_date || block.end_datetime || block.start_date || block.start_datetime)
      .toISOString()
      .split("T")[0];
    return selectedDay >= startDay && selectedDay <= endDay;
  });
};

const getErrorFieldLabel = (key) => {
  if (key === "name") return "Nombre completo";
  if (key === "email") return "Correo";
  if (key === "phone") return "Teléfono";
  if (key === "flightType") return "Tipo de vuelo";
  if (key === "routeType") return "Tipo de ruta";
  if (key === "aircraft_0") return "Aeronave";
  if (key === "start_0") return "Fecha de salida";
  if (key === "end_0") return "Fecha de regreso";
  if (key.startsWith("fromAirport_")) return `Origen de la ruta ${Number(key.split("_")[1]) + 1}`;
  if (key.startsWith("toAirport_")) return `Destino de la ruta ${Number(key.split("_")[1]) + 1}`;
  if (key.startsWith("passengers_")) return `Pasajeros de la ruta ${Number(key.split("_")[1]) + 1}`;
  return "";
};

const buildValidationMessage = () => {
  const fields = Object.keys(errors.value).map((key) => getErrorFieldLabel(key)).filter(Boolean);
  const unique = [...new Set(fields)];
  if (!unique.length) return "";
  return `Completa o corrige estos campos: ${unique.join(", ")}.`;
};

const validateForm = () => {
  errors.value = {};
  validationMessage.value = "";

  if (!form.name.trim()) errors.value.name = "El nombre completo es obligatorio";
  if (!form.email.trim()) errors.value.email = "El correo es obligatorio";
  if (!form.phone.trim()) errors.value.phone = "El teléfono es obligatorio";
  if (!form.flightType) errors.value.flightType = "El tipo de vuelo es obligatorio";
  if (!routeType.value) errors.value.routeType = "El tipo de ruta es obligatorio";

  const firstRoute = routes.value[0];
  if (!firstRoute.aircraft_id) errors.value.aircraft_0 = "Selecciona una aeronave";
  if (!firstRoute.start_date) errors.value.start_0 = "La fecha de salida es obligatoria";
  if (!firstRoute.end_date) errors.value.end_0 = "La fecha de regreso es obligatoria";

  routes.value.forEach((route, index) => {
    if (!route.fromAirport) errors.value[`fromAirport_${index}`] = "El aeropuerto de origen es obligatorio";
    if (!route.toAirport) errors.value[`toAirport_${index}`] = "El aeropuerto de destino es obligatorio";

    const max = selectedAircraft.value?.capacity_passengers || 1;
    if (route.passengers < 1 || route.passengers > max) {
      errors.value[`passengers_${index}`] = `Máximo ${max} pasajeros permitidos para esta aeronave`;
    }
  });

  const valid = Object.keys(errors.value).length === 0;
  if (!valid) validationMessage.value = buildValidationMessage();
  return valid;
};

const submitForm = () => {
  if (!validateForm()) return;
  if (!validRoutes.value.length) {
    errorMessage.value = "Completa la aeronave, origen, destino y fechas válidas antes de continuar.";
    return;
  }

  const invalidBreakdown = billableBreakdowns.value.find((item) => !item.ready);
  if (invalidBreakdown) {
    errorMessage.value = "No se pudo generar la cotización con la configuración actual.";
    return;
  }

  errorMessage.value = "";
  showQuoteModal.value = true;
};

const buildReservationPdfBlob = async () =>
  generateReservationPDF({
    form,
    routes: billableRoutes.value,
    operationalLegs: currentQuote.value?.legs || [],
    breakdowns: billableBreakdowns.value,
    totals: {
      flight: displayedFlightTotal.value,
      overnight: displayedOvernightTotal.value,
      expenses: displayedOperationalExpenses.value,
      subtotal: displayedSubtotal.value,
      iva: iva.value,
      total: displayedTotalFinal.value,
    },
    getAircraftName,
    getAircraftById,
  });

const buildOperationalRouteFilename = () => {
  const routeCodes = (currentQuote.value?.legs || []).reduce((chain, leg, index) => {
    const fromCode = String(leg?.from?.iata || leg?.from?.icao || "").trim().toUpperCase();
    const toCode = String(leg?.to?.iata || leg?.to?.icao || "").trim().toUpperCase();

    if (!fromCode || !toCode) return chain;
    if (index === 0) chain.push(fromCode);
    chain.push(toCode);

    return chain;
  }, []);

  const routeName = routeCodes.length ? routeCodes.join("-") : "cotizacion";

  return `cotizacion-${routeName}`.replace(/[^A-Z0-9-]/gi, "");
};

const downloadQuotePdf = async () => {
  if (!validRoutes.value.length) return;

  try {
    const pdfBlob = await buildReservationPdfBlob();
    const objectUrl = URL.createObjectURL(pdfBlob);
    const link = document.createElement("a");
    const pdfFilename = buildOperationalRouteFilename();

    link.href = objectUrl;
    link.download = `${pdfFilename}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    console.error(error);
    errorMessage.value = "No se pudo descargar el PDF.";
  }
};

const saveQuote = async () => {
  if (!validRoutes.value.length) return;

  loading.value = true;
  errorMessage.value = "";

  try {
    const { data: quoteData, error: quoteError } = await supabase
      .from("quotes")
      .insert({
        full_name: form.name,
        email: form.email,
        phone: form.phone,
        flight_type: form.flightType,
        total_estimated_price: displayedTotalFinal.value,
      })
      .select()
      .single();

    if (quoteError) throw quoteError;

    const payload = validRoutes.value.map((route, index) => ({
      quote_id: quoteData.id,
      from_airport: route.fromAirport,
      to_airport: route.toAirport,
      passengers: route.passengers,
      aircraft_id: getRouteAircraftId(route),
      estimated_price: routeEstimates.value[index]?.flightCost || 0,
      start_date: route.start_date || null,
      end_date: route.end_date || null,
    }));

    const { error: routesError } = await supabase.from("quote_routes").insert(payload);
    if (routesError) throw routesError;

    await fetchSavedQuotes();
    showQuoteModal.value = false;
    validationMessage.value = "Cotización guardada correctamente en Supabase.";
  } catch (error) {
    console.error(error);
    errorMessage.value = "No se pudo guardar la cotización en Supabase.";
  } finally {
    loading.value = false;
  }
};

const sendQuoteEmail = async () => {
  if (!validRoutes.value.length) return;

  loading.value = true;
  errorMessage.value = "";

  try {
    const blobToBase64 = (blob) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

    const pdfBlob = await buildReservationPdfBlob();
    const pdfBase64 = await blobToBase64(pdfBlob);

    const response = await fetch(
      "https://redskyg.com/landing/send-email_movil_cliente.php",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          form,
          routes: billableRoutes.value,
          subtotal: displayedSubtotal.value,
          iva: iva.value,
          total: displayedTotalFinal.value,
          totalMxn: totalMxn.value,
          pdf: pdfBase64,
        }),
      },
    );

    if (!response.ok) {
      throw new Error("No se pudo enviar el PDF por correo.");
    }

    validationMessage.value = "PDF enviado correctamente por correo.";
  } catch (error) {
    console.error(error);
    errorMessage.value = "No se pudo enviar el PDF por correo.";
  } finally {
    loading.value = false;
  }
};

watch(
  () => routes.value[0]?.aircraft_id,
  (aircraftId) => {
    routes.value.forEach((route, index) => {
      if (index === 0) return;
      route.aircraft_id = aircraftId || null;
    });

    const aircraft = getAircraftById(aircraftId);
    const baseAirport = getAircraftBaseAirport(aircraftId);
    if (!aircraft || !baseAirport) return;

    const firstRoute = routes.value[0];
    if (routeType.value === "NATIONAL") {
      firstRoute.fromState = aircraft.estado || baseAirport.estado || "";
      firstRoute.fromCity = aircraft.ciudad || baseAirport.ciudad || "";
      firstRoute.fromCountry = "";
    } else {
      firstRoute.fromCountry = baseAirport.country || "Mexico";
      firstRoute.fromState = "";
      firstRoute.fromCity = aircraft.ciudad || baseAirport.ciudad || "";
    }
    firstRoute.fromAirport = baseAirport.iata;
    syncLastRouteDestinationToHomeBase();
  },
);

watch(
  () => routeType.value,
  () => {
    if (hydratingSavedQuote.value) return;

    routes.value.forEach((route) => {
      route.fromCountry = "";
      route.fromState = "";
      route.fromCity = "";
      route.fromAirport = "";
      route.toCountry = "";
      route.toState = "";
      route.toCity = "";
      route.toAirport = "";
    });

    const aircraftId = routes.value[0]?.aircraft_id;
    if (aircraftId) {
      const baseAirport = getAircraftBaseAirport(aircraftId);
      if (baseAirport) {
        routes.value[0].fromAirport = baseAirport.iata;
        routes.value[0].fromCity = baseAirport.ciudad;
        if (routeType.value === "NATIONAL") {
          routes.value[0].fromState = baseAirport.estado || "";
        } else {
          routes.value[0].fromCountry = baseAirport.country || "";
        }
      }
    }
  },
);

watch(
  () => routes.value.map((route) => ({
    toCountry: route.toCountry,
    toState: route.toState,
    toCity: route.toCity,
    toAirport: route.toAirport,
  })),
  (newRoutes) => {
    if (hydratingSavedQuote.value) return;

    newRoutes.forEach((route, index) => {
      const next = routes.value[index + 1];
      if (!next) return;
      next.fromCountry = route.toCountry;
      next.fromState = route.toState;
      next.fromCity = route.toCity;
      next.fromAirport = route.toAirport;
    });
  },
  { deep: true },
);

watch(
  () => [
    routeType.value,
    routes.value.length,
    routes.value[0]?.fromCountry,
    routes.value[0]?.fromState,
    routes.value[0]?.fromCity,
    routes.value[0]?.fromAirport,
  ],
  () => {
    if (hydratingSavedQuote.value) return;
    syncLastRouteDestinationToHomeBase();
  },
  { immediate: true },
);

const quoteValidityLabel = ref("15:00");

watch(
  showQuoteModal,
  (visible) => {
    if (!visible) {
      quoteValidityLabel.value = "15:00";
      return;
    }

    let seconds = 15 * 60;
    quoteValidityLabel.value = "15:00";
    const interval = setInterval(() => {
      seconds -= 1;
      const minutes = String(Math.max(Math.floor(seconds / 60), 0)).padStart(2, "0");
      const secs = String(Math.max(seconds % 60, 0)).padStart(2, "0");
      quoteValidityLabel.value = `${minutes}:${secs}`;

      if (seconds <= 0 || !showQuoteModal.value) {
        clearInterval(interval);
      }
    }, 1000);
  },
);
</script>

<template>
  <main class="page-shell">
    <section class="view-switcher">
      <button
        type="button"
        class="view-switcher__btn"
        :class="{ 'view-switcher__btn--active': currentView === 'builder' }"
        @click="currentView = 'builder'; resetQuoteBuilder()"
      >
        Nueva cotización
      </button>
      <button
        type="button"
        class="view-switcher__btn"
        :class="{ 'view-switcher__btn--active': currentView === 'history' }"
        @click="currentView = 'history'"
      >
        Cotizaciones guardadas
      </button>
    </section>

    <section class="view-banner">
      <div>
        <p class="eyebrow">Vista activa</p>
        <h2>{{ currentView === "builder" ? "Nueva cotización" : "Cotizaciones guardadas" }}</h2>
        <p class="hero-text">
          {{
            currentView === "builder"
              ? "Crea una cotización nueva, calcula la operación y genera el PDF."
              : "Consulta cotizaciones guardadas y vuelve a cargarlas para editarlas manualmente."
          }}
        </p>
      </div>
    </section>

    <QuoteHero
      v-if="currentView === 'builder'"
      :aircraft-name="selectedAircraft?.name || ''"
      :data-loading="dataLoading"
      :format-currency="formatCurrency"
      :total-final="totalFinal"
      :valid-routes="validRoutes.length"
    />

    <section v-if="dataLoadError" class="data-banner data-banner--error">
      {{ dataLoadError }}
    </section>

    <section v-else-if="dataLoading" class="data-banner">
      Cargando aeropuertos, flota y disponibilidad desde Supabase...
    </section>

    <section v-if="currentView === 'builder'" class="workspace-grid">
      <ReservationForm
        :airports-by-city="airportsByCity"
        :allow-aircraft-change="allowAircraftChange"
        :billable-breakdowns="billableBreakdowns"
        :cities-by-country="citiesByCountry"
        :cities-by-state="citiesByState"
        :countries="countries"
        :errors="errors"
        :filtered-fleet="filteredFleet"
        :form="form"
        :format-currency="formatCurrency"
        :get-airport-option-value="getAirportOptionValue"
        :is-blocked="isBlocked"
        :loading="loading"
        :route-type="routeType"
        :routes="routes"
        :return-to-base-enabled="returnToBaseEnabled"
        :selected-aircraft="selectedAircraft"
        :states="states"
        :submit-error-message="submitErrorMessage"
        @add-route="addRoute"
        @close-at-base="closeAtBase"
        @remove-route="removeRoute"
        @reopen-routes="reopenRoutes"
        @submit="submitForm"
        @update:allow-aircraft-change="allowAircraftChange = $event"
        @update:route-type="routeType = $event"
      />

      <QuoteSidebar
        :aircraft-name="selectedAircraft?.name || ''"
        :billable-breakdowns="billableBreakdowns"
        :billable-routes="billableRoutes"
        :flight-display-total="displayedFlightTotal"
        :format-currency="formatCurrency"
        :is-international-flight="isInternationalFlight"
        :manual-summary="manualSummary"
        :operational-expenses="displayedOperationalExpenses"
        :overnight-total="displayedOvernightTotal"
        :subtotal="displayedSubtotal"
        :total-final="displayedTotalFinal"
        @reset-manual-summary="resetManualSummary"
        @toggle-manual-summary="toggleManualSummary"
        @update-manual-summary="updateManualSummary"
      />
    </section>

    <QuoteHistory
      v-else
      :format-currency="formatCurrency"
      :quotes="savedQuotes"
      @load-quote="loadSavedQuote"
    />

    <QuoteModal
      v-if="showQuoteModal"
      :aircraft-name="selectedAircraft?.name || ''"
      :billable-breakdowns="billableBreakdowns"
      :billable-routes="billableRoutes"
      :flight-display-total="displayedFlightTotal"
      :form="form"
      :format-currency="formatCurrency"
      :get-aircraft-name="getAircraftName"
      :is-international-flight="isInternationalFlight"
      :loading="loading"
      :operational-expenses="displayedOperationalExpenses"
      :overnight-total="displayedOvernightTotal"
      :quote-validity-label="quoteValidityLabel"
      :subtotal="displayedSubtotal"
      :total-final="displayedTotalFinal"
      @close="showQuoteModal = false"
      @download="downloadQuotePdf"
      @email="sendQuoteEmail"
      @save="saveQuote"
    />
  </main>
</template>
