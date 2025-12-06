// app/dashboard/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  LogOut,
  User,
  Copy,
  Home,
  Briefcase,
  Menu,
  ChevronRight,
  Filter,
  History,
  Lock,
  CheckCircle,
  TableOfContents,
  Network,
} from "lucide-react";
import {
  checkLoanUnlockStatus,
  LoanUnlockStatus,
} from "@/lib/loanUnlockingService";
import { ChevronDown, ChevronUp } from "lucide-react";
interface LoanOption {
  id: string;
  type: string;
  type_hindi: string;
  amount: string;
  icon: string;
  is_active: boolean;
  sort_order: number;
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
interface AgentWithPlans {
  id: string;
  referral_code: string;
  agent_plans: {
    plans: {
      plan_name: string;
    };
  }[];
}

interface LanguageContent {
  welcome: string;
  getInstantLoan: string;
  knowMore: string;
  wealthWellness: string;
  loginSignup: string;
  personalLoan: string;
  liveLoans: string;
  selectAll: string;
  installment: string;
  loanAmount: string;
  loanTenure: string;
  interestRate: string;
  remaining: string;
}

interface UserLoan {
  id: string;
  loan_type: string;
  loan_amount: number;
  tenure: number;
  tenure_unit: string;
  interest_rate: number;
  payment_type: "weekly" | "monthly";
  installment_amount: number;
  total_payable: number;
  total_interest: number;
  status: string;
  disbursed_at: string;
}

interface LoanEMI {
  id: string;
  loan_application_id: string;
  emi_number: number;
  due_date: string;
  emi_amount: number;
  status: "pending" | "paid" | "overdue" | "partial";
  paid_amount: number;
}

interface LoanWithProgress extends UserLoan {
  totalPaid: number;
  totalRemaining: number;
  progressPercentage: number;
  nextDueDate: string | null;
}

const LoanDashboard: React.FC = () => {
  const [selectedLoan, setSelectedLoan] = useState<string>("");
  const [loanOptions, setLoanOptions] = useState<LoanOption[]>([]);
  const [isLoadingLoans, setIsLoadingLoans] = useState(true);
  const [userLoans, setUserLoans] = useState<LoanWithProgress[]>([]);
  const [isLoadingUserLoans, setIsLoadingUserLoans] = useState(true);
  const [selectedUserLoans, setSelectedUserLoans] = useState<Set<string>>(
    new Set()
  );
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const [agentDropdownHover, setAgentDropdownHover] = useState(false);

  const searchParams = useSearchParams();
  const selectedLanguage = searchParams.get("language") || "english";
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [hasPurchasedCourse, setHasPurchasedCourse] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isAgent, setIsAgent] = useState(false);
  const [agentPlan, setAgentPlan] = useState<string>("");
  const [agentReferralCode, setAgentReferralCode] = useState<string>("");
  const [copiedReferral, setCopiedReferral] = useState(false);
  const [activeView, setActiveView] = useState<"home" | "agent-dashboard">(
    "home"
  );
  const [loanUnlockStatus, setLoanUnlockStatus] = useState<
    Map<string, LoanUnlockStatus>
  >(new Map());

  const languageContent: Record<string, LanguageContent> = {
    english: {
      welcome: "Welcome to Balaji Finance",
      getInstantLoan: "Get Instant Personal Loan upto",
      knowMore: "Know more",
      wealthWellness: "Wealth & Wellness Services",
      loginSignup: "Login/Signup with Mobile",
      personalLoan: "Personal Loan",
      liveLoans: "Live Loans",
      selectAll: "Select all",
      installment: "Installment",
      loanAmount: "Loan Amount",
      loanTenure: "Loan Tenure",
      interestRate: "Interest Rate",
      remaining: "Remaining",
    },
  };

  // Fetch loan options
  const fetchLoanOptions = async () => {
    try {
      setIsLoadingLoans(true);
      const { data, error } = await supabase
        .from("loan_options")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      setLoanOptions(data || []);
    } catch (error) {
      console.error("Error fetching loan options:", error);
      setLoanOptions([]);
    } finally {
      setIsLoadingLoans(false);
    }
  };

