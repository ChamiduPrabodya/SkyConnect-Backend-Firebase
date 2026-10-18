import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCBHWwJ9c9X37VPJ37wX2vLV8KlSKzSc_U",
  authDomain: "skyconnect-sl-e4cdd.firebaseapp.com",
  projectId: "skyconnect-sl-e4cdd",
  storageBucket: "skyconnect-sl-e4cdd.firebasestorage.app",
  messagingSenderId: "836916172981",
  appId: "1:836916172981:web:514049ceb25d6b2e03c6fc"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const partners = [
  {
    id: 'P-1042',
    name: 'Ceylon Coast Adventures',
    type: 'Tourism',
    category: 'Hotel & Water Sports',
    location: 'Galle, Sri Lanka',
    status: 'Pending',
    initials: 'CC',
    color: 'coral',
    email: 'ceyloncoast@gmail.com',
    phone: '+94 91 223 4567',
    rating: 4.8,
    createdAt: new Date().toISOString()
  },
  {
    id: 'P-1041',
    name: 'Lanka Air Connect',
    type: 'Airline',
    category: 'Domestic Airline',
    location: 'Katunayake, Sri Lanka',
    status: 'Pending',
    initials: 'LA',
    color: 'blue',
    email: 'lankaair@skyconnect.lk',
    phone: '+94 11 225 1122',
    code: 'LAC',
    rating: 4.6,
    createdAt: new Date().toISOString()
  },
  {
    id: 'P-1039',
    name: 'Hill Country Escapes',
    type: 'Tourism',
    category: 'Boutique Resort',
    location: 'Ella, Sri Lanka',
    status: 'Approved',
    initials: 'HC',
    color: 'green',
    email: 'hillcountry@gmail.com',
    phone: '+94 57 222 8899',
    rating: 4.9,
    createdAt: new Date().toISOString()
  },
  {
    id: 'P-1037',
    name: 'Serendib Island Tours',
    type: 'Tourism',
    category: 'Excursions & Travel',
    location: 'Colombo, Sri Lanka',
    status: 'Approved',
    initials: 'SI',
    color: 'purple',
    email: 'serendib@gmail.com',
    phone: '+94 11 250 3344',
    rating: 4.7,
    createdAt: new Date().toISOString()
  },
  {
    id: 'P-1035',
    name: 'Cinnamon Air',
    type: 'Airline',
    category: 'Scenic & Charter Flights',
    location: 'Colombo (Ratmalana), Sri Lanka',
    status: 'Approved',
    initials: 'CA',
    color: 'blue',
    email: 'ops@cinnamonair.com',
    phone: '+94 11 247 5475',
    code: 'C7',
    rating: 4.9,
    createdAt: new Date().toISOString()
  }
];

const offers = [
  {
    id: 'OF-208',
    title: 'Sunset Coastal Escape & Snorkeling',
    partner: 'Ceylon Coast Adventures',
    partnerId: 'P-1042',
    category: 'Beach',
    location: 'Galle & Unawatuna',
    price: 120,
    currency: 'USD',
    status: 'Pending',
    reach: 0,
    rating: 4.8,
    image: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa',
    description: 'Experience breathtaking Southern sunset catamaran tour with guided snorkeling at coral reefs.',
    tags: ['beach', 'sunset', 'ocean', 'adventure'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'OF-207',
    title: 'Misty Ella Mountain Retreat',
    partner: 'Hill Country Escapes',
    partnerId: 'P-1039',
    category: 'Nature',
    location: 'Ella, Sri Lanka',
    price: 85,
    currency: 'USD',
    status: 'Published',
    reach: 1284,
    rating: 4.9,
    image: 'https://images.unsplash.com/photo-1586861635167-e5223aadc9fe',
    description: 'Wake up above the clouds with panoramic views of Ella Rock, tea plantation hike, and organic breakfast.',
    tags: ['nature', 'tea', 'hiking', 'mountains'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'OF-206',
    title: 'Scenic Seaplane Discovery Flight',
    partner: 'Cinnamon Air',
    partnerId: 'P-1035',
    category: 'Adventure',
    location: 'Sigiriya & Castlereagh',
    price: 195,
    currency: 'USD',
    status: 'Published',
    reach: 968,
    rating: 4.9,
    image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e',
    description: 'Fly over ancient Sigiriya Fortress and Castlereagh reservoir in a premium amphibious aircraft.',
    tags: ['flight', 'aerial', 'sigiriya', 'luxury'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'OF-205',
    title: 'Colombo Heritage & Street Food Trail',
    partner: 'Serendib Island Tours',
    partnerId: 'P-1037',
    category: 'Culture',
    location: 'Colombo',
    price: 55,
    currency: 'USD',
    status: 'Published',
    reach: 742,
    rating: 4.7,
    image: 'https://images.unsplash.com/photo-1578632767115-351597cf2477',
    description: 'Explore Dutch Hospital precinct, Pettah bazaars, and sample authentic Kottu Roti by night.',
    tags: ['culture', 'food', 'city', 'nightlife'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'OF-204',
    title: 'Sigiriya Sunrise Balloon & Ancient Fortress',
    partner: 'Hill Country Escapes',
    partnerId: 'P-1039',
    category: 'Heritage',
    location: 'Sigiriya & Dambulla',
    price: 210,
    currency: 'USD',
    status: 'Published',
    reach: 1850,
    rating: 5.0,
    image: 'https://images.unsplash.com/photo-1588598198321-9735fd52455b',
    description: 'Float in a hot air balloon over UNESCO World Heritage fortress followed by a champagne breakfast.',
    tags: ['heritage', 'balloon', 'unesco', 'sunrise'],
    createdAt: new Date().toISOString()
  }
];

const destinations = [
  { id: 'dest-ella', name: 'Ella', region: 'Central Highlands', saves: 820, highlights: ['Ella Rock', 'Nine Arch Bridge', 'Little Adam\'s Peak'] },
  { id: 'dest-galle', name: 'Galle', region: 'Southern Province', saves: 680, highlights: ['Galle Fort', 'Lighthouse', 'Jungle Beach'] },
  { id: 'dest-sigiriya', name: 'Sigiriya', region: 'Cultural Triangle', saves: 550, highlights: ['Lion Rock', 'Pidurangala', 'Minneriya Safari'] },
  { id: 'dest-mirissa', name: 'Mirissa', region: 'Southern Coast', saves: 440, highlights: ['Coconut Tree Hill', 'Whale Watching', 'Secret Beach'] },
  { id: 'dest-kandy', name: 'Kandy', region: 'Central Province', saves: 390, highlights: ['Temple of the Tooth', 'Botanical Garden', 'Kandy Lake'] }
];

async function seedFirestore() {
  console.log('--- Starting SkyConnect SL Firestore Seeding ---');
  
  // 1. Seed partners
  for (const p of partners) {
    await setDoc(doc(db, 'partners', p.id), p);
    console.log(`[+] Added partner: ${p.name} (${p.id})`);
  }

  // 2. Seed offers
  for (const o of offers) {
    await setDoc(doc(db, 'offers', o.id), o);
    console.log(`[+] Added offer: ${o.title} (${o.id})`);
  }

  // 3. Seed destinations
  for (const d of destinations) {
    await setDoc(doc(db, 'destinations', d.id), d);
    console.log(`[+] Added destination: ${d.name} (${d.id})`);
  }

  console.log('--- Seeding Completed Successfully! ---');
  process.exit(0);
}

seedFirestore().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
