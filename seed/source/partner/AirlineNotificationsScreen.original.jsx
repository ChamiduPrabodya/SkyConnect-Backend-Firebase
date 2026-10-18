/**
 * AirlineNotificationsScreen — SkyConnect Airline Partner Portal
 *
 * Clean, simplified & aviation-tailored notifications hub:
 * - Clean "CAASL Flight Clearance & Slot Review" alert banner (simple & uncluttered)
 * - Streamlined airline operational notifications (Route slots, Weather advisories, APIS, BSP payouts)
 * - High-contrast light and dark mode colors
 * - Integrates liquid glass AirlineBottomNav with Home button
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useApp } from '../../context/AppContext';
import { NAVY, WHITE, SLATE } from '../../constants/theme';
import AirlineBottomNav from '../../components/navigation/AirlineBottomNav';

const AVIATION_CYAN = '#38BDF8';
const AVIATION_BLUE = '#0284C7';

const AVIATION_NOTIFICATIONS = [
  {
    id: 'air-notif-1',
    category: 'slot',
    title: 'International Slot Clearance Approved',
    body: 'CAASL & Dubai DCAA cleared daily slot for flight UL-504 (CMB → DXB, 08:30 Departure).',
    time: '2 hours ago',
    unread: true,
    icon: 'airplane-outline',
    iconColor: AVIATION_CYAN,
    iconBg: 'rgba(56, 189, 248, 0.16)',
  },
  {
    id: 'air-notif-2',
    category: 'manifest',
    title: 'Passenger Manifest Verified (APIS)',
    body: 'Advance Passenger Information cleared for 184 passengers on Colombo to Singapore flight UL-308.',
    time: '5 hours ago',
    unread: true,
    icon: 'people-outline',
    iconColor: '#10B981',
    iconBg: 'rgba(16, 185, 129, 0.15)',
  },
  {
    id: 'air-notif-3',
    category: 'weather',
    title: 'Bay of Bengal Weather Advisory',
    body: 'SIGMET Advisory: Isolated thunderstorms between FL300–FL360 along waypoint R461.',
    time: 'Yesterday',
    unread: false,
    icon: 'cloudy-outline',
    iconColor: '#F59E0B',
    iconBg: 'rgba(245, 158, 11, 0.15)',
  },
  {
    id: 'air-notif-4',
    category: 'settlement',
    title: 'IATA BSP Weekly Payout Settled',
    body: 'Net ticket settlement of LKR 8,450,000 deposited to Commercial Bank Airline Escrow AC #...4401.',
    time: '2 days ago',
    unread: false,
    icon: 'wallet-outline',
    iconColor: '#10B981',
    iconBg: 'rgba(16, 185, 129, 0.15)',
  },
];

export default function AirlineNotificationsScreen({ navigation }) {
  const { darkMode } = useApp();
  const [notifications, setNotifications] = useState(AVIATION_NOTIFICATIONS);
  const [filter, setFilter] = useState('all');

  const unreadCount = notifications.filter(n => n.unread).length;

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, unread: false })));
  };

  const filtered = notifications.filter(item => {
    if (filter === 'all') return true;
    if (filter === 'slot') return item.category === 'slot' || item.category === 'manifest';
    if (filter === 'settlement') return item.category === 'settlement';
    return true;
  });

  const bg = darkMode ? '#243B5A' : '#F0F9FF';
  const cardBg = darkMode ? '#101B2E' : '#FFFFFF';
  const borderColor = darkMode ? 'rgba(56, 189, 248, 0.35)' : 'rgba(2, 132, 199, 0.35)';

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      {/* ── Top Header Curved Transition ── */}
      <View style={{ backgroundColor: '#070C21' }}>
        <View
          style={[
            styles.curvedHeaderEdge,
            {
              backgroundColor: bg,
              borderTopColor: darkMode ? 'rgba(56, 189, 248, 0.45)' : 'transparent',
              borderTopWidth: darkMode ? 1.5 : 0,
            },
          ]}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Clean & Simple Pending CAASL Clearance Card ── */}
        <View
          style={[
            styles.caaslBanner,
            {
              backgroundColor: darkMode ? '#1A2318' : '#FEF3C7',
              borderColor: darkMode ? 'rgba(217, 119, 6, 0.45)' : '#FDE68A',
            },
          ]}
        >
          <View style={styles.caaslIconBox}>
            <Ionicons name="time" size={24} color="#D97706" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.caaslHeaderRow}>
              <Text style={[styles.caaslTitle, { color: darkMode ? '#FBBF24' : '#92400E' }]}>
                CAASL Flight Clearance
              </Text>
              <View style={styles.helplineChip}>
                <Ionicons name="call" size={10} color="#D97706" />
                <Text style={styles.helplineText}>1912</Text>
              </View>
            </View>
            <Text style={[styles.caaslSubtitle, { color: darkMode ? 'rgba(255,255,255,0.78)' : '#78350F' }]}>
              Scheduled routes will be visible to global travelers once slot clearance is issued.
            </Text>
          </View>
        </View>

        {/* ── Filter Chips & Mark All Read ── */}
        <View style={styles.filterBar}>
          <View style={styles.filterChipsRow}>
            {[
              { id: 'all', label: 'All Alerts' },
              { id: 'slot', label: 'Slots & Flights' },
              { id: 'settlement', label: 'Settlements' },
            ].map(f => (
              <Pressable
                key={f.id}
                onPress={() => setFilter(f.id)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: filter === f.id
                      ? AVIATION_CYAN
                      : (darkMode ? 'rgba(255,255,255,0.06)' : '#E2E8F0'),
                    borderColor: filter === f.id ? AVIATION_CYAN : 'transparent',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color: filter === f.id ? NAVY : (darkMode ? WHITE : NAVY),
                      fontWeight: filter === f.id ? '800' : '600',
                    },
                  ]}
                >
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {unreadCount > 0 && (
            <Pressable onPress={markAllRead} style={styles.markReadBtn} hitSlop={8}>
              <Text style={styles.markReadText}>Mark all read</Text>
            </Pressable>
          )}
        </View>

        {/* ── Notifications List ── */}
        <View style={styles.listWrap}>
          {filtered.map(item => (
            <View
              key={item.id}
              style={[
                styles.notifCard,
                {
                  backgroundColor: cardBg,
                  borderColor: item.unread ? (darkMode ? AVIATION_CYAN : 'rgba(2, 132, 199, 0.70)') : borderColor,
                },
              ]}
            >
              <View style={[styles.iconWrap, { backgroundColor: item.iconBg }]}>
                <Ionicons name={item.icon} size={22} color={item.iconColor} />
              </View>

              <View style={{ flex: 1 }}>
                <View style={styles.notifHeader}>
                  <Text style={[styles.notifTitle, { color: darkMode ? WHITE : NAVY }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={[styles.notifTime, { color: darkMode ? 'rgba(255,255,255,0.5)' : SLATE }]}>
                    {item.time}
                  </Text>
                </View>

                <Text style={[styles.notifBody, { color: darkMode ? 'rgba(255,255,255,0.72)' : '#475569' }]}>
                  {item.body}
                </Text>
              </View>

              {item.unread && (
                <View style={styles.unreadDot} />
              )}
            </View>
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating Bottom Nav with Home button */}
      <AirlineBottomNav
        navigation={navigation}
        activeTab="notifs"
        unreadNotifsCount={unreadCount}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  curvedHeaderEdge: {
    height: 20,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 8,
    gap: 14,
  },
  caaslBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1.2,
    padding: 16,
    gap: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
      default: {
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      },
    }),
  },
  caaslIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(217, 119, 6, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  caaslHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  caaslTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  caaslSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  helplineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(217, 119, 6, 0.15)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  helplineText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#D97706',
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  filterChipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
  },
  markReadBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  markReadText: {
    color: AVIATION_CYAN,
    fontSize: 12,
    fontWeight: '700',
  },
  listWrap: {
    gap: 10,
  },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1.2,
    padding: 14,
    gap: 12,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  notifTitle: {
    fontSize: 14,
    fontWeight: '800',
    flex: 1,
    marginRight: 8,
  },
  notifTime: {
    fontSize: 11,
  },
  notifBody: {
    fontSize: 12,
    lineHeight: 16,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: AVIATION_CYAN,
    alignSelf: 'center',
  },
});
