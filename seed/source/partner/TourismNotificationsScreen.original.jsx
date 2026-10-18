/**
 * TourismNotificationsScreen — SkyConnect Tourism Partner Portal
 *
 * Clean, simplified & user-friendly notifications hub:
 * - Clean "Pending SLTDA Review" alert banner (simple & uncluttered)
 * - Streamlined partner operational notifications
 * - High-contrast light and dark mode colors
 * - Integrates liquid glass TourismBottomNav with Home button
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
import { NAVY, BEIGE, WHITE, SLATE, ROSE } from '../../constants/theme';
import TourismBottomNav from '../../components/navigation/TourismBottomNav';

const CLEAN_NOTIFICATIONS = [
  {
    id: 'notif-1',
    category: 'booking',
    title: 'New Stay Reservation',
    body: 'Marcus Vance (Germany) reserved 3 nights at Deluxe Beach Cabana.',
    time: '4 hours ago',
    unread: true,
    icon: 'bed-outline',
    iconColor: BEIGE,
    iconBg: 'rgba(217, 185, 155, 0.16)',
  },
  {
    id: 'notif-2',
    category: 'tour',
    title: 'Tour Group Booked',
    body: '4 travelers booked Southern Coast Surfing & Safari package for Oct 18.',
    time: 'Yesterday',
    unread: true,
    icon: 'compass-outline',
    iconColor: '#38BDF8',
    iconBg: 'rgba(56, 189, 248, 0.15)',
  },
  {
    id: 'notif-3',
    category: 'payout',
    title: 'Weekly Payout Processed',
    body: 'Settlement of Rs. 428,500 transferred to Commercial Bank AC #...8831.',
    time: '2 days ago',
    unread: false,
    icon: 'wallet-outline',
    iconColor: '#10B981',
    iconBg: 'rgba(16, 185, 129, 0.15)',
  },
  {
    id: 'notif-4',
    category: 'review',
    title: '5-Star Guest Review',
    body: '"Unforgettable safari and beachfront cabana hospitality!" — Sarah K.',
    time: '3 days ago',
    unread: false,
    icon: 'star-outline',
    iconColor: '#F59E0B',
    iconBg: 'rgba(245, 158, 11, 0.15)',
  },
];

export default function TourismNotificationsScreen({ navigation }) {
  const { darkMode, user, hotels = [], activities = [], notifications: appNotifs = [] } = useApp();
  const [filter, setFilter] = useState('all');

  const isUserApproved = user?.status === 'Approved' || user?.status === 'approved';

  // Compute dynamic notifications including approvals
  const dynamicNotifs = React.useMemo(() => {
    const list = [...appNotifs];

    // 1. Partner Verification Approval Notification
    if (isUserApproved) {
      if (!list.some(n => n.id === 'notif-sltda-approved')) {
        list.push({
          id: 'notif-sltda-approved',
          category: 'booking',
          title: 'SLTDA Partner Verification Approved!',
          body: `Congratulations ${user?.name || 'Partner'}! Your tourism & hospitality registration has been approved by SLTDA and SkyConnect Admin.`,
          time: 'Just now',
          unread: true,
          icon: 'shield-checkmark',
          iconColor: '#10B981',
          iconBg: 'rgba(16, 185, 129, 0.16)',
        });
      }
    }

    // 2. Hotel/Stay Approval Notifications
    hotels.filter(h => h.status === 'approved' || h.status === 'Published').forEach(h => {
      const nid = `notif-hotel-approved-${h.id}`;
      if (!list.some(n => n.id === nid)) {
        list.push({
          id: nid,
          category: 'booking',
          title: `Stay Approved: ${h.name}`,
          body: `Your property "${h.name}" has been verified and published to global travelers.`,
          time: 'Just now',
          unread: true,
          icon: 'bed-outline',
          iconColor: '#10B981',
          iconBg: 'rgba(16, 185, 129, 0.16)',
        });
      }
    });

    // 3. Activity/Experience Approval Notifications
    activities.filter(a => a.status === 'approved' || a.status === 'Published').forEach(a => {
      const nid = `notif-act-approved-${a.id}`;
      if (!list.some(n => n.id === nid)) {
        list.push({
          id: nid,
          category: 'tour',
          title: `Experience Approved: ${a.name}`,
          body: `Your experience "${a.name}" has been verified and published to global travelers.`,
          time: 'Just now',
          unread: true,
          icon: 'compass-outline',
          iconColor: '#10B981',
          iconBg: 'rgba(16, 185, 129, 0.16)',
        });
      }
    });

    // 4. Baseline Operations Notifications
    CLEAN_NOTIFICATIONS.forEach(cn => {
      if (!list.some(n => n.id === cn.id)) {
        list.push(cn);
      }
    });

    return list;
  }, [appNotifs, isUserApproved, hotels, activities, user?.name]);

  const [notifications, setNotifications] = useState(dynamicNotifs);

  React.useEffect(() => {
    setNotifications(dynamicNotifs);
  }, [dynamicNotifs]);

  const unreadCount = notifications.filter(n => n.unread).length;

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, unread: false })));
  };

  const filtered = notifications.filter(item => {
    if (filter === 'all') return true;
    if (filter === 'booking') return item.category === 'booking' || item.category === 'tour';
    if (filter === 'payout') return item.category === 'payout';
    return true;
  });

  const bg = darkMode ? '#0C1724' : '#F6F1E9';
  const cardBg = darkMode ? '#12202C' : '#FFFFFF';
  const borderColor = darkMode ? 'rgba(217, 185, 155, 0.28)' : 'rgba(217, 185, 155, 0.45)';

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      {/* ── Top Header Curved Transition ── */}
      <View style={{ backgroundColor: '#070C21' }}>
        <View
          style={[
            styles.curvedHeaderEdge,
            {
              backgroundColor: bg,
              borderTopColor: darkMode ? 'rgba(217, 185, 155, 0.35)' : 'transparent',
              borderTopWidth: darkMode ? 1.2 : 0,
            },
          ]}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── SLTDA Status Banner (Updates dynamically when verified!) ── */}
        {isUserApproved ? (
          <View
            style={[
              styles.sltdaBanner,
              {
                backgroundColor: darkMode ? '#064E3B35' : '#ECFDF5',
                borderColor: darkMode ? '#10B98150' : '#A7F3D0',
              },
            ]}
          >
            <View style={[styles.sltdaIconBox, { backgroundColor: '#10B98120' }]}>
              <Ionicons name="shield-checkmark" size={24} color="#10B981" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.sltdaHeaderRow}>
                <Text style={[styles.sltdaTitle, { color: darkMode ? '#34D399' : '#065F46' }]}>
                  SLTDA Verified Partner
                </Text>
                <View style={[styles.helplineChip, { backgroundColor: '#10B98125' }]}>
                  <Ionicons name="checkmark-done" size={10} color="#10B981" />
                  <Text style={[styles.helplineText, { color: '#10B981' }]}>VERIFIED</Text>
                </View>
              </View>
              <Text style={[styles.sltdaSubtitle, { color: darkMode ? 'rgba(255,255,255,0.85)' : '#047857' }]}>
                Your partner account is active and verified by Sri Lanka Tourism Development Authority.
              </Text>
            </View>
          </View>
        ) : (
          <View
            style={[
              styles.sltdaBanner,
              {
                backgroundColor: darkMode ? '#1A2318' : '#FEF3C7',
                borderColor: darkMode ? 'rgba(217, 119, 6, 0.45)' : '#FDE68A',
              },
            ]}
          >
            <View style={styles.sltdaIconBox}>
              <Ionicons name="time" size={24} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.sltdaHeaderRow}>
                <Text style={[styles.sltdaTitle, { color: darkMode ? '#FBBF24' : '#92400E' }]}>
                  Pending SLTDA Review
                </Text>
                <View style={styles.helplineChip}>
                  <Ionicons name="call" size={10} color="#D97706" />
                  <Text style={styles.helplineText}>1912</Text>
                </View>
              </View>
              <Text style={[styles.sltdaSubtitle, { color: darkMode ? 'rgba(255,255,255,0.78)' : '#78350F' }]}>
                Listings will be visible to travelers once approved.
              </Text>
            </View>
          </View>
        )}

        {/* ── Filter Chips & Mark All Read ── */}
        <View style={styles.filterBar}>
          <View style={styles.filterChipsRow}>
            {[
              { id: 'all', label: 'All Alerts' },
              { id: 'booking', label: 'Reservations' },
              { id: 'payout', label: 'Payouts' },
            ].map(f => (
              <Pressable
                key={f.id}
                onPress={() => setFilter(f.id)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: filter === f.id
                      ? BEIGE
                      : (darkMode ? 'rgba(255,255,255,0.06)' : '#E2E8F0'),
                    borderColor: filter === f.id ? BEIGE : 'transparent',
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
                  borderColor: item.unread ? (darkMode ? BEIGE : 'rgba(217, 185, 155, 0.70)') : borderColor,
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
      <TourismBottomNav
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
  sltdaBanner: {
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
  sltdaIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(217, 119, 6, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sltdaHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  sltdaTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  sltdaSubtitle: {
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
    color: BEIGE,
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
    backgroundColor: BEIGE,
    alignSelf: 'center',
  },
});
