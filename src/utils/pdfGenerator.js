import jsPDF from "jspdf";

const PAGE = {
  width: 210,
  height: 297,
  marginX: 20,
  contentWidth: 170,
  footerTop: 285,
  footerY: 290,
};

const COLORS = {
  ink: [15, 23, 42],
  steel: [71, 85, 105],
  muted: [100, 116, 139],
  accent: [18, 52, 86],
  accentDark: [10, 31, 52],
  accentSoft: [232, 238, 245],
  gold: [181, 138, 76],
  goldSoft: [246, 240, 229],
  line: [214, 223, 233],
  panel: [248, 250, 252],
  zebra: [243, 247, 251],
  white: [255, 255, 255],
};

const formatDate = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().split("T")[0];
};

const formatMoney = (value = 0) =>
  `$${Math.round(Number(value || 0)).toLocaleString("en-US")}`;

const formatWholeDays = (value = 0) => Math.max(0, Math.ceil(Number(value || 0)));

const formatOperationalHours = (value = 0) => {
  const hours = Number(value || 0);
  if (!Number.isFinite(hours)) return "0.00 h";
  return `${hours.toFixed(2)} h`;
};

const loadImage = (src) =>
  new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = src;
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
  });

const canUseImage = (image) => image?.complete && image.naturalWidth !== 0;

const ensureSpace = (doc, state, neededHeight, top = 22) => {
  if (state.y + neededHeight > PAGE.footerTop - 8) {
    doc.addPage();
    state.y = top;
    state.boxStarted = false;
  }
};

const drawTextPair = (doc, label, value, x, y, width = 70) => {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.steel);
  doc.text(label.toUpperCase(), x, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.ink);
  const lines = doc.splitTextToSize(value || "-", width);
  doc.text(lines, x, y + 5);
  return lines.length;
};

const addPageFooter = (doc) => {
  const pageCount = doc.getNumberOfPages();

  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.setDrawColor(...COLORS.line);
    doc.line(PAGE.marginX, PAGE.footerTop, 190, PAGE.footerTop);
    doc.text("Red Sky Group", PAGE.marginX, PAGE.footerY);
    doc.text(`Page ${i} of ${pageCount}`, 190, PAGE.footerY, {
      align: "right",
    });
  }

  doc.setTextColor(...COLORS.ink);
};

const drawVerticalBrand = (doc, text = "RED SKY GROUP PRIVATE AVIATION") => {
  doc.setDrawColor(...COLORS.gold);
  doc.setLineWidth(0.6);
  doc.line(197, 62, 197, 244);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.gold);
  doc.text(text, 201, 238, { angle: 90 });
  doc.setTextColor(...COLORS.ink);
};

const drawSectionTitle = (doc, title, x, y) => {
  doc.setFillColor(...COLORS.gold);
  doc.roundedRect(x, y - 4.2, 2, 7, 0.7, 0.7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.ink);
  doc.text(title, x + 5, y);
};

const drawTermsBox = (doc, top) => {
  const height = PAGE.footerTop - top - 8;

  doc.setFillColor(...COLORS.white);
  doc.setDrawColor(...COLORS.line);
  doc.setLineWidth(0.25);
  doc.roundedRect(PAGE.marginX, top, PAGE.contentWidth, height, 3, 3, "FD");
  doc.setFillColor(...COLORS.goldSoft);
  doc.roundedRect(PAGE.marginX + 4, top + 4, 3, height - 8, 1, 1, "F");
};

