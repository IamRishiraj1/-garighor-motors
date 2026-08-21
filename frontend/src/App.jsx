import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Car, Search, Heart, X, Menu, Plus, Edit2, Trash2, LogIn, UserPlus,
  MessageCircle, Send, ChevronLeft, ChevronRight, Fuel, Gauge, Calendar,
  Settings, LayoutDashboard, ListChecks, Phone, Mail, MapPin, Star,
  ShieldCheck, ArrowRight, SlidersHorizontal, ChevronDown, Sparkles, Bot,
  Wrench, Award, Clock, CheckCircle2, AlertCircle, Loader2, User, LogOut,
  TrendingUp, Package, Users, BadgeCheck, FileCheck2, Palette, Cog
} from "lucide-react";

/* ---------------------------------- helpers ---------------------------------- */

const BRANDS = ["Toyota", "Honda", "Nissan", "Mitsubishi", "Suzuki", "Hyundai", "Mazda"];
const BODY_TYPES = ["Sedan", "Hatchback", "SUV", "Crossover", "MPV/Van", "Wagon"];
const FUEL_TYPES = ["Petrol", "Hybrid", "Diesel", "CNG"];
const TRANSMISSIONS = ["Automatic", "Manual", "CVT"];
const CONDITIONS = ["Excellent", "Very Good", "Good"];
const BRAND_HUES = {
  Toyota: "#8A3E1F", Honda: "#1F5A45", Nissan: "#2B3E52", Mitsubishi: "#6B3418",
  Suzuki: "#3E4A1F", Hyundai: "#4A2B52", Mazda: "#5A2436",
};

function formatBDT(num) {
  const n = Math.round(Number(num) || 0);
  const str = String(n);
  const last3 = str.slice(-3);
  const rest = str.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3 : last3;
  return "\u09F3" + grouped;
}
function formatKm(num) { return Number(num || 0).toLocaleString("en-US") + " km"; }
function timeAgo(ts) {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}

// Base URL of the Express/Prisma backend. Set VITE_API_URL in a frontend
// .env file to point at a non-local deployment; falls back to local dev.
const API_BASE = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_URL) || "http://localhost:4000/api";

/**
 * Single fetch wrapper for every backend call. Pass `token` for routes that
 * require login (admin car/lead writes). Pass a FormData `body` for file
 * uploads — the browser sets the multipart Content-Type itself, so we skip
 * setting it in that case.
 */
async function apiFetch(path, { method = "GET", body, token } = {}) {
  const headers = {};
  let payload;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  if (token) headers["Authorization"] = "Bearer " + token;

  const res = await fetch(API_BASE + path, { method, headers, body: payload });
  let data = null;
  try { data = await res.json(); } catch (e) { /* e.g. 204 No Content on delete */ }
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

// Wishlist is purely a local browser convenience — there's no backend model
// for it, so it stays in localStorage rather than going through the API.
// It's scoped per logged-in user (or "guest" when logged out) so switching
// accounts on the same browser never shows someone else's saved cars.
function wishlistKey(userId) {
  return userId ? `ggm-wishlist:user:${userId}` : "ggm-wishlist:guest";
}
function loadLocalWishlist(key) {
  try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) { return []; }
}
function saveLocalWishlist(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) { /* best effort */ }
}

/* ---------------------------------- small UI atoms ---------------------------------- */

function Placeholder({ brand, model, size = "normal" }) {
  const hue = BRAND_HUES[brand] || "#3E4A1F";
  return (
    <div style={{
      width: "100%", height: "100%", minHeight: size === "small" ? 120 : 190,
      background: `linear-gradient(135deg, ${hue} 0%, #14181F 130%)`,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", inset: 0, opacity: 0.12,
        backgroundImage: "repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 1px, transparent 14px)",
      }} />
      <Car size={size === "small" ? 34 : 48} color="#F3EFE6" strokeWidth={1.4} style={{ opacity: 0.85 }} />
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: 1, color: "#F3EFE6", opacity: 0.65, marginTop: 6, textTransform: "uppercase" }}>
        Photo pending upload
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    available: { bg: "#E4EFE8", fg: "#215A3F", label: "Available" },
    reserved: { bg: "#FBEFDD", fg: "#8A5A15", label: "Reserved" },
    sold: { bg: "#F3E3DD", fg: "#8A3418", label: "Sold" },
  };
  const s = map[status] || map.available;
  return (
    <span style={{
      background: s.bg, color: s.fg, fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
      padding: "4px 10px", borderRadius: 20, textTransform: "uppercase", fontFamily: "'IBM Plex Mono', monospace",
    }}>{s.label}</span>
  );
}

/* ---------------------------------- car hang-tag card ---------------------------------- */

