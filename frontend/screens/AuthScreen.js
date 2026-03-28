import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useState } from 'react';

// alt: const API_BASE = "http://192.168.178.77:8000";
const API_BASE = "https://shopping-list-backend-4wcr.onrender.com";

export default function AuthScreen({ onLogin }) {
  const [modus, setModus]         = useState('login'); // 'login' | 'register'
  const [username, setUsername]   = useState('');
  const [email, setEmail]         = useState('');
  const [passwort, setPasswort]   = useState('');
  const [passwort2, setPasswort2] = useState('');
  const [fehler, setFehler]       = useState('');
  const [laedt, setLaedt]         = useState(false);

  const absenden = async () => {
    setFehler('');

    if (!username.trim() || !passwort.trim()) {
      setFehler('Benutzername und Passwort sind Pflichtfelder.');
      return;
    }
    if (modus === 'register') {
      if (!email.trim()) { setFehler('E-Mail ist ein Pflichtfeld.'); return; }
      if (passwort !== passwort2) { setFehler('Passwörter stimmen nicht überein.'); return; }
      if (passwort.length < 6) { setFehler('Passwort muss mindestens 6 Zeichen lang sein.'); return; }
    }

    setLaedt(true);
    try {
      const endpoint = modus === 'login' ? '/auth/login' : '/auth/register';
      const body = modus === 'login'
        ? { username: username.trim(), password: passwort }
        : { username: username.trim(), email: email.trim(), password: passwort };

      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setFehler(data.detail || 'Fehler beim Anmelden.');
        return;
      }

      onLogin({ token: data.token, userId: data.user_id, username: data.username });
    } catch (e) {
      setFehler('Server nicht erreichbar.');
    } finally {
      setLaedt(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
      <ScrollView
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.logo}>🛒</Text>
        <Text style={styles.titel}>Meine Einkaufsliste</Text>
        <Text style={styles.untertitel}>
          {modus === 'login' ? 'Willkommen zurück' : 'Neues Konto erstellen'}
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Benutzername</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="benutzername"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!laedt}
          />

          {modus === 'register' && (
            <>
              <Text style={styles.label}>E-Mail</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="email@beispiel.de"
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!laedt}
              />
            </>
          )}

          <Text style={styles.label}>Passwort</Text>
          <TextInput
            style={styles.input}
            value={passwort}
            onChangeText={setPasswort}
            placeholder="••••••••"
            secureTextEntry
            editable={!laedt}
          />

          {modus === 'register' && (
            <>
              <Text style={styles.label}>Passwort wiederholen</Text>
              <TextInput
                style={styles.input}
                value={passwort2}
                onChangeText={setPasswort2}
                placeholder="••••••••"
                secureTextEntry
                editable={!laedt}
              />
            </>
          )}

          {fehler !== '' && <Text style={styles.fehler}>{fehler}</Text>}

          <TouchableOpacity
            style={[styles.button, laedt && styles.buttonDeaktiviert]}
            onPress={absenden}
            disabled={laedt}
          >
            {laedt
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>
                  {modus === 'login' ? 'Anmelden' : 'Konto erstellen'}
                </Text>
            }
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.wechsel}
          onPress={() => { setModus(m => m === 'login' ? 'register' : 'login'); setFehler(''); }}
          disabled={laedt}
        >
          <Text style={styles.wechselText}>
            {modus === 'login'
              ? 'Noch kein Konto? Jetzt registrieren →'
              : 'Bereits registriert? Jetzt anmelden →'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#f8f9fa' },
  inner:        { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  logo:         { fontSize: 56, marginBottom: 8 },
  titel:        { fontSize: 26, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 4 },
  untertitel:   { fontSize: 15, color: '#888', marginBottom: 32 },
  card:         { width: '100%', maxWidth: 400, backgroundColor: '#fff', borderRadius: 16, padding: 24, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  label:        { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6, marginTop: 12 },
  input:        { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 15, backgroundColor: '#fafafa' },
  fehler:       { color: '#c62828', fontSize: 13, marginTop: 12, textAlign: 'center' },
  button:       { marginTop: 20, backgroundColor: '#4CAF50', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  buttonDeaktiviert: { backgroundColor: '#aaa' },
  buttonText:   { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  wechsel:      { marginTop: 20 },
  wechselText:  { color: '#4CAF50', fontSize: 14 },
});