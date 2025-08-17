// app/index.tsx — Travel Companion (Expo / React Native)
// MVP features:
// - World map (tap countries to toggle Visited/Wishlist)
// - Local persistence (AsyncStorage via Zustand persist)
// - Multi-passport manager (ISO3 codes; choose primary)
// - Visa checker UI (stubbed; plug provider later)

import { geoNaturalEarth1, geoPath } from "d3-geo";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import Svg, { G, Path } from "react-native-svg";
import * as topojson from "topojson-client";
// ✅ FIX: named export, not default
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

// ---------- Constants
const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

type VisaRequirement =
  | "visa_free"
  | "evisa"
  | "eta"
  | "visa_on_arrival"
  | "visa_required"
  | "unknown";

type VisaResult = {
  passport: string;        // ISO3
  destination: string;     // ISO3
  requirement: VisaRequirement;
  allowedStay?: string;
  notes?: string;
  source?: string;
  fetchedAt: string;       // ISO date
};

type CountryMeta = { name: string; cca2: string; cca3: string };
type Mode = "visited" | "wishlist";

// ---------- Visa API (stub). Swap with fetch to your proxy later.
const visaApi = {
  async fetch(passport: string, destination: string): Promise<VisaResult> {
    const key = `${passport}->${destination}`.toUpperCase();
    const canned: Record<string, VisaResult> = {
      "FRA->JPN": {
        passport: "FRA",
        destination: "JPN",
        requirement: "visa_free",
        allowedStay: "90 days",
        notes: "Short-stay visa waiver for French citizens.",
        source: "https://www.mofa.go.jp/j_info/visit/visa/short/novisa.html",
        fetchedAt: new Date().toISOString(),
      },
      "UZB->KAZ": {
        passport: "UZB",
        destination: "KAZ",
        requirement: "visa_free",
        allowedStay: "30 days",
        notes: "Uzbek citizens are visa-free for short stays in Kazakhstan.",
        source: "https://consular.mfa.kz/en/visa-requirements",
        fetchedAt: new Date().toISOString(),
      },
    };
    return canned[key] ?? {
      passport,
      destination,
      requirement: "unknown",
      notes: "Configure a real visa provider proxy (Sherpa/VisaList) to get live results.",
      fetchedAt: new Date().toISOString(),
    };
  },
};

// ---------- State (Zustand + AsyncStorage)
type Store = {
  mode: Mode; setMode: (m: Mode) => void;
  visited: Set<string>; wishlist: Set<string>;
  toggleCountry: (cca3: string) => void;
  passports: string[]; primaryPassport: string | null;
  addPassport: (cca3: string) => void; removePassport: (cca3: string) => void;
  setPrimaryPassport: (cca3: string | null) => void;
};