function CarCard({ car, onView, onToggleWish, wished }) {
  return (
    <div
      onClick={() => onView(car)}
      style={{
        background: "#FFFDF9", borderRadius: 14, border: "1px solid #E4DFD2", cursor: "pointer",
        overflow: "hidden", position: "relative", transition: "transform .18s ease, box-shadow .18s ease",
        display: "flex", flexDirection: "column",
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 14px 28px rgba(20,24,31,0.14)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
    >
      <div style={{
        position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)", width: 16, height: 16,
        borderRadius: "50%", background: "var(--ggm-page-bg, #F3EFE6)", border: "1px solid #E4DFD2", zIndex: 2,
      }} />
      <div style={{ position: "relative", height: 172 }}>
        {car.image ? (
          <img src={car.image} alt={car.brand + " " + car.model} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : <Placeholder brand={car.brand} model={car.model} />}
        <div style={{ position: "absolute", top: 10, left: 10 }}><StatusPill status={car.status} /></div>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleWish(car.id); }}
          aria-label="Save to wishlist"
          style={{
            position: "absolute", top: 8, right: 8, width: 32, height: 32, borderRadius: "50%", border: "none",
            background: "rgba(20,24,31,0.55)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}>
          <Heart size={15} color={wished ? "#C98A3D" : "#F3EFE6"} fill={wished ? "#C98A3D" : "none"} />
        </button>
      </div>
      <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: "#8A8578", letterSpacing: 0.6 }}>
          STOCK #{car.stockNo} &middot; AUCTION {car.auctionGrade}
        </div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, letterSpacing: 0.5, color: "#14181F", lineHeight: 1 }}>
          {car.brand.toUpperCase()} {car.model.toUpperCase()}
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: 12.5, color: "#5B6B66", fontFamily: "'IBM Plex Mono', monospace" }}>
          <span>{car.year}</span><span>&middot;</span><span>{formatKm(car.mileage)}</span><span>&middot;</span><span>{car.fuel}</span>
        </div>
        <div style={{ height: 1, background: "#EDE8DB", margin: "2px 0" }} />
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: "#C98A3D", letterSpacing: 0.5 }}>{formatBDT(car.price)}</div>
          <div style={{ fontSize: 12.5, color: "#14181F", fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>
            Details <ArrowRight size={13} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- app ---------------------------------- */

export default function App() {
  const [ready, setReady] = useState(false);
  const [cars, setCars] = useState([]);
  const [leads, setLeads] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [profile, setProfile] = useState(null); // { id, name, email, role }
  const [token, setToken] = useState(null); // JWT from /api/auth/login or /register

  const [view, setView] = useState("home"); // home | catalog | admin
  const [navOpen, setNavOpen] = useState(false);
  const [authMode, setAuthMode] = useState(null); // null | login | register
  const [selectedCar, setSelectedCar] = useState(null);
  const [enquiryFor, setEnquiryFor] = useState(null);
  const [toast, setToast] = useState(null);

  const [adminTab, setAdminTab] = useState("overview");
  const [editingCar, setEditingCar] = useState(null); // object -> edit, "new" -> new
  const isAdmin = profile?.role === "admin";
  const [settings, setSettings] = useState(null); // { heroImage }

  const [filters, setFilters] = useState({ q: "", brand: "All", body: "All", fuel: "All", minPrice: "", maxPrice: "", sort: "newest" });
  const [wishlistOnly, setWishlistOnly] = useState(false);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { role: "assistant", text: "Hi, I'm the GariGhor assistant. Ask me about any car in the lot, compare two models, or ask how auction-sheet grading works." }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  // On first load: fetch live inventory and site settings from the backend,
  // restore the logged-in user (if a session token was saved from a
  // previous visit), then load the wishlist scoped to whoever that is (or
  // "guest" if no one's logged in) — pruning any saved IDs for cars that no
  // longer exist, e.g. deleted, or re-seeded with a new ID.
  useEffect(() => {
    (async () => {
      let liveCars = null;
      try {
        const [carsResult, settingsResult] = await Promise.all([
          apiFetch("/cars"),
          apiFetch("/settings").catch(() => ({ settings: null })), // non-critical — don't block the site on this
        ]);
        liveCars = carsResult.cars;
        setCars(liveCars);
        setSettings(settingsResult.settings);
      } catch (e) {
        showToast("Could not reach the server — is the backend running?");
      }

      let resolvedUserId = null;
      const savedToken = localStorage.getItem("ggm-token");
      if (savedToken) {
        try {
          const { user } = await apiFetch("/auth/me", { token: savedToken });
          setToken(savedToken);
          setProfile(user);
          resolvedUserId = user.id;
        } catch (e) {
          localStorage.removeItem("ggm-token"); // expired/invalid — drop it quietly
        }
      }

      const key = wishlistKey(resolvedUserId);
      const savedWishlist = loadLocalWishlist(key);
      if (liveCars) {
        // Only reconcile when we actually have authoritative data — if the
        // cars fetch failed, don't wipe someone's wishlist just because of
        // a transient network hiccup.
        const validIds = new Set(liveCars.map((c) => c.id));
        const prunedWishlist = savedWishlist.filter((id) => validIds.has(id));
        setWishlist(prunedWishlist);
        if (prunedWishlist.length !== savedWishlist.length) saveLocalWishlist(key, prunedWishlist);
      } else {
        setWishlist(savedWishlist);
      }

      setReady(true);
    })();
  }, []);

  useEffect(() => { if (ready) saveLocalWishlist(wishlistKey(profile?.id), wishlist); }, [wishlist, ready, profile?.id]);
  useEffect(() => { if (chatOpen) chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages, chatOpen, chatLoading]);

  // Admins need the leads inbox once they open the dealer console.
  useEffect(() => {
    if (view === "admin" && isAdmin && token) {
      apiFetch("/leads", { token }).then(({ leads }) => setLeads(leads)).catch(() => showToast("Could not load leads."));
    }
  }, [view, isAdmin, token]);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2600); }
  function toggleWish(id) {
    setWishlist(w => w.includes(id) ? w.filter(x => x !== id) : [...w, id]);
  }
  function goCatalog(presetBrand) {
    setView("catalog"); setNavOpen(false); setWishlistOnly(false);
    if (presetBrand) setFilters(f => ({ ...f, brand: presetBrand }));
    window.scrollTo?.({ top: 0 });
  }
  function goWishlist() {
    setView("catalog"); setNavOpen(false); setWishlistOnly(true);
    window.scrollTo?.({ top: 0 });
  }

  async function submitEnquiry(carId, form) {
    try {
      await apiFetch("/leads", { method: "POST", body: { carId, name: form.name, phone: form.phone, email: form.email, message: form.message, type: form.type } });
      setEnquiryFor(null);
      showToast("Enquiry sent - the GariGhor team will call you shortly.");
    } catch (e) {
      showToast(e.message || "Could not send your enquiry — please try again.");
    }
  }

  // Handles both the customer Login/Register modal AND the "Dealer login"
  // footer link, which reuses the same form — the backend account's role
  // decides whether the person lands back on the site or in the console.
  // Loads whichever user's (or guest's) wishlist matches the given id,
  // pruned against the currently-loaded cars. Called on login/logout so
  // switching accounts on the same browser never leaks between wishlists.
  function switchWishlistScope(userId) {
    const key = wishlistKey(userId);
    const saved = loadLocalWishlist(key);
    const validIds = new Set(cars.map(c => c.id));
    const pruned = saved.filter(id => validIds.has(id));
    setWishlist(pruned);
  }

  async function submitAuth(mode, form) {
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/register";
      const body = mode === "login" ? { email: form.email, password: form.password } : { name: form.name, email: form.email, password: form.password };
      const { token: newToken, user } = await apiFetch(path, { method: "POST", body });
      setToken(newToken);
      setProfile(user);
      localStorage.setItem("ggm-token", newToken);
      switchWishlistScope(user.id);
      setAuthMode(null);
      showToast(mode === "login" ? `Welcome back, ${user.name}` : "Account created - welcome to GariGhor Motors");
      if (user.role === "admin") { setView("admin"); setAdminTab("overview"); }
    } catch (e) {
      throw e; // let the modal show the error inline instead of just toasting it
    }
  }

  function logOut() {
    setToken(null); setProfile(null); localStorage.removeItem("ggm-token");
    switchWishlistScope(null);
    setView("home"); showToast("Signed out.");
  }

  async function saveCar(carData) {
    try {
      if (carData.id) {
        const { car } = await apiFetch(`/cars/${carData.id}`, { method: "PUT", body: carData, token });
        setCars(cs => cs.map(c => c.id === car.id ? car : c));
        showToast("Listing updated.");
      } else {
        const { car } = await apiFetch("/cars", { method: "POST", body: carData, token });
        setCars(cs => [car, ...cs]);
        showToast("New car added to inventory.");
      }
      setEditingCar(null);
    } catch (e) {
      showToast(e.message || "Could not save this listing.");
    }
  }
  async function deleteCar(id) {
    try {
      await apiFetch(`/cars/${id}`, { method: "DELETE", token });
      setCars(cs => cs.filter(c => c.id !== id));
      showToast("Listing removed.");
    } catch (e) {
      showToast(e.message || "Could not delete this listing.");
    }
  }
  async function setCarStatus(id, status) {
    try {
      const { car } = await apiFetch(`/cars/${id}/status`, { method: "PATCH", body: { status }, token });
      setCars(cs => cs.map(c => c.id === id ? car : c));
    } catch (e) {
      showToast(e.message || "Could not update status.");
    }
  }
  async function setLeadStatus(id, status) {
    try {
      const { lead } = await apiFetch(`/leads/${id}`, { method: "PUT", body: { status }, token });
      setLeads(ls => ls.map(l => l.id === id ? { ...l, ...lead } : l));
    } catch (e) {
      showToast(e.message || "Could not update lead.");
    }
  }
  async function updateHeroImage(url) {
    try {
      const { settings: updated } = await apiFetch("/settings", { method: "PUT", body: { heroImage: url }, token });
      setSettings(updated);
      showToast("Homepage photo updated.");
    } catch (e) {
      showToast(e.message || "Could not update homepage photo.");
    }
  }

  const filteredCars = cars.filter(c => {
    if (wishlistOnly && !wishlist.includes(c.id)) return false;
    if (filters.q && !(`${c.brand} ${c.model} ${c.stockNo}`.toLowerCase().includes(filters.q.toLowerCase()))) return false;
    if (filters.brand !== "All" && c.brand !== filters.brand) return false;
    if (filters.body !== "All" && c.bodyType !== filters.body) return false;
    if (filters.fuel !== "All" && c.fuel !== filters.fuel) return false;
    if (filters.minPrice && c.price < Number(filters.minPrice)) return false;
    if (filters.maxPrice && c.price > Number(filters.maxPrice)) return false;
    return true;
  }).sort((a, b) => {
    if (filters.sort === "priceLow") return a.price - b.price;
    if (filters.sort === "priceHigh") return b.price - a.price;
    if (filters.sort === "yearNew") return b.year - a.year;
    if (filters.sort === "mileageLow") return a.mileage - b.mileage;
    return b.createdAt - a.createdAt;
  });

  async function sendChat(overrideText) {
    const text = (overrideText || chatInput).trim();
    if (!text || chatLoading) return;
    const nextMessages = [...chatMessages, { role: "user", text }];
    setChatMessages(nextMessages);
    setChatInput("");
    setChatLoading(true);
    try {
      // The backend builds the system prompt from LIVE inventory in Postgres
      // and holds the real Anthropic API key — the browser never sees it.
      const { reply } = await apiFetch("/chat", { method: "POST", body: { messages: nextMessages } });
      setChatMessages(m => [...m, { role: "assistant", text: reply }]);
    } catch (e) {
      setChatMessages(m => [...m, { role: "assistant", text: "I'm having trouble connecting right now. Please try again in a moment, or call the showroom directly." }]);
    } finally {
      setChatLoading(false);
    }
  }

  if (!ready) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 400, fontFamily: "Inter, sans-serif", color: "#5B6B66" }}>
        <Loader2 className="ggm-spin" size={22} style={{ marginRight: 10 }} /> Loading GariGhor Motors...
      </div>
    );
  }

  return (
    <div className="ggm-app" style={{ fontFamily: "'Inter', sans-serif", background: "#F3EFE6", color: "#14181F", minHeight: 600, position: "relative" }}>
      <GlobalStyle />

      {view !== "admin" && (
        <SiteHeader
          navOpen={navOpen} setNavOpen={setNavOpen} view={view} setView={setView}
          goCatalog={goCatalog} goWishlist={goWishlist} profile={profile} setAuthMode={setAuthMode}
          wishCount={wishlist.length} logOut={logOut}
          onOpenConsole={() => { setView("admin"); setAdminTab("overview"); }}
        />
      )}

      {view === "home" && (
        <HomePage cars={cars} goCatalog={goCatalog} onView={setSelectedCar} onToggleWish={toggleWish} wishlist={wishlist} setChatOpen={setChatOpen} heroImage={settings?.heroImage} />
      )}
      {view === "catalog" && (
        <CatalogPage cars={filteredCars} total={cars.length} filters={filters} setFilters={setFilters}
          onView={setSelectedCar} onToggleWish={toggleWish} wishlist={wishlist}
          wishlistOnly={wishlistOnly} onShowAll={goCatalog} />
      )}
      {view === "admin" && isAdmin && (
        <AdminDashboard
          cars={cars} leads={leads} adminTab={adminTab} setAdminTab={setAdminTab}
          onExit={() => { setView("home"); }} token={token}
          editingCar={editingCar} setEditingCar={setEditingCar} saveCar={saveCar}
          deleteCar={deleteCar} setCarStatus={setCarStatus} setLeadStatus={setLeadStatus}
          heroImage={settings?.heroImage} onUpdateHeroImage={updateHeroImage}
        />
      )}

      {view !== "admin" && <SiteFooter onDealerLogin={() => setAuthMode("login")} />}

      {selectedCar && (
        <CarDetailModal car={selectedCar} onClose={() => setSelectedCar(null)}
          wished={wishlist.includes(selectedCar.id)} onToggleWish={toggleWish}
          onEnquire={() => { setEnquiryFor(selectedCar); }} />
      )}
      {enquiryFor && (
        <EnquiryModal car={enquiryFor} profile={profile} onClose={() => setEnquiryFor(null)} onSubmit={submitEnquiry} />
      )}
      {authMode && (
        <AuthModal mode={authMode} setMode={setAuthMode} onClose={() => setAuthMode(null)} onSubmit={submitAuth} />
      )}

      {view !== "admin" && (
        <ChatWidget open={chatOpen} setOpen={setChatOpen} messages={chatMessages} input={chatInput}
          setInput={setChatInput} loading={chatLoading} onSend={sendChat} endRef={chatEndRef} goCatalog={goCatalog} />
      )}

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#14181F",
          color: "#F3EFE6", padding: "12px 20px", borderRadius: 10, fontSize: 13.5, zIndex: 999, display: "flex",
          alignItems: "center", gap: 8, boxShadow: "0 10px 30px rgba(0,0,0,0.25)", maxWidth: "88%", textAlign: "center",
        }}>
          <CheckCircle2 size={16} color="#8FCBA6" /> {toast}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- global style ---------------------------------- */

