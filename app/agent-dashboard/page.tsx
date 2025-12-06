"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  TrendingUp,
  Users,
  DollarSign,
  Clock,
  CheckCircle,
  Award,
  Download,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface Commission {
  id: string;
  commission_amount: number;
  level: number;
  status: string;
  created_at: string;
  from_agent_id: string;
  plan_id: string;
}

interface Stats {
  totalEarnings: number;
  pendingEarnings: number;
  paidEarnings: number;
  totalNetwork: number;
  directReferrals: number;
  activeReferrals: number;
}

interface EarningsByLevel {
  level: number;
  amount: number;
}

interface EarningsByPlan {
  plan_name: string;
  amount: number;
  [key: string]: any;
}

export default function AgentDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({
    totalEarnings: 0,
    pendingEarnings: 0,
    paidEarnings: 0,
    totalNetwork: 0,
    directReferrals: 0,
    activeReferrals: 0,
  });
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [earningsByLevel, setEarningsByLevel] = useState<EarningsByLevel[]>([]);
  const [earningsByPlan, setEarningsByPlan] = useState<EarningsByPlan[]>([]);
  const [earningsTimeline, setEarningsTimeline] = useState<any[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // Get current user
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push("/login");
        return;
      }

      // Get user's internal ID
      const { data: userData } = await supabase
        .from("users")
        .select("id")
        .eq("auth_user_id", session.user.id)
        .single();

      if (!userData) return;

      // Get agent data
      const { data: agentData } = await supabase
        .from("agents")
        .select("id, total_referrals, active_referrals")
        .eq("user_id", userData.id)
        .single();

      if (!agentData) return;

      // Fetch all commissions for this agent
      const { data: commissionsData } = await supabase
        .from("commissions")
        .select("*")
        .eq("agent_id", agentData.id)
        .order("created_at", { ascending: false });

      setCommissions(commissionsData || []);

      // Calculate stats
      const totalEarnings =
        commissionsData?.reduce(
          (sum, c) => sum + Number(c.commission_amount),
          0
        ) || 0;
      const pendingEarnings =
        commissionsData
          ?.filter((c) => c.status === "pending")
          .reduce((sum, c) => sum + Number(c.commission_amount), 0) || 0;
      const paidEarnings =
        commissionsData
          ?.filter((c) => c.status === "paid")
          .reduce((sum, c) => sum + Number(c.commission_amount), 0) || 0;

      // Get direct referrals count
      const { count: directCount } = await supabase
        .from("agents")
        .select("id", { count: "exact", head: true })
        .eq("sponsor_id", agentData.id);

      setStats({
        totalEarnings,
        pendingEarnings,
        paidEarnings,
        totalNetwork: agentData.total_referrals || 0,
        directReferrals: directCount || 0,
        activeReferrals: agentData.active_referrals || 0,
      });

      // Earnings by level
      const levelMap = new Map<number, number>();
      commissionsData?.forEach((c) => {
        const current = levelMap.get(c.level) || 0;
        levelMap.set(c.level, current + Number(c.commission_amount));
      });
      const levelData = Array.from(levelMap.entries())
        .map(([level, amount]) => ({ level, amount }))
        .sort((a, b) => a.level - b.level);
      setEarningsByLevel(levelData);

      // Earnings by plan
      const planIds = [
        ...new Set(commissionsData?.map((c) => c.plan_id) || []),
      ];
      const { data: plansData } = await supabase
        .from("plans")
        .select("id, plan_name")
        .in("id", planIds);

      const planMap = new Map<string, number>();
      commissionsData?.forEach((c) => {
        const current = planMap.get(c.plan_id) || 0;
        planMap.set(c.plan_id, current + Number(c.commission_amount));
      });

      const planData = Array.from(planMap.entries()).map(
        ([plan_id, amount]) => ({
          plan_name:
            plansData?.find((p) => p.id === plan_id)?.plan_name || "Unknown",
          amount,
        })
      );
      setEarningsByPlan(planData);

      // Timeline data (last 7 days)
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - i));
        return date.toISOString().split("T")[0];
      });

      const timelineData = last7Days.map((date) => {
        const dayEarnings =
          commissionsData
            ?.filter((c) => c.created_at.startsWith(date))
            .reduce((sum, c) => sum + Number(c.commission_amount), 0) || 0;
        return {
          date: new Date(date).toLocaleDateString("en-IN", {
            month: "short",
            day: "numeric",
          }),
          earnings: dayEarnings,
        };
      });
      setEarningsTimeline(timelineData);
    } catch (error) {
      console.error("Dashboard load error:", error);
    } finally {
      setLoading(false);
    }
  };

  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">
                Earnings Dashboard
              </h1>
              <p className="text-sm text-white/80 mt-1">
                Track your commissions and network growth
              </p>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-5 h-5 text-white/80" />
                <p className="text-sm text-white/80">Total Earnings</p>
              </div>
              <p className="text-2xl font-bold text-white">
                ₹{stats.totalEarnings.toLocaleString("en-IN")}
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-white/80" />
                <p className="text-sm text-white/80">Pending</p>
              </div>
              <p className="text-2xl font-bold text-yellow-400">
                ₹{stats.pendingEarnings.toLocaleString("en-IN")}
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-white/80" />
                <p className="text-sm text-white/80">Paid</p>
              </div>
              <p className="text-2xl font-bold text-green-400">
                ₹{stats.paidEarnings.toLocaleString("en-IN")}
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-white/80" />
                <p className="text-sm text-white/80">Total Network</p>
              </div>
              <p className="text-2xl font-bold text-white">
                {stats.totalNetwork}
              </p>
              <p className="text-xs text-white/60 mt-1">
                {stats.directReferrals} direct
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Earnings Timeline Chart */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Earnings Timeline (Last 7 Days)
            </h2>
            <button className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={earningsTimeline}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="earnings"
                stroke="#3b82f6"
                strokeWidth={2}
                name="Earnings (₹)"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Earnings by Level */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Earnings by Level
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={earningsByLevel}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="level"
                  label={{
                    value: "Level",
                    position: "insideBottom",
                    offset: -5,
                  }}
                />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="amount" fill="#3b82f6" name="Earnings (₹)" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Earnings by Plan */}
          {/* Earnings by Plan */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Earnings by Plan
            </h2>
            {earningsByPlan.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={earningsByPlan}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry: any) =>
                      `${entry.plan_name} (${(
                        (entry.percent || 0) * 100
                      ).toFixed(0)}%)`
                    }
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="amount"
                    nameKey="plan_name"
                  >
                    {earningsByPlan.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any) =>
                      `₹${value.toLocaleString("en-IN")}`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-gray-400">
                <div className="text-center">
                  <Award className="w-12 h-12 mx-auto mb-2" />
                  <p className="text-sm">No plan earnings yet</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Recent Commissions Table */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Recent Commissions
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left text-gray-600">
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium">Level</th>
                  <th className="pb-3 font-medium text-right">Amount</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {commissions.slice(0, 10).map((commission) => (
                  <tr key={commission.id} className="hover:bg-gray-50">
                    <td className="py-3 text-gray-700">
                      {new Date(commission.created_at).toLocaleDateString(
                        "en-IN",
                        {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        }
                      )}
                    </td>
                    <td className="py-3">
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                        Level {commission.level}
                      </span>
                    </td>
                    <td className="py-3 text-right font-semibold text-gray-900">
                      ₹
                      {Number(commission.commission_amount).toLocaleString(
                        "en-IN"
                      )}
                    </td>
                    <td className="py-3">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          commission.status === "paid"
                            ? "bg-green-100 text-green-700"
                            : commission.status === "pending"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {commission.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {commissions.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <Award className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>No commissions yet</p>
                <p className="text-sm mt-1">
                  Start building your network to earn commissions
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => router.push("/agent-network")}
            className="bg-white rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow text-left"
          >
            <Users className="w-8 h-8 text-blue-600 mb-3" />
            <h3 className="font-semibold text-gray-900 mb-1">My Network</h3>
            <p className="text-sm text-gray-600">View your referral tree</p>
          </button>

          <button
            onClick={() => router.push("/agent-courses")}
            className="bg-white rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow text-left"
          >
            <Award className="w-8 h-8 text-yellow-600 mb-3" />
            <h3 className="font-semibold text-gray-900 mb-1">Training</h3>
            <p className="text-sm text-gray-600">Continue your courses</p>
          </button>

          <button
            onClick={() => router.push("/withdraw")}
            className="bg-white rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow text-left"
          >
            <DollarSign className="w-8 h-8 text-green-600 mb-3" />
            <h3 className="font-semibold text-gray-900 mb-1">Withdraw</h3>
            <p className="text-sm text-gray-600">Request payout</p>
          </button>
        </div>
      </div>
    </div>
  );
}
