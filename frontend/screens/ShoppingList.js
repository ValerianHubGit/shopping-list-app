import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useState } from 'react';

// ─── Konfiguration ────────────────────────────────────────────────────────────
// Android-Emulator: 10.0.2.2 | Echtes Gerät / Expo Go: deine lokale IP z.B. 192.168.x.x / 127.0.1.0.1:8000
//const API_BASE = "http://10.0.2.2:8000";
const API_BASE = "http://localhost:8000";
const LIST_ID = 1; // Wir arbeiten vorerst immer mit Liste 1

// Definierte Reihenfolge der Oberkategorien
const KATEGORIEREIHENFOLGE = ["Ungekühltes", "Gekühltes", "Tiefgekühltes"];

// ─── Hauptkomponente ──────────────────────────────────────────────────────────
export default function ShoppingList() {

  // artikel = aktueller Text im Eingabefeld
  const [artikel, setArtikel] = useState("");

  // liste = alle aktiven Einträge (noch nicht im Wagen)
  // Struktur je Eintrag: { id, product_id, name, kategorie, unterkategorie, is_in_cart }
  const [liste, setListe] = useState([]);

  // laedt = true während API-Call läuft → Button deaktivieren
  const [laedt, setLaedt] = useState(false);

  // ─── Produkt hinzufügen ─────────────────────────────────────────────────────
  const artikelHinzufuegen = async () => {
    if (artikel.trim() === "") return;
    setLaedt(true);

    try {
      // Schritt 1: Produkt in DB anlegen / abrufen (mit Kategorie-Info)
      const produktAntwort = await fetch(`${API_BASE}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: artikel.trim() })
      });
      const produkt = await produktAntwort.json();

      // Schritt 2: ShoppingListItem anlegen → gibt uns die item_id
      const itemAntwort = await fetch(`${API_BASE}/lists/${LIST_ID}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: produkt.id })
      });
      const neuesItem = await itemAntwort.json();

      // Schritt 3: State um vollständigen Eintrag erweitern
      setListe(vorherige => [...vorherige, {
        id: neuesItem.id,           // ShoppingListItem-ID → für PATCH-Call
        product_id: produkt.id,
        name: produkt.name,
        kategorie: produkt.category_name || "Sonstiges",
        unterkategorie: produkt.subcategory_name || null,
        is_in_cart: false,
      }]);

      setArtikel("");
    } catch (fehler) {
      console.error("Fehler beim Hinzufügen:", fehler);
    } finally {
      setLaedt(false);
    }
  };

  // ─── Checkbox: Eintrag in Warenkorb verschieben ─────────────────────────────
  const warenkorbToggle = async (itemId) => {
    try {
      // Backend informieren
      await fetch(`${API_BASE}/lists/${LIST_ID}/items/${itemId}/cart`, {
        method: "PATCH",
      });

      // Lokalen State updaten
      setListe(vorherige =>
        vorherige.map(item =>
          item.id === itemId
            ? { ...item, is_in_cart: !item.is_in_cart }
            : item
        )
      );
    } catch (fehler) {
      console.error("Fehler beim Warenkorb-Toggle:", fehler);
    }
  };

  // ─── Liste gruppieren ───────────────────────────────────────────────────────
  const gruppierteListe = (items) => {
    const gruppen = {};
    items.forEach(item => {
      const kat = item.kategorie || "Sonstiges";
      const subkat = item.unterkategorie || "__ohne__";
      if (!gruppen[kat]) gruppen[kat] = {};
      if (!gruppen[kat][subkat]) gruppen[kat][subkat] = [];
      gruppen[kat][subkat].push(item);
    });
    return gruppen;
  };

  // Aktive Items (noch nicht im Wagen)
  const aktiveItems = liste.filter(i => !i.is_in_cart);
  const warenkorbItems = liste.filter(i => i.is_in_cart);

  const gruppen = gruppierteListe(aktiveItems);
  const sortiertKategorien = [
    ...KATEGORIEREIHENFOLGE.filter(k => gruppen[k]),
    ...Object.keys(gruppen).filter(k => !KATEGORIEREIHENFOLGE.includes(k))
  ];

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <Text style={styles.title}>🛒 Meine Einkaufsliste</Text>

      {/* Eingabebereich */}
      <View style={styles.eingabeZeile}>
        <TextInput
          style={styles.input}
          placeholder="Artikel eingeben..."
          value={artikel}
          onChangeText={setArtikel}
          onSubmitEditing={artikelHinzufuegen}
          returnKeyType="done"
          editable={!laedt}
        />
        <TouchableOpacity
          style={[styles.button, laedt && styles.buttonDeaktiviert]}
          onPress={artikelHinzufuegen}
          disabled={laedt}
        >
          {laedt
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.buttonText}>+</Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.liste} showsVerticalScrollIndicator={false}>

        {/* ── Aktive Einkaufsliste ── */}
        {sortiertKategorien.map(kategorie => (
          <View key={kategorie}>
            <Text style={styles.kategorieHeader}>{kategorie}</Text>
            {Object.keys(gruppen[kategorie]).map(unterkategorie => (
              <View key={unterkategorie}>
                {unterkategorie !== "__ohne__" && (
                  <Text style={styles.unterkategorieHeader}>{unterkategorie}</Text>
                )}
                {gruppen[kategorie][unterkategorie].map(item => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.produktZeile}
                    onPress={() => warenkorbToggle(item.id)}
                    activeOpacity={0.6}
                  >
                    {/* Checkbox */}
                    <View style={styles.checkbox} />
                    <Text style={styles.produktText}>{item.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
        ))}

        {/* ── Warenkorb-Bereich ── */}
        {warenkorbItems.length > 0 && (
          <View style={styles.warenkorbContainer}>
            <Text style={styles.warenkorbHeader}>✓ Im Einkaufswagen</Text>
            {warenkorbItems.map(item => (
              <TouchableOpacity
                key={item.id}
                style={styles.produktZeile}
                onPress={() => warenkorbToggle(item.id)}
                activeOpacity={0.6}
              >
                {/* Checkbox ausgefüllt */}
                <View style={styles.checkboxAktiv}>
                  <Text style={styles.checkboxHaken}>✓</Text>
                </View>
                <Text style={styles.produktTextErledigt}>{item.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Abstand unten damit letzter Eintrag nicht am Rand klebt */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#1a1a1a',
  },

  // Eingabe
  eingabeZeile: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#fff',
  },
  button: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDeaktiviert: {
    backgroundColor: '#aaa',
  },
  buttonText: {
    color: '#fff',
    fontSize: 26,
    lineHeight: 30,
    fontWeight: 'bold',
  },

  // Liste
  liste: {
    marginTop: 10,
  },
  kategorieHeader: {
    fontSize: 17,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 4,
    color: '#222',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    paddingBottom: 4,
  },
  unterkategorieHeader: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
    marginTop: 10,
    marginBottom: 4,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Produktzeile
  produktZeile: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#bbb',
    marginRight: 12,
  },
  checkboxAktiv: {
    width: 22,
    height: 22,
    borderRadius: 5,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: '#4CAF50',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxHaken: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  produktText: {
    fontSize: 16,
    color: '#333',
  },
  produktTextErledigt: {
    fontSize: 16,
    color: '#aaa',
    textDecorationLine: 'line-through',
  },

  // Warenkorb
  warenkorbContainer: {
    marginTop: 30,
    paddingTop: 10,
    borderTopWidth: 2,
    borderTopColor: '#e0e0e0',
  },
  warenkorbHeader: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 8,
  },
});