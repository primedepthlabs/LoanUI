// app/dashboard/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { LogOut, User, Home, Briefcase, ArrowLeft, Menu } from "lucide-react";

interface LoanOption {
  id: string;
  type: string;
  type_hindi: string;
  amount: string;
  icon: string;
  is_active: boolean;
  sort_order: number;
}

interface LanguageContent {
  welcome: string;
  getInstantLoan: string;
  knowMore: string;
  wealthWellness: string;
  loginSignup: string;
  personalLoan: string;
}

const LoanDashboard: React.FC = () => {
  const [selectedLoan, setSelectedLoan] = useState<string>("");
  const [loanOptions, setLoanOptions] = useState<LoanOption[]>([]);
  const [isLoadingLoans, setIsLoadingLoans] = useState(true);
  const searchParams = useSearchParams();
  const selectedLanguage = searchParams.get("language") || "english";
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // start false to avoid SSR/hydration issues; we'll set it inside useEffect
  const [hasPurchasedCourse, setHasPurchasedCourse] = useState<boolean>(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // 'home' or 'agent-dashboard'
  const [activeView, setActiveView] = useState<"home" | "agent-dashboard">(
    "home"
  );

  const languageContent: Record<string, LanguageContent> = {
    english: {
      welcome: "Welcome to Balaji Finance",
      getInstantLoan: "Get Instant Personal Loan upto",
      knowMore: "Know more",
      wealthWellness: "Wealth & Wellness Services",
      loginSignup: "Login/Signup with Mobile",
      personalLoan: "Personal Loan",
    },
    hindi: {
      welcome: "Balaji Finance में आपका स्वागत है",
      getInstantLoan: "तुरंत व्यक्तिगत ऋण प्राप्त करें",
      knowMore: "और जानें",
      wealthWellness: "धन और कल्याण सेवाएं",
      loginSignup: "मोबाइल से लॉगिन/साइनअप करें",
      personalLoan: "व्यक्तिगत ऋण",
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

  // Server-side check for purchases/agent flag
  const checkPurchasedCourses = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("purchased_courses, is_agent")
        .eq("auth_user_id", userId)
        .single();

      if (error) throw error;

      const serverHas = !!(
        data?.purchased_courses?.length > 0 || data?.is_agent
      );
      // keep local true if previously set (merge)
      setHasPurchasedCourse((prev) => prev || serverHas);
    } catch (error) {
      console.error("Error checking purchased courses:", error);
      // don't overwrite client flag aggressively
    }
  };

  const handleKnowMore = (loanId: string) => {
    if (!user) {
      router.push("/login");
    } else {
      router.push(`/loan-details/${loanId}`);
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
          await checkPurchasedCourses(session.user.id);
        }
      } catch (err) {
        console.error("Auth check error:", err);
      } finally {
        if (!mounted) return;
        setIsCheckingAuth(false);

        // Read localStorage (client-only) to show Agent tab for dummy payments:
        try {
          const localFlag = localStorage.getItem("hasPurchasedCourse");
          if (localFlag === "true") {
            setHasPurchasedCourse(true);
            // DO NOT auto-open agent-dashboard here. User must click tab.
          }
        } catch (e) {
          // ignore localStorage errors
        }

        // Allow redirect param to auto-open view if present (optional)
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
        await checkPurchasedCourses(session.user.id);
      } else {
        setHasPurchasedCourse(false);
        setActiveView("home");
      }
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const content = languageContent[selectedLanguage] || languageContent.english;

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

  const handleAgentDashboard = () => {
    if (!hasPurchasedCourse) {
      router.push("/agent-courses");
      return;
    }
    // Redirect to the actual agent dashboard page
    router.push("/agent-dashboard");
  };

  const sidebarItems = [
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
      id: "earn-agent",
      label: "Earn as Agent",
      icon: Briefcase,
      onClick: handleEarnAsAgent,
    },
  ];

  if (hasPurchasedCourse) {
    sidebarItems.push({
      id: "agent-dashboard",
      label: "Agent Dashboard",
      icon: User,
      onClick: handleAgentDashboard,
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

          <nav className="flex-1 p-4">
            <div className="space-y-2">
              {sidebarItems.map((item) => {
                const IconComponent = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={item.onClick}
                    className="w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors text-gray-600 hover:bg-gray-50 hover:text-gray-800"
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
                  className="w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors text-gray-600 hover:bg-gray-50"
                >
                  <User className="w-5 h-5" />
                  <span className="font-medium">Profile</span>
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors text-red-600 hover:bg-red-50"
                >
                  <LogOut className="w-5 h-5" />
                  <span className="font-medium">Logout</span>
                </button>
              </div>
            ) : (
              <button
                onClick={handleLoginSignup}
                className="w-full bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-medium py-3 rounded-lg transition-colors"
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
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
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

        <div className="relative bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 p-6">
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

          <div className="hidden lg:flex absolute top-4 right-4 gap-2 z-20">
            {user && (
              <>
                <button
                  onClick={handleProfileClick}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-all duration-200 border border-white/20 group"
                  aria-label="Profile"
                >
                  <User className="w-5 h-5 text-white group-hover:text-yellow-400" />
                </button>
                <button
                  onClick={handleLogout}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-all duration-200 border border-white/20 group"
                  aria-label="Logout"
                >
                  <LogOut className="w-5 h-5 text-white group-hover:text-yellow-400" />
                </button>
              </>
            )}
          </div>

          <div className="text-center text-white relative z-10">
            <h1 className="text-xl font-bold mb-2">{content.welcome}</h1>
            <p className="text-gray-300 text-sm mb-1">
              {content.getInstantLoan}
            </p>
          </div>
        </div>

        <div className="flex-1 p-4 -mt-2 bg-gray-100">
          <>
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
              loanOptions.map((loan) => (
                <div
                  key={loan.id}
                  className="bg-white rounded-lg mb-4 p-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                        <span className="text-lg">{loan.icon}</span>
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-800 mb-1">
                          {loan.amount}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {selectedLanguage === "hindi"
                            ? loan.type_hindi
                            : loan.type}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleKnowMore(loan.id)}
                      className="text-yellow-600 text-sm font-medium flex items-center gap-1 hover:text-yellow-700"
                    >
                      {content.knowMore}
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
                </div>
              ))
            )}
          </>

          {!isCheckingAuth && !user && (
            <div className="lg:hidden fixed bottom-4 left-4 right-4">
              <button
                onClick={handleLoginSignup}
                className="w-full bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-bold py-3 rounded-lg text-base shadow-lg"
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
