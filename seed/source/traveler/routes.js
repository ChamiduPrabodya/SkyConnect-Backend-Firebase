// Sample route connections supplied for the Sri Lanka trip planner.
// Times are ranges; the itinerary planner uses the upper end to leave room for delays.
import { destinations } from './destinations';

export const routeConnections = [
  { from: 'colombo', to: 'negombo', distanceKm: 40, minHours: 1, maxHours: 1.5, type: 'City to beach' },
  { from: 'colombo', to: 'kandy', distanceKm: 115, minHours: 3, maxHours: 4, type: 'City to hill country' },
  { from: 'kandy', to: 'dambulla', distanceKm: 75, minHours: 2, maxHours: 2.5, type: 'Hill country to Cultural Triangle' },
  { from: 'dambulla', to: 'sigiriya', distanceKm: 20, minHours: 0.5, maxHours: 2 / 3, type: 'Cultural Triangle' },
  { from: 'sigiriya', to: 'kandy', distanceKm: 90, minHours: 2.5, maxHours: 3, type: 'Cultural Triangle to hill country' },
  { from: 'kandy', to: 'nuwara', distanceKm: 75, minHours: 2.5, maxHours: 3.5, type: 'Hill country' },
  { from: 'nuwara', to: 'ella', distanceKm: 55, minHours: 2, maxHours: 3, type: 'Hill country' },
  { from: 'ella', to: 'yala', distanceKm: 110, minHours: 2.5, maxHours: 3.5, type: 'Hill country to wildlife' },
  { from: 'yala', to: 'kataragama', distanceKm: 25, minHours: 0.5, maxHours: 0.75, type: 'Wildlife to cultural' },
  { from: 'yala', to: 'mirissa', distanceKm: 145, minHours: 3, maxHours: 4, type: 'Wildlife to south coast' },
  { from: 'mirissa', to: 'galle', distanceKm: 40, minHours: 1, maxHours: 1, type: 'South coast' },
  { from: 'galle', to: 'hikkaduwa', distanceKm: 20, minHours: 0.5, maxHours: 0.75, type: 'South coast' },
  { from: 'kandy', to: 'kitulgala', distanceKm: 90, minHours: 2.5, maxHours: 3, type: 'Hill country to adventure' },
  { from: 'anuradhapura', to: 'polonnaruwa', distanceKm: 105, minHours: 2.5, maxHours: 3, type: 'Cultural Triangle' },
  { from: 'polonnaruwa', to: 'trincomalee', distanceKm: 110, minHours: 2.5, maxHours: 3, type: 'Cultural Triangle to east coast' },
  { from: 'trincomalee', to: 'arugam_bay', distanceKm: 215, minHours: 5, maxHours: 6, type: 'East coast' },
  { from: 'colombo', to: 'galle', distanceKm: 125, minHours: 2, maxHours: 2.5, type: 'Western to south coast' },
  // Additional links keep every catalog destination reachable; times are relaxed road estimates.
  { from: 'colombo', to: 'bentota', distanceKm: 62, minHours: 1, maxHours: 1.5, type: 'Western to southwest coast' },
  { from: 'colombo', to: 'ratnapura', distanceKm: 100, minHours: 2.5, maxHours: 3.5, type: 'Western to gem country' },
  { from: 'galle', to: 'unawatuna', distanceKm: 6, minHours: 0.15, maxHours: 0.25, type: 'South coast' },
  { from: 'unawatuna', to: 'hikkaduwa', distanceKm: 20, minHours: 0.5, maxHours: 0.75, type: 'South coast' },
  { from: 'galle', to: 'matara', distanceKm: 45, minHours: 1, maxHours: 1.5, type: 'South coast' },
  { from: 'mirissa', to: 'matara', distanceKm: 11, minHours: 0.25, maxHours: 0.5, type: 'South coast' },
  { from: 'matara', to: 'tangalle', distanceKm: 35, minHours: 0.75, maxHours: 1.25, type: 'South coast' },
  { from: 'mirissa', to: 'tangalle', distanceKm: 50, minHours: 1, maxHours: 1.5, type: 'South coast' },
  { from: 'tangalle', to: 'yala', distanceKm: 90, minHours: 1.75, maxHours: 2.5, type: 'South coast to wildlife' },
  { from: 'bentota', to: 'hikkaduwa', distanceKm: 30, minHours: 0.5, maxHours: 0.75, type: 'Southwest coast' },
  { from: 'trincomalee', to: 'pasikuda', distanceKm: 110, minHours: 2.5, maxHours: 3.5, type: 'East coast' },
  { from: 'pasikuda', to: 'polonnaruwa', distanceKm: 110, minHours: 2.5, maxHours: 3.5, type: 'East coast to Cultural Triangle' },
  { from: 'pasikuda', to: 'arugam_bay', distanceKm: 145, minHours: 3, maxHours: 4, type: 'East coast' },
  { from: 'negombo', to: 'kalpitiya', distanceKm: 135, minHours: 2.5, maxHours: 3.25, type: 'Northwestern coast' },
  { from: 'kalpitiya', to: 'wilpattu', distanceKm: 167, minHours: 4, maxHours: 5, type: 'Northwestern coast to wildlife' },
  { from: 'anuradhapura', to: 'wilpattu', distanceKm: 75, minHours: 1.5, maxHours: 2.5, type: 'Northwestern wildlife' },
  { from: 'anuradhapura', to: 'jaffna', distanceKm: 201, minHours: 3.5, maxHours: 4.5, type: 'North to ancient city' },
  { from: 'ella', to: 'haputale', distanceKm: 30, minHours: 0.75, maxHours: 1.25, type: 'Hill country' },
  { from: 'nuwara', to: 'haputale', distanceKm: 60, minHours: 1.75, maxHours: 2.5, type: 'Hill country' },
];

