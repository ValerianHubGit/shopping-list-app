import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, Platform,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';

// alt: const API_BASE = "http://192.168.178.77:8000";
const API_BASE = "https://shopping-list-backend-4wcr.onrender.com";

export default function ListsScreen({ auth, onListSelect, onLogout }) {
  const [listen, setListen]           = useState([]);
  const [laedt, setLaedt]             = useState(false);
  const [neuerName, setNeuerName]     = useState('');
  const [hinzuLaedt, setHinzuLaedt]   = useState(false);
  const [umbenennen, setUmbenennen]   = useState(null); // { id, name }
  const [umbenennenText, setUmbenennenText] = useState('');
  const [loeschenId, setLoeschenId]   = useState(null);
  const [fehler, setFehler]           = useState('');

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${auth.token}`,
  };

  const listenLaden = useCallback(async () => {
    setLaedt(true);
    try {
      const res = await fetch(`${API_BASE}/lists`, { headers });
      if (res.status === 401) { onLogout(); return; }
      setListen(await res.json());
    } catch (e) { setFehler('Listen konnten nicht geladen werden.'); }
    finally { setLaedt(false); }
  }, [auth.token]);

  useEffect(() => { listenLaden(); }, [listenLaden]);

  const listeAnlegen = async () => {
    if (!neuerName.trim()) return;
    setHinzuLaedt(true);
    try {
      const res = await fetch(`${API_BASE}/lists`, {
        method: 'POST', headers,
        body: JSON.stringify({ name: neuerName.trim() }),
      });
      const neu = await res.json();
      setListen(v => [...v, neu]);
      setNeuerName('');
    } catch (e) { setFehler('Fehler beim Anlegen.'); }
    finally { setHinzuLaedt(false); }
  };

  const listeUmbenennen = async () => {
    if (!umbenennenText.trim()) return;
    try {
      await fetch(`${API_BASE}/lists/${umbenennen.id}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ name: umbenennenText.trim() }),
      });
      setListen(v => v.map(l => l.id === umbenennen.id ? { ...l, name: umbenennenText.trim() } : l));
      setUmbenennen(null);
    } catch (e) { setFehler('Fehler beim Umbenennen.'); }
  };

  const listeLoeschen = async (id) => {
    try {
      await fetch(`${API_BASE}/lists/${id}`, { method: 'DELETE', headers });
      setListen(v => v.filter(l => l.id !== id));
    } catch (e) { setFehler('Fehler beim Löschen.'); }
    finally { setLoeschenId(null); }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>🛒 Meine Listen</Text>
          <Text style={styles.nutzer}>Eingeloggt als {auth.username}</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
          <Text style={styles.logoutText}>Abmelden</Text>
        </TouchableOpacity>
      </View>

      {fehler !== '' && (
        <Text style={styles.fehler}>{fehler}</Text>
      )}

      {/* Neue Liste anlegen */}
      <View style={styles.neuZeile}>
        <TextInput
          style={styles.input}
          value={neuerName}
          onChangeText={setNeuerName}
          placeholder="Neue Liste benennen…"
          onSubmitEditing={listeAnlegen}
          returnKeyType="done"
          editable={!hinzuLaedt}
        />
        <TouchableOpacity
          style={[styles.addBtn, hinzuLaedt && styles.addBtnDeaktiviert]}
          onPress={listeAnlegen}
          disabled={hinzuLaedt}
        >
          {hinzuLaedt
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.addBtnText}>+</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Listen */}
      {laedt
        ? <ActivityIndicator style={{ marginTop: 40 }} color="#4CAF50" size="large" />
        : (
          <ScrollView style={styles.liste} showsVerticalScrollIndicator={false}>
            {listen.length === 0 && (
              <Text style={styles.leer}>Noch keine Listen vorhanden.{'\n'}Lege jetzt deine erste Liste an!</Text>
            )}
            {listen.map(l => (
              <View key={l.id} style={styles.listeItem}>
                {/* Umbenennen-Modus */}
                {umbenennen?.id === l.id ? (
                  <View style={styles.umbenennenZeile}>
                    <TextInput
                      style={styles.umbenennenInput}
                      value={umbenennenText}
                      onChangeText={setUmbenennenText}
                      autoFocus
                      onSubmitEditing={listeUmbenennen}
                      returnKeyType="done"
                    />
                    <TouchableOpacity style={styles.okBtn} onPress={listeUmbenennen}>
                      <Text style={styles.okBtnText}>✓</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.abbrechenBtn} onPress={() => setUmbenennen(null)}>
                      <Text style={styles.abbrechenBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ) : loeschenId === l.id ? (
                  /* Löschen-Bestätigung */
                  <View style={styles.loeschenZeile}>
                    <Text style={styles.loeschenFrage}>„{l.name}" wirklich löschen?</Text>
                    <TouchableOpacity style={styles.jaBtn} onPress={() => listeLoeschen(l.id)}>
                      <Text style={styles.jaBtnText}>Ja, löschen</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.neinBtn} onPress={() => setLoeschenId(null)}>
                      <Text style={styles.neinBtnText}>Abbrechen</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  /* Normal-Ansicht */
                  <>
                    <TouchableOpacity style={styles.listenName} onPress={() => onListSelect(l)}>
                      <Text style={styles.listenNameText}>{l.name}</Text>
                      <Text style={styles.listenPfeil}>→</Text>
                    </TouchableOpacity>
                    <View style={styles.aktionen}>
                      <TouchableOpacity
                        style={styles.aktionBtn}
                        onPress={() => { setUmbenennen(l); setUmbenennenText(l.name); }}
                      >
                        <Text style={styles.aktionIcon}>✏️</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.aktionBtn}
                        onPress={() => setLoeschenId(l.id)}
                      >
                        <Text style={styles.aktionIcon}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            ))}
            <View style={{ height: 40 }} />
          </ScrollView>
        )
      }
    </View>
  );
}

