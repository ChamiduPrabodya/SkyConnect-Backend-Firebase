import { airlinePartners, hotelPartners, pendingTourismPartners } from './partnerData.js';

const tourismDemoPartners = [
  { id: 'P-1042', name: 'Ceylon Coast Adventures', type: 'Tourism', location: 'Galle, Sri Lanka', status: 'Pending', initials: 'CC', color: 'coral', submittedAt: 'Oct 10, 2026', contactName: 'Nimali Perera', email: 'nimali@ceyloncoast.example', phone: '+94 77 234 5678', website: 'ceyloncoast.example', businessRegistration: 'PV 1042/2024', country: 'Sri Lanka', description: 'A local tour operator offering guided coastal trips and island experiences.' },
  { id: 'P-1039', name: 'Hill Country Escapes', type: 'Tourism', location: 'Ella, Sri Lanka', status: 'Approved', initials: 'HC', color: 'green', submittedAt: 'Sep 28, 2026', contactName: 'Kavindu Silva', email: 'hello@hillcountry.example', phone: '+94 57 234 5678', website: 'hillcountry.example', businessRegistration: 'PV 0901/2022', country: 'Sri Lanka', description: 'A small tourism business offering stays and guided hill-country experiences.' },
  { id: 'P-1037', name: 'Serendib Island Tours', type: 'Tourism', location: 'Colombo, Sri Lanka', status: 'Approved', initials: 'SI', color: 'purple', submittedAt: 'Sep 18, 2026', contactName: 'Dinuka Fernando', email: 'info@serendibisland.example', phone: '+94 11 345 6789', website: 'serendibisland.example', businessRegistration: 'PV 0734/2021', country: 'Sri Lanka', description: 'A Sri Lankan tour company providing island tours and cultural experiences.' },
];

export const demoPartners = [...airlinePartners, ...hotelPartners, ...pendingTourismPartners, ...tourismDemoPartners];

export const demoOffers = [
  { id: 'OF-208', title: 'Sunset coastal escape', partner: 'Ceylon Coast Adventures', category: 'Beach', status: 'Pending', reach: '—' },
  { id: 'OF-207', title: 'Misty Ella weekend', partner: 'Hill Country Escapes', category: 'Nature', status: 'Published', reach: '1,284' },
  { id: 'OF-206', title: 'Island-hopper discovery', partner: 'Serendib Island Tours', category: 'Adventure', status: 'Published', reach: '968' },
  { id: 'OF-205', title: 'Colombo city by night', partner: 'Serendib Island Tours', category: 'Culture', status: 'Published', reach: '742' },
];

export const activity = [
  { icon: 'partner', title: 'Airline application awaiting review', detail: 'Helitours submitted a profile', time: 'Mar 10, 2024', tone: 'blue' },
  { icon: 'offer', title: 'Offer waiting for review', detail: 'Sunset coastal escape · Ceylon Coast Adventures', time: '48 min ago', tone: 'orange' },
  { icon: 'check', title: 'Partner approved', detail: 'Hill Country Escapes is now verified', time: '2 hours ago', tone: 'green' },
  { icon: 'trend', title: 'Discovery trend updated', detail: 'Nature experiences are gaining interest', time: 'Today', tone: 'purple' },
];

