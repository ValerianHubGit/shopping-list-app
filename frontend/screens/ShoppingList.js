import { StyleSheet, Text, View, TextInput, Button, ScrollView } from 'react-native';
import { useState } from 'react';

export default function ShoppingList() {
  const [artikel, setArtikel] = useState("");
  const [liste, setListe] = useState([]);

  const artikelHinzufuegen = async () => {
    if (artikel.trim() === "") return;

    try {
      const response = await fetch("http://127.0.0.1:8000/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: artikel })
      });
      const neuesProdukt = await response.json();
      setListe([...liste, {
        name: neuesProdukt.name,
        kategorie: neuesProdukt.category_name,
        unterkategorie: neuesProdukt.subcategory_name
      }]);
      setArtikel("");
    } catch (fehler) {
      console.error("Fehler beim Hinzufügen:", fehler);
    }
  };

  // Definierte Reihenfolge der Kategorien
const KATEGORIEREIHENFOLGE = ["Ungekühltes", "Gekühltes", "Tiefgekühltes"];

const gruppierteListe = () => {
    const gruppen = {};
    liste.forEach(item => {
      const kat = item.kategorie || "Sonstiges";
      const subkat = item.unterkategorie || null;
      if (!gruppen[kat]) gruppen[kat] = {};
      if (subkat) {
        if (!gruppen[kat][subkat]) gruppen[kat][subkat] = [];
        gruppen[kat][subkat].push(item.name);
      } else {
        if (!gruppen[kat]["__ohne__"]) gruppen[kat]["__ohne__"] = [];
        gruppen[kat]["__ohne__"].push(item.name);
      }
    });
    return gruppen;
  };
  // Kategorien in definierter Reihenfolge, Sonstiges immer zuletzt
const gruppen = gruppierteListe();
const sortiertKategorien = [
  ...KATEGORIEREIHENFOLGE.filter(k => gruppen[k]),
  ...Object.keys(gruppen).filter(k => !KATEGORIEREIHENFOLGE.includes(k))
];


  return (
    <View style={styles.container}>
      <Text style={styles.title}>🛒 Meine Einkaufsliste</Text>
      <TextInput
        style={styles.input}
        placeholder="Bitte Artikel eingeben"
        value={artikel}
        onChangeText={setArtikel}
      />
      <Button title="Hinzufügen" onPress={artikelHinzufuegen} />

      {/* Kategorisierte Liste */}
      <ScrollView style={styles.liste}>
            {sortiertKategorien.map(kategorie => (
            <View key={kategorie}>
                <Text style={styles.kategorieHeader}>{kategorie}</Text>
                {Object.keys(gruppen[kategorie]).map(unterkategorie => (
                <View key={unterkategorie}>
                    {/* Unterkategorie nur anzeigen wenn vorhanden */}
                    {unterkategorie !== "__ohne__" && (
                    <Text style={styles.unterkategorieHeader}>{unterkategorie}</Text>
                    )}
                    {gruppen[kategorie][unterkategorie].map(produktName => (
                    <Text key={produktName} style={styles.produkt}>• {produktName}</Text>
                    ))}
                </View>
            ))}
            </View>
        ))}
        </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  input: {
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  liste: {
    marginTop: 20,
  },
  kategorieHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 4,
    color: '#333',
  },
  unterkategorieHeader: {
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 12,
    marginTop: 8,
    marginBottom: 4,
    color: '#555',
  },
  produkt: {
    fontSize: 14,
    marginLeft: 24,
    marginBottom: 2,
    color: '#777',
  },
});