// app/agent-dashboard/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, TrendingUp, Users, DollarSign, Award, CheckCircle, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient"; // remove if you don't want Supabase calls

type Recruit = {
  id: string;
  name: string;
  recruitsCount: number; // how many people this recruit brought
  recruits?: Recruit[]; // optional nested list (only one-level used here)
};

export default function AgentDashboard() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [revenues, setRevenues] = useState({
    thisWeek: 0,
    thisMonth: 0,
    basicProgram: 0,
    advancedProgram: 0,
  });
  const [directs, setDirects] = useState<Recruit[]>([]); // agent's immediate recruits
  const [mockMode] = useState(false); // set true to force mock data (if your DB differs)

  // --- Eligibility logic helpers ---
  const qualifiesFor = (n: number) => {
    // Agent must have at least n direct recruits AND
    // each direct must have at least n recruits
    if (directs.length < n) return false;
    return directs.slice(0, n).every((d) => (d.recruitsCount ?? 0) >= n);
  };

  // summary numbers for display
  const directCount = directs.length;
  const recruitsTotals = useMemo(() => {
    const counts = directs.map((d) => d.recruitsCount ?? 0);
    const average = counts.length ? Math.round(counts.reduce((s, x) => s + x, 0) / counts.length) : 0;
    return { counts, average, max: Math.max(0, ...(counts.length ? counts : [0])) };
  }, [directs]);

  // --- fetch from supabase (best-effort) else use demo data ---
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        // get session/user
        const { data: sessData, error: sessError } = await supabase.auth.getSession();
        if (sessError) throw sessError;
        const session = sessData?.session;
        const uid = session?.user?.id ?? null;
        if (!mounted) return;
        setAgentId(uid);

        if (!uid || mockMode) {
          // fallback mock data (if user not logged or you want demo)
          setRevenues({
            thisWeek: 2450,
            thisMonth: 15320,
            basicProgram: 8200,
            advancedProgram: 7100,
          });
          setDirects([
            { id: "u1", name: "Ramesh", recruitsCount: 2, recruits: [{ id: "u1a", name: "A", recruitsCount: 0 }, { id: "u1b", name: "B", recruitsCount: 0 }] },
            { id: "u2", name: "Sita", recruitsCount: 2, recruits: [{ id: "u2a", name: "C", recruitsCount: 0 }, { id: "u2b", name: "D", recruitsCount: 0 }] },
            { id: "u3", name: "Kiran", recruitsCount: 1, recruits: [{ id: "u3a", name: "E", recruitsCount: 0 }] },
          ]);
          return;
        }

        // Try to fetch agent revenue (adapt table/column names to your DB)
        // Example: table 'agent_revenues' with columns: auth_user_id, period, amount, program
        try {
          // Example total fetch - adapt to your schema
          const { data: revRows } = await supabase
            .from("agent_revenues")
            .select("*")
            .eq("auth_user_id", uid);

          if (revRows && revRows.length) {
            const thisWeek = revRows.filter((r: any) => r.period === "week").reduce((s: number, r: any) => s + (r.amount || 0), 0);
            const thisMonth = revRows.filter((r: any) => r.period === "month").reduce((s: number, r: any) => s + (r.amount || 0), 0);
            const basicProgram = revRows.filter((r: any) => r.program === "basic").reduce((s: number, r: any) => s + (r.amount || 0), 0);
            const advancedProgram = revRows.filter((r: any) => r.program === "advanced").reduce((s: number, r: any) => s + (r.amount || 0), 0);
            setRevenues({ thisWeek, thisMonth, basicProgram, advancedProgram });
          } else {
            // fallback demo if no rows
            setRevenues({ thisWeek: 2450, thisMonth: 15320, basicProgram: 8200, advancedProgram: 7100 });
          }
        } catch (revErr) {
          console.warn("Revenue fetch error", revErr);
          setRevenues({ thisWeek: 2450, thisMonth: 15320, basicProgram: 8200, advancedProgram: 7100 });
        }

        // Try to fetch referrals: example table 'users' with 'referred_by' column
        try {
          // immediate directs
          const { data: directsRows } = await supabase
            .from("users")
            .select("id, full_name, referred_by")
            .eq("referred_by", uid);

          if (directsRows) {
            // For each direct, fetch their recruits count (one level)
            const directIds = directsRows.map((d: any) => d.id);
            const { data: secondLevel } = await supabase
              .from("users")
              .select("id, full_name, referred_by")
              .in("referred_by", directIds || []);

            // build structured recruits
            const directMap = (directsRows || []).map((d: any) => {
              const childCount = (secondLevel || []).filter((s: any) => s.referred_by === d.id).length;
              const recruits = (secondLevel || []).filter((s: any) => s.referred_by === d.id).map((s: any) => ({ id: s.id, name: s.full_name || "User", recruitsCount: 0 }));
              return { id: d.id, name: d.full_name || "User", recruitsCount: childCount, recruits };
            });

            if (mounted) setDirects(directMap);
          } else {
            // fallback mock
            setDirects([
              { id: "u1", name: "Ramesh", recruitsCount: 2, recruits: [{ id: "u1a", name: "A", recruitsCount: 0 }, { id: "u1b", name: "B", recruitsCount: 0 }] },
              { id: "u2", name: "Sita", recruitsCount: 2, recruits: [{ id: "u2a", name: "C", recruitsCount: 0 }, { id: "u2b", name: "D", recruitsCount: 0 }] },
            ]);
          }
        } catch (refErr) {
          console.warn("Referral fetch error", refErr);
          setDirects([
            { id: "u1", name: "Ramesh", recruitsCount: 2, recruits: [{ id: "u1a", name: "A", recruitsCount: 0 }, { id: "u1b", name: "B", recruitsCount: 0 }] },
            { id: "u2", name: "Sita", recruitsCount: 2, recruits: [{ id: "u2a", name: "C", recruitsCount: 0 }, { id: "u2b", name: "D", recruitsCount: 0 }] },
            { id: "u3", name: "Kiran", recruitsCount: 1, recruits: [{ id: "u3a", name: "E", recruitsCount: 0 }] },
          ]);
        }
      } catch (err) {
        console.error("Agent dashboard load error:", err);
        // fallback demo
        setRevenues({ thisWeek: 2450, thisMonth: 15320, basicProgram: 8200, advancedProgram: 7100 });
        setDirects([
          { id: "u1", name: "Ramesh", recruitsCount: 2, recruits: [{ id: "u1a", name: "A", recruitsCount: 0 }, { id: "u1b", name: "B", recruitsCount: 0 }] },
          { id: "u2", name: "Sita", recruitsCount: 2, recruits: [{ id: "u2a", name: "C", recruitsCount: 0 }, { id: "u2b", name: "D", recruitsCount: 0 }] },
        ]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, [mockMode]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm p-4">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-xl font-bold text-gray-800">Agent Dashboard</h1>
        </div>
      </div>

      <div className="p-6">
        {/* Welcome + quick revenue cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <p className="text-sm text-gray-600">This Week</p>
            <p className="text-2xl font-bold text-green-600">₹{revenues.thisWeek.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <p className="text-sm text-gray-600">This Month</p>
            <p className="text-2xl font-bold text-green-600">₹{revenues.thisMonth.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <p className="text-sm text-gray-600">Basic Program</p>
            <p className="text-2xl font-bold text-blue-600">₹{revenues.basicProgram.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <p className="text-sm text-gray-600">Advanced Program</p>
            <p className="text-2xl font-bold text-yellow-600">₹{revenues.advancedProgram.toLocaleString()}</p>
          </div>
        </div>

        {/* Referral summary */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-3">Referral Summary</h3>
            <p className="text-sm text-gray-600 mb-2">Direct recruits: <span className="font-bold">{directCount}</span></p>
            <p className="text-sm text-gray-600 mb-2">Avg recruits per direct: <span className="font-bold">{recruitsTotals.average}</span></p>
            <p className="text-sm text-gray-600">Max recruits under a single direct: <span className="font-bold">{recruitsTotals.max}</span></p>

            <div className="mt-4 space-y-2">
              {directs.map((d) => (
                <div key={d.id} className="flex items-center justify-between border rounded p-2">
                  <div>
                    <p className="font-medium">{d.name}</p>
                    <p className="text-xs text-gray-500">Has {d.recruitsCount} recruits</p>
                  </div>
                  <div className="text-sm text-gray-700">{d.recruitsCount}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 2x2 system */}
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-3">2 × 2 Referral Program</h3>
            <p className="text-sm text-gray-600 mb-2">Need: At least 2 direct recruits, and each must have ≥ 2 recruits</p>

            <div className="mt-3 flex items-center gap-3">
              {qualifiesFor(2) ? (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-semibold">Eligible</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-red-600">
                  <XCircle className="w-5 h-5" />
                  <span className="font-semibold">Not eligible</span>
                </div>
              )}
            </div>

            {/* simple visual tree: show top N directs and their recruits */}
            <div className="mt-4">
              <div className="flex items-start gap-4">
                {/* agent box */}
                <div className="text-center">
                  <div className="bg-gray-50 p-3 rounded-lg border">You</div>
                </div>

                {/* connectors and direct boxes */}
                <div className="flex-1 grid grid-cols-2 gap-2">
                  {directs.slice(0, 2).map((d) => (
                    <div key={d.id} className="border rounded p-2 bg-white">
                      <div className="font-medium">{d.name}</div>
                      <div className="text-xs text-gray-500">Recruits: {d.recruitsCount}</div>
                      <div className="mt-2 grid grid-cols-2 gap-1">
                        {(d.recruits || Array.from({ length: Math.max(0, d.recruitsCount) })).slice(0, 2).map((r, idx) => (
                          <div key={idx} className="text-xs p-1 border rounded text-center bg-gray-50">
                            {r?.name ?? `P${idx + 1}`}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* fill empty slots if not enough directs */}
                  {directs.length < 2 &&
                    Array.from({ length: 2 - directs.length }).map((_, i) => (
                      <div key={`empty-${i}`} className="border rounded p-2 bg-gray-50 text-center text-sm text-gray-400">
                        Empty slot
                      </div>
                    ))}
                </div>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button className="px-3 py-2 bg-yellow-400 rounded text-sm font-medium" onClick={() => router.push("/agent-referrals")}>
                View Details
              </button>
              <button className="px-3 py-2 border rounded text-sm" onClick={() => alert("Share referral link copied!")}>
                Share Link
              </button>
            </div>
          </div>

          {/* 3x3 system */}
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-3">3 × 3 Referral Program</h3>
            <p className="text-sm text-gray-600 mb-2">Need: At least 3 direct recruits, and each must have ≥ 3 recruits</p>

            <div className="mt-3 flex items-center gap-3">
              {qualifiesFor(3) ? (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-semibold">Eligible</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-red-600">
                  <XCircle className="w-5 h-5" />
                  <span className="font-semibold">Not eligible</span>
                </div>
              )}
            </div>

            <div className="mt-4">
              <div className="flex items-start gap-4">
                <div className="text-center">
                  <div className="bg-gray-50 p-3 rounded-lg border">You</div>
                </div>

                <div className="flex-1 grid grid-cols-3 gap-2">
                  {directs.slice(0, 3).map((d) => (
                    <div key={d.id} className="border rounded p-2 bg-white">
                      <div className="font-medium">{d.name}</div>
                      <div className="text-xs text-gray-500">Recruits: {d.recruitsCount}</div>
                      <div className="mt-2 grid grid-cols-3 gap-1">
                        {(d.recruits || Array.from({ length: Math.max(0, d.recruitsCount) })).slice(0, 3).map((r, idx) => (
                          <div key={idx} className="text-xs p-1 border rounded text-center bg-gray-50">
                            {r?.name ?? `P${idx + 1}`}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {directs.length < 3 &&
                    Array.from({ length: 3 - directs.length }).map((_, i) => (
                      <div key={`empty3-${i}`} className="border rounded p-2 bg-gray-50 text-center text-sm text-gray-400">
                        Empty slot
                      </div>
                    ))}
                </div>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button className="px-3 py-2 bg-yellow-400 rounded text-sm font-medium" onClick={() => router.push("/agent-referrals")}>
                View Details
              </button>
              <button className="px-3 py-2 border rounded text-sm" onClick={() => alert("Referral tree exported (demo)")}>
                Export Tree
              </button>
            </div>
          </div>
        </div>

        {/* Extra quick actions and training (kept from previous UI) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-bold mb-4">Training Progress</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Basic Agent Program</span>
                  <span>100%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full w-full"></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Advanced Agent Program</span>
                  <span>65%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-yellow-500 h-2 rounded-full w-[65%]"></div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-bold mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <button onClick={() => router.push("/agent-dashboard/leads")} className="w-full text-left p-3 border border-gray-200 rounded-lg hover:border-yellow-400 hover:bg-yellow-50 transition-colors">
                📋 View Leads
              </button>
              <button onClick={() => router.push("/agent-dashboard/new")} className="w-full text-left p-3 border border-gray-200 rounded-lg hover:border-yellow-400 hover:bg-yellow-50 transition-colors">
                👥 Add New Lead
              </button>
              <button onClick={() => router.push("/agent-courses")} className="w-full text-left p-3 border border-gray-200 rounded-lg hover:border-yellow-400 hover:bg-yellow-50 transition-colors">
                🎓 Continue Training
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
