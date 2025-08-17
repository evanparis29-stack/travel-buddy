import React, { useMemo, useState } from "react";
import {
  Alert,
  Linking,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import useStore from "../../store/store";

// ================== CONFIG ==================
const API_BASE = "https://travel-buddy-egkw.vercel.app";

// Types the UI will use (matches what /api/visa returns)
type VisaRequirement =
  | "visa_free"
  | "evisa"
  | "eta"
  | "visa_on_arrival"
  | "visa_required"
  | "unknown";

type VisaResult = {
  passport: string;            // ISO3 (e.g., FRA)
  destination: string;         // ISO3 (e.g., JPN)
  requirement: VisaRequirement;
  allowedStay?: string | null;
  notes?: string | null;
  source?: string;
  fetchedAt?: string;
};

const requirementLabel: Record<VisaRequirement, string> = {
  visa_free: "Visa-free",
  evisa: "eVisa",
  eta: "eTA",
  visa_on_arrival: "Visa on arrival",
  visa_required: "Visa required",
  unknown: "Unknown",
};

function reqColor(req: VisaRequirement) {
  switch (req) {
    case "visa_free":
      return "#16a34a";
    case "visa_on_arrival":
    case "evisa":
    case "eta":
      return "#d97706";
    case "visa_required":
      return "#dc2626";
    default:
      return "#6b7280";
  }
}

// Decode common HTML entities
function decodeHtml(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
// Strip HTML tags -> plain text
function stripTags(s: string) {
  return s.replace(/<[^>]*>/g, "");
}
// Pull the first URL out of a string
function extractFirstUrl(s: string): string | null {
  const m = s.match(/https?:\/\/[^\s"'<)]+/i);
  return m ? m[0] : null;
}

// ============================================

export default function Screen() {
  // global store
  const passports = useStore((s) => s.passports);
  const primaryPassport = useStore((s) => s.primaryPassport);
  const addPassport = useStore((s) => s.addPassport);
  const removePassport = useStore((s) => s.removePassport);
  const setPrimaryPassport = useStore((s) => s.setPrimaryPassport);

  // local states
  const [passportNew, setPassportNew] = useState("");
  const [dest, setDest] = useState("");
  const [visaLoading, setVisaLoading] = useState(false);
  const [visaResult, setVisaResult] = useState<VisaResult | null>(null);

  // memoized cleaned notes / url so we don't put "const" inside JSX
  const cleanedNotes = useMemo(() => {
    if (!visaResult?.notes) return "";
    const decoded = decodeHtml(visaResult.notes);
    return stripTags(decoded);
  }, [visaResult?.notes]);

  const notesUrl = useMemo(() => {
    if (!visaResult?.notes) return null;
    const decoded = decodeHtml(visaResult.notes);
    return extractFirstUrl(decoded);
  }, [visaResult?.notes]);

  // ---- Add passport ----
  const handleAddPassport = () => {
    const code = passportNew.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) {
      Alert.alert("Invalid code", "Enter a 3-letter ISO3 code (e.g. FRA, USA, TUR).");
      return;
    }
    addPassport(code);
    setPassportNew("");
  };

  // ---- Visa check (calls your deployed /api/visa) ----
  const runVisa = async () => {
    if (!primaryPassport || !dest) return;

    const passportISO3 = primaryPassport.toUpperCase();
    const destinationISO3 = dest.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(destinationISO3)) {
      Alert.alert("Invalid destination", "Enter a 3-letter ISO3 code like JPN or KAZ.");
      return;
    }

    try {
      setVisaLoading(true);
      setVisaResult(null);

      const res = await fetch(`${API_BASE}/api/visa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passport: passportISO3,      // ISO3; server converts to ISO2 for RapidAPI
          destination: destinationISO3 // ISO3
        }),
      });

      const data = await res.json();
      // Helpful while testing:
      console.log("visa data", data);

      if (!res.ok) {
        Alert.alert("Visa API error", data?.message || "Request failed");
        return;
      }

      // data already normalized by the server
      setVisaResult({
        passport: data.passport,
        destination: data.destination,
        requirement: data.requirement as VisaRequirement,
        allowedStay: data.allowedStay ?? null,
        notes: data.notes ?? null,
        source: data.source ?? "visa-requirement.p.rapidapi.com",
        fetchedAt: data.fetchedAt ?? new Date().toISOString(),
      });
    } catch (err: any) {
      Alert.alert("Network error", err?.message || "Failed to fetch.");
    } finally {
      setVisaLoading(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "white", padding: 16 }}>
      {/* Passport Manager */}
      <View
        style={{
          backgroundColor: "white",
          borderRadius: 16,
          borderWidth: 1,
          borderColor: "#e5e7eb",
          padding: 12,
          marginBottom: 24,
        }}
      >
        <Text style={{ fontWeight: "700", marginBottom: 6 }}>Passports</Text>
        <View
          style={{ flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 12 }}
        >
          <TextInput
            placeholder="Enter passport ISO3 (e.g. FRA, USA, TUR)"
            autoCapitalize="characters"
            value={passportNew}
            onChangeText={(t) => setPassportNew(t.toUpperCase())}
            maxLength={3}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: "#e5e7eb",
              borderRadius: 12,
              paddingHorizontal: 10,
              paddingVertical: 8,
            }}
          />
          <TouchableOpacity
            disabled={!passportNew}
            onPress={handleAddPassport}
            style={{
              backgroundColor: !passportNew ? "#94a3b8" : "#2563eb",
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 10,
            }}
          >
            <Text style={{ color: "white" }}>Add</Text>
          </TouchableOpacity>
        </View>

        {passports.map((p: string) => (
          <View
            key={p}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 6,
            }}
          >
            <Text
              style={{
                fontWeight: p === primaryPassport ? "700" : "400",
                color: p === primaryPassport ? "#2563eb" : "#000",
              }}
            >
              {p} {p === primaryPassport ? "(primary)" : ""}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {p !== primaryPassport && (
                <TouchableOpacity onPress={() => setPrimaryPassport(p)}>
                  <Text style={{ color: "#2563eb" }}>Set Primary</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => removePassport(p)}>
                <Text style={{ color: "red" }}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      {/* Visa checker */}
      <View
        style={{
          backgroundColor: "white",
          borderRadius: 16,
          borderWidth: 1,
          borderColor: "#e5e7eb",
          padding: 12,
          marginBottom: 24,
        }}
      >
        <Text style={{ fontWeight: "700", marginBottom: 6 }}>Visa checker</Text>
        <Text style={{ color: "#64748b", fontSize: 12, marginBottom: 6 }}>
          Enter destination ISO3 (e.g. JPN, KAZ). Your primary passport will be used.
        </Text>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <TextInput
            placeholder="Destination (ISO3)"
            autoCapitalize="characters"
            value={dest}
            onChangeText={(t) => setDest(t.toUpperCase())}
            maxLength={3}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: "#e5e7eb",
              borderRadius: 12,
              paddingHorizontal: 10,
              paddingVertical: 8,
            }}
          />
          <TouchableOpacity
            disabled={!primaryPassport || !dest || visaLoading}
            onPress={runVisa}
            style={{
              backgroundColor:
                !primaryPassport || !dest ? "#94a3b8" : "#2563eb",
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 10,
            }}
          >
            <Text style={{ color: "white" }}>
              {visaLoading ? "Checking…" : "Check"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Visa result */}
        {visaResult && (
          <View
            style={{
              marginTop: 16,
              padding: 12,
              borderWidth: 1,
              borderColor: "#e5e7eb",
              borderRadius: 12,
              backgroundColor: "#f8fafc",
            }}
          >
            <Text style={{ fontWeight: "700", marginBottom: 8 }}>
              Result for {visaResult.passport} → {visaResult.destination}
            </Text>

            {/* status badge + stay */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginBottom: 6,
              }}
            >
              <View
                style={{
                  backgroundColor: reqColor(visaResult.requirement),
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 999,
                }}
              >
                <Text style={{ color: "white", fontWeight: "600" }}>
                  {requirementLabel[visaResult.requirement]}
                </Text>
              </View>
              {visaResult.allowedStay ? (
                <Text style={{ color: "#334155" }}>
                  • Stay: {visaResult.allowedStay}
                </Text>
              ) : null}
            </View>

            {/* notes */}
            {cleanedNotes ? (
              <Text style={{ fontSize: 12, color: "#334155" }}>
                {cleanedNotes}
              </Text>
            ) : null}

            {/* optional link extracted from notes */}
            {notesUrl ? (
              <TouchableOpacity
                style={{ marginTop: 8 }}
                onPress={() => Linking.openURL(notesUrl)}
              >
                <Text
                  style={{ color: "#2563eb", textDecorationLine: "underline" }}
                >
                  -->Check official source
                </Text>
              </TouchableOpacity>
            ) : null}

            {visaResult.fetchedAt ? (
              <Text style={{ marginTop: 8, fontSize: 10, color: "#6b7280" }}>
                {new Date(visaResult.fetchedAt).toLocaleString()}
              </Text>
            ) : null}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