const destinationSeeds = [
  ['anuradhapura','Anuradhapura','North Central Province','Culture','Polonnaruwa','2.5–3 hr','',[['Ancient city cycling tour','4 hr'],['Sacred city heritage walk','2–4 hr'],['Sri Maha Bodhi','1 hr'],['Ruwanwelisaya Stupa','1 hr'],['Jetavanaramaya','45 min'],['Mihintale','2–2.5 hr']]],
  ['arugam-bay','Arugam Bay','Eastern Province','Beach','Trincomalee','5–6 hr','',[['Surf lesson','2 hr'],['Lagoon wildlife paddle','2–3 hr'],['Kumana safari','5 hr'],['Crocodile Rock viewpoint','1 hr']]],
  ['bentota','Bentota','Western Province','Beach','Colombo','1–1.5 hr','',[['River safari','2 hr'],['Watersports','2 hr'],['Beach day','3 hr'],['Brief Garden','1.5 hr'],['Turtle hatchery','1 hr'],['Lunuganga tour','2 hr']]],
  ['colombo','Colombo','Western Province','Culture','Trip start','', '',[['Historic walking tour','2–3 hr'],['Food tour','3 hr'],['National Museum','1.5–2 hr'],['Red Mosque','30 min'],['Gangaramaya Temple','45–60 min'],['Galle Face Green','1–1.5 hr']]],
  ['dambulla','Dambulla','Central Province','Culture','Kandy','2–2.5 hr','',[['Cave temple','1–2 hr'],['Market and village walk','2–3 hr']]],
  ['ella','Ella','Uva Province','Adventure','Haputale','45–75 min','/destinations/ella.jpg',[['Nine Arch Bridge','1.5–2 hr'],['Little Adam’s Peak','2 hr'],['Ella Rock hike','4 hr'],['Ravana Falls','30–45 min'],['Scenic train ride','3 hr']]],
  ['galle','Galle','Southern Province','Culture','Colombo','2–2.5 hr','/destinations/galle.jpg',[['Fort walking tour','2.5–3 hr'],['Coastal cooking class','3–4 hr'],['Lighthouse','1 hr'],['Maritime Museum','1 hr'],['Dutch Reformed Church','30 min'],['Jungle Beach snorkeling','2.5 hr']]],
  ['haputale','Haputale','Uva Province','Nature','Ella','45–75 min','',[['Adisham Bungalow','1.5 hr'],['Bambarakanda Falls hike','3 hr'],['Dambatenne Tea Factory','1.5 hr']]],
  ['hikkaduwa','Hikkaduwa','Southern Province','Beach','Galle','30–45 min','',[['Reef snorkeling','1.5–2 hr'],['Surf session','2 hr'],['Glass-bottom boat tour','1 hr'],['Turtle hatchery','1 hr']]],
  ['jaffna','Jaffna','Northern Province','Culture','Anuradhapura','3.5–4.5 hr','',[['Fort and town walk','2–3 hr'],['Northern islands trip','6–8 hr'],['Casuarina Beach','3 hr'],['Public Library','1 hr'],['Nallur Kovil','1.5 hr']]],
  ['kandy','Kandy','Central Province','Culture','Colombo','3–4 hr','/destinations/kandy.jpg',[['Temple of the Tooth','1.5–2 hr'],['Botanical gardens','2–3 hr'],['Lake walk','1 hr'],['Viewpoint','30–45 min'],['Cultural dance','1 hr']]],
  ['kalpitiya','Kalpitiya','North Western Province','Beach','Negombo','2.5–3.25 hr','',[['Bar Reef snorkeling','3 hr'],['Dolphin and whale watching','3 hr'],['Lagoon safari','2 hr'],['Kite surfing','3 hr']]],
  ['kataragama','Kataragama','Uva Province','Culture','Yala','30–45 min','',[['Sacred city and shrine','2–3 hr'],['Menik River walk','1–2 hr'],['Kiri Vehera','1 hr'],['Tissa Wewa','1 hr']]],
  ['kitulgala','Kitulgala','Sabaragamuwa Province','Adventure','Kandy','2.5–3 hr','',[['White-water rafting','2–3 hr'],['Rainforest and waterfall trek','2–4 hr']]],
  ['matara','Matara','Southern Province','Culture','Galle','1–1.5 hr','',[['Fort heritage walk','1–2 hr'],['Paravi Duwa and town visit','1–2 hr']]],
  ['mirissa','Mirissa','Southern Province','Beach','Matara','15–30 min','/destinations/mirissa.jpg',[['Surf session','2 hr'],['Coconut Tree Hill','30–60 min'],['Whale watching','4 hr'],['Snorkeling','2 hr'],['Secret Beach','1.5–2 hr']]],
  ['negombo','Negombo','Western Province','Beach','Colombo','1–1.5 hr','',[['Lagoon boat ride','1–2 hr'],['Fish market and town walk','1–2 hr']]],
  ['nuwara-eliya','Nuwara Eliya','Central Province','Nature','Kandy','2.5–3.5 hr','/destinations/nuwara.jpg',[['Tea estate tasting','1–2 hr'],['Highland nature walk','2–4 hr'],['Gregory Lake','45–60 min'],['Victoria Park','45–60 min']]],
  ['pasikuda','Pasikuda','Eastern Province','Beach','Trincomalee','2.5–3.5 hr','',[['Batticaloa lagoon and city tour','3 hr'],['Snorkeling','2 hr'],['Beach day','4 hr']]],
  ['polonnaruwa','Polonnaruwa','North Central Province','Culture','Anuradhapura','2.5–3 hr','',[['Ancient city cycling tour','3–3.5 hr'],['Heritage tour','4 hr'],['Gal Vihara','45–60 min'],['Minneriya safari','3 hr']]],
  ['ratnapura','Ratnapura','Sabaragamuwa Province','Nature','Colombo','2.5–3.5 hr','',[['Gem heritage visit','1–2 hr'],['Waterfall and foothill walk','3–5 hr'],['Bopath Ella','3 hr']]],
  ['sigiriya','Sigiriya','Central Province','Culture','Dambulla','30–40 min','/destinations/sigiriya.jpg',[['Rock Fortress walk','2.5–3 hr'],['Village cycling tour','2.5 hr'],['Museum','45–60 min'],['Water gardens','30–60 min'],['Pidurangala hike','2 hr']]],
  ['tangalle','Tangalle','Southern Province','Beach','Matara','45–75 min','',[['Hummanaya Blow Hole','1 hr'],['Mulkirigala Rock Temple','2.5 hr'],['Turtle watch','3 hr'],['Beach time','3 hr']]],
  ['trincomalee','Trincomalee','Eastern Province','Beach','Polonnaruwa','2.5–3 hr','',[['Pigeon Island snorkeling','3.5–4 hr'],['Fort Frederick','1 hr'],['Kanniya Hot Springs','30–45 min'],['Nilaveli Beach','3 hr'],['Whale watching','4 hr']]],
  ['udawalawe','Udawalawe','Sabaragamuwa Province','Nature','','','',[['National Park safari','4 hr']]],
  ['unawatuna','Unawatuna','Southern Province','Beach','Galle','10–15 min','',[['Peace Pagoda hike','1 hr'],['Rumassala walk','1.5 hr'],['Beach snorkeling','3 hr']]],
  ['wilpattu','Wilpattu','North Western Province','Nature','Anuradhapura','1.5–2.5 hr','',[['Guided safari','4–6 hr'],['Birdwatching drive','3–5 hr'],['Nature walk','Duration not listed'],['Village visit','Duration not listed']]],
  ['yala','Yala','Southern and Uva Provinces','Nature','Ella','2.5–3.5 hr','/destinations/yala.jpg',[['Wildlife safari','4–6 hr'],['Birdwatching','2–3 hr'],['Morning safari','3–5 hr'],['Sithulpawwa Temple','1.5–3 hr']]],
];

const destinationPrices = { sigiriya: 6500, ella: 3500, mirissa: 4000, kandy: 3000, galle: 2500, 'nuwara-eliya': 3000, yala: 12000 };
export const demoDestinations = destinationSeeds.map(([id, name, region, category, travelFrom, travelTime, image, activities]) => ({
  id, name, region, category, travelFrom, travelTime, image, price: destinationPrices[id] ?? null, rating: 'New',
  description: `Explore ${name} and its local highlights.`,
  activities: activities.map(([activity, duration]) => ({ name: activity, duration })),
}));

export const demoTravelPackages = [
  { id: 'hill', name: 'A little hill-country magic', duration: '3 days · 2 nights', price: 24000, image: '/destinations/ella.jpg', destinationIds: ['kandy', 'ella'], includes: ['Hotels', 'Transport', 'Activities'], description: 'A sample hill-country bundle covering stays, transport, and activities across Kandy and Ella.' },
  { id: 'wild', name: 'Into the wild, together', duration: '3 days · 2 nights', price: 36000, image: '/destinations/yala.jpg', destinationIds: ['yala', 'mirissa'], includes: ['Hotels', 'Transport', 'Activities'], description: 'A sample wildlife and coast bundle with guided activities and transfers.' },
];