const addSectionText = (doc, state, title, text) => {
  const paragraphs = String(text || "")
    .split("\n")
    .filter(Boolean);
  const contentLines = paragraphs.flatMap((paragraph) =>
    doc.splitTextToSize(paragraph.replace(/^- /, "- "), PAGE.contentWidth - 21),
  );
  const blockHeight = 5.2 + contentLines.length * 3.7 + paragraphs.length * 0.25;

  ensureSpace(doc, state, blockHeight, 22);

  if (!state.boxStarted) {
    drawTermsBox(doc, state.y);
    state.y += 8;
    state.boxStarted = true;
  } else {
    doc.setDrawColor(...COLORS.line);
    doc.setLineWidth(0.2);
    doc.line(PAGE.marginX + 11, state.y - 0.9, 184, state.y - 0.9);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.ink);
  doc.text(title, PAGE.marginX + 11, state.y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.9);
  doc.setTextColor(...COLORS.steel);

  let textY = state.y + 4.2;
  paragraphs.forEach((paragraph) => {
    const lines = doc.splitTextToSize(
      paragraph.replace(/^- /, "- "),
      PAGE.contentWidth - 21,
    );
    doc.text(lines, PAGE.marginX + 11, textY);
    textY += lines.length * 3.7 + 0.25;
  });

  state.y = textY + 1.1;
};

const getRoutePath = (routes = []) => {
  if (!routes.length) return "-";

  const path = [];

  routes.forEach((route, index) => {
    const fromAirport = route?.fromAirport || "-";
    const toAirport = route?.toAirport || "-";

    if (index === 0) {
      path.push(fromAirport, toAirport);
      return;
    }

    if (path[path.length - 1] !== fromAirport) {
      path.push(fromAirport);
    }

    path.push(toAirport);
  });

  return path.join("-");
};

const getLegAirportCode = (airport = {}) => airport?.iata || airport?.icao || "-";

const normalizeOperationalLegs = (legs = [], fallbackRoutes = []) => {
  if (legs.length) {
    return legs.map((leg) => ({
      fromAirport: getLegAirportCode(leg?.from),
      toAirport: getLegAirportCode(leg?.to),
      miles: Number(leg?.distanceNm || 0),
      hours: Number(leg?.realHours || 0),
      type: leg?.type || "client",
    }));
  }

  return fallbackRoutes.map((route, index) => ({
    fromAirport: route?.fromAirport || "-",
    toAirport: route?.toAirport || "-",
    miles: Number(route?.miles || 0),
    hours: Number(route?.hours || 0),
    type: route?.positioningType || (route?.positioning ? "repositioning" : "client"),
  }));
};