function GlobalStyle() {
  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap" />
      <style>{`
        .ggm-app * { box-sizing: border-box; }
        .ggm-app button { font-family: inherit; }
        .ggm-app input, .ggm-app select, .ggm-app textarea { font-family: 'Inter', sans-serif; }
        .ggm-spin { animation: ggm-spin 1s linear infinite; }
        @keyframes ggm-spin { to { transform: rotate(360deg); } }
        @keyframes ggm-fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes ggm-fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .ggm-fade { animation: ggm-fadeUp .35s ease both; }
        .ggm-scrollbar::-webkit-scrollbar { width: 6px; }
        .ggm-scrollbar::-webkit-scrollbar-thumb { background: #D8D2C2; border-radius: 6px; }
      `}</style>
    </>
  );
}

/* ---------------------------------- header ---------------------------------- */

function SiteHeader({ navOpen, setNavOpen, view, setView, goCatalog, goWishlist, profile, setAuthMode, wishCount, logOut, onOpenConsole }) {
  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 40, background: "rgba(243,239,230,0.94)", backdropFilter: "blur(6px)",
      borderBottom: "1px solid #E4DFD2",
    }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div onClick={() => setView("home")} style={{ cursor: "pointer", display: "flex", flexDirection: "column", lineHeight: 1 }}>
          <span style={{ fontSize: 11, letterSpacing: 3, color: "#C98A3D", fontFamily: "'IBM Plex Mono', monospace" }}>গাড়ি ঘর</span>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, letterSpacing: 1 }}>GARIGHOR MOTORS</span>
        </div>

        <nav style={{ display: "flex", alignItems: "center", gap: 26 }} className="ggm-desktop-nav">
          <button onClick={() => setView("home")} style={navLinkStyle(view === "home")}>Home</button>
          <button onClick={() => goCatalog()} style={navLinkStyle(view === "catalog")}>Inventory</button>
          <div style={{ position: "relative" }}>
            <button onClick={goWishlist} style={{ ...navLinkStyle(false), display: "flex", alignItems: "center", gap: 6 }}>
              <Heart size={15} /> Wishlist {wishCount > 0 && <span style={badgeStyle}>{wishCount}</span>}
            </button>
          </div>
          {profile?.role === "admin" && (
            <button onClick={onOpenConsole} style={{ ...navLinkStyle(false), display: "flex", alignItems: "center", gap: 6, color: "#C98A3D" }}>
              <LayoutDashboard size={15} /> Dealer console
            </button>
          )}
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {profile ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#14181F", color: "#F3EFE6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 700 }}>
                {profile.name.slice(0, 1).toUpperCase()}
              </div>
              <span style={{ fontSize: 13.5, fontWeight: 600 }} className="ggm-desktop-nav">{profile.name.split(" ")[0]}</span>
              <button onClick={logOut} title="Sign out" style={{ background: "none", border: "none", cursor: "pointer", color: "#5B6B66", display: "flex" }}><LogOut size={16} /></button>
            </div>
          ) : (
            <button onClick={() => setAuthMode("login")} style={ctaGhost} className="ggm-desktop-nav">Log in</button>
          )}
          <button onClick={() => goCatalog()} style={ctaSolid}>Browse cars</button>
          <button onClick={() => setNavOpen(!navOpen)} style={{ display: "none", background: "none", border: "none", cursor: "pointer" }} className="ggm-mobile-toggle">
            <Menu size={22} />
          </button>
        </div>
      </div>
      <style>{`
        @media (max-width: 720px) {
          .ggm-desktop-nav { display: none !important; }
          .ggm-mobile-toggle { display: flex !important; }
        }
      `}</style>
      {navOpen && (
        <div style={{ borderTop: "1px solid #E4DFD2", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <button onClick={() => { setView("home"); setNavOpen(false); }} style={navLinkStyle(false)}>Home</button>
          <button onClick={() => goCatalog()} style={navLinkStyle(false)}>Inventory</button>
          <button onClick={() => { goWishlist(); setNavOpen(false); }} style={navLinkStyle(false)}>Wishlist {wishCount > 0 && `(${wishCount})`}</button>
          {!profile && <button onClick={() => { setAuthMode("login"); setNavOpen(false); }} style={navLinkStyle(false)}>Log in</button>}
          {profile?.role === "admin" && <button onClick={() => { onOpenConsole(); setNavOpen(false); }} style={navLinkStyle(false)}>Dealer console</button>}
        </div>
      )}
    </header>
  );
}
const navLinkStyle = (active) => ({
  background: "none", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600,
  color: active ? "#14181F" : "#5B6B66", padding: 0,
});
const badgeStyle = { background: "#C98A3D", color: "#fff", fontSize: 10.5, borderRadius: 20, padding: "1px 6px", fontWeight: 700 };
const ctaSolid = { background: "#14181F", color: "#F3EFE6", border: "none", padding: "10px 18px", borderRadius: 9, fontSize: 13.5, fontWeight: 700, cursor: "pointer" };
const ctaGhost = { background: "none", border: "1px solid #C9C3B2", padding: "9px 16px", borderRadius: 9, fontSize: 13.5, fontWeight: 700, cursor: "pointer", color: "#14181F" };

/* ---------------------------------- home page ---------------------------------- */

