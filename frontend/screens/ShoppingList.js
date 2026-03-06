import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, Platform, PanResponder,
  Animated,
} from 'react-native';
import { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = "http://192.168.178.77:8000";
const KATEGORIEREIHENFOLGE = ["Ungekühltes", "Gekühltes", "Tiefgekühltes"];
const PANEL_BREITE_FALLBACK = 240;
const DRAG_SCHWELLE = 6;

// ─── Listen-Menü Popup ───────────────────────────────────────────────────────
function ListenMenuPopup({ onSchliessen, onAktion }) {
  const overlayStyle = Platform.OS === 'web'
    ? { ...listenMenuStyles.overlay, position: 'fixed' }
    : listenMenuStyles.overlay;
  return (
    <View style={overlayStyle}>
      <View style={listenMenuStyles.box}>
        <Text style={listenMenuStyles.titel}>🗂 Liste verwalten</Text>
        <TouchableOpacity style={listenMenuStyles.option} onPress={() => onAktion('back')}>
          <Text style={listenMenuStyles.optionIcon}>←</Text>
          <View style={listenMenuStyles.optionText}>
            <Text style={listenMenuStyles.optionTitel}>Zur Listenübersicht</Text>
            <Text style={listenMenuStyles.optionBeschreibung}>Aktuelle Liste verlassen</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={listenMenuStyles.option} onPress={() => onAktion('reset')}>
          <Text style={listenMenuStyles.optionIcon}>↩️</Text>
          <View style={listenMenuStyles.optionText}>
            <Text style={listenMenuStyles.optionTitel}>Liste zurücksetzen</Text>
            <Text style={listenMenuStyles.optionBeschreibung}>Alle Einkaufswagenartikel zurück in die offene Liste</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={listenMenuStyles.option} onPress={() => onAktion('clearCart')}>
          <Text style={listenMenuStyles.optionIcon}>🧹</Text>
          <View style={listenMenuStyles.optionText}>
            <Text style={listenMenuStyles.optionTitel}>Einkaufswagen leeren</Text>
            <Text style={listenMenuStyles.optionBeschreibung}>Gekaufte Artikel löschen, offene behalten</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={[listenMenuStyles.option, listenMenuStyles.optionGefaehrlich]} onPress={() => onAktion('clearAll')}>
          <Text style={listenMenuStyles.optionIcon}>🗑️</Text>
          <View style={listenMenuStyles.optionText}>
            <Text style={[listenMenuStyles.optionTitel, listenMenuStyles.optionTitelRot]}>Liste vollständig leeren</Text>
            <Text style={listenMenuStyles.optionBeschreibung}>Alle Artikel unwiderruflich löschen</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={listenMenuStyles.abbrechen} onPress={onSchliessen}>
          <Text style={listenMenuStyles.abbrechenText}>Abbrechen</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function BestatigungsModal({ sichtbar, titel, nachricht, onJa, onNein, onJaLabel }) {
  if (!sichtbar) return null;
  const overlayStyle = Platform.OS === 'web'
    ? { ...modalStyles.overlay, position: 'fixed' }
    : modalStyles.overlay;
  return (
    <View style={overlayStyle}>
      <View style={modalStyles.box}>
        <Text style={modalStyles.titel}>{titel}</Text>
        <Text style={modalStyles.nachricht}>{nachricht}</Text>
        <View style={modalStyles.buttons}>
          <TouchableOpacity style={modalStyles.buttonNein} onPress={onNein}>
            <Text style={modalStyles.buttonNeinText}>Abbrechen</Text>
          </TouchableOpacity>
          <TouchableOpacity style={modalStyles.buttonJa} onPress={onJa}>
            <Text style={modalStyles.buttonJaText}>{onJaLabel ?? 'Ja, hinzufügen'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────
export default function ShoppingList({ listId, listName, auth, onZurueck, onLogout }) {
  const [artikel, setArtikel] = useState("");
  // Auth-Header als Ref — stabile Referenz für useCallback mit [] deps
  const authHeadersRef = useRef({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${auth.token}`,
  });
  // Immer aktuell halten
  authHeadersRef.current = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${auth.token}`,
  };
  const [liste, setListe] = useState([]);
  const [laedt, setLaedt] = useState(false);
  const [modal, setModal] = useState(null);
  const [alleKategorien, setAlleKategorien] = useState([]);
  const alleKategorienRef = useRef([]);
  const [hoveredKat, setHoveredKat] = useState(null); // ID der aktuell gehoverten Kategorie
  const [panelBreite, setPanelBreite] = useState(PANEL_BREITE_FALLBACK);
  const panelBreiteRef = useRef(PANEL_BREITE_FALLBACK); // Sync-Ref für Animationen
  const [dragItem, setDragItem] = useState(null);
  const [activeDropZone, setActiveDropZone] = useState(null);
  const [listenMenu, setListenMenu] = useState(false);     // Popup offen?
  const [listenBestaetigung, setListenBestaetigung] = useState(null); // {aktion, text}

  const dragX = useRef(new Animated.Value(-9999)).current;
  const dragY = useRef(new Animated.Value(-9999)).current;
  const panelTranslateX = useRef(new Animated.Value(PANEL_BREITE_FALLBACK)).current;
  const contentPaddingRight = useRef(new Animated.Value(0)).current;

  // ─── Refs ──────────────────────────────────────────────────────────────────
  const listRef       = useRef([]);
  const alleKatRef    = useRef([]);
  const dragItemRef   = useRef(null);
  const isDragging    = useRef(false);
  const startPos      = useRef({ x: 0, y: 0 });
  const modalOffen    = useRef(false);

  // Web: DOM-Nodes direkt (kein data-Attribut, kein elementsFromPoint)
  const itemNodes     = useRef({}); // id → DOM node
  const zoneNodes     = useRef({}); // key → DOM node
  const ghostNode     = useRef(null);
  const grabOffsetRef     = useRef({ x: 0, y: 0, rowW: 0, rowH: 0, rowX: 0, rowY: 0 });
  const grabNativeOffset  = useRef({ dx: 0, dy: 0 }); // Finger-Offset innerhalb Item (Native)
  const pressInPos        = useRef({ x: 0, y: 0 });   // pageX/Y bei onPressIn (Native)
  const isPointerDown    = useRef(false); // true nur solange Maustaste gehalten wird
  const dragEndedRef      = useRef(false);  // true direkt nach Drag-Ende → nächsten click unterdrücken
  const scrollViewRef     = useRef(null);   // ScrollView ref für native
  const scrollNodeRef     = useRef(null);   // DOM node für web
  const scrollRAF         = useRef(null);   // requestAnimationFrame handle
  const panelViewRef      = useRef(null);   // Native: Panel measureInWindow
  const rootViewRef       = useRef(null);   // Native: Root-View für Koordinaten-Offset
  const rootOffsetRef     = useRef({ x: 0, y: 0 }); // Offset StatusBar/Container
  const panelLayoutRef    = useRef(null);   // Native: Panel absolute {x,y,w,h}
  const panelAbsYRef      = useRef(0);      // Native: Panel absolute Y nach Animation
  const zoneLayoutsRef    = useRef({});     // Native: Zone onLayout relative {y,h}
  const scrollOffsetRef   = useRef(0);      // aktueller Scroll-Offset
  const scrollLayoutRef   = useRef(null);   // {y, height} der ScrollView (native)

  // Native
  const itemViewRefs  = useRef({});
  const itemPosRefs   = useRef({});
  const zonePosRefs   = useRef({});

  // Callback-Refs (useEffect bleibt [])
  const onDropRef       = useRef(null);
  const onTapRef        = useRef(null);
  const panelEinRef     = useRef(null);
  const dragBeendenRef  = useRef(null);

  useEffect(() => {
    listRef.current = liste;
    // Nach Render: Item-Positionen frisch messen (Native)
    if (Platform.OS !== 'web') {
      const t = setTimeout(() => zonenMessenRef.current?.(), 150);
      return () => clearTimeout(t);
    }
  }, [liste]);
  useEffect(() => { alleKatRef.current = alleKategorien; }, [alleKategorien]);
  useEffect(() => { modalOffen.current = modal !== null || listenMenu || listenBestaetigung !== null; }, [modal, listenMenu, listenBestaetigung]);

  // Wenn hoveredKat wechselt: alle sub_* Zonen sofort aus zonePosRefs löschen.
  // Verhindert, dass veraltete Sub-Positionen die Zone-Erkennung verfälschen.
  useEffect(() => {
    Object.keys(zonePosRefs.current).forEach(key => {
      if (key.startsWith('sub_')) delete zonePosRefs.current[key];
    });
  }, [hoveredKat]);

  // Wenn panelBreite sich ändert und das Panel gerade geschlossen ist,
  // panelTranslateX auf neuen Wert setzen damit es korrekt versteckt bleibt.
  useEffect(() => {
    if (!isDragging.current) {
      panelTranslateX.setValue(panelBreite);
    }
  }, [panelBreite, panelTranslateX]);

  // ─── Initial-Load ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [ir, kr] = await Promise.all([
          fetch(`${API_BASE}/lists/${listId}/items`, { headers: authHeadersRef.current }),
          fetch(`${API_BASE}/categories`, { headers: authHeadersRef.current }),
        ]);
        if (ir.status === 401) { onLogout(); return; }
        const rawItems = await ir.json();
        const kats  = await kr.json();
        // Explizites Mapping — stellt sicher dass id-Feld vorhanden ist
        const items = Array.isArray(rawItems) ? rawItems.map(i => ({
          id: i.id,
          product_id: i.product_id,
          name: i.name || '',
          kategorie: i.kategorie || 'Sonstiges',
          unterkategorie: i.unterkategorie || null,
          is_in_cart: i.is_in_cart || false,
        })) : [];
        setListe(items);
        setAlleKategorien(kats);
    alleKategorienRef.current = kats;
      } catch (e) { console.error(e); }
    })();
  }, []);

  // ─── Web: BoundingClientRect-basierte Suche ────────────────────────────────
  const rectVon = (node) => {
    if (!node) return null;
    try {
      const r = node.getBoundingClientRect?.();
      if (r && r.width > 0) return { x: r.left, y: r.top, w: r.width, h: r.height };
    } catch (_) {}
    return null;
  };

  const trifft = (px, py, r) =>
    r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;

  const findeItemWeb = (px, py) => {
    if (typeof document === 'undefined') return null;
    // Primär: BoundingClientRect auf gespeicherten Nodes
    for (const item of listRef.current) {
      const node = itemNodes.current[String(item.id)];
      if (trifft(px, py, rectVon(node))) return item;
    }
    // Fallback: data-item-id Attribut via elementsFromPoint
    const els = document.elementsFromPoint(px, py);
    for (const el of els) {
      const id = el.getAttribute?.('data-item-id');
      if (id) return listRef.current.find(i => String(i.id) === id) ?? null;
    }
    return null;
  };

  const ermittleZoneWeb = (px, py) => {
    if (typeof document === 'undefined') return null;
    // Ghost hat pointer-events:none → wird von elementsFromPoint übersprungen
    const els = document.elementsFromPoint(px, py);
    for (const el of els) {
      const zone = el.getAttribute?.('data-zone');
      if (zone) return zone;
    }
    // Fallback: BoundingClientRect auf gespeicherten Nodes
    for (const [key, node] of Object.entries(zoneNodes.current)) {
      if (node && trifft(px, py, rectVon(node))) return key;
    }
    return null;
  };

  // ─── Native: koordinatenbasierte Suche ────────────────────────────────────
  const findeItemNative = (px, py) => {
    for (const item of listRef.current) {
      if (trifft(px, py, itemPosRefs.current[item.id])) return item;
    }
    return null;
  };

  const ermittleZoneNative = (px, py) => {
    const entries = Object.entries(zonePosRefs.current);
    if (entries.length === 0) {
      console.log('[DnD] zonePosRefs LEER');
      return null;
    }
    console.log('[DnD] Finger:', px.toFixed(0), py.toFixed(0), 'rootOff:', rootOffsetRef.current.x.toFixed(0), rootOffsetRef.current.y.toFixed(0));
    entries.forEach(([k, r]) => console.log('[DnD] Zone', k, 'x:', r.x?.toFixed(0), 'y:', r.y?.toFixed(0), 'w:', r.w?.toFixed(0), 'h:', r.h?.toFixed(0)));
    let beste = null, besteH = Infinity;
    for (const [key, r] of entries) {
      if (trifft(px, py, r) && r.h < besteH) {
        beste = key;
        besteH = r.h;
      }
    }
    return beste;
  };

  const findeItem    = Platform.OS === 'web' ? findeItemWeb    : findeItemNative;
  const ermittleZone = Platform.OS === 'web' ? ermittleZoneWeb : ermittleZoneNative;

  // Native: Zonen via measureInWindow nach Panel-Animation
  const zonenMessenRef = useRef(null);
  const zonenMessen = useCallback(() => {
    if (Platform.OS === 'web') return;
    // Items messen
    Object.entries(itemViewRefs.current).forEach(([id, ref]) => {
      ref?.measureInWindow?.((x, y, w, h) => {
        if (w > 0) itemPosRefs.current[id] = { x, y, w, h };
      });
    });
    // Veraltete sub_* Zonen aus geschlossenen Kategorien entfernen.
    // Nur Nodes die aktuell im zoneNodes.current stehen (= sichtbar gemountet)
    // werden gemessen. Alle anderen sub_* werden gelöscht.
    Object.keys(zonePosRefs.current).forEach(key => {
      if (key.startsWith('sub_') && !zoneNodes.current[key]) {
        delete zonePosRefs.current[key];
      }
    });
    // Alle sichtbaren Zonen direkt messen (Panel muss eingefahren sein)
    Object.entries(zoneNodes.current).forEach(([key, ref]) => {
      ref?.measureInWindow?.((x, y, w, h) => {
        if (h > 0) zonePosRefs.current[key] = { x, y, w, h };
      });
    });
    const zm = Object.entries(zonePosRefs.current).map(([k,r]) => `${k}:y${r.y?.toFixed(0)}-${(r.y+r.h)?.toFixed(0)}`).join(' ');
    console.log('[DnD] Zonen:', zm);
  }, []);
  zonenMessenRef.current = zonenMessen;

  // ─── Panel-Breite auto-messen ─────────────────────────────────────────────
  // Die Messlage (opacity:0, left:-9999) rendert alle Texte unkonstrained.
  // onPanelTextMessen wird für jeden Text aufgerufen und setzt die Panel-
  // Breite auf das nötige Minimum (längster Text + Padding + Extras).
  const maxGemesseneBreite = useRef(0);
  const onPanelTextMessen = useCallback((e, typ) => {
    const textBreite = e.nativeEvent.layout.width;
    let benoetigt;
    if (typ === 'kat') {
      // paddingHorizontal:16 + paddingHorizontal:16 + Pfeil(11px) + Gap(8px)
      benoetigt = textBreite + 32 + 19;
    } else if (typ === 'sub') {
      // paddingHorizontal:16 + paddingHorizontal:16
      benoetigt = textBreite + 32;
    } else {
      // trash label: margin:12*2 + padding:14*2
      benoetigt = textBreite + 52;
    }
    if (benoetigt > maxGemesseneBreite.current) {
      maxGemesseneBreite.current = benoetigt;
      const neu = Math.ceil(benoetigt) + 2; // 2px Sicherheitspuffer
      panelBreiteRef.current = neu;
      setPanelBreite(neu);
    }
  }, []);


  // ─── Panel-Animation ──────────────────────────────────────────────────────
  // Auto-Scroll während Drag
  const SCROLL_ZONE = 80;  // px vom Rand → Scroll startet
  const SCROLL_SPEED = 12; // px pro Frame

  const autoScrollStop = () => {
    if (scrollRAF.current) {
      cancelAnimationFrame(scrollRAF.current);
      scrollRAF.current = null;
    }
  };

  const autoScrollTick = (py) => {
    autoScrollStop();
    const doScroll = () => {
      if (!isDragging.current) return;

      if (Platform.OS === 'web') {
        const node = scrollNodeRef.current;
        if (!node) return;
        const r = node.getBoundingClientRect();
        const distTop = py - r.top;
        const distBot = r.bottom - py;
        const inListArea = px >= r.left && px <= r.right;
        if (inListArea) {
          if (distTop < SCROLL_ZONE) {
            node.scrollTop -= SCROLL_SPEED * (1 - distTop / SCROLL_ZONE);
          } else if (distBot < SCROLL_ZONE) {
            node.scrollTop += SCROLL_SPEED * (1 - distBot / SCROLL_ZONE);
          }
        }
      } else {
        // Native: ScrollView.scrollTo
        const sv = scrollViewRef.current;
        if (!sv) return;
        // Native auto-scroll handled via layout measurement (simplified)
      }
      scrollRAF.current = requestAnimationFrame(() => doScroll());
    };
    scrollRAF.current = requestAnimationFrame(doScroll);
  };

  const panelEin = useCallback(() => {
    Animated.parallel([
      Animated.spring(panelTranslateX,    { toValue: 0,           useNativeDriver: false, tension: 80, friction: 12 }),
      Animated.spring(contentPaddingRight, { toValue: panelBreiteRef.current, useNativeDriver: false, tension: 80, friction: 12 }),
    ]).start(({ finished }) => { if (finished) zonenMessen(); });
  }, [zonenMessen]);
  panelEinRef.current = panelEin;

  const panelAus = useCallback(() => {
    Animated.parallel([
      Animated.spring(panelTranslateX,    { toValue: panelBreiteRef.current, useNativeDriver: false, tension: 80, friction: 12 }),
      Animated.spring(contentPaddingRight, { toValue: 0,            useNativeDriver: false, tension: 80, friction: 12 }),
    ]).start();
  }, []);

  // ─── Drag beenden ─────────────────────────────────────────────────────────
  const dragBeenden = useCallback(() => {
    if (isDragging.current) dragEndedRef.current = true;
    autoScrollStop();
    isDragging.current    = false;
    isPointerDown.current = false;
    dragItemRef.current   = null;
    setDragItem(null);
    setActiveDropZone(null);
    setHoveredKat(null);
    panelAus();
    dragX.setValue(-9999);
    dragY.setValue(-9999);
    if (Platform.OS === 'web') {
      document.body.style.userSelect = '';
      document.body.style.cursor     = '';
    }
  }, [panelAus]);
  dragBeendenRef.current = dragBeenden;

  // ─── Web: window-level capture listener ──────────────────────────────────
  // window capture feuert VOR document capture —
  // RNW's Event-Delegation sitzt auf document, kann unsere Listener nicht mehr blockieren
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const onDown = (e) => {
      // Wenn Drag läuft: pointerdown = zweiter Klick zum Abbrechen → Drag beenden
      if (isDragging.current) {
        dragBeendenRef.current();
        return;
      }
      if (modalOffen.current) return;
      startPos.current  = { x: e.clientX, y: e.clientY };
      isPointerDown.current = true;
      document.body.style.userSelect = 'none';
      // Grab-Offset: wo innerhalb der Zeile wurde geklickt?
      const item = findeItemWeb(e.clientX, e.clientY);
      if (item) {
        const node = itemNodes.current[String(item.id)];
        const r = node?.getBoundingClientRect?.();
        if (r) {
          grabOffsetRef.current = {
            x: e.clientX - r.left,
            y: e.clientY - r.top,
            rowW: r.width,
            rowH: r.height,
            rowX: r.left,
            rowY: r.top,
          };
        }
      }
    };

    const onMove = (e) => {
      const px = e.clientX, py = e.clientY;
      const dx = Math.abs(px - startPos.current.x);
      const dy = Math.abs(py - startPos.current.y);

      if (!isDragging.current && isPointerDown.current && (dx > DRAG_SCHWELLE || dy > DRAG_SCHWELLE)) {
        if (modalOffen.current) return;
        const item = findeItemWeb(startPos.current.x, startPos.current.y);
        if (item) {
          isDragging.current  = true;
          dragItemRef.current = item;
          setDragItem(item);
          document.body.style.cursor = 'grabbing';
          panelEinRef.current();
        }
      }

      if (isDragging.current) {
        // Ghost auf Fingertip zentriert — Detection ebenfalls bei (px, py)
        dragX.setValue(px - (grabOffsetRef.current.rowW || 120) / 2);
        dragY.setValue(py - (grabOffsetRef.current.rowH || 22) / 2);
        autoScrollTick(py);
        const zone = ermittleZoneWeb(px, py);
        setActiveDropZone(zone);
        // Welche Oberkategorie wird gehovered?
        if (zone?.startsWith('sub_')) {
          // Finde Oberkategorie der gehoverten Unterkategorie
          const subId = parseInt(zone.replace('sub_', ''));
          const kat = alleKatRef.current.find(k =>
            (k.subcategories || []).some(s => s.id === subId)
          );
          setHoveredKat(kat?.id ?? null);
        } else if (zone?.startsWith('kat_')) {
          setHoveredKat(parseInt(zone.replace('kat_', '')));
        } else {
          setHoveredKat(null);
        }
        e.preventDefault();
      }
    };

    const onUp = (e) => {
      isPointerDown.current = false;
      if (!isDragging.current) return; // kein aktiver Drag → ignorieren
      const px = e.clientX, py = e.clientY;
      const item = dragItemRef.current;
      // Zone VOR dragBeenden ermitteln — Nodes sind danach ggf. unmountet
      const zone = ermittleZoneWeb(px, py);
      dragBeendenRef.current();
      if (item && zone) onDropRef.current?.(item, zone);
    };

    const onUpMouse = (e) => {
      // mouseup als Fallback falls pointerup nicht feuert
      onUp({ clientX: e.clientX, clientY: e.clientY });
    };

    // window + capture:true → feuert vor RNW's document-delegation
    // Tap-Erkennung via 'click' Event (sauber getrennt von Drag)
    const onClick = (e) => {
      // Immer unterdrücken wenn Modal/Menü offen — Click gehört dem Popup, nicht der Liste
      if (modalOffen.current) {
        return;
      }
      if (isDragging.current || dragEndedRef.current) {
        dragEndedRef.current = false;
        e.stopPropagation();
        return;
      }
      const tap = findeItemWeb(e.clientX, e.clientY);
      if (tap) onTapRef.current?.(tap.id);
    };
    window.addEventListener('click', onClick, { capture: true });
    window.addEventListener('pointerdown',  onDown,    { capture: true });
    window.addEventListener('pointermove',  onMove,    { capture: true, passive: false });
    window.addEventListener('pointerup',    onUp,      { capture: true });
    window.addEventListener('pointercancel',onUp,      { capture: true });
    window.addEventListener('mouseup',      onUpMouse, { capture: true });

    return () => {
      window.removeEventListener('click',         onClick,   { capture: true });
      window.removeEventListener('pointerdown',  onDown,    { capture: true });
      window.removeEventListener('pointermove',  onMove,    { capture: true });
      window.removeEventListener('pointerup',    onUp,      { capture: true });
      window.removeEventListener('pointercancel',onUp,      { capture: true });
      window.removeEventListener('mouseup',      onUpMouse, { capture: true });
    };
  }, []); // Einmalig — alles via Refs

  // ─── Native PanResponder ──────────────────────────────────────────────────
  const panResponder = useRef(PanResponder.create({
    // Nicht sofort klauen — erst wenn Drag-Schwelle überschritten wird
    onStartShouldSetPanResponder:        () => false,
    onMoveShouldSetPanResponder:         (_, gs) =>
      isDragging.current ||
      (!modalOffen.current && (Math.abs(gs.dx) > DRAG_SCHWELLE || Math.abs(gs.dy) > DRAG_SCHWELLE)),
    onStartShouldSetPanResponderCapture: () => isDragging.current,
    onMoveShouldSetPanResponderCapture:  () => isDragging.current,
    onPanResponderGrant: (e) => {
      const { pageX, pageY } = e.nativeEvent;
      // Nur überschreiben wenn Drag noch nicht per Long Press gestartet
      if (!isDragging.current) {
        startPos.current = { x: pageX, y: pageY };
        zonenMessenRef.current?.();
      }
    },
    onPanResponderMove: (e) => {
      const { pageX, pageY } = e.nativeEvent;
      const dx = Math.abs(pageX - startPos.current.x);
      const dy = Math.abs(pageY - startPos.current.y);
      if (!isDragging.current && (dx > DRAG_SCHWELLE || dy > DRAG_SCHWELLE)) {
        const item = findeItemNative(startPos.current.x, startPos.current.y);
        if (item) {
          isDragging.current  = true;
          dragItemRef.current = item;
          setDragItem(item);
          panelEinRef.current();
        }
      }
      if (isDragging.current) {
        const rx = rootOffsetRef.current.x;
        const ry = rootOffsetRef.current.y;
        dragX.setValue(pageX - grabNativeOffset.current.dx - rx);
        dragY.setValue(pageY - grabNativeOffset.current.dy - ry);
        const zone = ermittleZoneNative(pageX, pageY);
        if (Math.round(pageY) % 30 === 0) console.log('[DnD] Finger pageY:', pageY.toFixed(0), 'zone:', zone);
        setActiveDropZone(zone);
        // hoveredKat ableiten — analog zu Web-Logik
        if (zone?.startsWith('kat_')) {
          const katId = parseInt(zone.replace('kat_', ''));
          setHoveredKat(prev => {
            if (prev !== katId) {
              // Neue Kat → Subs erscheinen → Zonen nach Render neu messen
              setTimeout(() => zonenMessenRef.current?.(), 150);
            }
            return katId;
          });
        } else if (zone?.startsWith('sub_')) {
          const subId = parseInt(zone.replace('sub_', ''));
          const katObj = alleKategorienRef.current.find(k =>
            (k.subcategories || []).some(s => s.id === subId)
          );
          if (katObj) setHoveredKat(katObj.id ?? null);
        } else {
          // Finger außerhalb Panel
          setHoveredKat(null);
        }
        // Native auto-scroll — nur im Listenbereich (nicht im Panel)
        const sv = scrollViewRef.current;
        if (sv?.scrollTo && scrollLayoutRef.current) {
          const { x: listX, y: listY, width: listW, height: listH } = scrollLayoutRef.current;
          const relY = pageY - listY;
          const inListArea = pageX >= listX && pageX <= listX + listW;
          if (inListArea) {
            if (relY < SCROLL_ZONE) {
              scrollOffsetRef.current = Math.max(0, scrollOffsetRef.current - SCROLL_SPEED);
              sv.scrollTo({ y: scrollOffsetRef.current, animated: false });
            } else if (relY > listH - SCROLL_ZONE) {
              scrollOffsetRef.current += SCROLL_SPEED;
              sv.scrollTo({ y: scrollOffsetRef.current, animated: false });
            }
          }
        }
      }
    },
    onPanResponderRelease: (e) => {
      const { pageX, pageY } = e.nativeEvent;
      const item        = dragItemRef.current;
      const wasDragging = isDragging.current;
      const zone        = wasDragging ? ermittleZoneNative(pageX, pageY) : null;
      dragBeendenRef.current();
      // Taps werden von TouchableOpacity onPress behandelt
      // Hier nur Drag-Drop auflösen
      if (wasDragging && item && zone) {
        onDropRef.current?.(item, zone);
      }
    },
    onPanResponderTerminate: () => { dragBeendenRef.current(); },
  })).current;

  // ─── Aktionen ─────────────────────────────────────────────────────────────
  const itemLoeschen = useCallback(async (item) => {
    try {
      await fetch(`${API_BASE}/lists/${listId}/items/${item.id}`, { method: 'DELETE', headers: authHeadersRef.current });
      setListe(v => v.filter(i => i.id !== item.id));
    } catch (e) { console.error(e); }
  }, []);

  const unterkategorieAendern = useCallback(async (item, subId) => {
    try {
      await fetch(`${API_BASE}/lists/${listId}/items/${item.id}/subcategory`, {
        method: 'PATCH',
        headers: authHeadersRef.current,
        body: JSON.stringify({ subcategory_id: subId }),
      });
      let newKat = 'Sonstiges', newSub = null;
      for (const k of alleKatRef.current) {
        const s = (k.subcategories || []).find(s => s.id === subId);
        if (s) { newKat = k.name; newSub = s.name; break; }
      }
      if (item.is_in_cart) {
        await fetch(`${API_BASE}/lists/${listId}/items/${item.id}/cart`, { method: 'PATCH', headers: authHeadersRef.current });
      }
      setListe(v => v.map(i => i.id === item.id
        ? { ...i, kategorie: newKat, unterkategorie: newSub, is_in_cart: false } : i));
    } catch (e) { console.error(e); }
  }, []);

  const warenkorbToggle = useCallback(async (itemId) => {
    try {
      await fetch(`${API_BASE}/lists/${listId}/items/${itemId}/cart`, { method: 'PATCH', headers: authHeadersRef.current });
      setListe(v => v.map(i => i.id === itemId ? { ...i, is_in_cart: !i.is_in_cart } : i));
    } catch (e) { console.error(e); }
  }, []);

  const handleDrop = useCallback(async (item, zone) => {
    if (zone === 'trash') {
      await itemLoeschen(item);
    } else if (zone === 'cart') {
      if (!item.is_in_cart) await warenkorbToggle(item.id);
    } else if (zone?.startsWith('kat_')) {
      // Drop auf Oberkategorie → erste Unterkategorie nehmen
      const katId = parseInt(zone.replace('kat_', ''));
      const kat = alleKatRef.current.find(k => k.id === katId);
      const firstSub = (kat?.subcategories || [])[0];
      if (firstSub) await unterkategorieAendern(item, firstSub.id);
    } else {
      const subId = parseInt(zone.replace('sub_', ''));
      await unterkategorieAendern(item, subId);
    }
  }, [itemLoeschen, warenkorbToggle, unterkategorieAendern]);

  // ─── Listen-Aktionen ────────────────────────────────────────────────────────
  const listeLeeren = useCallback(async (nurWarenkorb = false, nurReset = false) => {
    try {
      const zuLoeschen = nurWarenkorb
        ? liste.filter(i => i.is_in_cart)
        : nurReset ? [] : liste;

      if (nurReset) {
        // Alle is_in_cart → false
        const imWarenkorb = liste.filter(i => i.is_in_cart);
        await Promise.all(imWarenkorb.map(i =>
          fetch(`${API_BASE}/lists/${listId}/items/${i.id}/cart`, { method: 'PATCH', headers: authHeadersRef.current })
        ));
        setListe(v => v.map(i => ({ ...i, is_in_cart: false })));
      } else {
        await Promise.all(zuLoeschen.map(i =>
          fetch(`${API_BASE}/lists/${listId}/items/${i.id}`, { method: 'DELETE', headers: authHeadersRef.current })
        ));
        const geloeschteIds = new Set(zuLoeschen.map(i => i.id));
        setListe(v => v.filter(i => !geloeschteIds.has(i.id)));
      }
    } catch (e) { console.error(e); }
  }, [liste]);

  const listenAktionBestaetigen = (aktion) => {
    setListenMenu(false);
    if (aktion === 'back') { onZurueck(); return; }
    const texte = {
      reset:     { frage: 'Liste zurücksetzen?',         details: 'Alle Artikel im Einkaufswagen werden zurück in die offene Liste verschoben.' },
      clearCart: { frage: 'Einkaufswagen leeren?',       details: 'Alle gekauften Artikel werden dauerhaft gelöscht. Offene Artikel bleiben erhalten.' },
      clearAll:  { frage: 'Liste vollständig leeren?',   details: 'Alle Artikel werden unwiderruflich gelöscht.' },
    };
    setListenBestaetigung({ aktion, ...texte[aktion] });
  };

  const listenAktionAusfuehren = async () => {
    const { aktion } = listenBestaetigung;
    setListenBestaetigung(null);
    dragEndedRef.current = true; // unterdrückt den click der durch Bestätigen ausgelöst wird
    if (aktion === 'reset')     await listeLeeren(false, true);
    if (aktion === 'clearCart') await listeLeeren(true,  false);
    if (aktion === 'clearAll')  await listeLeeren(false, false);
  };

  useEffect(() => { onDropRef.current = handleDrop;      }, [handleDrop]);
  useEffect(() => { onTapRef.current  = warenkorbToggle; }, [warenkorbToggle]);

  // ─── Artikel hinzufügen ───────────────────────────────────────────────────
  const itemZurListeHinzufuegen = async (produkt) => {
    try {
      const res = await fetch(`${API_BASE}/lists/${listId}/items`, {
        method: 'POST', headers: authHeadersRef.current,
        body: JSON.stringify({ product_id: produkt.id }),
      });
      const neu = await res.json();
      setListe(v => [...v, {
        id: neu.id, product_id: produkt.id, name: produkt.name,
        kategorie: produkt.category_name || 'Sonstiges',
        unterkategorie: produkt.subcategory_name || null, is_in_cart: false,
      }]);
    } catch (e) { console.error(e); }
    finally { setArtikel(''); setModal(null); setLaedt(false); }
  };

  const artikelHinzufuegen = async () => {
    if (!artikel.trim()) return;
    setLaedt(true);
    try {
      const res  = await fetch(`${API_BASE}/products`, {
        method: 'POST', headers: authHeadersRef.current,
        body: JSON.stringify({ name: artikel.trim() }),
      });
      const prod = await res.json();
      if (liste.find(i => i.product_id === prod.id)) {
        setLaedt(false);
        setModal({ titel: 'Bereits in der Liste',
          nachricht: `"${prod.name}" ist schon eingetragen. Trotzdem nochmal hinzufügen?`,
          onJa: () => itemZurListeHinzufuegen(prod) });
        setArtikel(''); return;
      }
      if (prod.is_new) {
        const katText = prod.category_name
          ? `${prod.category_name}${prod.subcategory_name ? ' › ' + prod.subcategory_name : ''}`
          : 'Keine Kategorie erkannt';
        setLaedt(false);
        setModal({ titel: 'Neues Produkt erkannt',
          nachricht: `"${prod.name}" wurde eingestuft als:\n${katText}\n\nZur Liste hinzufügen?`,
          onJa: () => itemZurListeHinzufuegen(prod) });
        setArtikel(''); return;
      }
      await itemZurListeHinzufuegen(prod);
    } catch (e) { console.error(e); }
    finally { setLaedt(false); }
  };

  // ─── Gruppieren ───────────────────────────────────────────────────────────
  const gruppierteListe = (items) => {
    const g = {};
    items.forEach(item => {
      const k = item.kategorie || 'Sonstiges';
      const s = item.unterkategorie || '__ohne__';
      if (!g[k]) g[k] = {};
      if (!g[k][s]) g[k][s] = [];
      g[k][s].push(item);
    });
    return g;
  };

  const aktiveItems    = liste.filter(i => !i.is_in_cart && i.name);
  const warenkorbItems = liste.filter(i =>  i.is_in_cart);
  const gruppen        = gruppierteListe(aktiveItems);
  // Stabile Kategorie-Reihenfolge: erst KATEGORIEREIHENFOLGE, dann Rest nach DB-Position
  const sortiertKats = [
    ...KATEGORIEREIHENFOLGE.filter(k => gruppen[k]),
    ...Object.keys(gruppen)
      .filter(k => !KATEGORIEREIHENFOLGE.includes(k))
      .sort((a, b) => {
        const posA = alleKategorien.find(k => k.name === a)?.position ?? 99;
        const posB = alleKategorien.find(k => k.name === b)?.position ?? 99;
        return posA - posB;
      }),
  ];

  // ─── Produktzeile ─────────────────────────────────────────────────────────
  const renderZeile = (item) => {
    const isDragged = dragItem !== null && dragItem.id === item.id;
    const refSetter = (node) => {
      if (Platform.OS === 'web') {
        if (node) {
          node.setAttribute?.('data-item-id', String(item.id));
          itemNodes.current[String(item.id)] = node;
        } else {
          delete itemNodes.current[String(item.id)];
        }
      } else {
        itemViewRefs.current[item.id] = node;
        // Position direkt beim Mount messen
        if (node) {
          node.measureInWindow?.((x, y, w, h) => {
            if (w > 0) itemPosRefs.current[item.id] = { x, y, w, h };
          });
        }
      }
    };

    // Native: TouchableOpacity für zuverlässige Taps
    if (Platform.OS !== 'web') {
      return (
        <TouchableOpacity
          key={item.id}
          ref={refSetter}
          activeOpacity={0.7}
          delayLongPress={350}
          onPress={() => {
            if (!isDragging.current) onTapRef.current?.(item.id);
          }}
          onPressIn={e => {
            pressInPos.current = {
              x: e.nativeEvent.pageX,
              y: e.nativeEvent.pageY,
            };
          }}
          onLongPress={() => {
            // Long Press startet den Drag
            // Root-Offset aktuell messen
            rootViewRef.current?.measureInWindow?.((rx, ry) => {
              rootOffsetRef.current = { x: rx, y: ry };
            });
            zonenMessenRef.current?.();
            const pos = itemPosRefs.current[item.id];
            if (pos) {
              const rx = rootOffsetRef.current.x;
              const ry = rootOffsetRef.current.y;
              const px = pressInPos.current.x;
              const py = pressInPos.current.y;
              // Grab-Offset: Finger-Position minus Item-Position, beide in Screen-Koordinaten
              grabNativeOffset.current = {
                dx: px - pos.x,
                dy: py - pos.y,
              };
              // Ghost startet genau an Item-Position (im Root-View-Koordinatensystem)
              dragX.setValue(pos.x - rx);
              dragY.setValue(pos.y - ry);
              startPos.current = { x: px, y: py };
            }
            isDragging.current  = true;
            dragItemRef.current = item;
            setDragItem(item);
            panelEinRef.current?.();
            // Panel nach Animation einmalig verorten (450ms = spring fertig)
            setTimeout(() => zonenMessenRef.current?.(), 450);
          }}
          style={[styles.produktZeile, isDragged && styles.produktZeileDragging]}
        >
          {item.is_in_cart
            ? <View style={styles.checkboxAktiv}><Text style={styles.checkboxHaken}>✓</Text></View>
            : <View style={styles.checkbox} />}
          <Text style={item.is_in_cart ? styles.produktTextErledigt : styles.produktText}>
            {item.name}
          </Text>
          <Text style={styles.dragHandle}>⠿</Text>
        </TouchableOpacity>
      );
    }

    // Web: View mit data-Attributen für pointer-Events
    return (
      <View
        key={item.id}
        ref={refSetter}
        style={[styles.produktZeile, isDragged && styles.produktZeileDragging]}
      >
        {item.is_in_cart
          ? <View style={styles.checkboxAktiv}><Text style={styles.checkboxHaken}>✓</Text></View>
          : <View style={styles.checkbox} />}
        <Text style={item.is_in_cart ? styles.produktTextErledigt : styles.produktText}>
          {item.name}
        </Text>
        <Text style={styles.dragHandle}>⠿</Text>
      </View>
    );
  };

  // ─── Zone-Ref-Setter ──────────────────────────────────────────────────────
  // WICHTIG: zoneRefCache stellt sicher, dass für denselben key immer
  // dieselbe Ref-Funktion zurückgegeben wird. Ohne Cache ruft React bei
  // jedem Re-render die alte Ref mit null auf → löscht zonePosRefs → LEER.
  const zoneRefCache = useRef({});
  const zoneRef = (key) => {
    if (!zoneRefCache.current[key]) {
      zoneRefCache.current[key] = (node) => {
        if (Platform.OS === 'web') {
          if (node) {
            node.setAttribute('data-zone', key);
            zoneNodes.current[key] = node;
          } else {
            delete zoneNodes.current[key];
          }
        } else {
          if (node) {
            zoneNodes.current[key] = node;
          } else {
            delete zoneNodes.current[key];
            // zonePosRefs NICHT löschen — stale Position bleibt bis zur
            // nächsten Messung. Verhindert LEER bei hoveredKat-Wechsel.
          }
        }
      };
    }
    return zoneRefCache.current[key];
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  const rootProps = Platform.OS === 'web'
    ? { style: styles.container }
    : { ...panResponder.panHandlers, style: styles.container };

  return (
    <View
      {...rootProps}
      ref={node => {
        if (Platform.OS !== 'web' && node) {
          rootViewRef.current = node;
          node.measureInWindow?.((x, y) => {
            rootOffsetRef.current = { x, y };
          });
        }
      }}
    >
      {listenMenu && (
        <ListenMenuPopup
          onSchliessen={() => setListenMenu(false)}
          onAktion={listenAktionBestaetigen}
        />
      )}

      {listenBestaetigung && (
        <BestatigungsModal
          sichtbar={true}
          titel={listenBestaetigung.frage}
          nachricht={listenBestaetigung.details}
          onJa={listenAktionAusfuehren}
          onJaLabel="Ja, ausführen"
          onNein={() => setListenBestaetigung(null)}
        />
      )}

      <BestatigungsModal
        sichtbar={modal !== null} titel={modal?.titel}
        nachricht={modal?.nachricht} onJa={modal?.onJa}
        onNein={() => { setModal(null); setLaedt(false); }}
      />

      {/* Ghost */}
      {dragItem && (
        <Animated.View
          pointerEvents="none"
          ref={node => { ghostNode.current = node; }}
          style={[
            styles.dragGhost,
            Platform.OS === 'web' && { position: 'fixed' },
            {
              transform: [{ translateX: dragX }, { translateY: dragY }],
              width: Platform.OS === 'web' ? grabOffsetRef.current.rowW : '100%',
            },
          ]}
        >
          {dragItem.is_in_cart
            ? <View style={styles.checkboxAktiv}><Text style={styles.checkboxHaken}>✓</Text></View>
            : <View style={styles.checkbox} />}
          <Text style={dragItem.is_in_cart ? styles.produktTextErledigt : styles.produktText}>
            {dragItem.name}
          </Text>
          <Text style={styles.dragHandle}>⠿</Text>
        </Animated.View>
      )}

      {/* Unsichtbare Messlage — bestimmt auto. Panel-Breite */}
      <View style={{ position: 'absolute', left: -9999, top: 0, opacity: 0 }} pointerEvents="none">
        {alleKategorien.map(kat => (
          <View key={kat.id}>
            <Text style={styles.panelKatHeaderText}
              onLayout={e => onPanelTextMessen(e, 'kat')}>{kat.name}</Text>
            {(kat.subcategories || []).map(sub => (
              <Text key={sub.id} style={styles.panelSubkatText}
                onLayout={e => onPanelTextMessen(e, 'sub')}>{sub.name}</Text>
            ))}
          </View>
        ))}
        <Text style={styles.trashLabel}
          onLayout={e => onPanelTextMessen(e, 'trash')}>Loslassen zum Löschen</Text>
      </View>

      {/* Panel — immer pointerEvents auto (Ghost hat none, blockiert nicht) */}
      <Animated.View
        ref={node => { if (Platform.OS !== 'web') panelViewRef.current = node; }}
        pointerEvents="auto"
        style={[
          styles.kategoriePanel,
          Platform.OS === 'web' && { position: 'fixed' },
          { transform: [{ translateX: panelTranslateX }], width: panelBreite },
        ]}
      >
        <Text style={styles.kategoriePanelTitel}>📂 Kategorien</Text>
        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} scrollEnabled={false}>
          {alleKategorien.map(kat => {
            const katKey = `kat_${kat.id}`;
            const istOffen = hoveredKat === kat.id;
            const katAktiv = activeDropZone === katKey;
            return (
              <View key={kat.id}>
                {/* Oberkategorie — eigene Drop-Zone + Hover-Indikator */}
                <View
                  ref={zoneRef(katKey)}

                  style={[styles.panelKatHeader, katAktiv && styles.panelKatHeaderAktiv]}
                >
                  <Text style={styles.panelKatHeaderText}>{kat.name}</Text>
                  <Text style={styles.panelKatPfeil}>{istOffen ? '▲' : '▼'}</Text>
                </View>
                {/* Unterkategorien — nur wenn gehovered */}
                {istOffen && (kat.subcategories || []).map(sub => {
                  const key = `sub_${sub.id}`;
                  const aktiv = activeDropZone === key;
                  return (
                    <View
                      key={sub.id}
                      ref={zoneRef(key)}

                      style={[styles.panelSubkat, aktiv && styles.panelSubkatAktiv]}>
                      <Text style={[styles.panelSubkatText, aktiv && styles.panelSubkatTextAktiv]}>
                        {sub.name}
                      </Text>
                    </View>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
        <View
          ref={zoneRef('trash')}

          style={[styles.trashZone, activeDropZone === 'trash' && styles.trashZoneAktiv]}>
          <Text style={styles.trashIcon}>🗑️</Text>
          <Text style={[styles.trashLabel, activeDropZone === 'trash' && styles.trashLabelAktiv]}>
            {activeDropZone === 'trash' ? 'Loslassen zum Löschen' : 'Hierher ziehen'}
          </Text>
        </View>
      </Animated.View>

      {/* Hauptinhalt */}
      <Animated.View style={{ flex: 1, paddingRight: contentPaddingRight }}>
        <View style={styles.titelZeile}>
          <TouchableOpacity style={styles.menuButton} onPress={() => setListenMenu(true)}>
            <Text style={styles.menuButtonText}>☰</Text>
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>{listName}</Text>
        </View>
        <View style={styles.eingabeZeile}>
          <TextInput
            style={styles.input} placeholder="Artikel eingeben..."
            value={artikel} onChangeText={setArtikel}
            onSubmitEditing={artikelHinzufuegen} returnKeyType="done" editable={!laedt}
          />
          <TouchableOpacity
            style={[styles.button, laedt && styles.buttonDeaktiviert]}
            onPress={artikelHinzufuegen} disabled={laedt}
          >
            {laedt ? <ActivityIndicator color="#fff" size="small" />
                   : <Text style={styles.buttonText}>+</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={node => {
            if (Platform.OS === 'web') {
              // RNW: ScrollView renders a div — grab the inner scroll container
              scrollNodeRef.current = node?._scrollNode ?? node?.getScrollableNode?.() ?? node;
            } else {
              scrollViewRef.current = node;
            }
          }}
          style={styles.liste}
          showsVerticalScrollIndicator={false}
          scrollEnabled={dragItem === null}
          onScroll={e => {
            scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
            // cart-Zone nach Scroll neu messen (liegt im ScrollView → y ändert sich)
            if (isDragging.current) {
              const cartNode = zoneNodes.current['cart'];
              cartNode?.measureInWindow?.((x, y, w, h) => {
                if (h > 0) zonePosRefs.current['cart'] = { x, y, w, h };
              });
            }
          }}
          onLayout={e => { scrollLayoutRef.current = e.nativeEvent.layout; }}
          scrollEventThrottle={16}
        >
          {sortiertKats.map(kat => (
            <View key={kat}>
              <Text style={styles.kategorieHeader}>{kat}</Text>
              {Object.keys(gruppen[kat])
                .sort((a, b) => {
                  // Stabile Unterkategorie-Reihenfolge via position aus DB
                  const katObj = alleKategorien.find(k => k.name === kat);
                  const subs   = katObj?.subcategories || [];
                  const posA   = subs.find(s => s.name === a)?.position ?? 99;
                  const posB   = subs.find(s => s.name === b)?.position ?? 99;
                  if (a === '__ohne__') return 1;  // __ohne__ immer zuletzt
                  if (b === '__ohne__') return -1;
                  return posA - posB;
                })
                .map(sub => (
                <View key={sub}>
                  {sub !== '__ohne__' && (
                    <Text style={styles.unterkategorieHeader}>{sub}</Text>
                  )}
                  {gruppen[kat][sub].map(renderZeile)}
                </View>
              ))
              }
            </View>
          ))}

          {warenkorbItems.length > 0 && (
            <View ref={zoneRef('cart')}
              style={[styles.warenkorbContainer, activeDropZone === 'cart' && styles.warenkorbContainerAktiv]}>
              <Text style={styles.warenkorbHeader}>✓ Im Einkaufswagen</Text>
              {warenkorbItems.map(renderZeile)}
            </View>
          )}
          <View style={{ height: 80 }} />
        </ScrollView>
      </Animated.View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  titelZeile:               { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
  menuButton:               { width: 40, height: 40, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  menuButtonText:           { fontSize: 18, color: '#555' },
  container:                { flex: 1, backgroundColor: '#f8f9fa', paddingTop: 60, paddingHorizontal: 20 },
  title:                    { fontSize: 26, fontWeight: 'bold', color: '#1a1a1a', flex: 1 },
  eingabeZeile:             { flexDirection: 'row', gap: 10, marginBottom: 10 },
  input:                    { flex: 1, fontSize: 16, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, backgroundColor: '#fff' },
  button:                   { width: 48, height: 48, borderRadius: 10, backgroundColor: '#4CAF50', alignItems: 'center', justifyContent: 'center' },
  buttonDeaktiviert:        { backgroundColor: '#aaa' },
  buttonText:               { color: '#fff', fontSize: 26, lineHeight: 30, fontWeight: 'bold' },
  liste:                    { marginTop: 10 },
  kategorieHeader:          { fontSize: 17, fontWeight: 'bold', marginTop: 20, marginBottom: 4, color: '#222', borderBottomWidth: 1, borderBottomColor: '#ddd', paddingBottom: 4 },
  unterkategorieHeader:     { fontSize: 14, fontWeight: '600', marginLeft: 8, marginTop: 10, marginBottom: 4, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, paddingVertical: 6 },
  unterkategorieHeaderAktiv:{ backgroundColor: '#e8f5e9', color: '#2e7d32' },
  produktZeile:             { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  produktZeileDragging:     { opacity: 0.3 },
  checkbox:                 { width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: '#bbb', marginRight: 12 },
  checkboxAktiv:            { width: 22, height: 22, borderRadius: 5, backgroundColor: '#4CAF50', borderWidth: 2, borderColor: '#4CAF50', marginRight: 12, alignItems: 'center', justifyContent: 'center' },
  checkboxHaken:            { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  produktText:              { flex: 1, fontSize: 16, color: '#333' },
  produktTextErledigt:      { flex: 1, fontSize: 16, color: '#aaa', textDecorationLine: 'line-through' },
  dragHandle:               { fontSize: 18, color: '#ccc', paddingLeft: 8 },
  warenkorbContainer:       { marginTop: 30, paddingTop: 10, borderTopWidth: 2, borderTopColor: '#e0e0e0' },
  warenkorbContainerAktiv:  { backgroundColor: '#e8f5e9', borderTopColor: '#4CAF50' },
  warenkorbHeader:          { fontSize: 17, fontWeight: 'bold', color: '#4CAF50', marginBottom: 8 },
  dragGhost:                { position: 'absolute', zIndex: 1000, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, elevation: 10, flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4 },
  dragGhostText:            { fontSize: 15, fontWeight: '600', color: '#333' },
  kategoriePanel:           { position: 'absolute', right: 0, top: 0, bottom: 0, width: PANEL_BREITE_FALLBACK, zIndex: 997, backgroundColor: '#fff', borderLeftWidth: 1, borderLeftColor: '#e0e0e0', paddingTop: 60, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, elevation: 8 },
  kategoriePanelTitel:      { fontSize: 13, fontWeight: 'bold', color: '#555', paddingHorizontal: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  panelKatHeader:           { backgroundColor: '#4CAF50', paddingHorizontal: 16, paddingVertical: 12, marginTop: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  panelKatHeaderAktiv:      { backgroundColor: '#388E3C' },
  panelKatPfeil:            { color: '#fff', fontSize: 11, opacity: 0.9 },
  panelKatHeaderText:       { fontSize: 13, fontWeight: 'bold', color: '#fff' },
  panelSubkat:              { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  panelSubkatAktiv:         { backgroundColor: '#e8f5e9', borderLeftWidth: 3, borderLeftColor: '#4CAF50' },
  panelSubkatText:          { fontSize: 14, color: '#333' },
  panelSubkatTextAktiv:     { fontWeight: '600', color: '#2e7d32' },
  trashZone:                { margin: 12, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 2, borderColor: '#ef9a9a', backgroundColor: '#ffebee' },
  trashZoneAktiv:           { backgroundColor: '#ef5350', borderColor: '#c62828' },
  trashIcon:                { fontSize: 26 },
  trashLabel:               { fontSize: 11, color: '#c62828', marginTop: 4, textAlign: 'center' },
  trashLabelAktiv:          { color: '#fff', fontWeight: 'bold' },
});

const listenMenuStyles = StyleSheet.create({
  overlay:           { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', zIndex: 1002 },
  box:               { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '88%', maxWidth: 380, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  titel:             { fontSize: 17, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 16 },
  option:            { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#f0f0f0', gap: 12 },
  optionGefaehrlich: { },
  optionIcon:        { fontSize: 22, width: 32, textAlign: 'center' },
  optionText:        { flex: 1 },
  optionTitel:       { fontSize: 15, fontWeight: '600', color: '#1a1a1a', marginBottom: 2 },
  optionTitelRot:    { color: '#c62828' },
  optionBeschreibung:{ fontSize: 13, color: '#888' },
  abbrechen:         { marginTop: 12, paddingVertical: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#eee' },
  abbrechenText:     { fontSize: 15, color: '#888' },
});

const modalStyles = StyleSheet.create({
  overlay:        { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', zIndex: 1001 },
  box:            { backgroundColor: '#fff', borderRadius: 14, padding: 24, width: '85%', maxWidth: 360, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  titel:          { fontSize: 17, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 10 },
  nachricht:      { fontSize: 15, color: '#444', lineHeight: 22, marginBottom: 20 },
  buttons:        { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  buttonNein:     { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
  buttonNeinText: { fontSize: 15, color: '#666' },
  buttonJa:       { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#4CAF50' },
  buttonJaText:   { fontSize: 15, color: '#fff', fontWeight: '600' },
});