  // Fetch user's active loans
  const fetchUserLoans = async (userId: string) => {
    try {
      setIsLoadingUserLoans(true);

      // Get disbursed loans for this user
      const { data: loans, error: loansError } = await supabase
        .from("loan_applications")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "disbursed")
        .order("disbursed_at", { ascending: false });

      if (loansError) throw loansError;

      if (!loans || loans.length === 0) {
        setUserLoans([]);
        return;
      }

      // Get EMIs for all loans
      const loanIds = loans.map((loan) => loan.id);
      const { data: emis, error: emisError } = await supabase
        .from("loan_emis")
        .select("*")
        .in("loan_application_id", loanIds)
        .order("emi_number", { ascending: true });

      if (emisError) throw emisError;

      // Calculate progress for each loan
      const loansWithProgress: LoanWithProgress[] = loans.map((loan) => {
        const loanEmis =
          emis?.filter((emi) => emi.loan_application_id === loan.id) || [];

        const totalPaid = loanEmis.reduce(
          (sum, emi) => sum + emi.paid_amount,
          0
        );
        const totalRemaining = loan.total_payable - totalPaid;
        const progressPercentage = (totalPaid / loan.total_payable) * 100;

        // Find next unpaid EMI
        const nextUnpaidEmi = loanEmis.find(
          (emi) =>
            emi.status === "pending" ||
            emi.status === "overdue" ||
            emi.status === "partial"
        );
        const nextDueDate = nextUnpaidEmi?.due_date || null;

        return {
          ...loan,
          totalPaid,
          totalRemaining,
          progressPercentage,
          nextDueDate,
        };
      });

      setUserLoans(loansWithProgress);
    } catch (error) {
      console.error("Error fetching user loans:", error);
      setUserLoans([]);
    } finally {
      setIsLoadingUserLoans(false);
    }
  };

  // Fetch loan unlock status
  const fetchLoanUnlockStatus = async (userId: string, loans: LoanOption[]) => {
    const statusMap = new Map<string, LoanUnlockStatus>();

    for (const loan of loans) {
      const status = await checkLoanUnlockStatus(
        userId,
        loan.id,
        loan.sort_order
      );
      statusMap.set(loan.id, status);
    }

    setLoanUnlockStatus(statusMap);
  };

  useEffect(() => {
    if (user && loanOptions.length > 0) {
      fetchLoanUnlockStatus(user.id, loanOptions);
    }
  }, [user, loanOptions]);

  // Server-side check for purchases/agent flag
  const checkPurchasedCourses = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("is_agent")
        .eq("auth_user_id", userId)
        .single();

      if (error) throw error;

      const serverHas = !!data?.is_agent;
      setHasPurchasedCourse((prev) => prev || serverHas);
    } catch (error) {
      console.error("Error checking purchased courses:", error);
    }
  };
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
  `
        )
        .eq("user_id", userData.id)
        .maybeSingle();

      const agent = data as AgentWithPlans | null;

      console.log("🎯 Agent data:", agent);

      if (agent) {
        setIsAgent(true);
        setHasPurchasedCourse(true);
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
  const copyReferralCode = () => {
    navigator.clipboard.writeText(agentReferralCode);
    setCopiedReferral(true);
    setTimeout(() => setCopiedReferral(false), 2000);
  };
  const handleKnowMore = (loanId: string) => {
    if (!user) {
      router.push("/login");
      return;
    }

    const unlockStatus = loanUnlockStatus.get(loanId);

    if (unlockStatus && !unlockStatus.isUnlocked) {
      // Show alert that loan is locked
      alert(unlockStatus.reason);
      return;
    }

    router.push(`/loan-details/${loanId}`);
  };

  const handleViewLoanDetails = (loanId: string) => {
    router.push(`/my-loan/${loanId}`);
  };

  const toggleLoanSelection = (loanId: string) => {
    setSelectedUserLoans((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(loanId)) {
        newSet.delete(loanId);
      } else {
        newSet.add(loanId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedUserLoans.size === userLoans.length) {
      setSelectedUserLoans(new Set());
    } else {
      setSelectedUserLoans(new Set(userLoans.map((loan) => loan.id)));
    }
  };

  // Client-only effect: auth, server check, then localStorage flag read.
  useEffect(() => {
    let mounted = true;

    const checkAuthAndFlags = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!mounted) return;
        setUser(session?.user ?? null);

        if (session?.user) {
          // await checkPurchasedCourses(session.user.id);
          await checkAgentStatus(session.user.id);
          await fetchUserLoans(session.user.id);
        }
      } catch (err) {
        console.error("Auth check error:", err);
      } finally {
        if (!mounted) return;
        setIsCheckingAuth(false);

        try {
          const localFlag = localStorage.getItem("hasPurchasedCourse");
          if (localFlag === "true") {
            setHasPurchasedCourse(true);
          }
        } catch (e) {
          // ignore localStorage errors
        }

        const incomingView = searchParams.get("view");
        if (incomingView === "agent-dashboard") {
          setActiveView("agent-dashboard");
        }
      }
    };

    checkAuthAndFlags();
    fetchLoanOptions();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      setUser(session?.user || null);
      if (session?.user) {
        // await checkPurchasedCourses(session.user.id);
        await checkAgentStatus(session.user.id);
        await fetchUserLoans(session.user.id);
      } else {
        setHasPurchasedCourse(false);
        setActiveView("home");
        setUserLoans([]);
      }
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe?.();
    };
  }, []);
  //
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`dashboard-loans-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*", // INSERT, UPDATE, DELETE
          schema: "public",
          table: "loan_applications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log("User loan updated:", payload);

          // Reload user's loans
          fetchUserLoans(user.id);

          // Reload unlock status (in case loan completed/status changed)
          if (loanOptions.length > 0) {
            fetchLoanUnlockStatus(user.id, loanOptions);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loanOptions]);

  // 2. Listen to loan_emis changes (for loan progress updates)
  useEffect(() => {
    if (!user || userLoans.length === 0) return;

    const loanIds = userLoans.map((loan) => loan.id);

    const channel = supabase
      .channel(`dashboard-emis-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "loan_emis",
        },
        (payload: any) => {
          console.log("EMI updated:", payload);

          // Check if this EMI belongs to user's loans
          const affectedLoanId =
            payload.new?.loan_application_id ||
            payload.old?.loan_application_id;

          if (loanIds.includes(affectedLoanId)) {
            // Reload user's loans to update progress
            fetchUserLoans(user.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, userLoans]);

  // 3. Listen to loan_options changes (for available loans)
  useEffect(() => {
    const channel = supabase
      .channel("dashboard-loan-options")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "loan_options",
        },
        (payload) => {
          console.log("Loan option updated:", payload);

          // Reload loan options
          fetchLoanOptions();

          // Reload unlock status if user is logged in
          if (user) {
            fetchLoanOptions().then(() => {
              fetchLoanUnlockStatus(user.id, loanOptions);
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loanOptions]);
  //
  const content = languageContent.english;

  const handleLoanSelect = (loanId: string) => {
    setSelectedLoan(loanId);
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      try {
        localStorage.removeItem("hasPurchasedCourse");
      } catch {}
      setUser(null);
      setHasPurchasedCourse(false);
      setActiveView("home");
      router.push("/login");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleLoginSignup = () => router.push("/login");
  const handleProfileClick = () => router.push("/profile");
  const handleEarnAsAgent = () => router.push("/agent-courses");
  const handleLoanHistory = () => router.push("/loan-history");
  const handleContentForAgents = () => router.push("/agent-content");
  const handleAgentNetwork = () => router.push("/agent-network");
  const handleAgentDashboard = () => {
    if (!hasPurchasedCourse) {
      router.push("/agent-courses");
      return;
    }
    router.push("/agent-dashboard");
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const sidebarItems: SidebarItem[] = [
    {
      id: "home",
      label: "Home",
      icon: Home,
      onClick: () => {
        setActiveView("home");
        setSidebarOpen(false);
      },
    },
    {
      id: "loanhistory",
      label: "Loan History",
      icon: History,
      onClick: handleLoanHistory,
    },
  ];

  // Only show "Earn as Agent" if user hasn't purchased a course
  if (!hasPurchasedCourse) {
    sidebarItems.splice(1, 0, {
      id: "earn-agent",
      label: isAgent ? agentPlan : "Earn as Agent",
      icon: Briefcase,
      onClick: handleEarnAsAgent,
    });
  }

  if (isAgent) {
    sidebarItems.push({
      id: "agent-dashboard-parent",
      isParent: true,
      label: "Agent Dashboard",
      icon: User,
      open: agentDropdownOpen || agentDropdownHover,
      toggle: () => router.push("/agent-dashboard"),
      children: [
        {
          id: "agent-content",
          label: "Learning Content",
          icon: TableOfContents,
          onClick: handleContentForAgents,
        },
        {
          id: "agent-network",
          label: "My Network",
          icon: Network,
          onClick: handleAgentNetwork,
        },
      ],
    });
  }

  if (isLoadingLoans) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading loan options...</p>
        </div>
      </div>
    );
  }
  function isParentItem(item: SidebarItem): item is SidebarParentItem {
    return (item as SidebarParentItem).isParent === true;
  }

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div
        className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}
      >
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
                <span className="text-white font-bold text-sm">SB</span>
              </div>
              <div>
                <h2 className="font-bold text-gray-800">S.B Finance</h2>
                <p className="text-xs text-gray-500">Loan Services</p>
              </div>
            </div>
          </div>
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

                if (isParentItem(item)) {
                  return (
                    <div
                      key={item.id}
                      onMouseEnter={() => setAgentDropdownHover(true)}
                      onMouseLeave={() => setAgentDropdownHover(false)}
                    >
                      <button
                        onClick={item.toggle}
                        className="w-full flex items-center justify-between p-3 rounded-lg text-left text-gray-600 hover:bg-gray-50"
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
                            return (
                              <button
                                key={child.id}
                                onClick={child.onClick}
                                className="w-full flex items-center gap-3 p-2 rounded-lg text-left text-gray-600 hover:bg-gray-50"
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

                // normal item
                return (
                  <button
                    key={item.id}
                    onClick={item.onClick}
                    className="w-full flex items-center gap-3 p-3 rounded-lg text-left text-gray-600 hover:bg-gray-50"
                  >
                    <IconComponent className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          <div className="p-4 border-t border-gray-200">
            {user ? (
              <div className="space-y-3">
                <button
                  onClick={handleProfileClick}
                  className="w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors text-gray-600 hover:bg-gray-50 cursor-pointer"
                >
                  <User className="w-5 h-5" />
                  <span className="font-medium">Profile</span>
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors text-red-600 hover:bg-red-50 cursor-pointer"
                >
                  <LogOut className="w-5 h-5" />
                  <span className="font-medium">Logout</span>
                </button>
              </div>
            ) : (
              <button
                onClick={handleLoginSignup}
                className="w-full bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-medium py-3 rounded-lg transition-colors cursor-pointer"
              >
                {content.loginSignup}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-screen">
        <div className="lg:hidden bg-white shadow-sm p-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
            >
              <Menu className="w-5 h-5 text-gray-600" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
                <span className="text-white font-bold text-xs">SB</span>
              </div>
              <span className="font-bold text-gray-800">S.B Finance</span>
            </div>
            <div className="w-9" />
          </div>
        </div>

        <div className="relative bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 p-4">
          <div className="absolute inset-0 opacity-10">
            <div
              style={{
                backgroundImage:
                  "radial-gradient(circle at 20% 50%, white 1px, transparent 1px)",
                backgroundSize: "20px 20px",
              }}
              className="w-full h-full"
            />
          </div>

          <div className="flex justify-center mb-4 relative z-10">
            <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg border-2 border-white">
              <img
                src="logo.jpg"
                alt="logo"
                className="w-10 h-10 rounded-full"
              />
            </div>
          </div>

          <div className="text-center text-white relative z-10">
            <h1 className="text-xl font-bold mb-2">{content.welcome}</h1>
            <p className="text-gray-300 text-sm mb-1">
              {content.getInstantLoan}
            </p>
          </div>
        </div>

        <div className="flex-1 p-4 -mt-2 bg-gray-100">
          {/* Live Loans Section */}
          {user && userLoans.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800">
                  {content.liveLoans}
                </h2>
              </div>

              {/* Select All and Filter */}
              <div className="flex items-center justify-between mb-3 px-2">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={
                      selectedUserLoans.size === userLoans.length &&
                      userLoans.length > 0
                    }
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 cursor-pointer"
                  />
                  <span>{content.selectAll}</span>
                </label>
              </div>

              {/* Loan Cards */}
              <div className="space-y-3">
                {isLoadingUserLoans ? (
                  <div className="bg-white rounded-lg p-8 text-center">
                    <div className="w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    <p className="text-sm text-gray-500">
                      Loading your loans...
                    </p>
                  </div>
                ) : (
                  userLoans.map((loan) => (
                    <div
                      key={loan.id}
                      className="bg-white rounded-lg p-2 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-start gap-3 flex-1">
                          <input
                            type="checkbox"
                            checked={selectedUserLoans.has(loan.id)}
                            onChange={() => toggleLoanSelection(loan.id)}
                            className="mt-1 w-4 h-4 rounded border-gray-300 cursor-pointer"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-gray-800">
                                {loan.loan_type}
                              </h3>
                              <span className="text-xs text-gray-500">
                                • {content.installment}:{" "}
                                {loan.payment_type === "weekly"
                                  ? "Weekly"
                                  : "Monthly"}
                              </span>
                            </div>

                            {/* Loan Details Grid */}
                            <div className="grid grid-cols-3 gap-3 mt-3 mb-3">
                              <div>
                                <p className="text-xs text-gray-500">
                                  {content.loanAmount}
                                </p>
                                <p className="text-sm font-semibold text-gray-800">
                                  ₹{loan.loan_amount.toLocaleString("en-IN")}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">
                                  {content.loanTenure}
                                </p>
                                <p className="text-sm font-semibold text-gray-800">
                                  {loan.tenure}{" "}
                                  {loan.payment_type === "weekly"
                                    ? "Week(s)"
                                    : "Month(s)"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">
                                  {content.interestRate}
                                </p>
                                <p className="text-sm font-semibold text-gray-800">
                                  {loan.interest_rate}% pa
                                </p>
                              </div>
                            </div>

                            {/* Progress Bar */}
                            <div className="mb-2">
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-green-500 h-2 rounded-full transition-all"
                                  style={{
                                    width: `${Math.min(
                                      loan.progressPercentage,
                                      100
                                    )}%`,
                                  }}
                                ></div>
                              </div>
                            </div>

                            {/* Remaining Amount */}
                            <div className="flex items-center justify-between">
                              <p className="text-sm text-gray-600">
                                {content.remaining}:{" "}
                                <span className="font-semibold text-gray-800">
                                  ₹{loan.totalRemaining.toLocaleString("en-IN")}
                                </span>
                              </p>
                              {loan.nextDueDate && (
                                <p className="text-xs text-gray-500">
                                  Next: {formatDate(loan.nextDueDate)}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => handleViewLoanDetails(loan.id)}
                          className="text-gray-400 hover:text-gray-600 transition-colors ml-2 cursor-pointer"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Available Loan Options with Lock/Unlock System */}
          <div>
            {user && userLoans.length > 0 && (
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Available Loans
              </h2>
            )}

            {loanOptions.length === 0 ? (
              <div className="bg-white rounded-lg p-8 text-center">
                <p className="text-gray-600 text-lg">
                  No loan options available at the moment
                </p>
                <p className="text-gray-500 text-sm mt-2">
                  Please check back later
                </p>
              </div>
            ) : (
              loanOptions.map((loan) => {
                const unlockStatus = loanUnlockStatus.get(loan.id);
                const isLocked = unlockStatus
                  ? !unlockStatus.isUnlocked
                  : false;

                return (
                  <div
                    key={loan.id}
                    className={`bg-white rounded-lg mb-4 p-4 shadow-sm transition-all ${
                      isLocked
                        ? "opacity-60 cursor-not-allowed"
                        : "hover:shadow-md cursor-pointer"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        {/* Lock/Unlock Icon */}
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            isLocked ? "bg-gray-100" : "bg-yellow-100"
                          }`}
                        >
                          {isLocked ? (
                            <Lock className="w-5 h-5 text-gray-400" />
                          ) : (
                            <span className="text-lg">{loan.icon}</span>
                          )}
                        </div>

                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3
                              className={`text-lg font-bold ${
                                isLocked ? "text-gray-400" : "text-gray-800"
                              }`}
                            >
                              {loan.amount}
                            </h3>
                            {!isLocked && loan.sort_order > 1 && (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            )}
                          </div>
                          <p
                            className={`text-sm ${
                              isLocked ? "text-gray-400" : "text-gray-600"
                            }`}
                          >
                            {selectedLanguage === "hindi"
                              ? loan.type_hindi
                              : loan.type}
                          </p>

                          {/* Lock Reason */}
                          {isLocked && unlockStatus && (
                            <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                              <Lock className="w-3 h-3" />
                              {unlockStatus.reason}
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleKnowMore(loan.id)}
                        disabled={isLocked}
                        className={`text-sm font-medium flex items-center gap-1 transition-colors ${
                          isLocked
                            ? "text-gray-400 cursor-not-allowed"
                            : "text-yellow-600 hover:text-yellow-700 cursor-pointer"
                        }`}
                      >
                        {isLocked ? "Locked" : content.knowMore}
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </button>
                    </div>

                    {/* Progress indicator for unlocked loans */}
                    {!isLocked && loan.sort_order > 1 && unlockStatus && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          {unlockStatus.reason}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {!isCheckingAuth && !user && (
            <div className="lg:hidden fixed bottom-4 left-4 right-4">
              <button
                onClick={handleLoginSignup}
                className="w-full bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-bold py-3 rounded-lg text-base shadow-lg cursor-pointer transition-colors"
              >
                {content.loginSignup}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoanDashboard;