const useStore = create<Store>()(
  persist(
    (set, get) => ({
      mode: "visited",
      setMode: (m) => set({ mode: m }),
      visited: new Set<string>(),
      wishlist: new Set<string>(),
      passports: [],
      primaryPassport: null,
      toggleCountry: (cca3) => {
        const { mode } = get();
        if (mode === "visited") {
          const v = new Set(get().visited);
          const w = new Set(get().wishlist);
          v.has(cca3) ? v.delete(cca3) : v.add(cca3);
          w.delete(cca3);
          set({ visited: v, wishlist: w });
        } else {
          const w = new Set(get().wishlist);
          w.has(cca3) ? w.delete(cca3) : w.add(cca3);
          set({ wishlist: w });
        }
      },
      addPassport: (p) => {
        const arr = get().passports;
        if (arr.includes(p)) return;
        const next = [...arr, p];
        set({ passports: next, primaryPassport: get().primaryPassport ?? p });
      },
      removePassport: (p) => {
        const next = get().passports.filter((x) => x !== p);
        const primary = get().primaryPassport;
        set({ passports: next, primaryPassport: primary === p ? (next[0] ?? null) : primary });
      },
      setPrimaryPassport: (p) => set({ primaryPassport: p }),
    }),
    {
      name: "tc.mobi",
      storage: createJSONStorage(() => AsyncStorage),
      // serialize Sets for storage
      partialize: (s) => ({
        ...s,
        visited: Array.from(s.visited),
        wishlist: Array.from(s.wishlist),
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (Array.isArray((state as any).visited)) (state as any).visited = new Set((state as any).visited);
        if (Array.isArray((state as any).wishlist)) (state as any).wishlist = new Set((state as any).wishlist);
      },
    }
  )
);

// ---------- Helpers
const requirementLabel = (r: VisaRequirement) => ({
  visa_free: "Visa-free",
  evisa: "eVisa",
  eta: "eTA",
  visa_on_arrival: "Visa on arrival",
  visa_required: "Visa required",
  unknown: "Unknown",
}[r]);

const toneColor = (r: VisaRequirement) => ({
  visa_free: "#16a34a",
  evisa: "#d97706",
  eta: "#d97706",
  visa_on_arrival: "#d97706",
  visa_required: "#dc2626",
  unknown: "#6b7280",
}[r]);

const pct = (num: number, denom: number) => (denom ? Math.round((num / denom) * 1000) / 10 : 0);

// ---------- Screen (default export for Expo Router)
export default function Screen() {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const visited = useStore((s) => s.visited);
  const wishlist = useStore((s) => s.wishlist);
  const toggleCountry = useStore((s) => s.toggleCountry);
  const passports = useStore((s) => s.passports);
  const primaryPassport = useStore((s) => s.primaryPassport);
  const addPassport = useStore((s) => s.addPassport);
  const removePassport = useStore((s) => s.removePassport);
  const setPrimaryPassport = useStore((s) => s.setPrimaryPassport);

  const [countries, setCountries] = useState<CountryMeta[]>([]);
  const [numToCca3, setNumToCca3] = useState<Map<string, string> | null>(null);
  const [loadingMap, setLoadingMap] = useState(true);
  const [geos, setGeos] = useState<any[]>([]);

  const [dest, setDest] = useState<string>("");
  const [visaLoading, setVisaLoading] = useState(false);
  const [visaResult, setVisaResult] = useState<VisaResult | null>(null);

  // Countries metadata
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("https://restcountries.com/v3.1/all");
        const json = await res.json();
        const m = new Map<string, string>();
        const list: CountryMeta[] = [];
        json.forEach((c: any) => {
          const ccn3: string | undefined = c.ccn3;
          const cca3: string | undefined = c.cca3;
          const cca2: string | undefined = c.cca2;
          const name: string | undefined = c.name?.common;
          if (ccn3 && cca3) m.set(ccn3.padStart(3, "0"), cca3);
          if (name && cca2 && cca3) list.push({ name, cca2, cca3 });
        });
        list.sort((a, b) => a.name.localeCompare(b.name));
        setCountries(list);
        setNumToCca3(m);
      } catch {
        Alert.alert("Network error", "Failed to load country list.");
      }
    })();
  }, []);

  // Map data
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(GEO_URL);
        const topo = await res.json();
        const feats = topojson.feature(topo, (topo as any).objects.countries) as any;
        setGeos(feats.features);
      } catch {
        Alert.alert("Network error", "Failed to load world map.");
      } finally {
        setLoadingMap(false);
      }
    })();
  }, []);

  // Projection
  const width = 360;
  const height = 200;
  const projection = useMemo(() => geoNaturalEarth1().translate([width / 2, height / 2]).scale(80), []);
  const pathGen = useMemo(() => geoPath(projection as any), [projection]);

  const isoFromGeo = (geo: any) => {
    if (!numToCca3) return null;
    const idNum = String(geo.id).padStart(3, "0");
    return numToCca3.get(idNum) ?? null;
  };

  const total = countries.length || 249;
  const visitedPct = pct(visited.size, total);
  const wishlistPct = pct(wishlist.size, total);

  const passportInput = useRef<TextInput>(null);

  async function runVisa() {
    if (!primaryPassport || !dest) return;
    setVisaLoading(true);
    try {
      const res = await visaApi.fetch(primaryPassport, dest);
      setVisaResult(res);
    } finally {
      setVisaLoading(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#f8fafc" }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "700", marginBottom: 8 }}>Travel Companion — App (MVP)</Text>
      <Text style={{ color: "#64748b", marginBottom: 12 }}>
        Tap the map to toggle countries. Switch mode (Visited/Wishlist). Add your passports and check visa rules.
      </Text>

      {/* Mode toggle */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        <TouchableOpacity
          onPress={() => setMode("visited")}
          style={{
            paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999,
            backgroundColor: mode === "visited" ? "#2563eb" : "white",
            borderWidth: 1, borderColor: mode === "visited" ? "#2563eb" : "#e2e8f0",
          }}>
          <Text style={{ color: mode === "visited" ? "white" : "#111827" }}>Visited</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setMode("wishlist")}
          style={{
            paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999,
            backgroundColor: mode === "wishlist" ? "#7c3aed" : "white",
            borderWidth: 1, borderColor: mode === "wishlist" ? "#7c3aed" : "#e2e8f0",
          }}>
          <Text style={{ color: mode === "wishlist" ? "white" : "#111827" }}>Wishlist</Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        <View style={{ backgroundColor: "#dcfce7", paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999 }}>
          <Text style={{ color: "#166534", fontWeight: "600" }}>{visited.size} visited ({visitedPct}%)</Text>
        </View>
        <View style={{ backgroundColor: "#fef3c7", paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999 }}>
          <Text style={{ color: "#92400e", fontWeight: "600" }}>{wishlist.size} wishlist ({wishlistPct}%)</Text>
        </View>
      </View>

      {/* Map */}
      <View style={{ backgroundColor: "white", borderRadius: 16, borderWidth: 1, borderColor: "#e5e7eb", padding: 8, marginBottom: 16 }}>
        {loadingMap ? (
          <View style={{ height: 220, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator />
            <Text style={{ color: "#6b7280", marginTop: 8 }}>Loading world map…</Text>
          </View>
        ) : (
          <Svg width="100%" height={220} viewBox={`0 0 ${width} ${height}`}>
            <G>
              {geos.map((geo, i) => {
                const d = pathGen(geo) as string;
                const cca3 = isoFromGeo(geo);
                const isVisited = cca3 ? visited.has(cca3) : false;
                const isWish = cca3 ? wishlist.has(cca3) : false;
                const fill = isVisited ? "#2563eb" : isWish ? "#7c3aed" : "#e5e7eb";
                const stroke = "#94a3b8";
                return (
                  <Path
                    key={i}
                    d={d}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={0.4}
                    onPress={() => cca3 && toggleCountry(cca3)}
                  />
                );
              })}
            </G>
          </Svg>
        )}
        <Text style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>Tip: Tap countries to toggle. Switch mode above.</Text>
      </View>

      {/* Passports */}
      <View style={{ backgroundColor: "white", borderRadius: 16, borderWidth: 1, borderColor: "#e5e7eb", padding: 12, marginBottom: 16 }}>
        <Text style={{ fontWeight: "700", marginBottom: 6 }}>Your passports</Text>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <TextInput
            ref={passportInput}
            placeholder="Add passport (ISO3 e.g., FRA, UZB)"
            autoCapitalize="characters"
            style={{ flex: 1, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 }}
          />
          <TouchableOpacity
            onPress={() => {
              const anyRef = passportInput.current as any;
              const raw: string =
                anyRef?.value ??
                anyRef?._lastNativeText ??
                "";
              const v = raw.trim().toUpperCase();
              if (v && /^[A-Z]{3}$/.test(v)) {
                addPassport(v);
                (passportInput.current as any)?.clear?.();
              }
            }}
            style={{ backgroundColor: "#111827", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 }}>
            <Text style={{ color: "white" }}>Add</Text>
          </TouchableOpacity>
        </View>
        {passports.length > 0 && (
          <View style={{ marginTop: 10 }}>
            {passports.map((p) => (
              <View key={p} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <TouchableOpacity onPress={() => setPrimaryPassport(p)}>
                  <Text style={{ fontWeight: primaryPassport === p ? "700" : "400" }}>
                    {p}{primaryPassport === p ? "  (primary)" : ""}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removePassport(p)}>
                  <Text style={{ color: "#dc2626" }}>Remove</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Visa checker */}
      <View style={{ backgroundColor: "white", borderRadius: 16, borderWidth: 1, borderColor: "#e5e7eb", padding: 12, marginBottom: 24 }}>
        <Text style={{ fontWeight: "700", marginBottom: 6 }}>Visa checker</Text>
        <Text style={{ color: "#64748b", fontSize: 12, marginBottom: 6 }}>
          Enter destination ISO3 (e.g. JPN, KAZ). We’ll connect a real provider later.
        </Text>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <TextInput
            placeholder="Destination (ISO3)"
            autoCapitalize="characters"
            value={dest}
            onChangeText={setDest}
            maxLength={3}
            style={{ flex: 1, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 }}
          />
          <TouchableOpacity
            disabled={!primaryPassport || !dest || visaLoading}
            onPress={runVisa}
            style={{
              backgroundColor: !primaryPassport || !dest ? "#94a3b8" : "#2563eb",
              paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10
            }}>
            <Text style={{ color: "white" }}>{visaLoading ? "Checking…" : "Check"}</Text>
          </TouchableOpacity>
        </View>
        {visaResult && (
          <View style={{ marginTop: 10, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 10, backgroundColor: "#f8fafc" }}>
            <Text style={{ fontWeight: "600" }}>{visaResult.passport} → {visaResult.destination}</Text>
            <Text style={{ color: toneColor(visaResult.requirement), marginTop: 4 }}>
              {requirementLabel(visaResult.requirement)}{visaResult.allowedStay ? ` • Stay: ${visaResult.allowedStay}` : ""}
            </Text>
            {visaResult.notes ? <Text style={{ color: "#334155", marginTop: 6, fontSize: 12 }}>{visaResult.notes}</Text> : null}
            {visaResult.source ? <Text style={{ marginTop: 6, fontSize: 12, color: "#2563eb" }}>Source: {visaResult.source}</Text> : null}
            <Text style={{ marginTop: 6, fontSize: 10, color: "#6b7280" }}>{new Date(visaResult.fetchedAt).toLocaleString()}</Text>
          </View>
        )}
        <Text style={{ color: "#64748b", fontSize: 11, marginTop: 8 }}>
          Disclaimer: Policies change. Always verify on official government websites.
        </Text>
      </View>

      <Text style={{ fontSize: 12, color: "#6b7280", marginBottom: 24 }}>
        Data stored locally on this device. We’ll add login + cloud sync later.
      </Text>
    </ScrollView>
  );
}