export const generateReservationPDF = async ({
  form,
  routes,
  operationalLegs = [],
  breakdowns = [],
  totals,
  getAircraftName,
  getAircraftById,
}) => {
  const doc = new jsPDF({ compress: true });
  const pdfLegs = normalizeOperationalLegs(operationalLegs, routes);
  const firstCustomerRoute = routes.find((route) => !route?.positioning) || routes[0] || {};
  const aircraft = getAircraftById?.(firstCustomerRoute.aircraft_id) || null;
  const aircraftName =
    aircraft?.name || getAircraftName?.(firstCustomerRoute.aircraft_id) || "-";
  const pax = aircraft?.capacity_passengers || firstCustomerRoute.passengers || 0;
  const totalNights = breakdowns.reduce(
    (sum, item) => sum + formatWholeDays(item.nights),
    0,
  );
  const taxRate = totals.subtotal
    ? Math.round((totals.iva / totals.subtotal) * 100)
    : 0;
  const tripType = taxRate === 4 ? "International Charter" : "National Charter";

  const logo = await loadImage(`${import.meta.env.BASE_URL}images/logo.png`);
  const secondaryLogo = await loadImage(`${import.meta.env.BASE_URL}images/logoo.png`);

  doc.setFillColor(...COLORS.white);
  doc.rect(0, 0, PAGE.width, 56, "F");
  doc.setFillColor(...COLORS.accentDark);
  doc.rect(0, 0, PAGE.width, 9, "F");
  doc.setFillColor(...COLORS.gold);
  doc.rect(0, 9, PAGE.width, 1.2, "F");

  if (canUseImage(logo)) {
    doc.addImage(logo, "PNG", 18, 10, 54, 36);
  }

  doc.setFillColor(...COLORS.accent);
  doc.roundedRect(142, 13, 48, 24, 3, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.8);
  doc.setTextColor(...COLORS.accentSoft);
  doc.text("DATE", 147, 21);
  doc.text("DOCUMENT", 147, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.white);
  doc.text(formatDate(), 186, 21, { align: "right" });
  doc.text("Reservation", 186, 30, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(21);
  doc.setTextColor(...COLORS.ink);
  doc.text("Executive Flight Quote", 20, 46);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...COLORS.steel);
  doc.text("Professional private aviation quotation", 20, 52);

  doc.setDrawColor(...COLORS.line);
  doc.setLineWidth(0.4);
  doc.line(20, 58, 190, 58);
  drawVerticalBrand(doc);

  const clientRows = [
    ["Name", form.name || "-"],
    ["Email", form.email || "-"],
    ["Phone", form.phone || "-"],
  ];
  const profileRows = [
    ["Aircraft", aircraftName],
    ["Route", getRoutePath(pdfLegs)],
    ["Trip Type", tripType],
    ["Passengers", String(firstCustomerRoute.passengers || 0)],
  ];

  const getCardHeight = (rows, width) => {
    let height = 17;
    rows.forEach(([, value]) => {
      const lines = doc.splitTextToSize(value || "-", width);
      height += 7 + lines.length * 4.2;
    });
    return Math.max(height, 56);
  };

  const cardHeight = Math.max(
    getCardHeight(clientRows, 68),
    getCardHeight(profileRows, 68),
  );

  doc.setFillColor(...COLORS.panel);
  doc.setDrawColor(...COLORS.line);
  doc.setLineWidth(0.25);
  doc.roundedRect(20, 64, 82, cardHeight, 4, 4, "FD");
  doc.roundedRect(108, 64, 82, cardHeight, 4, 4, "FD");
  doc.setFillColor(...COLORS.gold);
  doc.rect(20, 64, 82, 1.4, "F");
  doc.rect(108, 64, 82, 1.4, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...COLORS.ink);
  doc.text("Client Information", 26, 75);
  doc.text("Trip Profile", 114, 75);

  let clientY = 85;
  clientRows.forEach(([label, value]) => {
    const usedLines = drawTextPair(doc, label, value, 26, clientY, 68);
    clientY += 7 + usedLines * 4.2;
  });

  let profileY = 85;
  profileRows.forEach(([label, value]) => {
    const usedLines = drawTextPair(doc, label, value, 114, profileY, 68);
    profileY += 7 + usedLines * 4.2;
  });

  let y = 64 + cardHeight + 11;

  drawSectionTitle(doc, "Flight Legs", 20, y);
  y += 8;

  doc.setFillColor(...COLORS.accentSoft);
  doc.roundedRect(20, y, 170, 10, 2, 2, "F");
  doc.setTextColor(...COLORS.accent);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("#", 25, y + 6.5);
  doc.text("DEPARTURE", 38, y + 6.5);
  doc.text("ARRIVAL", 90, y + 6.5);
  doc.text("DIST (NM)", 140, y + 6.5, { align: "right" });
  doc.text("TIME", 182, y + 6.5, { align: "right" });
  y += 10;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.ink);

  pdfLegs.forEach((leg, index) => {
    const miles = leg?.miles || breakdowns[index]?.miles || 0;
    const hours = leg?.hours || breakdowns[index]?.hours || 0;
    const legTypeLabel =
      leg?.type === "return_to_base"
        ? "Return to base"
        : leg?.type === "repositioning"
          ? "Repositioning"
          : "";
    const fromLabel = legTypeLabel ? `${leg.fromAirport || "-"} (${legTypeLabel})` : leg.fromAirport || "-";
    const fromText = doc.splitTextToSize(fromLabel, 45);
    const toText = doc.splitTextToSize(leg.toAirport || "-", 45);
    const rowHeight = Math.max(fromText.length, toText.length) * 4.8 + 7;

    if (index % 2 === 0) {
      doc.setFillColor(...COLORS.zebra);
      doc.rect(20, y, 170, rowHeight, "F");
    }

    doc.setFontSize(8.5);
    doc.text(String(index + 1), 25, y + 7);
    doc.text(fromText, 38, y + 7);
    doc.text(toText, 90, y + 7);
    doc.text(
      Number(miles).toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
      140,
      y + 7,
      { align: "right" },
    );
    doc.text(formatOperationalHours(hours), 182, y + 7, { align: "right" });

    doc.setDrawColor(...COLORS.line);
    doc.line(20, y + rowHeight, 190, y + rowHeight);
    y += rowHeight;
  });

  y += 12;

  drawSectionTitle(doc, "Commercial Breakdown", 20, y);
  y += 8;

  const costRows = [
    ["Flight Cost", totals.flight],
    [
      `Overnight Crew${totalNights ? ` (${totalNights} ${totalNights === 1 ? "night" : "nights"})` : ""}`,
      totals.overnight,
    ],
    ["Operational Expenses", totals.expenses],
  ];

  doc.setFillColor(...COLORS.panel);
  doc.setDrawColor(...COLORS.line);
  doc.setLineWidth(0.25);
  doc.roundedRect(20, y, 170, 46, 4, 4, "FD");
  doc.setFillColor(...COLORS.accentSoft);
  doc.roundedRect(24, y + 5, 162, 10, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.accent);
  doc.text("DESCRIPTION", 29, y + 11.5);
  doc.text("AMOUNT", 181, y + 11.5, { align: "right" });

  let rowY = y + 23;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.2);
  doc.setTextColor(...COLORS.ink);

  costRows.forEach(([label, value], index) => {
    if (index % 2 === 0) {
      doc.setFillColor(...COLORS.white);
      doc.roundedRect(25, rowY - 5.4, 160, 8.5, 1.5, 1.5, "F");
    }

    doc.text(label, 29, rowY);
    doc.setFont("helvetica", "bold");
    doc.text(formatMoney(value), 181, rowY, { align: "right" });
    doc.setFont("helvetica", "normal");
    rowY += 7.2;
  });

  y += 54;

  doc.setFillColor(...COLORS.accentDark);
  doc.roundedRect(20, y, 170, 24, 4, 4, "F");
  doc.setFillColor(...COLORS.gold);
  doc.rect(20, y, 170, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.goldSoft);
  doc.text("TOTAL ESTIMATED BALANCE", 26, y + 9);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.accentSoft);
  doc.text("Estimated in USD, subject to itinerary confirmation", 26, y + 16);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(21);
  doc.setTextColor(...COLORS.white);
  doc.text(`${formatMoney(totals.total)} USD`, 185, y + 16.5, { align: "right" });

  doc.addPage();
  const termsState = { y: 38 };

  doc.setFillColor(...COLORS.accentDark);
  doc.rect(0, 0, PAGE.width, 12, "F");
  doc.setFillColor(...COLORS.gold);
  doc.rect(0, 12, PAGE.width, 1.2, "F");
  if (canUseImage(secondaryLogo || logo)) {
    doc.addImage(secondaryLogo || logo, "PNG", 20, 15, 38, 25);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(...COLORS.ink);
  doc.text("TERMS AND CONDITIONS", 72, 26);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.muted);
  doc.text("Private aviation service agreement", 72, 32);
  drawVerticalBrand(doc, "RED SKY GROUP TERMS");

  addSectionText(
    doc,
    termsState,
    "USE OF PRIVATE AVIATION SERVICE",
    "The use of the aircraft is strictly limited to private transportation purposes, including family, business, and leisure travel. Any commercial or cargo activities of any kind are expressly prohibited.",
  );
  addSectionText(
    doc,
    termsState,
    "INCLUDED SERVICES",
    "The private jet includes airport fees, fuel, crew fees, a premium minibar, and snacks. This service must be requested in advance by the passenger to ensure proper delivery.",
  );
  addSectionText(
    doc,
    termsState,
    "CAPACITY AND LUGGAGE",
    `The maximum capacity of the aircraft is ${pax} passengers. Each passenger is permitted one (1) 50-pound bag and one (1) small handbag.`,
  );
  addSectionText(
    doc,
    termsState,
    "PAYMENT AND DEPOSIT",
    "The passenger must pay Red Sky Group a deposit of 50% of the total trip cost to secure the private aviation service. The remaining balance must be paid in full prior to boarding.",
  );
  addSectionText(
    doc,
    termsState,
    "ADDITIONAL DEPOSIT",
    "Depending on the destination, Red Sky Group may require a deposit greater than 50% to cover trip expenses such as fuel, handling, and overflight permits.",
  );
  addSectionText(
    doc,
    termsState,
    "PASSENGER AND COMPANIONS RESPONSIBILITY",
    "The passenger agrees to use and fly in the aircraft at their own risk and responsibility, as do their companions. The passenger and their companions confirm that they have medical insurance and will be responsible for any hospital expenses in the event of an accident at the airport ramp or FBO facilities.",
  );
  addSectionText(
    doc,
    termsState,
    "COMPLIANCE WITH SAFETY INSTRUCTIONS",
    "Passengers must comply at all times with all instructions and safety measures indicated by the Captain or First Officer. If crew instructions are not followed, Red Sky Group shall not be liable for any accidents occurring onboard the aircraft or airport facilities.",
  );
  addSectionText(
    doc,
    termsState,
    "PROHIBITIONS ONBOARD THE AIRCRAFT",
    "- Throwing sanitary paper or towels into the toilet.\n- Standing while the aircraft is taxiing, taking off, landing, or during turbulence.\n- Improper use of electronic or entertainment equipment.\n- Excessive alcohol consumption.\n- Possession or use of weapons, drugs, or illegal substances.",
  );
  addSectionText(
    doc,
    termsState,
    "TRANSPORT OF PROHIBITED ITEMS",
    "Transporting illegal substances, explosives, firearms, ammunition, or any items prohibited under the laws of Mexico or the United States is strictly forbidden. Transporting cash amounts exceeding legal limits without declaration is prohibited. In Mexico, the maximum amount without declaration is $10,000 USD.",
  );
  addSectionText(
    doc,
    termsState,
    "DAMAGES AND ADDITIONAL COSTS",
    "- Damage to aircraft electronic or entertainment equipment.\n- Burns or irreparable stains on seats, flooring or carpets.\n- Malfunction of aircraft toilet due to improper use.\n- Loss or damage to onboard furniture or amenities.",
  );
  addSectionText(
    doc,
    termsState,
    "CANCELLATION POLICIES",
    "To cancel the private aviation service, the passenger must notify Red Sky Group at least 48 hours before the scheduled departure. Cancellations made less than 48 hours before departure will incur a charge of $3,300 USD plus tax. Cancellation requests must be submitted in writing to ventas@redskyg.com.",
  );
  addSectionText(
    doc,
    termsState,
    "DISCLAIMER OF LIABILITY",
    "Red Sky Group shall not be liable for illegal actions committed by the passenger or their companions. Passengers agree to indemnify and hold harmless Red Sky Group and its personnel from any legal claims resulting from such actions.",
  );
  addSectionText(
    doc,
    termsState,
    "COMPLIANCE WITH REGULATIONS",
    "Red Sky Group operates in strict compliance with aviation regulations in Mexico and the United States. Responsibility for compliance with laws related to transported goods or cash rests solely with the passenger.",
  );
  addSectionText(
    doc,
    termsState,
    "REFUSAL OF SERVICE",
    "Red Sky Group reserves the right to refuse boarding or terminate services if illegal activity is suspected. No refund will be provided in such cases.",
  );
  addSectionText(
    doc,
    termsState,
    "ACCEPTANCE OF TERMS AND CONDITIONS",
    "By booking and using the private jet of Red Sky Group, the passenger and their companions acknowledge and agree to comply with all terms and conditions set forth in this document.",
  );

  addPageFooter(doc);
  return doc.output("blob");
};
