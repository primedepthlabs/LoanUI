// components/Sidebar.tsx
"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

import {
  LogOut,
  User,
  Copy,
  Home,
  Briefcase,
  History,
  CheckCircle,
  TableOfContents,
  Network,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface AgentWithPlans {
  id: string;
  referral_code: string;
  agent_plans: {
    plans: {
      plan_name: string;
    };
  }[];
}

interface SidebarChildItem {
  id: string;
  label: string;
  icon: any;
  onClick: () => void;
}

interface SidebarParentItem {
  id: string;
  label: string;
  icon: any;
  isParent: true;
  open: boolean;
  toggle: () => void;
  children: SidebarChildItem[];
}

interface SidebarNormalItem {
  id: string;
  label: string;
  icon: any;
  onClick: () => void;
}

type SidebarItem = SidebarParentItem | SidebarNormalItem;

interface SidebarProps {
  user: any;
  onLogout: () => void;
  onLoginSignup: () => void;
  onProfileClick: () => void;
  activeTab: string;
  onTabChange: (tabId: string) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  profilePicture?: string | null;
}

const Sidebar: React.FC<SidebarProps> = ({
  user,
  onLogout,
  onLoginSignup,
  onProfileClick,
  activeTab,
  onTabChange,
  sidebarOpen,
  setSidebarOpen,
  profilePicture: externalProfilePicture,
}) => {
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const [agentDropdownHover, setAgentDropdownHover] = useState(false);
  const [copiedReferral, setCopiedReferral] = useState(false);
  const [isAgent, setIsAgent] = useState(false);
  const [agentPlan, setAgentPlan] = useState<string>("");
  const [agentReferralCode, setAgentReferralCode] = useState<string>("");
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  // Fetch user profile data including profile picture
  const fetchUserProfile = async (authUserId: string) => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("profile_picture_url, name")
        .eq("auth_user_id", authUserId)
        .single();

      if (data) {
        setProfilePicture(data.profile_picture_url || null);
        setUserName(data.name || "User");
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
    }
  };
  // Check agent status - exact same as dashboard
  const checkAgentStatus = async (authUserId: string) => {
    try {
      console.log("🔍 Checking agent status for auth_user_id:", authUserId);

      // Step 1: Get user's internal ID from users table
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("auth_user_id", authUserId)
        .single();

      console.log("📊 User data:", userData);

      if (!userData) {
        console.log("❌ No user found");
        setIsAgent(false);
        return;
      }

      // Step 2: Check if this user is an agent (use maybeSingle instead of single)
      const { data } = await supabase
        .from("agents")
        .select(
          `
          id,
          referral_code,
          agent_plans (
            plans ( plan_name )
          )
        `,
        )
        .eq("user_id", userData.id)
        .maybeSingle();

      const agent = data as AgentWithPlans | null;

      console.log("🎯 Agent data:", agent);

      if (agent) {
        setIsAgent(true);
        setAgentPlan(agent?.agent_plans?.[0]?.plans?.plan_name ?? "");
        setAgentReferralCode(agent.referral_code ?? "");
      } else {
        setIsAgent(false);
        setAgentPlan("");
        setAgentReferralCode("");
      }
    } catch (error) {
      console.error("Error checking agent status:", error);
      setIsAgent(false);
    }
  };
  //
  useEffect(() => {
    const handler = (e: any) => {
      console.log("PWA install event fired");
      e.preventDefault();
      setInstallPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  // Check agent status when user changes
  useEffect(() => {
    if (user?.id) {
      checkAgentStatus(user.id);

      fetchUserProfile(user.id);
    } else {
      setIsAgent(false);
      setAgentPlan("");
      setAgentReferralCode("");
      setProfilePicture(null);
      setUserName("");
    }
  }, [user]);

  const copyReferralCode = () => {
    navigator.clipboard.writeText(agentReferralCode);
    setCopiedReferral(true);
    setTimeout(() => setCopiedReferral(false), 2000);
  };

  const sidebarItems: SidebarItem[] = [
    {
      id: "home",
      label: "Home",
      icon: Home,
      onClick: () => {
        onTabChange("home");
        setSidebarOpen(false);
      },
    },
    {
      id: "loan-history",
      label: "Loan History",
      icon: History,
      onClick: () => {
        onTabChange("loan-history");
        setSidebarOpen(false);
      },
    },
  ];

  // 🔥 Show "Earn as Agent" for everyone - exact same logic as dashboard
  sidebarItems.splice(1, 0, {
    id: "earn-agent",
    label: isAgent ? agentPlan || "Agent Portal" : "Become an Agent",
    icon: Briefcase,
    onClick: () => {
      onTabChange("earn-agent");
      setSidebarOpen(false);
    },
  });

  // Only show dropdown for existing agents
  if (isAgent) {
    sidebarItems.push({
      id: "agent-dashboard-parent",
      isParent: true,
      label: "Agent Dashboard",
      icon: User,
      open: agentDropdownOpen || agentDropdownHover,
      toggle: () => {
        onTabChange("agent-dashboard");
        setSidebarOpen(false);
      },
      children: [
        {
          id: "agent-content",
          label: "Learning Content",
          icon: TableOfContents,
          onClick: () => {
            onTabChange("agent-content");
            setSidebarOpen(false);
          },
        },
        {
          id: "agent-network",
          label: "My Network",
          icon: Network,
          onClick: () => {
            onTabChange("agent-network");
            setSidebarOpen(false);
          },
        },
      ],
    });
  }

  function isParentItem(item: SidebarItem): item is SidebarParentItem {
    return (item as SidebarParentItem).isParent === true;
  }

  return (
    <>
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}
      >
        <div className="flex flex-col h-full">
          {/* Logo Section */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-700 flex items-center justify-center overflow-hidden">
                {user && (externalProfilePicture || profilePicture) ? (
                  <img
                    src={externalProfilePicture || profilePicture || ""}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-white font-bold text-sm">SB</span>
                )}
              </div>
              <div>
                <h2 className="font-bold text-gray-800">S.B Finance</h2>
                <p className="text-xs text-gray-500">Loan Services</p>
              </div>
            </div>
          </div>

          {/* Referral Code Section */}
          {isAgent && agentReferralCode && (
            <div className="p-4 border-b border-gray-200 bg-gradient-to-br from-blue-50 to-purple-50">
              <div className="flex items-center justify-between bg-white rounded-lg p-2">
                <code className="text-sm font-bold text-blue-600">
                  {agentReferralCode}
                </code>
                <button
                  onClick={copyReferralCode}
                  className="p-1.5 hover:bg-gray-100 rounded"
                >
                  {copiedReferral ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4 text-gray-600 cursor-pointer" />
                  )}
                </button>
              </div>
              {copiedReferral && (
                <p className="text-xs text-green-600 mt-1">✓ Copied!</p>
              )}
            </div>
          )}
          <nav className="flex-1 p-4">
            <div className="space-y-2">
              {sidebarItems.map((item) => {
                const IconComponent = item.icon;
                const isActive = activeTab === item.id;

                if (isParentItem(item)) {
                  return (
                    <div
                      key={item.id}
                      onMouseEnter={() => setAgentDropdownHover(true)}
                      onMouseLeave={() => setAgentDropdownHover(false)}
                    >
                      <button
                        onClick={item.toggle}
                        className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors ${
                          isActive
                            ? "bg-yellow-50 text-yellow-700"
                            : "text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <IconComponent className="w-5 h-5" />
                          <span className="font-medium">{item.label}</span>
                        </div>
                        {item.open ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>

                      {item.open && (
                        <div className="ml-6 mt-2 space-y-2">
                          {item.children.map((child) => {
                            const ChildIcon = child.icon;
                            const isChildActive = activeTab === child.id;
                            return (
                              <button
                                key={child.id}
                                onClick={child.onClick}
                                className={`w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors ${
                                  isChildActive
                                    ? "bg-yellow-50 text-yellow-700"
                                    : "text-gray-600 hover:bg-gray-50"
                                }`}
                              >
                                <ChildIcon className="w-4 h-4" />
                                <span className="text-sm">{child.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                // Normal item
                return (
                  <button
                    key={item.id}
                    onClick={item.onClick}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                      isActive
                        ? "bg-yellow-50 text-yellow-700"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <IconComponent className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Bottom Section */}
          <div className="p-4 border-t border-gray-200">
            {user ? (
              <div className="space-y-3">
                {installPrompt && (
                  <button
                    onClick={() => installPrompt.prompt()}
                    className="w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors text-gray-600 hover:bg-gray-50"
                  >
                    <span className="font-medium">Install App</span>
                  </button>
                )}
                <button
                  onClick={onProfileClick}
                  className="w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors text-gray-600 hover:bg-gray-50 cursor-pointer"
                >
                  <User className="w-5 h-5" />
                  <span className="font-medium">Profile</span>
                </button>

                <button
                  onClick={onLogout}
                  className="w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors text-red-600 hover:bg-red-50 cursor-pointer"
                >
                  <LogOut className="w-5 h-5" />
                  <span className="font-medium">Logout</span>
                </button>
              </div>
            ) : (
              <button
                onClick={onLoginSignup}
                className="w-full bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-medium py-3 rounded-lg transition-colors cursor-pointer"
              >
                Login/Signup
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