const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: '#f8f9fa', paddingTop: 60, paddingHorizontal: 20 },
  header:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  logo:              { fontSize: 24, fontWeight: 'bold', color: '#1a1a1a' },
  nutzer:            { fontSize: 13, color: '#888', marginTop: 2 },
  logoutBtn:         { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff' },
  logoutText:        { fontSize: 13, color: '#666' },
  fehler:            { color: '#c62828', fontSize: 13, marginBottom: 12, textAlign: 'center' },
  neuZeile:          { flexDirection: 'row', gap: 10, marginBottom: 20 },
  input:             { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 15, backgroundColor: '#fff' },
  addBtn:            { width: 48, height: 48, borderRadius: 10, backgroundColor: '#4CAF50', alignItems: 'center', justifyContent: 'center' },
  addBtnDeaktiviert: { backgroundColor: '#aaa' },
  addBtnText:        { color: '#fff', fontSize: 26, lineHeight: 30, fontWeight: 'bold' },
  liste:             { flex: 1 },
  leer:              { textAlign: 'center', color: '#aaa', fontSize: 15, marginTop: 60, lineHeight: 24 },
  listeItem:         { backgroundColor: '#fff', borderRadius: 12, marginBottom: 10, paddingHorizontal: 16, paddingVertical: 4, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  listenName:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  listenNameText:    { fontSize: 17, fontWeight: '500', color: '#1a1a1a', flex: 1 },
  listenPfeil:       { fontSize: 18, color: '#ccc' },
  aktionen:          { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingVertical: 8, gap: 4 },
  aktionBtn:         { flex: 1, alignItems: 'center', paddingVertical: 4 },
  aktionIcon:        { fontSize: 18 },
  umbenennenZeile:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  umbenennenInput:   { flex: 1, borderWidth: 1, borderColor: '#4CAF50', borderRadius: 8, padding: 8, fontSize: 15 },
  okBtn:             { width: 36, height: 36, borderRadius: 8, backgroundColor: '#4CAF50', alignItems: 'center', justifyContent: 'center' },
  okBtnText:         { color: '#fff', fontWeight: 'bold' },
  abbrechenBtn:      { width: 36, height: 36, borderRadius: 8, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' },
  abbrechenBtnText:  { color: '#666' },
  loeschenZeile:     { paddingVertical: 12, gap: 8 },
  loeschenFrage:     { fontSize: 14, color: '#333', marginBottom: 8 },
  jaBtn:             { backgroundColor: '#ef5350', borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginBottom: 4 },
  jaBtnText:         { color: '#fff', fontWeight: '600' },
  neinBtn:           { backgroundColor: '#f0f0f0', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  neinBtnText:       { color: '#666' },
});