function HomePage({ cars, goCatalog, onView, onToggleWish, wishlist, setChatOpen, heroImage }) {
  const featured = cars.filter(c => c.featured).slice(0, 4);
  return (
    <main>
      <section style={{
        background: "linear-gradient(120deg, #14181F 0%, #1E2A26 60%, #14181F 100%)", color: "#F3EFE6",
        padding: "72px 20px 90px", position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.06, backgroundImage: "repeating-linear-gradient(115deg, #fff 0, #fff 1px, transparent 1px, transparent 60px)" }} />
        <div style={{ maxWidth: 1180, margin: "0 auto", position: "relative", display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 40, alignItems: "center" }} className="ggm-hero-grid">
          <div className="ggm-fade">
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, letterSpacing: 2, color: "#C98A3D", marginBottom: 14 }}>
              CHATTOGRAM &middot; RECONDITIONED &amp; LOCAL STOCK
            </div>
            <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(40px, 6vw, 68px)", lineHeight: 0.98, letterSpacing: 0.5, margin: "0 0 18px" }}>
              EVERY CAR INSPECTED TWICE.<br />PRICED ONCE.
            </h1>
            <p style={{ fontSize: 16, color: "#C7C2B4", maxWidth: 480, lineHeight: 1.6, marginBottom: 30 }}>
              We hand-pick reconditioned Japanese imports and trusted local trade-ins, verify every auction sheet ourselves, and hang the real price on the windscreen. No haggling games.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button onClick={() => goCatalog()} style={{ ...ctaSolid, background: "#C98A3D", color: "#14181F", padding: "13px 24px", fontSize: 14 }}>Browse inventory <ArrowRight size={14} style={{ verticalAlign: -2, marginLeft: 4 }} /></button>
              <button onClick={() => setChatOpen(true)} style={{ ...ctaGhost, background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.25)", color: "#F3EFE6" }}>
                <Bot size={15} style={{ verticalAlign: -3, marginRight: 6 }} />Ask the assistant
              </button>
            </div>
            <div style={{ display: "flex", gap: 26, marginTop: 44, flexWrap: "wrap" }}>
              {[["150-pt", "Inspection checklist"], ["Auction-sheet", "Verified on every unit"], ["1-year", "Engine & transmission cover"]].map((s, i) => (
                <div key={i}>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: "#C98A3D" }}>{s[0]}</div>
                  <div style={{ fontSize: 12, color: "#9B9689" }}>{s[1]}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="ggm-fade" style={{ animationDelay: ".1s" }}>
            <div style={{ borderRadius: 18, overflow: "hidden", border: "1px solid rgba(255,255,255,0.12)", height: 340 }}>
              {heroImage ? <img src={heroImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Placeholder brand="Toyota" model="" />}
            </div>
          </div>
        </div>
      </section>

      <section style={{ maxWidth: 1180, margin: "0 auto", padding: "48px 20px 10px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: "#8A8578", letterSpacing: 1.5, marginBottom: 4 }}>THIS WEEK'S PICKS</div>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, margin: 0 }}>FEATURED INVENTORY</h2>
          </div>
          <button onClick={() => goCatalog()} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 700, color: "#14181F", display: "flex", alignItems: "center", gap: 4 }}>
            View all {cars.length} cars <ArrowRight size={14} />
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(255px, 1fr))", gap: 22 }}>
          {featured.map(c => <CarCard key={c.id} car={c} onView={onView} onToggleWish={onToggleWish} wished={wishlist.includes(c.id)} />)}
        </div>
      </section>

      <section style={{ maxWidth: 1180, margin: "0 auto", padding: "70px 20px" }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: "#8A8578", letterSpacing: 1.5, marginBottom: 4, textAlign: "center" }}>WHY BUY FROM US</div>
        <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, margin: "0 0 34px", textAlign: "center" }}>THE PAPERWORK IS ALREADY DONE</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 20 }}>
          {[
            [FileCheck2, "Auction sheet on file", "Every Japan-import unit is sold with its original auction sheet grade, translated and explained in plain language."],
            [Wrench, "150-point inspection", "Engine, transmission, suspension, electricals and body are checked before a car is ever listed."],
            [ShieldCheck, "1-year engine warranty", "Covers the engine and transmission for 12 months or 15,000 km, whichever comes first."],
            [Bot, "AI showroom assistant", "Ask questions any time - compare models, understand grading, or get help booking a visit."],
          ].map(([Icon, title, desc], i) => (
            <div key={i} style={{ background: "#FFFDF9", border: "1px solid #E4DFD2", borderRadius: 14, padding: 22 }}>
              <Icon size={22} color="#C98A3D" style={{ marginBottom: 12 }} />
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{title}</div>
              <div style={{ fontSize: 13.5, color: "#5B6B66", lineHeight: 1.55 }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ background: "#14181F", color: "#F3EFE6", padding: "50px 20px" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", gap: 26, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, margin: "0 0 6px" }}>VISIT THE SHOWROOM FLOOR</h2>
            <div style={{ color: "#9B9689", fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}><MapPin size={15} /> Agrabad Access Road, Chattogram, Bangladesh</div>
          </div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}><Phone size={15} color="#C98A3D" /> +880 1XXX-XXXXXX</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}><Clock size={15} color="#C98A3D" /> Sat - Thu, 10am - 8pm</div>
          </div>
        </div>
      </section>
      <style>{`@media (max-width: 820px) { .ggm-hero-grid { grid-template-columns: 1fr !important; } }`}</style>
    </main>
  );
}

/* ---------------------------------- catalog page ---------------------------------- */

function CatalogPage({ cars, total, filters, setFilters, onView, onToggleWish, wishlist, wishlistOnly, onShowAll }) {
  const [showFilters, setShowFilters] = useState(false);
  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 20px 70px" }}>
      <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: "#8A8578", letterSpacing: 1.5 }}>
            {wishlistOnly ? `${cars.length} SAVED CAR${cars.length === 1 ? "" : "S"}` : `${total} CARS ON THE LOT`}
          </div>
          <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 34, margin: "2px 0 0" }}>{wishlistOnly ? "YOUR WISHLIST" : "INVENTORY"}</h1>
        </div>
        {wishlistOnly && (
          <button onClick={onShowAll} style={{ ...ctaGhost, display: "flex", alignItems: "center", gap: 6 }}>
            <Car size={14} /> Show full inventory
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 260px" }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: 11, color: "#8A8578" }} />
          <input value={filters.q} onChange={e => set("q", e.target.value)} placeholder="Search brand, model, or stock number"
            style={{ width: "100%", padding: "10px 12px 10px 34px", borderRadius: 9, border: "1px solid #D8D2C2", fontSize: 13.5, background: "#FFFDF9" }} />
        </div>
        <select value={filters.sort} onChange={e => set("sort", e.target.value)} style={selectStyle}>
          <option value="newest">Newest listed</option>
          <option value="priceLow">Price: low to high</option>
          <option value="priceHigh">Price: high to low</option>
          <option value="yearNew">Year: newest</option>
          <option value="mileageLow">Mileage: lowest</option>
        </select>
        <button onClick={() => setShowFilters(!showFilters)} style={{ ...ctaGhost, display: "flex", alignItems: "center", gap: 6 }}>
          <SlidersHorizontal size={14} /> Filters
        </button>
      </div>

      {showFilters && (
        <div className="ggm-fade" style={{ background: "#FFFDF9", border: "1px solid #E4DFD2", borderRadius: 14, padding: 18, marginBottom: 22, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
          <FilterField label="Brand"><select value={filters.brand} onChange={e => set("brand", e.target.value)} style={selectStyle}><option>All</option>{BRANDS.map(b => <option key={b}>{b}</option>)}</select></FilterField>
          <FilterField label="Body type"><select value={filters.body} onChange={e => set("body", e.target.value)} style={selectStyle}><option>All</option>{BODY_TYPES.map(b => <option key={b}>{b}</option>)}</select></FilterField>
          <FilterField label="Fuel"><select value={filters.fuel} onChange={e => set("fuel", e.target.value)} style={selectStyle}><option>All</option>{FUEL_TYPES.map(b => <option key={b}>{b}</option>)}</select></FilterField>
          <FilterField label="Min price (BDT)"><input type="number" value={filters.minPrice} onChange={e => set("minPrice", e.target.value)} placeholder="0" style={selectStyle} /></FilterField>
          <FilterField label="Max price (BDT)"><input type="number" value={filters.maxPrice} onChange={e => set("maxPrice", e.target.value)} placeholder="No limit" style={selectStyle} /></FilterField>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button onClick={() => setFilters({ q: "", brand: "All", body: "All", fuel: "All", minPrice: "", maxPrice: "", sort: "newest" })} style={{ ...ctaGhost, width: "100%" }}>Clear filters</button>
          </div>
        </div>
      )}

      {cars.length === 0 ? (
        <div style={{ textAlign: "center", padding: "70px 20px", color: "#8A8578" }}>
          {wishlistOnly ? (
            <>
              <Heart size={36} style={{ marginBottom: 12, opacity: 0.5 }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: "#14181F" }}>You haven't saved any cars yet</div>
              <div style={{ fontSize: 13.5, marginTop: 4, marginBottom: 18 }}>Tap the heart icon on any car to add it here.</div>
              <button onClick={onShowAll} style={ctaSolid}>Browse inventory</button>
            </>
          ) : (
            <>
              <Car size={36} style={{ marginBottom: 12, opacity: 0.5 }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: "#14181F" }}>No cars match those filters</div>
              <div style={{ fontSize: 13.5, marginTop: 4 }}>Try widening your price range or clearing a filter.</div>
            </>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(255px, 1fr))", gap: 22 }}>
          {cars.map(c => <CarCard key={c.id} car={c} onView={onView} onToggleWish={onToggleWish} wished={wishlist.includes(c.id)} />)}
        </div>
      )}
    </main>
  );
}
function FilterField({ label, children }) {
  return <div><div style={{ fontSize: 11.5, color: "#8A8578", marginBottom: 5, fontWeight: 600 }}>{label}</div>{children}</div>;
}
const selectStyle = { padding: "10px 12px", borderRadius: 9, border: "1px solid #D8D2C2", fontSize: 13.5, background: "#FFFDF9", width: "100%" };

/* ---------------------------------- car detail modal ---------------------------------- */

function ModalShell({ onClose, children, maxWidth = 640 }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(20,24,31,0.6)", zIndex: 200, display: "flex",
      alignItems: "center", justifyContent: "center", padding: 16, animation: "ggm-fadeIn .2s ease",
    }}>
      <div onClick={e => e.stopPropagation()} className="ggm-fade ggm-scrollbar" style={{
        background: "#F9F7F1", borderRadius: 16, maxWidth, width: "100%", maxHeight: "88vh", overflowY: "auto",
        position: "relative",
      }}>
        {children}
      </div>
    </div>
  );
}

