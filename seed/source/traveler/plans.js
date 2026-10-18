export const planTemplates = [
  {
    id: 'bronze',
    name: 'Budget',
    subtitle: 'Guesthouses and lower-cost activities.',
    hotelId: 'budget',
    multiplier: 0,
    activityStyle: 'value',
    icon: 'compass-outline',
  },
  {
    id: 'silver',
    name: 'BestMatch',
    subtitle: 'Interest-matched stops and activities with your preferred stay.',
    hotelId: 'boutique',
    multiplier: 1,
    activityStyle: 'signature',
    icon: 'sparkles-outline',
  },
  {
    id: 'gold',
    name: 'Premium',
    subtitle: 'Luxury stays and signature experiences.',
    hotelId: 'luxury',
    multiplier: 2,
    activityStyle: 'premium',
    icon: 'diamond-outline',
  },
];
