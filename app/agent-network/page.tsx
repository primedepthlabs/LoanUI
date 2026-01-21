"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

interface AgentNode {
  id: string;
  agent_id: string;
  plan_id: string;
  parent_id: string | null;
  position: string;
  level: number;
  user?: {
    id: string;
    name: string;
    email: string;
    mobile_number: string;
  };
  agent?: {
    referral_code: string;
    is_active: boolean;
    current_level: number;
  };
  plans?: Array<{ plan_id: string; plan?: { plan_name: string } }>;
  children: AgentNode[];
}

interface NetworkStats {
  totalDownline: number;
  activeAgents: number;
  directReferrals: number;
  maxLevel: number;
}

export default function AgentNetworkPage() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(null);
  const [userPlans, setUserPlans] = useState<any[]>([]);
  const [pairingLimitGroups, setPairingLimitGroups] = useState<
    Map<number, any[]>
  >(new Map());
  const [selectedPairingLimit, setSelectedPairingLimit] = useState<
    number | null
  >(null);
  const [pairingNetworkTrees, setPairingNetworkTrees] = useState<
    Map<number, AgentNode | null>
  >(new Map());
  const router = useRouter();
  const [pairingStats, setPairingStats] = useState<Map<number, NetworkStats>>(
    new Map(),
  );
  const [pairingSettings, setPairingSettings] = useState<Map<number, any>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<AgentNode | null>(null);
  const [agentCommissions, setAgentCommissions] = useState<Map<string, number>>(
    new Map(),
  );

  // Fetch current user and their agent ID
  useEffect(() => {
    async function fetchCurrentUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);

        const { data: userData } = await supabase
          .from("users")
          .select("id")
          .eq("auth_user_id", user.id)
          .single();

        if (!userData) {
          setLoading(false);
          return;
        }

        const { data: agentData } = await supabase
          .from("agents")
          .select("id")
          .eq("user_id", userData.id)
          .single();

        if (agentData) {
          setCurrentAgentId(agentData.id);

          // ✅ Fetch agent's plans (WITHOUT nested settings)
          const { data: plansData } = await supabase
            .from("agent_plans")
            .select("plan_id, plan:plans(id, plan_name, amount)")
            .eq("agent_id", agentData.id)
            .eq("is_active", true);

          if (plansData && plansData.length > 0) {
            // ✅ Fetch settings separately
            const planIds = plansData.map((p: any) => p.plan_id);
            const { data: settingsData } = await supabase
              .from("plan_chain_settings")
              .select("plan_id, pairing_limit, max_depth")
              .in("plan_id", planIds);

            // ✅ Create settings map
            const settingsMap = new Map();
            settingsData?.forEach((s) => {
              settingsMap.set(s.plan_id, s);
            });

            // ✅ Attach settings to plans
            const plansWithSettings = plansData.map((p: any) => ({
              ...p,
              settings: settingsMap.get(p.plan_id),
            }));

            setUserPlans(plansWithSettings);

            // ✅ Group plans by pairing_limit
            const groups = new Map<number, any[]>();
            plansWithSettings.forEach((p: any) => {
              const pairingLimit = p.settings?.pairing_limit || 2;
              if (!groups.has(pairingLimit)) {
                groups.set(pairingLimit, []);
              }
              groups.get(pairingLimit)!.push(p);
            });

            setPairingLimitGroups(groups);

            // ✅ Set first pairing limit as selected
            const firstPairingLimit = Array.from(groups.keys())[0];
            setSelectedPairingLimit(firstPairingLimit);
          }
        }
      }
      setLoading(false);
    }

    fetchCurrentUser();
  }, []);

  // Fetch network data when pairing limit changes
  useEffect(() => {
    if (currentAgentId && selectedPairingLimit !== null) {
      fetchPairingNetworkData(selectedPairingLimit);
    }
  }, [currentAgentId, selectedPairingLimit, userPlans]);
  // Fetch pairing-limit-specific network data
  async function fetchPairingNetworkData(pairingLimit: number) {
    if (!currentAgentId) return;

    setLoading(true);

    try {
      console.log("🔍 Fetching network for pairing_limit:", pairingLimit);

      // ✅ Store settings for this pairing limit
      setPairingSettings((prev) =>
        new Map(prev).set(pairingLimit, {
          pairing_limit: pairingLimit,
          max_depth: 50,
        }),
      );

      // ✅ Fetch positions by pairing_limit instead of plan_id
      const { data: positions, error: positionsError } = await supabase
        .from("plan_binary_positions")
        .select(
          `
            *,
            agent:agents!plan_binary_positions_agent_id_fkey(
              id,
              referral_code,
              is_active,
              current_level,
              user:users!agents_user_id_fkey(
                id,
                name,
                email,
                mobile_number
              )
            )
          `,
        )
        .eq("pairing_limit", pairingLimit);

      console.log("📍 Positions:", { positions, positionsError });

      const safePositions = positions || [];

      if (safePositions.length === 0) {
        console.warn("⚠️ No positions found for pairing_limit", pairingLimit);
        setPairingNetworkTrees((prev) => new Map(prev).set(pairingLimit, null));
        setLoading(false);
        return;
      }

      const currentAgentPosition = safePositions.find(
        (p) => p.agent_id === currentAgentId,
      );

      if (!currentAgentPosition) {
        console.warn("⚠️ Current agent has no position in this pairing tree");
        setPairingNetworkTrees((prev) => new Map(prev).set(pairingLimit, null));
        setLoading(false);
        return;
      }

      console.log("✅ Current agent position found:", currentAgentPosition);

      // Fetch agent plans for all agents in tree
      const agentIds = safePositions.map((p) => p.agent_id);

      const { data: agentPlansData } = await supabase
        .from("agent_plans")
        .select("agent_id, plan_id, plan:plans(id, plan_name)")
        .in("agent_id", agentIds)
        .eq("is_active", true);

      const agentPlansMap = new Map<string, any[]>();
      agentPlansData?.forEach((ap) => {
        if (!agentPlansMap.has(ap.agent_id)) {
          agentPlansMap.set(ap.agent_id, []);
        }
        agentPlansMap.get(ap.agent_id)!.push(ap);
      });

      // ✅ Fetch commissions across ALL plans with this pairing limit
      const plansWithPairingLimit = userPlans.filter((p: any) => {
        const planPairingLimit = p.settings?.pairing_limit || 2;
        return planPairingLimit === pairingLimit;
      });
      const planIds = plansWithPairingLimit.map((p: any) => p.plan_id);

      const { data: commissionsData, error: commissionsError } = await supabase
        .from("commissions")
        .select("from_agent_id, commission_amount, status")
        .eq("agent_id", currentAgentId)
        .in("plan_id", planIds)
        .in("status", ["paid", "pending"]);

      console.log("💰 Commissions:", { commissionsData, commissionsError });

      const commMap = new Map<string, number>();
      commissionsData?.forEach((c) => {
        const current = commMap.get(c.from_agent_id) || 0;
        commMap.set(c.from_agent_id, current + Number(c.commission_amount));
      });
      setAgentCommissions(commMap);

      // Build tree
      function buildTree(
        agentId: string,
        currentLevel: number = 1,
      ): AgentNode | null {
        const maxDepth = 50;

        if (currentLevel > maxDepth) {
          return null;
        }

        const position = safePositions.find((p) => p.agent_id === agentId);
        if (!position) return null;

        const children: AgentNode[] = [];

        // Build children based on pairing limit
        for (let i = 1; i <= pairingLimit; i++) {
          const childField = `child_${i}_id`;
          if (position[childField]) {
            const child = buildTree(position[childField], currentLevel + 1);
            if (child) children.push(child);
          }
        }

        return {
          id: position.id,
          agent_id: position.agent_id,
          plan_id: position.plan_id || "", // May not have plan_id anymore
          parent_id: position.parent_id,
          position: position.position,
          level: currentLevel,
          user: position.agent?.user,
          agent: position.agent
            ? {
                referral_code: position.agent.referral_code,
                is_active: position.agent.is_active,
                current_level: position.agent.current_level || 1,
              }
            : undefined,
          plans: agentPlansMap.get(position.agent_id) || [],
          children,
        };
      }

      const tree = buildTree(currentAgentId, 1);
      console.log("🌳 Tree built:", tree);

      setPairingNetworkTrees((prev) => new Map(prev).set(pairingLimit, tree));

      const stats = calculateNetworkStats(tree);
      console.log("📊 Stats:", stats);
      setPairingStats((prev) => new Map(prev).set(pairingLimit, stats));
    } catch (error) {
      console.error("❌ Error fetching network:", error);
      setPairingNetworkTrees((prev) => new Map(prev).set(pairingLimit, null));
    }

    setLoading(false);
  }

  function calculateNetworkStats(node: AgentNode | null): NetworkStats {
    if (!node) {
      return {
        totalDownline: 0,
        activeAgents: 0,
        directReferrals: 0,
        maxLevel: 0,
      };
    }

    let totalDownline = 0;
    let activeAgents = 0;
    let directReferrals = node.children.length;
    let maxLevel = node.level;

    function traverse(n: AgentNode) {
      totalDownline++;
      if (n.agent?.is_active) activeAgents++;
      if (n.level > maxLevel) maxLevel = n.level;
      n.children.forEach((child) => traverse(child));
    }

    node.children.forEach((child) => traverse(child));

    return { totalDownline, activeAgents, directReferrals, maxLevel };
  }

  function renderTreeNode(agent: AgentNode, isCurrentUser: boolean = false) {
    const initials =
      agent.user?.name
        ?.split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase() || "?";

    return (
      <div key={agent.agent_id} className="flex flex-col items-center">
        <div
          onClick={() => setSelectedAgent(agent)}
          className={`relative w-12 h-12 rounded-full flex items-center justify-center cursor-pointer transition-all border-2
            ${
              isCurrentUser
                ? "bg-gradient-to-br from-blue-500 to-blue-700 border-blue-400"
                : agent.agent?.is_active
                  ? "bg-gradient-to-br from-yellow-400 to-yellow-500 border-yellow-300"
                  : "bg-gray-300 border-gray-200"
            }
            hover:scale-105 shadow-md`}
        >
          <span
            className={`text-sm font-bold ${
              isCurrentUser || agent.agent?.is_active
                ? "text-white"
                : "text-gray-600"
            }`}
          >
            {initials}
          </span>
          {isCurrentUser && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
          )}
        </div>

        <p className="text-xs text-gray-700 mt-1.5 max-w-[80px] truncate font-medium">
          {agent.user?.name || "Unknown"}
        </p>

        {agent.children.length > 0 && (
          <div className="mt-4">
            <div className="relative h-6">
              <div className="absolute top-0 left-1/2 w-px h-full bg-gray-300 -translate-x-1/2"></div>
              {agent.children.length > 1 && (
                <div
                  className="absolute top-3 bg-gray-300 h-px"
                  style={{
                    left: `${50 / agent.children.length}%`,
                    right: `${50 / agent.children.length}%`,
                  }}
                ></div>
              )}
              {agent.children.map((_, idx) => {
                const spacing = 100 / (agent.children.length + 1);
                const leftPosition = spacing * (idx + 1);
                return (
                  <div
                    key={idx}
                    className="absolute top-3 w-px h-3 bg-gray-300"
                    style={{
                      left: `${leftPosition}%`,
                      transform: "translateX(-50%)",
                    }}
                  ></div>
                );
              })}
            </div>

            <div className="flex justify-center gap-8">
              {agent.children.map((child) =>
                renderTreeNode(child, child.agent_id === currentAgentId),
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-200 border-t-yellow-400 rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your network...</p>
        </div>
      </div>
    );
  }

  if (userPlans.length === 0) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-sm text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">
            No Active Plans
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            Purchase a plan to start building your network
          </p>
          <a
            href="/agent-courses"
            className="inline-block bg-yellow-400 hover:bg-yellow-500 text-gray-800 px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            Browse Plans
          </a>
        </div>
      </div>
    );
  }

  const currentTree = pairingNetworkTrees.get(selectedPairingLimit || 0);
  const currentStats = pairingStats.get(selectedPairingLimit || 0) || {
    totalDownline: 0,
    activeAgents: 0,
    directReferrals: 0,
    maxLevel: 0,
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-9xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 mb-1">
              My Network
            </h1>
            <p className="text-sm text-gray-600">
              View and manage your team structure
            </p>
          </div>
        </div>

        {/* Pairing Limit Tabs */}
        {pairingLimitGroups.size > 1 && (
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            {Array.from(pairingLimitGroups.entries()).map(
              ([pairingLimit, plans]) => (
                <button
                  key={pairingLimit}
                  onClick={() => setSelectedPairingLimit(pairingLimit)}
                  className={`px-5 py-2.5 text-sm font-semibold whitespace-nowrap rounded-lg transition-all ${
                    selectedPairingLimit === pairingLimit
                      ? "bg-yellow-400 text-gray-800 shadow-md"
                      : "bg-white text-gray-700 hover:bg-gray-50 shadow-sm"
                  }`}
                >
                  {pairingLimit}-Pair System ({plans.length} plan
                  {plans.length > 1 ? "s" : ""})
                </button>
              ),
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            {
              label: "Total Downline",
              value: currentStats.totalDownline,
              color: "from-blue-50 to-blue-100",
            },
            {
              label: "Active Agents",
              value: currentStats.activeAgents,
              color: "from-green-50 to-green-100",
            },
            {
              label: "Direct Referrals",
              value: currentStats.directReferrals,
              color: "from-purple-50 to-purple-100",
            },
            {
              label: "Max Level",
              value: currentStats.maxLevel,
              color: "from-orange-50 to-orange-100",
            },
          ].map((stat, idx) => (
            <div
              key={idx}
              className={`bg-gradient-to-br ${stat.color} rounded-lg p-4 shadow-sm`}
            >
              <p className="text-xs text-gray-600 mb-1">{stat.label}</p>
              <p className="text-3xl font-bold text-gray-800">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Tree */}
        <div className="bg-white rounded-lg shadow-md p-8">
          <h2 className="text-xl font-bold text-gray-800 mb-6">
            Network Structure
          </h2>
          {currentTree ? (
            <div className="overflow-x-auto">
              <div className="inline-block min-w-full">
                {renderTreeNode(currentTree, true)}
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </div>
              <p className="text-gray-600">
                No network data available for this pairing system yet
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Share your referral code to start building your network
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {selectedAgent && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedAgent(null)}
        >
          <div
            className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-gray-800">
                  {selectedAgent.user?.name || "Unknown"}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Code: {selectedAgent.agent?.referral_code}
                </p>
              </div>
              <button
                onClick={() => setSelectedAgent(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3 text-gray-700">
                <svg
                  className="w-5 h-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                <span className="text-sm">
                  {selectedAgent.user?.email || "No email"}
                </span>
              </div>

              <div className="flex items-center gap-3 text-gray-700">
                <svg
                  className="w-5 h-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                  />
                </svg>
                <span className="text-sm">
                  {selectedAgent.user?.mobile_number || "No phone"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-200">
                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Position</p>
                  <p className="text-lg font-bold text-blue-600">
                    {selectedAgent.position}
                  </p>
                </div>
                <div className="bg-green-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Tree Level</p>
                  <p className="text-lg font-bold text-green-600">
                    {selectedAgent.level}
                  </p>
                </div>
                <div className="bg-purple-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Children</p>
                  <p className="text-lg font-bold text-purple-600">
                    {selectedAgent.children.length}
                  </p>
                </div>
                <div className="bg-orange-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Status</p>
                  <p
                    className={`text-lg font-bold ${
                      selectedAgent.agent?.is_active
                        ? "text-green-600"
                        : "text-gray-400"
                    }`}
                  >
                    {selectedAgent.agent?.is_active ? "Active" : "Inactive"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 pt-4 border-t border-gray-200">
                <div className="bg-yellow-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Agent Level</p>
                  <p className="text-lg font-bold text-yellow-600">
                    Level {selectedAgent.agent?.current_level || 1}
                  </p>
                </div>
              </div>

              {agentCommissions.has(selectedAgent.agent_id) && (
                <div className="pt-4 border-t border-gray-200">
                  <p className="text-sm font-semibold text-gray-600 mb-2">
                    Commission Generated for You:
                  </p>
                  <p className="text-3xl font-bold text-green-600">
                    ₹
                    {agentCommissions
                      .get(selectedAgent.agent_id)
                      ?.toLocaleString("en-IN")}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Total from this agent's purchases
                  </p>
                </div>
              )}

              {selectedAgent.plans && selectedAgent.plans.length > 0 && (
                <div className="pt-4 border-t border-gray-200">
                  <p className="text-sm font-semibold text-gray-600 mb-2">
                    Active Plans:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedAgent.plans.map((ap: any, idx: number) => (
                      <span
                        key={idx}
                        className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-medium"
                      >
                        {ap.plan?.plan_name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
