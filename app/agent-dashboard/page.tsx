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
  XCircle,
  Info,
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
interface Cashback {
  cashback_amount: number;
  status: string;
}

interface Commission {
  id: string;
  commission_amount: number;
  original_amount: number;
  level: number;
  status: string;
  created_at: string;
  paid_at: string | null;
  from_agent_id: string;
  plan_id: string;
  payment_id: string | null;
  plan?: {
    plan_name: string;
  };
  from_agent?: {
    user?: {
      name: string;
    };
  };
}

interface Stats {
  totalEarnings: number;
  pendingEarnings: number;
  paidEarnings: number;
  cancelledEarnings: number;
  totalNetwork: number;
  directReferrals: number;
  activeReferrals: number;
  activePlans: number;
  instantCashback: number;
  availableBalance: number;
  totalWithdrawn: number;
  pendingWithdrawal: number;
}

interface EarningsByLevel {
  level: number;
  amount: number;
  count: number;
}

interface EarningsByPlan {
  plan_name: string;
  amount: number;
  count: number;
  commission_rate?: number;
}

interface EarningsByStatus {
  name: string;
  value: number;
  [key: string]: any;
}

export default function AgentDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({
    totalEarnings: 0,
    pendingEarnings: 0,
    paidEarnings: 0,
    cancelledEarnings: 0,
    totalNetwork: 0,
    directReferrals: 0,
    activeReferrals: 0,
    activePlans: 0,
    instantCashback: 0,
    availableBalance: 0,
    totalWithdrawn: 0,
    pendingWithdrawal: 0,
  });
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [earningsByLevel, setEarningsByLevel] = useState<EarningsByLevel[]>([]);
  const [earningsByPlan, setEarningsByPlan] = useState<EarningsByPlan[]>([]);
  const [earningsByStatus, setEarningsByStatus] = useState<EarningsByStatus[]>(
    [],
  );
  const [planMap, setPlanMap] = useState<Record<string, string>>({});

  const [lockedPlans, setLockedPlans] = useState<any[]>([]);

  const [earningsTimeline, setEarningsTimeline] = useState<any[]>([]);
  const totalLockedAmount = lockedPlans.reduce(
    (sum, p) => sum + Number(p.locked_amount),
    0,
  );

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
        .select("id, total_referrals, active_referrals, referral_code")
        .eq("user_id", userData.id)
        .single();

      if (!agentData) return;
      // ✅ Fetch cashback records
      const { data: cashbackData } = await supabase
        .from("agent_cashbacks")

        .select("cashback_amount, status")
        .eq("agent_id", agentData.id);
      const totalCashback =
        cashbackData?.reduce((sum, c) => sum + Number(c.cashback_amount), 0) ||
        0;

      /**
       * Cashback is instantly credited,
       * so entire amount is treated as PAID
       */
      const paidCashback = totalCashback;

      // Get active plans count
      const { data: agentPlans } = await supabase
        .from("agent_plans")
        .select("plan_id")
        .eq("agent_id", agentData.id)
        .eq("is_active", true);
      //
      const { data: plans } = await supabase
        .from("plans")
        .select("id, plan_name");

      const map: Record<string, string> = {};
      plans?.forEach((p) => {
        map[p.id] = p.plan_name;
      });

      setPlanMap(map);

      //
      const { data: planRewards } = await supabase
        .from("agent_plan_rewards")
        .select(
          "locked_amount, pairing_completed, pairing_limit, plan_id, is_released",
        )
        .eq("agent_id", agentData.id);

      setLockedPlans(planRewards || []);

      // Fetch all commissions with related data - FIXED foreign key constraint
      const { data: commissionsData } = await supabase
        .from("commissions")
        .select(
          `
          *,
          plan:plans(plan_name),
          from_agent:agents!commissions_from_agent_id_fkey(
            user:users(name)
          )
        `,
        )
        .eq("agent_id", agentData.id)
        .order("created_at", { ascending: false });

      setCommissions(commissionsData || []);

      // Calculate stats
      const totalEarnings =
        commissionsData?.reduce(
          (sum, c) => sum + Number(c.commission_amount),
          0,
        ) || 0;

      const pendingEarnings =
        commissionsData
          ?.filter((c) => c.status === "pending")
          .reduce((sum, c) => sum + Number(c.commission_amount), 0) || 0;

      const paidEarnings =
        commissionsData
          ?.filter((c) => c.status === "paid")
          .reduce((sum, c) => sum + Number(c.commission_amount), 0) || 0;

      const cancelledEarnings =
        commissionsData
          ?.filter((c) => c.status === "cancelled")
          .reduce((sum, c) => sum + Number(c.commission_amount), 0) || 0;

      // Get withdrawn amounts
      const { data: completedWithdrawals } = await supabase
        .from("withdrawal_requests")
        .select("amount")
        .eq("agent_id", agentData.id)
        .eq("status", "completed");

      const totalWithdrawn =
        completedWithdrawals?.reduce((sum, w) => sum + Number(w.amount), 0) ||
        0;

      // Get pending withdrawals
      const { data: pendingWithdrawals } = await supabase
        .from("withdrawal_requests")
        .select("amount")
        .eq("agent_id", agentData.id)
        .in("status", ["pending", "approved"]);

      const pendingWithdrawalAmount =
        pendingWithdrawals?.reduce((sum, w) => sum + Number(w.amount), 0) || 0;

      const availableBalance =
        paidEarnings + paidCashback - totalWithdrawn - pendingWithdrawalAmount;

      // Get direct referrals count
      const { count: directCount } = await supabase
        .from("agents")
        .select("id", { count: "exact", head: true })
        .eq("sponsor_id", agentData.id);

      setStats({
        totalEarnings: totalEarnings - cancelledEarnings + totalCashback,
        instantCashback: totalCashback,
        pendingEarnings,
        paidEarnings,
        cancelledEarnings,
        totalNetwork: agentData.total_referrals || 0,
        directReferrals: directCount || 0,
        activeReferrals: agentData.active_referrals || 0,
        activePlans: agentPlans?.length || 0,
        availableBalance,
        totalWithdrawn,
        pendingWithdrawal: pendingWithdrawalAmount,
      });

      // Earnings by level
      const levelMap = new Map<number, { amount: number; count: number }>();
      commissionsData
        ?.filter((c) => c.status !== "cancelled")
        .forEach((c) => {
          const current = levelMap.get(c.level) || { amount: 0, count: 0 };
          levelMap.set(c.level, {
            amount: current.amount + Number(c.commission_amount),
            count: current.count + 1,
          });
        });

      const levelData = Array.from(levelMap.entries())
        .map(([level, data]) => ({ level, ...data }))
        .sort((a, b) => a.level - b.level);
      setEarningsByLevel(levelData);

      // Earnings by plan
      const planMap = new Map<
        string,
        { amount: number; count: number; name: string }
      >();
      commissionsData
        ?.filter((c) => c.status !== "cancelled")
        .forEach((c) => {
          const planName = c.plan?.plan_name || "Unknown";
          const current = planMap.get(c.plan_id) || {
            amount: 0,
            count: 0,
            name: planName,
          };
          planMap.set(c.plan_id, {
            amount: current.amount + Number(c.commission_amount),
            count: current.count + 1,
            name: planName,
          });
        });

      const planData = Array.from(planMap.values()).map((data) => ({
        plan_name: data.name,
        amount: data.amount,
        count: data.count,
      }));
      setEarningsByPlan(planData);

      // Earnings by status
      const statusData: EarningsByStatus[] = [
        { name: "Paid", value: paidEarnings },
        { name: "Pending", value: pendingEarnings },
      ];
      if (cancelledEarnings > 0) {
        statusData.push({ name: "Cancelled", value: cancelledEarnings });
      }
      setEarningsByStatus(statusData);

      // Timeline data (last 7 days)
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - i));
        return date.toISOString().split("T")[0];
      });

      const timelineData = last7Days.map((date) => {
        const dayEarnings =
          commissionsData
            ?.filter(
              (c) => c.created_at.startsWith(date) && c.status !== "cancelled",
            )
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
  const STATUS_COLORS = {
    Paid: "#10b981",
    Pending: "#f59e0b",
    Cancelled: "#ef4444",
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }
  console.log("LOCKED PLANS =>", lockedPlans);
  const locked = lockedPlans.filter((p) => !p.is_released);
  const unlocked = lockedPlans.filter((p) => p.is_released);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 shadow-sm">
        <div className="max-w-9xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">
                Earnings Dashboard
              </h1>
              <p className="text-sm text-white mt-1">
                Track your commissions and network growth
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Net Earnings */}
            <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-lg p-4 text-white shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-5 h-5" />
                <p className="text-sm opacity-90">Net Earnings</p>
              </div>
              <p className="text-3xl font-bold mb-1">
                ₹{stats.totalEarnings.toLocaleString("en-IN")}
              </p>
              <p className="text-xs opacity-75">
                {stats.activePlans} active plans
              </p>
            </div>

            {/* Pending */}
            <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-lg p-4 text-white shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5" />
                <p className="text-sm opacity-90">Pending</p>
              </div>
              <p className="text-3xl font-bold mb-1">
                ₹{stats.pendingEarnings.toLocaleString("en-IN")}
              </p>
              <p className="text-xs opacity-75">Awaiting payment</p>
            </div>

            {/* Available Balance */}
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg p-4 text-white shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5" />
                <p className="text-sm opacity-90">Available</p>
              </div>
              <p className="text-3xl font-bold mb-1">
                ₹{stats.availableBalance.toLocaleString("en-IN")}
              </p>
              <p className="text-xs opacity-75">Ready to withdraw</p>
            </div>

            {/* Instant Cashback */}
            <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-lg p-4 text-white shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <Award className="w-5 h-5" />
                <p className="text-sm opacity-90">Instant Cashback</p>
              </div>
              <p className="text-3xl font-bold mb-1">
                ₹{stats.instantCashback.toLocaleString("en-IN")}
              </p>
              <p className="text-xs opacity-75">Credited instantly</p>
            </div>

            {/* Network */}
            <div className="bg-gradient-to-br from-teal-600 to-teal-700 rounded-lg p-4 text-white shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5" />
                <p className="text-sm opacity-90">Network</p>
              </div>
              <p className="text-3xl font-bold mb-1">{stats.totalNetwork}</p>
              <p className="text-xs opacity-75">
                {stats.directReferrals} direct • {stats.activeReferrals} active
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-9xl mx-auto px-4 py-6 space-y-6">
        {/* Earnings Timeline Chart */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Earnings Timeline
              </h2>
              <p className="text-sm text-gray-500">Last 7 days performance</p>
            </div>
            <button className="text-sm text-yellow-600 hover:text-yellow-700 flex items-center gap-1">
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
                stroke="#eab308"
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
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Earnings by Level
              </h2>
              <p className="text-sm text-gray-500">
                Commission breakdown by referral depth
              </p>
            </div>
            {earningsByLevel.length > 0 ? (
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
                  <Tooltip
                    formatter={(value: any, name?: string | number) => {
                      if (name === "amount")
                        return [
                          `₹${value.toLocaleString("en-IN")}`,
                          "Earnings",
                        ];
                      return [value, "Count"];
                    }}
                  />
                  <Legend />
                  <Bar dataKey="amount" fill="#eab308" name="Earnings (₹)" />
                  <Bar dataKey="count" fill="#10b981" name="Commissions" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-gray-400">
                <div className="text-center">
                  <TrendingUp className="w-12 h-12 mx-auto mb-2" />
                  <p className="text-sm">No level data yet</p>
                </div>
              </div>
            )}
          </div>

          {/* Earnings by Status */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Earnings Status
              </h2>
              <p className="text-sm text-gray-500">
                Payment status distribution
              </p>
            </div>
            {earningsByStatus.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={earningsByStatus}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry: any) =>
                      `${entry.name} (₹${entry.value.toLocaleString("en-IN")})`
                    }
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {earningsByStatus.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          STATUS_COLORS[
                            entry.name as keyof typeof STATUS_COLORS
                          ]
                        }
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
                  <Info className="w-12 h-12 mx-auto mb-2" />
                  <p className="text-sm">No status data yet</p>
                </div>
              </div>
            )}
          </div>
        </div>
        {locked.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">🔒 Locked Plans</h2>

            {locked.map((p, i) => {
              const progress = Math.min(p.pairing_completed, p.pairing_limit);
              const percent = Math.min((progress / p.pairing_limit) * 100, 100);

              return (
                <div key={i} className="border rounded-lg p-4 mb-4">
                  <div className="flex justify-between mb-1">
                    <div className="font-medium text-gray-900">
                      {planMap[p.plan_id] ?? "Plan"}
                    </div>
                    <div className="text-sm text-gray-500">
                      {progress} / {p.pairing_limit}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-gray-200 rounded h-2 mb-2">
                    <div
                      className="bg-orange-500 h-2 rounded"
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">
                      {p.pairing_limit - progress} more pair(s) needed
                    </span>

                    <span className="font-semibold text-orange-600">
                      ₹{Number(p.locked_amount).toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {unlocked.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6 mt-6">
            <h2 className="text-lg font-semibold mb-4">✅ Unlocked Plans</h2>

            {unlocked.map((p, i) => (
              <div key={i} className="border rounded-lg p-4 mb-3 bg-green-50">
                <div className="flex justify-between">
                  <div className="font-medium text-gray-900">
                    {planMap[p.plan_id] ?? "Plan"}
                  </div>
                  <div className="text-green-600 text-sm flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" />
                    Unlocked
                  </div>
                </div>

                <div className="text-green-700 font-semibold mt-1">
                  ₹{Number(p.locked_amount).toLocaleString("en-IN")}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Earnings by Plan
            </h2>
            <p className="text-sm text-gray-500">
              Which plans generate most commission
            </p>
          </div>
          {earningsByPlan.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {earningsByPlan.map((plan, index) => (
                <div
                  key={index}
                  className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-gray-900">
                      {plan.plan_name}
                    </h3>
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                  </div>
                  <p className="text-2xl font-bold text-gray-900 mb-1">
                    ₹{plan.amount.toLocaleString("en-IN")}
                  </p>
                  <p className="text-sm text-gray-500">
                    {plan.count} commissions
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-gray-400">
              <div className="text-center">
                <Award className="w-12 h-12 mx-auto mb-2" />
                <p className="text-sm">No plan earnings yet</p>
              </div>
            </div>
          )}
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
                  <th className="pb-3 font-medium">From</th>
                  <th className="pb-3 font-medium">Plan</th>
                  <th className="pb-3 font-medium">Level</th>
                  <th className="pb-3 font-medium text-right">Original</th>
                  <th className="pb-3 font-medium text-right">Commission</th>
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
                        },
                      )}
                    </td>
                    <td className="py-3 text-gray-700">
                      {commission.from_agent?.user?.name || "Unknown"}
                    </td>
                    <td className="py-3 text-gray-700">
                      {commission.plan?.plan_name || "N/A"}
                    </td>
                    <td className="py-3">
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
                        L{commission.level}
                      </span>
                    </td>
                    <td className="py-3 text-right text-gray-600">
                      ₹
                      {Number(commission.original_amount).toLocaleString(
                        "en-IN",
                      )}
                    </td>
                    <td className="py-3 text-right font-semibold text-gray-900">
                      ₹
                      {Number(commission.commission_amount).toLocaleString(
                        "en-IN",
                      )}
                    </td>
                    <td className="py-3">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full inline-flex items-center gap-1 ${
                          commission.status === "paid"
                            ? "bg-green-100 text-green-700"
                            : commission.status === "pending"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-red-100 text-red-700"
                        }`}
                      >
                        {commission.status === "paid" && (
                          <CheckCircle className="w-3 h-3" />
                        )}
                        {commission.status === "pending" && (
                          <Clock className="w-3 h-3" />
                        )}
                        {commission.status === "cancelled" && (
                          <XCircle className="w-3 h-3" />
                        )}
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
            <Users className="w-8 h-8 text-yellow-600 mb-3" />
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
