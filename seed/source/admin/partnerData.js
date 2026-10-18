import { mockAirlines, mockRoutes, mockHotels, mockPendingRegistrations } from './partnerMockData.js';

const statusLabel = status => status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Pending';
const initials = name => name.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
const colors = ['blue', 'green', 'purple', 'gold'];

export function normalizeRoute(route) {
  const hours = route.duration?.match(/(\d+)h/);
  const minutes = route.duration?.match(/(\d+)m/);
  const cabinNames = route.cabin ? route.cabin.split('/').map(name => name.trim()) : [];
  return {
    ...route,
    originIataCode: route.origin?.code,
    originCity: route.origin?.city,
    originCountry: route.origin?.country,
    destinationIataCode: route.destination?.code,
    destinationCity: route.destination?.city,
    destinationCountry: route.destination?.country,
    effectiveDate: route.startDate,
    flightNumber: route.flightNo,
    durationMinutes: hours || minutes ? Number(hours?.[1] || 0) * 60 + Number(minutes?.[1] || 0) : null,
    aircraftType: route.aircraft,
    cabinClass: route.cabin,
    cabins: cabinNames.map(className => {
      const key = className.toLowerCase().replace(/\s+/g, '');
      return { className, price: route.price?.[key], seats: route.seats?.[key] };
    }),
  };
}

export const airlinePartners = mockAirlines.map((airline, index) => {
  const registration = mockPendingRegistrations.find(item => item.type === 'airline' && item.name === airline.name);
  return {
    ...airline,
    type: 'Airline', status: statusLabel(airline.status),
    location: airline.headquarters, initials: initials(airline.name), color: colors[index % colors.length],
    email: airline.contact?.email, phone: airline.contact?.phone,
    submittedAt: registration?.submittedAt || airline.registeredAt,
    iataCode: airline.iata, icaoCode: airline.icao, fleetSize: airline.fleet,
    registrationId: registration?.id, documents: registration?.documents, applicationNotes: registration?.notes,
    routes: mockRoutes.filter(route => route.airlineId === airline.id).map(normalizeRoute),
  };
});

export const hotelPartners = mockHotels.map((hotel, index) => ({
  ...hotel,
  type: 'Hotel', status: statusLabel(hotel.status),
  location: hotel.location?.address || hotel.location?.city,
  initials: initials(hotel.name), color: colors[index % colors.length], submittedAt: hotel.createdAt,
  hotelDetails: hotel,
}));

// Airline registrations are merged into their existing airline record to avoid duplicates.
export const pendingTourismPartners = mockPendingRegistrations.filter(item => item.type === 'tourism').map((registration, index) => ({
  ...registration,
  type: 'Tourism', status: 'Pending', location: registration.country,
  initials: initials(registration.name), color: colors[index % colors.length],
  email: registration.contactEmail, businessRegistration: registration.registrationNo,
  description: registration.notes, applicationNotes: registration.notes, documents: registration.documents,
}));