function CarDetailModal({ car, onClose, wished, onToggleWish, onEnquire }) {
  return (
    <ModalShell onClose={onClose} maxWidth={720}>
      <button onClick={onClose} style={{ position: "absolute", top: 14, right: 14, background: "#14181F", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 5 }}>
        <X size={16} color="#F3EFE6" />
      </button>
      <div style={{ height: 280, position: "relative" }}>
        {car.image ? <img src={car.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Placeholder brand={car.brand} model={car.model} />}
        <div style={{ position: "absolute", top: 14, left: 14 }}><StatusPill status={car.status} /></div>
      </div>
      <div style={{ padding: "22px 26px 28px" }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#8A8578", letterSpacing: 1 }}>STOCK #{car.stockNo} &middot; AUCTION GRADE {car.auctionGrade}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 34, margin: "4px 0 6px", letterSpacing: 0.5 }}>{car.brand.toUpperCase()} {car.model.toUpperCase()}</h2>
          <button onClick={() => onToggleWish(car.id)} style={{ ...ctaGhost, display: "flex", alignItems: "center", gap: 6 }}>
            <Heart size={14} color={wished ? "#C98A3D" : "#14181F"} fill={wished ? "#C98A3D" : "none"} /> {wished ? "Saved" : "Save"}
          </button>
        </div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 30, color: "#C98A3D", marginBottom: 18 }}>{formatBDT(car.price)}</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
          {[[Calendar, "Model / Reg. year", `${car.year} / ${car.regYear}`], [Gauge, "Mileage", formatKm(car.mileage)], [Fuel, "Fuel", car.fuel],
          [Cog, "Transmission", car.transmission], [Settings, "Engine", car.engineCC + " cc"], [Palette, "Color", car.color],
          [Award, "Condition", car.condition], [Car, "Body type", car.bodyType]].map(([Icon, label, value], i) => (
            <div key={i} style={{ background: "#FFFDF9", border: "1px solid #E4DFD2", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#8A8578", fontSize: 11, marginBottom: 4 }}><Icon size={12} />{label}</div>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 13.5, lineHeight: 1.65, color: "#3A3A36", marginBottom: 20 }}>{car.desc}</div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#8A8578", marginBottom: 8, letterSpacing: 0.5 }}>FEATURES</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {car.features.map((f, i) => (
              <span key={i} style={{ background: "#E4EFE8", color: "#215A3F", fontSize: 12, padding: "6px 11px", borderRadius: 20, display: "flex", alignItems: "center", gap: 5 }}>
                <CheckCircle2 size={12} />{f}
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button disabled={car.status === "sold"} onClick={onEnquire} style={{ ...ctaSolid, flex: 1, padding: "13px 18px", opacity: car.status === "sold" ? 0.5 : 1, cursor: car.status === "sold" ? "not-allowed" : "pointer" }}>
            {car.status === "sold" ? "This car has been sold" : "Enquire / Book a test drive"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

/* ---------------------------------- enquiry modal ---------------------------------- */

function EnquiryModal({ car, profile, onClose, onSubmit }) {
  const [form, setForm] = useState({ name: profile?.name || "", email: profile?.email || "", phone: "", message: `I'm interested in the ${car.brand} ${car.model} (${car.stockNo}).`, type: "enquiry" });
  const [error, setError] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  function submit() {
    if (!form.name.trim() || !form.phone.trim()) { setError("Please add your name and phone number so we can reach you."); return; }
    onSubmit(car.id, form);
  }
  return (
    <ModalShell onClose={onClose} maxWidth={440}>
      <div style={{ padding: 26 }}>
        <button onClick={onClose} style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", cursor: "pointer" }}><X size={18} /></button>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#8A8578", letterSpacing: 1 }}>{car.stockNo}</div>
        <h3 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, margin: "2px 0 18px" }}>{car.brand.toUpperCase()} {car.model.toUpperCase()}</h3>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[["enquiry", "General enquiry"], ["testdrive", "Book test drive"]].map(([val, label]) => (
            <button key={val} onClick={() => set("type", val)} style={{
              flex: 1, padding: "9px 10px", borderRadius: 9, border: form.type === val ? "1px solid #14181F" : "1px solid #D8D2C2",
              background: form.type === val ? "#14181F" : "#FFFDF9", color: form.type === val ? "#F3EFE6" : "#14181F", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
            }}>{label}</button>
          ))}
        </div>
        <FormInput label="Full name" value={form.name} onChange={v => set("name", v)} placeholder="Your name" />
        <FormInput label="Phone number" value={form.phone} onChange={v => set("phone", v)} placeholder="01XXX-XXXXXX" />
        <FormInput label="Email (optional)" value={form.email} onChange={v => set("email", v)} placeholder="you@example.com" />
        <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: "#5B6B66" }}>Message</div>
        <textarea value={form.message} onChange={e => set("message", e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical", marginBottom: 16 }} />
        {error && <div style={{ color: "#B5482F", fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
        <button onClick={submit} style={{ ...ctaSolid, width: "100%", padding: "13px" }}>Send to showroom</button>
      </div>
    </ModalShell>
  );
}
function FormInput({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: "#5B6B66" }}>{label}</div>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
    </div>
  );
}
const inputStyle = { width: "100%", padding: "11px 13px", borderRadius: 9, border: "1px solid #D8D2C2", fontSize: 13.5, background: "#FFFDF9" };

/* ---------------------------------- auth modal (styled after the reference flow) ---------------------------------- */

function AuthModal({ mode, setMode, onClose, onSubmit }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  async function submit() {
    if (!form.email.includes("@")) { setError("Enter a valid email address."); return; }
    if (form.password.length < 6) { setError("Password should be at least 6 characters."); return; }
    if (mode === "register" && form.password !== form.confirm) { setError("Passwords don't match."); return; }
    if (mode === "register" && !form.name.trim()) { setError("Tell us your name."); return; }
    setError(""); setSubmitting(true);
    try {
      await onSubmit(mode, form); // talks to the real backend — throws with a server message on failure
    } catch (e) {
      setError(e.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,24,31,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="ggm-fade" style={{
        width: "100%", maxWidth: 460, borderRadius: 18, overflow: "hidden", position: "relative",
        background: "linear-gradient(160deg, #3A2E22 0%, #14181F 80%)", border: "1px solid rgba(255,255,255,0.1)",
      }}>
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "rgba(0,0,0,0.3)", border: "none", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 3 }}>
          <X size={15} color="#F3EFE6" />
        </button>
        <div style={{ padding: "30px 30px 8px", color: "#F3EFE6" }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: 2, color: "#C98A3D" }}>গাড়ি ঘর</div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: 0.5 }}>GARIGHOR MOTORS</div>
        </div>
        <div style={{ padding: "18px 30px 30px" }}>
          <div style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 16, padding: 20 }}>
            {mode === "register" && (
              <AuthField icon={User} placeholder="Full name" value={form.name} onChange={v => set("name", v)} />
            )}
            <AuthField icon={Mail} placeholder="Email address" value={form.email} onChange={v => set("email", v)} />
            <AuthField icon={ShieldCheck} placeholder="Password" type="password" value={form.password} onChange={v => set("password", v)} />
            {mode === "register" && (
              <AuthField icon={ShieldCheck} placeholder="Confirm password" type="password" value={form.confirm} onChange={v => set("confirm", v)} last />
            )}
            {error && <div style={{ color: "#F0A98F", fontSize: 12.5, marginTop: 4, marginBottom: 4 }}>{error}</div>}
            <button onClick={submit} disabled={submitting} style={{ width: "100%", marginTop: 14, background: "#C98A3D", color: "#14181F", border: "none", borderRadius: 12, padding: "13px", fontWeight: 700, fontSize: 14, cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {submitting ? <Loader2 size={15} className="ggm-spin" /> : mode === "login" ? <>Log in <LogIn size={15} /></> : <>Create account <UserPlus size={15} /></>}
            </button>
          </div>
          <div style={{ textAlign: "center", marginTop: 18, fontSize: 13, color: "#C7C2B4" }}>
            {mode === "login" ? (
              <>New to GariGhor? <button onClick={() => { setError(""); setMode("register"); }} style={linkBtn}>Create an account</button></>
            ) : (
              <>Already registered? <button onClick={() => { setError(""); setMode("login"); }} style={linkBtn}>Log in</button></>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
function AuthField({ icon: Icon, placeholder, value, onChange, type = "text", last }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", background: "rgba(0,0,0,0.25)", borderRadius: 30, padding: "13px 18px",
      marginBottom: last ? 0 : 12,
    }}>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#F3EFE6", fontSize: 14 }} />
      <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#14181F", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={13} color="#F3EFE6" />
      </div>
    </div>
  );
}
const linkBtn = { background: "none", border: "none", color: "#C98A3D", fontWeight: 700, cursor: "pointer", fontSize: 13, padding: 0 };

/* ---------------------------------- admin dashboard ---------------------------------- */

function AdminDashboard({ cars, leads, adminTab, setAdminTab, onExit, token, editingCar, setEditingCar, saveCar, deleteCar, setCarStatus, setLeadStatus, heroImage, onUpdateHeroImage }) {
  const available = cars.filter(c => c.status === "available").length;
  const reserved = cars.filter(c => c.status === "reserved").length;
  const sold = cars.filter(c => c.status === "sold").length;
  const inventoryValue = cars.filter(c => c.status !== "sold").reduce((s, c) => s + c.price, 0);
  const newLeads = leads.filter(l => l.status === "new").length;
  const [invSearch, setInvSearch] = useState("");
  const [heroUploading, setHeroUploading] = useState(false);

  async function handleHeroPhotoChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setHeroUploading(true);
    try {
      const data = new FormData();
      data.append("image", file);
      const { url } = await apiFetch("/uploads", { method: "POST", body: data, token });
      await onUpdateHeroImage(url);
    } catch (err) {
      // onUpdateHeroImage / apiFetch already surface errors via toast at the App level
    } finally {
      setHeroUploading(false);
      e.target.value = "";
    }
  }

  const tabs = [["overview", LayoutDashboard, "Overview"], ["inventory", Package, "Inventory"], ["leads", Users, "Leads", newLeads]];

  return (
    <div className="ggm-admin-shell" style={{ display: "flex", minHeight: "100vh", background: "#F3EFE6" }}>
      <style>{`
        @media (max-width: 780px) {
          .ggm-admin-shell { flex-direction: column !important; }
          .ggm-admin-aside { width: 100% !important; padding: 10px 12px !important; display: flex !important; align-items: center !important; gap: 8px !important; }
          .ggm-admin-title { display: none !important; }
          .ggm-admin-nav { display: flex !important; flex-direction: row !important; gap: 6px !important; overflow-x: auto !important; flex: 1 !important; }
          .ggm-admin-navbtn { width: auto !important; white-space: nowrap !important; margin-bottom: 0 !important; padding: 8px 10px !important; }
          .ggm-admin-divider { display: none !important; }
          .ggm-admin-main { padding: 16px !important; }
        }
      `}</style>
      <aside className="ggm-admin-aside" style={{ width: 210, background: "#14181F", color: "#F3EFE6", padding: "22px 16px", flexShrink: 0 }}>
        <div className="ggm-admin-title" style={{ marginBottom: 30, paddingLeft: 4 }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: 2, color: "#C98A3D" }}>গাড়ি ঘর</div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20 }}>DEALER CONSOLE</div>
        </div>
        <div className="ggm-admin-nav">
          {tabs.map(([key, Icon, label, count]) => (
            <button key={key} className="ggm-admin-navbtn" onClick={() => setAdminTab(key)} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: 9,
              background: adminTab === key ? "rgba(201,138,61,0.18)" : "transparent", border: "none", cursor: "pointer",
              color: adminTab === key ? "#C98A3D" : "#C7C2B4", fontSize: 13.5, fontWeight: 600, marginBottom: 4, textAlign: "left",
            }}>
              <Icon size={16} /> {label} {count > 0 && <span style={{ marginLeft: "auto", background: "#C98A3D", color: "#14181F", fontSize: 10.5, padding: "1px 7px", borderRadius: 20, fontWeight: 800 }}>{count}</span>}
            </button>
          ))}
        </div>
        <div className="ggm-admin-divider" style={{ height: 1, background: "rgba(255,255,255,0.12)", margin: "16px 0" }} />
        <button onClick={onExit} className="ggm-admin-navbtn" style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: 9, background: "transparent", border: "none", cursor: "pointer", color: "#C7C2B4", fontSize: 13.5, fontWeight: 600 }}>
          <LogOut size={16} /> Exit to site
        </button>
      </aside>

      <main className="ggm-admin-main" style={{ flex: 1, padding: "28px 30px", overflowX: "hidden" }}>
        {adminTab === "overview" && (
          <div className="ggm-fade">
            <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 30, margin: "0 0 20px" }}>OVERVIEW</h1>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 28 }}>
              <StatCard icon={Package} label="Total listings" value={cars.length} />
              <StatCard icon={CheckCircle2} label="Available now" value={available} accent="#215A3F" />
              <StatCard icon={Clock} label="Reserved" value={reserved} accent="#8A5A15" />
              <StatCard icon={TrendingUp} label="Sold" value={sold} accent="#8A3418" />
              <StatCard icon={Users} label="New leads" value={newLeads} accent="#C98A3D" />
              <StatCard icon={BadgeCheck} label="Lot value (unsold)" value={formatBDT(inventoryValue)} isText />
            </div>
            <div style={{ background: "#FFFDF9", border: "1px solid #E4DFD2", borderRadius: 14, padding: 20, marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 4 }}>Homepage photo</div>
              <div style={{ fontSize: 12.5, color: "#8A8578", marginBottom: 14 }}>The large photo shown in the homepage hero banner, next to "Every car inspected twice."</div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 120, height: 76, borderRadius: 10, overflow: "hidden", border: "1px solid #E4DFD2", flexShrink: 0, background: "#F2EEE3", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {heroImage ? <img src={heroImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Car size={20} color="#C9C3B2" />}
                </div>
                <div>
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleHeroPhotoChange} disabled={heroUploading} style={{ fontSize: 12.5 }} />
                  {heroUploading && <div style={{ fontSize: 11.5, color: "#8A8578", marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}><Loader2 size={11} className="ggm-spin" /> Uploading...</div>}
                </div>
              </div>
            </div>
            <div style={{ background: "#FFFDF9", border: "1px solid #E4DFD2", borderRadius: 14, padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 14 }}>Recent enquiries</div>
              {leads.slice(0, 5).length === 0 ? <div style={{ fontSize: 13, color: "#8A8578" }}>No enquiries yet - once customers enquire on a car, they'll show up here.</div> :
                leads.slice(0, 5).map(l => (
                  <div key={l.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #EDE8DB", fontSize: 13 }}>
                    <div><b>{l.name}</b> &middot; {l.carLabel}</div>
                    <div style={{ color: "#8A8578" }}>{timeAgo(l.createdAt)}</div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {adminTab === "inventory" && (
          <div className="ggm-fade">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
              <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 30, margin: 0 }}>INVENTORY</h1>
              <button onClick={() => setEditingCar("new")} style={{ ...ctaSolid, display: "flex", alignItems: "center", gap: 6 }}><Plus size={15} /> Add new car</button>
            </div>
            <input value={invSearch} onChange={e => setInvSearch(e.target.value)} placeholder="Search inventory..." style={{ ...inputStyle, maxWidth: 320, marginBottom: 16 }} />
            <div style={{ background: "#FFFDF9", border: "1px solid #E4DFD2", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#F2EEE3", textAlign: "left" }}>
                      {["Stock #", "Car", "Year", "Price", "Mileage", "Status", "Actions"].map(h => (
                        <th key={h} style={{ padding: "11px 14px", fontSize: 11.5, color: "#8A8578", fontWeight: 700, letterSpacing: 0.5 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cars.filter(c => `${c.brand} ${c.model} ${c.stockNo}`.toLowerCase().includes(invSearch.toLowerCase())).map(c => (
                      <tr key={c.id} style={{ borderTop: "1px solid #EDE8DB" }}>
                        <td style={{ padding: "10px 14px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{c.stockNo}</td>
                        <td style={{ padding: "10px 14px", fontWeight: 600 }}>{c.brand} {c.model}</td>
                        <td style={{ padding: "10px 14px" }}>{c.year}</td>
                        <td style={{ padding: "10px 14px" }}>{formatBDT(c.price)}</td>
                        <td style={{ padding: "10px 14px" }}>{formatKm(c.mileage)}</td>
                        <td style={{ padding: "10px 14px" }}>
                          <select value={c.status} onChange={e => setCarStatus(c.id, e.target.value)} style={{ ...selectStyle, padding: "5px 8px", fontSize: 12, width: "auto" }}>
                            <option value="available">Available</option><option value="reserved">Reserved</option><option value="sold">Sold</option>
                          </select>
                        </td>
                        <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                          <button onClick={() => setEditingCar(c)} style={iconBtn} title="Edit"><Edit2 size={14} /></button>
                          <button onClick={() => { if (confirm(`Remove ${c.brand} ${c.model} from inventory?`)) deleteCar(c.id); }} style={iconBtn} title="Delete"><Trash2 size={14} color="#B5482F" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {adminTab === "leads" && (
          <div className="ggm-fade">
            <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 30, margin: "0 0 20px" }}>CUSTOMER LEADS</h1>
            {leads.length === 0 ? (
              <div style={{ background: "#FFFDF9", border: "1px solid #E4DFD2", borderRadius: 14, padding: 40, textAlign: "center", color: "#8A8578" }}>
                No enquiries yet. When a customer submits an enquiry or test-drive request, it will appear here for follow-up.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {leads.map(l => (
                  <div key={l.id} style={{ background: "#FFFDF9", border: "1px solid #E4DFD2", borderRadius: 12, padding: 16, display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <b style={{ fontSize: 14.5 }}>{l.name}</b>
                        <span style={{ fontSize: 11, background: l.type === "testdrive" ? "#E4EFE8" : "#F2EEE3", color: l.type === "testdrive" ? "#215A3F" : "#5B6B66", padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>
                          {l.type === "testdrive" ? "Test drive" : "Enquiry"}
                        </span>
                      </div>
                      <div style={{ fontSize: 12.5, color: "#5B6B66", marginBottom: 6 }}>{l.carLabel} &middot; {timeAgo(l.createdAt)}</div>
                      <div style={{ fontSize: 13, color: "#3A3A36", marginBottom: 6 }}>{l.message}</div>
                      <div style={{ display: "flex", gap: 14, fontSize: 12.5, color: "#5B6B66" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Phone size={12} />{l.phone}</span>
                        {l.email && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Mail size={12} />{l.email}</span>}
                      </div>
                    </div>
                    <select value={l.status} onChange={e => setLeadStatus(l.id, e.target.value)} style={{ ...selectStyle, width: "auto", height: 36, alignSelf: "flex-start" }}>
                      <option value="new">New</option><option value="contacted">Contacted</option><option value="closed">Closed</option>
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {editingCar && <CarFormModal car={editingCar === "new" ? null : editingCar} token={token} onClose={() => setEditingCar(null)} onSave={saveCar} />}
    </div>
  );
}
function StatCard({ icon: Icon, label, value, accent = "#14181F", isText }) {
  return (
    <div style={{ background: "#FFFDF9", border: "1px solid #E4DFD2", borderRadius: 14, padding: 16 }}>
      <Icon size={17} color={accent} style={{ marginBottom: 8 }} />
      <div style={{ fontFamily: isText ? "'Bebas Neue', sans-serif" : "'Bebas Neue', sans-serif", fontSize: isText ? 22 : 26, color: "#14181F" }}>{value}</div>
      <div style={{ fontSize: 12, color: "#8A8578" }}>{label}</div>
    </div>
  );
}
const iconBtn = { background: "none", border: "1px solid #E4DFD2", borderRadius: 7, width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", marginRight: 6 };

/* ---------------------------------- car add/edit form ---------------------------------- */

function CarFormModal({ car, token, onClose, onSave }) {
  const [form, setForm] = useState(car ? { ...car, featuresText: car.features.join(", ") } : {
    id: null, brand: "Toyota", model: "", year: new Date().getFullYear() - 3, regYear: new Date().getFullYear() - 2,
    price: "", mileage: "", fuel: "Petrol", transmission: "Automatic", engineCC: 1500, color: "", condition: "Very Good",
    bodyType: "Sedan", auctionGrade: "4.0 / B", status: "available", featured: false, image: "", desc: "", featuresText: "",
  });
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handlePhotoChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setUploading(true); setError("");
    try {
      const data = new FormData();
      data.append("image", file);
      const { url } = await apiFetch("/uploads", { method: "POST", body: data, token });
      set("image", url);
    } catch (err) {
      setError(err.message || "Photo upload failed.");
    } finally {
      setUploading(false);
      e.target.value = ""; // allow re-selecting the same file later
    }
  }

  function submit() {
    if (!form.model.trim() || !form.price || !form.mileage) { setError("Model, price, and mileage are required."); return; }
    const payload = { ...form, price: Number(form.price), mileage: Number(form.mileage), year: Number(form.year), regYear: Number(form.regYear), engineCC: Number(form.engineCC), features: form.featuresText.split(",").map(s => s.trim()).filter(Boolean) };
    delete payload.featuresText;
    onSave(payload);
  }

  return (
    <ModalShell onClose={onClose} maxWidth={640}>
      <div style={{ padding: 26 }}>
        <button onClick={onClose} style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", cursor: "pointer" }}><X size={18} /></button>
        <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, margin: "0 0 18px" }}>{car ? "EDIT LISTING" : "ADD NEW CAR"}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <LabeledField label="Brand"><select value={form.brand} onChange={e => set("brand", e.target.value)} style={selectStyle}>{BRANDS.map(b => <option key={b}>{b}</option>)}</select></LabeledField>
          <LabeledField label="Model"><input value={form.model} onChange={e => set("model", e.target.value)} placeholder="e.g. Axio Hybrid" style={inputStyle} /></LabeledField>
          <LabeledField label="Model year"><input type="number" value={form.year} onChange={e => set("year", e.target.value)} style={inputStyle} /></LabeledField>
          <LabeledField label="Registration year"><input type="number" value={form.regYear} onChange={e => set("regYear", e.target.value)} style={inputStyle} /></LabeledField>
          <LabeledField label="Price (BDT)"><input type="number" value={form.price} onChange={e => set("price", e.target.value)} placeholder="1850000" style={inputStyle} /></LabeledField>
          <LabeledField label="Mileage (km)"><input type="number" value={form.mileage} onChange={e => set("mileage", e.target.value)} placeholder="45000" style={inputStyle} /></LabeledField>
          <LabeledField label="Fuel type"><select value={form.fuel} onChange={e => set("fuel", e.target.value)} style={selectStyle}>{FUEL_TYPES.map(b => <option key={b}>{b}</option>)}</select></LabeledField>
          <LabeledField label="Transmission"><select value={form.transmission} onChange={e => set("transmission", e.target.value)} style={selectStyle}>{TRANSMISSIONS.map(b => <option key={b}>{b}</option>)}</select></LabeledField>
          <LabeledField label="Engine (cc)"><input type="number" value={form.engineCC} onChange={e => set("engineCC", e.target.value)} style={inputStyle} /></LabeledField>
          <LabeledField label="Color"><input value={form.color} onChange={e => set("color", e.target.value)} placeholder="Pearl White" style={inputStyle} /></LabeledField>
          <LabeledField label="Condition"><select value={form.condition} onChange={e => set("condition", e.target.value)} style={selectStyle}>{CONDITIONS.map(b => <option key={b}>{b}</option>)}</select></LabeledField>
          <LabeledField label="Body type"><select value={form.bodyType} onChange={e => set("bodyType", e.target.value)} style={selectStyle}>{BODY_TYPES.map(b => <option key={b}>{b}</option>)}</select></LabeledField>
          <LabeledField label="Auction grade"><input value={form.auctionGrade} onChange={e => set("auctionGrade", e.target.value)} placeholder="4.5 / B" style={inputStyle} /></LabeledField>
          <LabeledField label="Status"><select value={form.status} onChange={e => set("status", e.target.value)} style={selectStyle}><option value="available">Available</option><option value="reserved">Reserved</option><option value="sold">Sold</option></select></LabeledField>
        </div>
        <LabeledField label="Photo (optional - leave blank to show placeholder)">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {form.image ? (
              <img src={form.image} alt="" style={{ width: 72, height: 54, objectFit: "cover", borderRadius: 8, border: "1px solid #E4DFD2" }} />
            ) : (
              <div style={{ width: 72, height: 54, borderRadius: 8, border: "1px dashed #D8D2C2", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Car size={18} color="#C9C3B2" />
              </div>
            )}
            <div style={{ flex: 1 }}>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoChange} disabled={uploading} style={{ fontSize: 12.5 }} />
              {uploading && <div style={{ fontSize: 11.5, color: "#8A8578", marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}><Loader2 size={11} className="ggm-spin" /> Uploading...</div>}
              {form.image && !uploading && (
                <button type="button" onClick={() => set("image", "")} style={{ background: "none", border: "none", color: "#B5482F", fontSize: 11.5, cursor: "pointer", padding: 0, marginTop: 4 }}>Remove photo</button>
              )}
            </div>
          </div>
        </LabeledField>
        <LabeledField label="Description"><textarea value={form.desc} onChange={e => set("desc", e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} /></LabeledField>
        <LabeledField label="Features (comma-separated)"><input value={form.featuresText} onChange={e => set("featuresText", e.target.value)} placeholder="Sunroof, Cruise Control, Alloy Wheels" style={inputStyle} /></LabeledField>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 18, cursor: "pointer" }}>
          <input type="checkbox" checked={form.featured} onChange={e => set("featured", e.target.checked)} /> Feature this car on the homepage
        </label>
        {error && <div style={{ color: "#B5482F", fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={submit} style={{ ...ctaSolid, flex: 1, padding: 13 }}>{car ? "Save changes" : "Add to inventory"}</button>
          <button onClick={onClose} style={{ ...ctaGhost, padding: 13 }}>Cancel</button>
        </div>
      </div>
    </ModalShell>
  );
}
function LabeledField({ label, children }) {
  return <div style={{ marginBottom: 14 }}><div style={{ fontSize: 12, fontWeight: 600, color: "#5B6B66", marginBottom: 6 }}>{label}</div>{children}</div>;
}

/* ---------------------------------- footer ---------------------------------- */

function SiteFooter({ onDealerLogin }) {
  return (
    <footer style={{ background: "#FFFDF9", borderTop: "1px solid #E4DFD2", padding: "40px 20px 26px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 24 }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, marginBottom: 6 }}>GARIGHOR MOTORS</div>
          <div style={{ fontSize: 12.5, color: "#8A8578", maxWidth: 280, lineHeight: 1.6 }}>Reconditioned and locally-sourced cars, sold with a verified auction sheet and honest pricing. Chattogram, Bangladesh.</div>
        </div>
        <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5, color: "#5B6B66" }}>
            <span style={{ fontWeight: 700, color: "#14181F", marginBottom: 2 }}>Contact</span>
            <span>+880 1XXX-XXXXXX</span>
            <span>hello@garighormotors.example</span>
            <span>Agrabad Access Road, Chattogram</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5, color: "#5B6B66" }}>
            <span style={{ fontWeight: 700, color: "#14181F", marginBottom: 2 }}>Hours</span>
            <span>Sat - Thu: 10am - 8pm</span>
            <span>Friday: Closed</span>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1180, margin: "26px auto 0", paddingTop: 18, borderTop: "1px solid #EDE8DB", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, fontSize: 11.5, color: "#8A8578" }}>
        <span>&copy; {new Date().getFullYear()} GariGhor Motors. All rights reserved.</span>
        <button onClick={onDealerLogin} style={{ background: "none", border: "none", color: "#8A8578", cursor: "pointer", fontSize: 11.5, textDecoration: "underline" }}>Dealer login</button>
      </div>
    </footer>
  );
}

/* ---------------------------------- chat text formatting ---------------------------------- */

// The AI assistant occasionally uses light Markdown (**bold**, "- " bullets)
// even though the system prompt asks it to avoid headers. Rather than fight
// the model, render the handful of patterns it actually uses — no need for
// a full Markdown library for this.
function renderChatText(text) {
  const lines = String(text).split("\n");
  return lines.map((line, i) => {
    const bulletMatch = line.match(/^\s*[-*]\s+(.*)/);
    const content = bulletMatch ? bulletMatch[1] : line;
    const parts = content.split(/(\*\*.+?\*\*)/g).map((part, j) => {
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        return <strong key={j}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
    return (
      <div key={i} style={{ display: "flex", gap: 6, marginTop: i > 0 ? 4 : 0 }}>
        {bulletMatch && <span style={{ flexShrink: 0 }}>&bull;</span>}
        <span>{parts}{line === "" && "\u00A0"}</span>
      </div>
    );
  });
}

/* ---------------------------------- AI chat widget ---------------------------------- */

function ChatWidget({ open, setOpen, messages, input, setInput, loading, onSend, endRef, goCatalog }) {
  const quickPrompts = ["Show me SUVs under 25 lakh", "What does auction grade mean?", "Compare a Toyota Axio and a Honda Fit", "Help me book a test drive"];
  return (
    <>
      <button onClick={() => setOpen(!open)} aria-label="Open AI assistant" style={{
        position: "fixed", bottom: 22, right: 22, width: 56, height: 56, borderRadius: "50%", background: "#14181F",
        border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 150,
        boxShadow: "0 10px 26px rgba(20,24,31,0.35)",
      }}>
        {open ? <X size={22} color="#F3EFE6" /> : <MessageCircle size={22} color="#F3EFE6" />}
      </button>

      {open && (
        <div className="ggm-fade" style={{
          position: "fixed", bottom: 90, right: 22, width: 360, maxWidth: "92vw", height: 480, maxHeight: "70vh",
          background: "#F9F7F1", borderRadius: 16, boxShadow: "0 20px 50px rgba(20,24,31,0.3)", zIndex: 150,
          display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid #E4DFD2",
        }}>
          <div style={{ background: "#14181F", color: "#F3EFE6", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#C98A3D", display: "flex", alignItems: "center", justifyContent: "center" }}><Bot size={16} color="#14181F" /></div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>GariGhor Assistant</div>
              <div style={{ fontSize: 11, color: "#9B9689" }}>Ask about any car in stock</div>
            </div>
          </div>
          <div className="ggm-scrollbar" style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%" }}>
                <div style={{
                  background: m.role === "user" ? "#14181F" : "#FFFDF9", color: m.role === "user" ? "#F3EFE6" : "#14181F",
                  border: m.role === "user" ? "none" : "1px solid #E4DFD2", padding: "9px 13px", borderRadius: 13, fontSize: 13, lineHeight: 1.5,
                }}>{renderChatText(m.text)}</div>
              </div>
            ))}
            {loading && (
              <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#8A8578" }}>
                <Loader2 size={13} className="ggm-spin" /> Thinking...
              </div>
            )}
            {messages.length <= 1 && !loading && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                {quickPrompts.map((q, i) => (
                  <button key={i} onClick={() => onSend(q)} style={{ textAlign: "left", background: "#FFFDF9", border: "1px solid #E4DFD2", borderRadius: 10, padding: "8px 11px", fontSize: 12, cursor: "pointer", color: "#14181F" }}>{q}</button>
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>
          <div style={{ padding: 10, borderTop: "1px solid #E4DFD2", display: "flex", gap: 8, background: "#FFFDF9" }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && onSend()} placeholder="Ask about a car, price, or booking..."
              style={{ flex: 1, border: "1px solid #D8D2C2", borderRadius: 10, padding: "9px 12px", fontSize: 13 }} />
            <button onClick={() => onSend()} disabled={loading} style={{ background: "#14181F", border: "none", borderRadius: 10, width: 38, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <Send size={15} color="#F3EFE6" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