export function routeBetween(from, to) {
  const direct = routeConnections.find((route) => route.from === from && route.to === to);
  if (direct) return { ...direct };
  const reverse = routeConnections.find((route) => route.from === to && route.to === from);
  if (reverse) return { ...reverse, from, to };
  const fromPlace = destinations.find((destination) => destination.id === from);
  const toPlace = destinations.find((destination) => destination.id === to);
  if (!fromPlace?.coordinates || !toPlace?.coordinates) return null;
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const lat1 = radians(fromPlace.coordinates.latitude);
  const lat2 = radians(toPlace.coordinates.latitude);
  const latDelta = lat2 - lat1;
  const lonDelta = radians(toPlace.coordinates.longitude - fromPlace.coordinates.longitude);
  const earthKm = 6371;
  const chord = Math.sin(latDelta / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(lonDelta / 2) ** 2;
  const straightKm = earthKm * 2 * Math.atan2(Math.sqrt(chord), Math.sqrt(1 - chord));
  const distanceKm = Math.round((straightKm * 1.3) / 5) * 5;
  const roundQuarterHour = (hours) => Math.max(0.25, Math.round(hours * 4) / 4);
  return {
    from,
    to,
    distanceKm,
    minHours: roundQuarterHour(distanceKm / 45),
    maxHours: roundQuarterHour(distanceKm / 35)
   , type: 'Approximate overland connection',
    estimated: true,
  };
}

export function routesFrom(destinationId) {
  const explicit = routeConnections.flatMap((route) => {
    if (route.from === destinationId) return [{ ...route }];
    if (route.to === destinationId) return [{ ...route, from: destinationId, to: route.from }];
    return [];
  });
  const reachableIds = new Set(explicit.map((route) => route.to));
  const estimated = destinations
    .filter((destination) => destination.id !== destinationId && !reachableIds.has(destination.id))
    .map((destination) => routeBetween(destinationId, destination.id))
    .filter(Boolean);
  return [...explicit, ...estimated];
}
