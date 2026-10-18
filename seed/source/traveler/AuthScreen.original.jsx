import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, Modal, Pressable, ScrollView, TextInput, Keyboard } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Page,
  Header,
  Field,
  Button,
  Badge,
  ErrorText,
  DemoNote,
  s,
} from '../components/common/UI';
import { useApp } from '../context/AppContext';
import { validateAuth } from '../utils/trip';
import { phoneCountries } from '../data/mock/phoneCountries';
import { registerTraveler, signInTraveler } from '../services/userService';

const DEMO_VERIFICATION_CODE = '123456';

export default function AuthScreen({ navigation, route }) {
  const { user, setUser, savePlan, createBooking, setDraftStep, setNotice, colors } = useApp();
  const [register, setRegister] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const [contactMethod, setContactMethod] = useState('email');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('traveler@example.com');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState(user?.country || '');
  const [countrySearch, setCountrySearch] = useState('');
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [otp, setOtp] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [legalPage, setLegalPage] = useState(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef(null);
  const authRequest = useRef(false);
  const resolvedAuth = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!verificationPending || secondsLeft <= 0) return undefined;
    const countdown = setTimeout(() => setSecondsLeft((value) => value - 1), 1000);
    return () => clearTimeout(countdown);
  }, [verificationPending, secondsLeft]);

  const selectedPhoneCountry = phoneCountries.find((item) => item.name === country);
  const phoneDigits = phone.replace(/\D/g, '');
  const normalizedPhone = phoneDigits.replace(/^0/, '');
  const contactValue = register || contactMethod === 'email'
    ? email.trim()
    : selectedPhoneCountry ? `${selectedPhoneCountry.callingCode}${normalizedPhone}` : phone.trim();
  const filteredPhoneCountries = phoneCountries.filter((item) =>
    `${item.name} ${item.callingCode}`.toLowerCase().includes(countrySearch.trim().toLowerCase()),
  );
  const maskedContact = register || contactMethod === 'email'
    ? email.replace(/^(.).+(@.+)$/, '$1***$2')
    : `${selectedPhoneCountry?.callingCode || ''} ${normalizedPhone.replace(/\d(?=\d{3})/g, '*')}`;
  const phoneValidationMessage = () => {
    if (!selectedPhoneCountry) return 'Choose your country before entering a phone number.';
    if (!phoneDigits) return 'Enter your phone number.';
    const validLength = selectedPhoneCountry.nationalNumberLengths.includes(phoneDigits.length);
    const validPrefix = !selectedPhoneCountry.nationalNumberPrefix
      || phoneDigits.startsWith(selectedPhoneCountry.nationalNumberPrefix);
    if (validLength && validPrefix) return '';
    if (selectedPhoneCountry.name === 'Sri Lanka') return 'Enter a valid Sri Lankan mobile number with 10 digits starting with 07.';
    const expectedLengths = selectedPhoneCountry.nationalNumberLengths.join(' or ');
    return `Enter a valid ${selectedPhoneCountry.name} phone number (${expectedLengths} digits).`;
  };

  const finishAuth = async () => {
    if (authRequest.current) return;
    authRequest.current = true;
    setLoading(true);
    const userEmail = register || contactMethod === 'email' ? email.trim() : (user?.email || '');
    const userPhone = register ? `${selectedPhoneCountry?.callingCode || ''}${normalizedPhone}` : contactMethod === 'phone' ? contactValue : (user?.phone || '');
    const userName = register ? fullName.trim() : (user?.name || 'Traveler');

    try {
      let result = resolvedAuth.current?.email === userEmail && resolvedAuth.current?.register === register
        ? resolvedAuth.current.result : null;
      if (!result && userEmail && password) {
        result = register
          ? await registerTraveler({ email: userEmail, password, fullName: userName, phone: userPhone, country })
          : await signInTraveler(userEmail, password);
        if (result.success) resolvedAuth.current = { email: userEmail, register, result };
      }
      const traveler = {
        name: userName,
        email: userEmail,
        phone: userPhone,
        country: register ? country : (user?.country || country),
        ...(result?.success ? result.profile : {}),
      };
      setUser(traveler);
      if (route.params?.action === 'save') {
        savePlan();
        navigation.goBack();
      } else if (route.params?.action === 'demoBooking') {
        // Pass the resolved profile directly; setUser takes effect on the next render.
        const id = await createBooking(traveler);
        setDraftStep('complete');
        navigation.reset({
          index: 1,
          routes: [{ name: 'Main' }, { name: 'BookingStatus', params: { id, simulate: true } }],
        });
      } else {
        setNotice(register ? 'Your demo profile is ready.' : 'Welcome to your demo profile.');
        navigation.goBack();
      }
      setPassword('');
      setConfirm('');
      setVerificationPending(false);
    } catch {
      setError(route.params?.action === 'demoBooking'
        ? 'Your booking could not be saved online. Please try again.'
        : 'Sign in could not be completed. Please try again.');
    } finally {
      authRequest.current = false;
      setLoading(false);
    }
  };

  const submit = () => {
    let message = '';
    if (register) {
      if (!fullName.trim()) message = 'Enter your full name.';
      else if (!country.trim()) message = 'Enter your country of residence.';
      else if (!selectedPhoneCountry) message = 'Choose your country before entering a phone number.';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) message = 'Enter a valid email address.';
      else if (phoneValidationMessage()) message = phoneValidationMessage();
      else if (!password) message = 'Enter a password.';
      else if (password.length < 6) message = 'Use at least 6 characters for your password.';
      else if (!confirm) message = 'Confirm your password.';
      else if (password !== confirm) message = 'Your passwords do not match.';
      else if (!termsAccepted) message = 'Agree to the Terms of Service and Privacy Policy to continue.';
    } else if (contactMethod === 'email') {
      message = validateAuth(email.trim(), password, confirm, false);
    } else if (phoneValidationMessage()) {
      message = phoneValidationMessage();
    } else if (!password) {
      message = 'Enter your password.';
    } else if (password.length < 6) {
      message = 'Use at least 6 characters for the demo password.';
    }

    setError(message);
    if (message) return;
    setLoading(true);
    timer.current = setTimeout(() => {
      setLoading(false);
      if (register) {
        setOtp('');
        setSecondsLeft(60);
        setVerificationPending(true);
      } else {
        finishAuth();
      }
    }, 500);
  };

  const verifyCode = () => {
    if (otp !== DEMO_VERIFICATION_CODE) {
      setError('Enter the 6-digit demo code shown below.');
      return;
    }
    setError('');
    finishAuth();
  };

  const resendCode = () => {
    if (secondsLeft > 0) return;
    setOtp('');
    setError('');
    setSecondsLeft(60);
  };

  const toggleRegistration = () => {
    setRegister((value) => !value);
    setError('');
    setConfirm('');
    setTermsAccepted(false);
  };

  return (
    <Page>
      <Header
        title={verificationPending ? 'Verify your contact' : register ? 'Create your account' : 'Welcome, wanderer'}
        subtitle={verificationPending ? 'One quick step to finish your demo registration.' : undefined}
        navigation={navigation}
      />
      {!verificationPending ? (
        <>
          <View style={{ alignItems: 'center', marginVertical: 22 }}>
            <Image source={require('../../assets/images/logo.png')} style={{ width: 72, height: 72 }} resizeMode="contain" />
            <Text style={[s.title, { marginTop: 17 }]}>
              {register ? 'Make yourself at home.' : 'Your next chapter awaits.'}
            </Text>
          </View>
          <Badge>DEMO {register ? 'REGISTRATION' : 'SIGN-IN'}</Badge>
          <Text style={[s.body, { marginVertical: 16 }]}>
            {register
              ? 'Create a local demo profile. No real account or verification message will be created.'
              : 'Use a fictional email or phone and a demo password to continue.'}
          </Text>
          {register && (
            <Field
              label="Full name"
              placeholder="Your name"
              autoComplete="name"
              textContentType="name"
              autoCapitalize="words"
              value={fullName}
              onChangeText={setFullName}
            />
          )}
          {!register && (
            <>
              <Text style={[s.label, { marginBottom: 8 }]}>Continue with</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                {['email', 'phone'].map((method) => {
                  const selected = contactMethod === method;
                  return (
                    <Pressable
                      key={method}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => {
                        setContactMethod(method);
                        setError('');
                        if (method === 'phone' && !country) setCountryPickerOpen(true);
                      }}
                      style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: selected ? colors.teal : colors.line, backgroundColor: selected ? colors.mint : colors.card }}
                    >
                      <Text style={{ color: selected ? colors.teal : colors.muted, fontSize: 13, fontWeight: '700' }}>
                        {method === 'email' ? 'Email' : 'Phone'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
          {(register || contactMethod === 'phone') && (
            <View style={{ marginBottom: 14 }}>
              <Text style={[s.label, { marginBottom: 7 }]}>Country / calling code</Text>
              <View style={{ minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 9, paddingLeft: 12, paddingRight: 8, borderRadius: 12, borderWidth: 1, borderColor: countryPickerOpen ? colors.teal : colors.line, backgroundColor: colors.inputBg }}>
                <Ionicons name="globe-outline" size={18} color={colors.teal} />
                <TextInput
                  accessibilityLabel="Search or select country"
                  placeholder="Search or select country"
                  placeholderTextColor={colors.muted}
                  value={countryPickerOpen ? countrySearch : selectedPhoneCountry?.name || ''}
                  onFocus={() => {
                    if (!countryPickerOpen) setCountrySearch('');
                    setCountryPickerOpen(true);
                  }}
                  onChangeText={(value) => {
                    setCountrySearch(value);
                    setCountryPickerOpen(true);
                  }}
                  autoCapitalize="words"
                  style={{ flex: 1, minWidth: 0, minHeight: 48, paddingVertical: 10, color: colors.text, fontSize: 14, fontWeight: selectedPhoneCountry && !countryPickerOpen ? '700' : '400' }}
                />
                {selectedPhoneCountry && <Text style={{ color: colors.teal, fontSize: 14, fontWeight: '800' }}>{selectedPhoneCountry.callingCode}</Text>}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={countryPickerOpen ? 'Close country options' : 'Show country options'}
                  accessibilityState={{ expanded: countryPickerOpen }}
                  onPress={() => {
                    setCountrySearch('');
                    if (countryPickerOpen) Keyboard.dismiss();
                    setCountryPickerOpen((open) => !open);
                  }}
                  hitSlop={8}
                  style={{ width: 30, height: 42, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name={countryPickerOpen ? 'chevron-up' : 'chevron-down'} size={17} color={colors.muted} />
                </Pressable>
              </View>
              {countryPickerOpen && (
                <View style={{ marginTop: 5, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.inputBg }}>
                  <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 210 }}>
                    {filteredPhoneCountries.length ? filteredPhoneCountries.map((item) => (
                      <Pressable
                        key={item.name}
                        accessibilityRole="button"
                        accessibilityState={{ selected: item.name === country }}
                        onPress={() => {
                          setCountry(item.name);
                          setPhone('');
                          setCountrySearch('');
                          setCountryPickerOpen(false);
                          Keyboard.dismiss();
                        }}
                        style={{ minHeight: 42, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, borderBottomWidth: 1, borderBottomColor: colors.line, borderRadius: 8, backgroundColor: item.name === country ? colors.mint : 'transparent' }}
                      >
                        <Text style={{ flex: 1, color: colors.text, fontSize: 13, fontWeight: item.name === country ? '700' : '500' }}>{item.name}</Text>
                        <Text style={{ color: colors.teal, fontSize: 13, fontWeight: '700' }}>{item.callingCode}</Text>
                      </Pressable>
                    )) : (
                      <Text style={{ color: colors.muted, fontSize: 12, padding: 12 }}>No matching country. Try another search.</Text>
                    )}
                  </ScrollView>
                </View>
              )}
            </View>
          )}
          {(register || contactMethod === 'phone') && (
            <View style={{ marginBottom: 16 }}>
              <Text style={[s.label, { marginBottom: 7 }]}>Phone number</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ minHeight: 52, minWidth: 64, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}>
                  <Text style={{ color: colors.teal, fontSize: 15, fontWeight: '800' }}>{selectedPhoneCountry?.callingCode || '+__'}</Text>
                </View>
                <TextInput
                  accessibilityLabel="Phone number without country code"
                  placeholder={selectedPhoneCountry?.name === 'Sri Lanka' ? '077 123 4567' : selectedPhoneCountry ? 'Phone number' : 'Choose country first'}
                  placeholderTextColor={colors.muted}
                  keyboardType="phone-pad"
                  autoComplete="tel-national"
                  textContentType="telephoneNumber"
                  editable={Boolean(selectedPhoneCountry)}
                  value={phone}
                  onChangeText={(value) => setPhone(value.replace(/[^\d\s()-]/g, ''))}
                  style={{ flex: 1, minHeight: 52, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inputBg, color: colors.text, fontSize: 15, opacity: selectedPhoneCountry ? 1 : 0.6 }}
                />
              </View>
              <Text style={[s.caption, { marginTop: 5 }]}>Enter the number without the country code.</Text>
            </View>
          )}
          {(register || contactMethod === 'email') && (
            <Field
              label="Email address"
              placeholder="name@example.com"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          )}
          <Field
            label={register ? 'Password' : 'Demo password'}
            placeholder="At least 6 characters"
            secureTextEntry={!passwordVisible}
            autoComplete={register ? 'new-password' : 'current-password'}
            textContentType={register ? 'newPassword' : 'password'}
            autoCapitalize="none"
            value={password}
            onChangeText={setPassword}
            rightAccessory={(
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
                onPress={() => setPasswordVisible((value) => !value)}
                hitSlop={8}
                style={{ width: 38, height: 42, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name={passwordVisible ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
              </Pressable>
            )}
          />
          {register && (
            <Field
              label="Confirm password"
              secureTextEntry={!confirmPasswordVisible}
              autoComplete="off"
              textContentType="none"
              autoCapitalize="none"
              value={confirm}
              onChangeText={setConfirm}
              rightAccessory={(
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={confirmPasswordVisible ? 'Hide confirm password' : 'Show confirm password'}
                  onPress={() => setConfirmPasswordVisible((value) => !value)}
                  hitSlop={8}
                  style={{ width: 38, height: 42, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name={confirmPasswordVisible ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
                </Pressable>
              )}
            />
          )}
          {register && (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: termsAccepted }}
              onPress={() => setTermsAccepted((accepted) => !accepted)}
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, marginBottom: 8 }}
            >
              <Ionicons name={termsAccepted ? 'checkbox' : 'square-outline'} size={21} color={termsAccepted ? colors.teal : colors.muted} />
              <Text style={[s.caption, { flex: 1, lineHeight: 20 }]}>
                I agree to the{' '}
                <Text onPress={() => setLegalPage('terms')} style={{ color: colors.teal, fontWeight: '700' }}>Terms of Service</Text>
                {' '}and{' '}
                <Text onPress={() => setLegalPage('privacy')} style={{ color: colors.teal, fontWeight: '700' }}>Privacy Policy</Text>.
              </Text>
            </Pressable>
          )}
          <ErrorText>{error}</ErrorText>
          <Button
            title={register ? 'Create Account' : 'Demo Sign In'}
            loading={loading}
            disabled={register && !termsAccepted}
            onPress={submit}
          />
          <Button
            title={register ? 'Already exploring? Sign in' : 'New here? Create an account'}
            variant="ghost"
            disabled={loading}
            onPress={toggleRegistration}
          />
          <DemoNote text="Demo only. No real account is created, and contact details are not verified." />
        </>
      ) : (
        <>
          <Badge>DEMO VERIFICATION</Badge>
          <Text style={[s.body, { marginTop: 16, marginBottom: 8 }]}>
            A real app would send a code to {maskedContact}. No email or SMS is sent in this demo.
          </Text>
          <DemoNote text={`Preview code: ${DEMO_VERIFICATION_CODE}. Enter it below to continue.`} />
          <Field
            label="6-digit verification code"
            placeholder="000000"
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            autoFocus
            maxLength={6}
            value={otp}
            onChangeText={(value) => setOtp(value.replace(/\D/g, '').slice(0, 6))}
            style={{ marginTop: 18 }}
            inputMode="numeric"
          />
          <Text style={{ color: colors.muted, textAlign: 'center', letterSpacing: 4, fontSize: 22, fontWeight: '700', marginVertical: 8 }}>
            {Array.from({ length: 6 }, (_, index) => otp[index] || '•').join('  ')}
          </Text>
          <ErrorText>{error}</ErrorText>
          <Button
            title="Verify and create account"
            icon="checkmark-circle-outline"
            disabled={otp.length !== 6}
            loading={loading}
            onPress={verifyCode}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: secondsLeft > 0 }}
            disabled={secondsLeft > 0}
            onPress={resendCode}
            style={{ alignSelf: 'center', padding: 14, opacity: secondsLeft > 0 ? 0.55 : 1 }}
          >
            <Text style={{ color: colors.teal, fontWeight: '700' }}>
              {secondsLeft > 0 ? `Resend code in 00:${String(secondsLeft).padStart(2, '0')}` : 'Resend code'}
            </Text>
          </Pressable>
          <Button
            title="Change registration details"
            variant="ghost"
            onPress={() => { setVerificationPending(false); setOtp(''); setError(''); }}
          />
        </>
      )}
      <Modal
        visible={!!legalPage}
        transparent
        animationType="fade"
        onRequestClose={() => setLegalPage(null)}
      >
        <View style={{ flex: 1, justifyContent: 'center', padding: 22, backgroundColor: '#0009' }}>
          <View style={{ maxHeight: '80%', borderRadius: 20, padding: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={s.heading}>{legalPage === 'terms' ? 'Terms of Service' : 'Privacy Policy'}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setLegalPage(null)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.muted} />
              </Pressable>
            </View>
            <ScrollView>
              <Text style={s.body}>
                {legalPage === 'terms'
                  ? 'SkyConnect is currently a local demo. Creating a profile does not create a real account, reserve travel, or take payment. Do not use this preview as a real booking service.'
                  : 'This demo does not send verification messages. Profile and trip information are used only by this local app preview. Do not enter sensitive personal or payment information.'}
              </Text>
            </ScrollView>
            <Button title="Close" variant="secondary" onPress={() => setLegalPage(null)} style={{ marginTop: 14 }} />
          </View>
        </View>
      </Modal>
    </Page>
  );
}
