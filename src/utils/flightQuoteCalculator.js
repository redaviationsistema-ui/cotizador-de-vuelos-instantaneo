export function calculateAircraftQuote({
  aircraft,
  airports = [],
  originCode,
  destinationCode,
  passengers = 1,
  exchangeRate = 17.21,
  taxRate = 0.16,
  overnightNights = 0,
  routeType = "Nacional",
  includeTax = false,
  includeRepositioning = true,
  includeReturnToBase = true,
}) {
  if (!aircraft) return null;

  const originAirport = findAirport(airports, originCode);
  const destinationAirport = findAirport(airports, destinationCode);
  const baseCode = aircraft.iata || aircraft.home_base;
  const baseAirport = findAirport(airports, baseCode);

  if (!originAirport || !destinationAirport || !baseAirport) {
    return null;
  }

  const legs = buildOperationalRoute({
    baseAirport,
    originAirport,
    destinationAirport,
    passengers,
    includeRepositioning,
    includeReturnToBase,
  });

  const calculatedLegs = legs.map((leg) => {
    const distanceNm = calculateDistanceNm({
      lat1: getLat(leg.from),
      lng1: getLng(leg.from),
      lat2: getLat(leg.to),
      lng2: getLng(leg.to),
    });

    const {
      operationalMinutes,
      roundedMinutes,
    } = calculateLegMinutes({
      distanceNm,
      aircraft,
    });

    return {
      ...leg,
      distanceNm,
      eteMinutes: roundedMinutes,
      ete: formatMinutes(roundedMinutes),
      eteFormatted: formatMinutes(roundedMinutes),
      realMinutes: operationalMinutes,
      realTime: formatMinutes(operationalMinutes),
      realHours: operationalMinutes / 60,
    };
  });

  const totalNm = calculatedLegs.reduce((sum, leg) => sum + leg.distanceNm, 0);
  const totalFlightMinutes = calculatedLegs.reduce(
    (sum, leg) => sum + leg.eteMinutes,
    0,
  );
  const flightHours = totalFlightMinutes / 60;
  const hourlyRate = Number(
    aircraft.hourly_rate ||
      aircraft.sale_price_usd ||
      aircraft.rental_price_usd ||
      0,
  );
  const flightCost = flightHours * hourlyRate;
  const overnightBillableHours = Number(overnightNights || 0) * 0.5;
  const overnightCost = overnightBillableHours * hourlyRate;
  const airportFees = Number(
    routeType === "Nacional"
      ? aircraft.national_expenses_usd || 600
      : aircraft.international_expenses_usd ||
          aircraft.national_expenses_usd ||
          600,
  );
  const subtotal = flightCost + overnightCost + airportFees;
  const tax = includeTax ? subtotal * Number(taxRate || 0.16) : 0;
  const totalUsd = subtotal + tax;
  const totalMxn = totalUsd * Number(exchangeRate || 0);

  return {
    aircraft,
    baseAirport,
    originAirport,
    destinationAirport,
    legs: calculatedLegs,
    totalNm,
    totalFlightMinutes,
    totalFlightTime: formatMinutes(totalFlightMinutes),
    totalRealMinutes: calculatedLegs.reduce((sum, leg) => sum + leg.realMinutes, 0),
    totalRealTime: formatMinutes(calculatedLegs.reduce((sum, leg) => sum + leg.realMinutes, 0)),
    totalRealHours: calculatedLegs.reduce((sum, leg) => sum + leg.realHours, 0),
    flightHours,
    hourlyRate,
    flightCost,
    overnightBillableHours,
    overnightHours: overnightBillableHours,
    airportFees,
    overnightCost,
    subtotal,
    tax,
    iva: tax,
    totalUsd,
    totalMxn,
  };
}

function buildOperationalRoute({
  baseAirport,
  originAirport,
  destinationAirport,
  passengers,
  includeRepositioning,
  includeReturnToBase,
}) {
  const legs = [];
  const baseCode = getAirportCode(baseAirport);
  const originCode = getAirportCode(originAirport);
  const destinationCode = getAirportCode(destinationAirport);

  if (includeRepositioning && baseCode !== originCode) {
    legs.push({
      type: "repositioning",
      label: "Reposicionamiento",
      from: baseAirport,
      to: originAirport,
      pax: 0,
    });
  }

  legs.push({
    type: "client",
    label: "Vuelo cliente",
    from: originAirport,
    to: destinationAirport,
    pax: passengers,
  });

  if (includeReturnToBase && destinationCode !== baseCode) {
    legs.push({
      type: "return_to_base",
      label: "Regreso a base",
      from: destinationAirport,
      to: baseAirport,
      pax: 0,
    });
  }

  return legs;
}

function findAirport(airports, code) {
  const cleanCode = String(code || "").trim().toUpperCase();

  return airports.find((airport) => {
    const iata = String(airport.iata || "").toUpperCase();
    const icao = String(airport.icao || "").toUpperCase();
    return iata === cleanCode || icao === cleanCode;
  });
}

function getAirportCode(airport) {
  return String(airport.iata || airport.icao || "").toUpperCase();
}

function getLat(airport) {
  return Number(
    airport.latitude || airport.lat || airport.Latitude || airport.LATITUDE || 0,
  );
}

function getLng(airport) {
  return Number(
    airport.longitude ||
      airport.lng ||
      airport.lon ||
      airport.Longitude ||
      airport.LONGITUDE ||
      0,
  );
}

function calculateLegMinutes({ distanceNm, aircraft }) {
  const speedKnots = Number(
    aircraft.cruise_speed_knots || aircraft.speed_knots || aircraft.speed || 1,
  );
  const directMinutes = (distanceNm / speedKnots) * 60;
  const climbDescentMinutes = getClimbDescentMinutes(aircraft);
  const reserveMinutes = getReserveMinutes(distanceNm);
  const operationalMinutes =
    directMinutes + climbDescentMinutes + reserveMinutes;

  return {
    operationalMinutes,
    roundedMinutes: roundUpMinutes(operationalMinutes, 5),
  };
}

function getClimbDescentMinutes(aircraft) {
  const type = String(aircraft.aircraft_type || "").toLowerCase();

  if (type.includes("helicopter") || type.includes("helicoptero") || type.includes("helicóptero")) return 8;
  if (type.includes("turboprop") || type.includes("turbohelice") || type.includes("turbohélice")) return 12;
  if (type.includes("jet")) return 20;

  return 15;
}

function getReserveMinutes(distanceNm) {
  if (distanceNm <= 100) return 9;
  if (distanceNm <= 300) return 12;
  if (distanceNm <= 700) return 18;
  if (distanceNm <= 1200) return 25;

  return 35;
}

function roundUpMinutes(minutes, block = 5) {
  return Math.ceil(minutes / block) * block;
}

function calculateDistanceNm({ lat1, lng1, lat2, lng2 }) {
  const earthRadiusNm = 3440.065;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusNm * c;
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function formatMinutes(minutes) {
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return `${hours}:${String(mins).padStart(2, "0")}`;
}
