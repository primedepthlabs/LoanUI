"use client";

import React, { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { LogOut, User } from "lucide-react";

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

  // Language content
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

  // Fetch loan options from Supabase
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
  const handleKnowMore = (loanId: string) => {
    if (!user) {
      router.push("/login");
    } else {
      router.push(`/loan-details/${loanId}`);
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        setUser(session?.user || null);
      } catch (error) {
        console.error("Auth check error:", error);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuth();
    fetchLoanOptions();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const content = languageContent[selectedLanguage] || languageContent.english;

  const handleLoanSelect = (loanId: string) => {
    setSelectedLoan(loanId);
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      router.push("/");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleLoginSignup = () => {
    router.push("/login");
  };

  const handleProfileClick = () => {
    router.push("/profile");
  };

  // Loading state for loans
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
    <div className="min-h-screen bg-gray-100 mx-auto relative">
      {/* Header Section */}
      <div className="relative bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 p-6">
        {/* Decorative Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div
            className="w-full h-full"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 50%, white 1px, transparent 1px)",
              backgroundSize: "20px 20px",
            }}
          ></div>
        </div>

        <div className="flex justify-center mb-4 relative z-10">
          <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg border-2 border-white">
            <img src="logo.jpg" alt="logo" className="w-10 h-10 rounded-full" />
          </div>
        </div>

        {/* Profile Icon - Left Side */}
        {user && (
          <button
            onClick={handleProfileClick}
            className="absolute top-4 left-4 p-2 cursor-pointer rounded-full bg-white/10 hover:bg-white/20 transition-all duration-200 backdrop-blur-sm border border-white/20 group z-20"
            aria-label="Profile"
          >
            <User className="w-5 h-5 text-white group-hover:text-yellow-400 transition-colors duration-200" />
          </button>
        )}

        {/* Logout Button - Right Side */}
        {user && (
          <button
            onClick={handleLogout}
            className="absolute top-4 right-4 p-2 cursor-pointer rounded-full bg-white/10 hover:bg-white/20 transition-all duration-200 backdrop-blur-sm border border-white/20 group z-20"
            aria-label="Logout"
          >
            <LogOut className="w-5 h-5 text-white group-hover:text-yellow-400 transition-colors duration-200" />
          </button>
        )}

        {/* Welcome Text */}
        <div className="text-center text-white relative z-10">
          <h1 className="text-xl font-bold mb-2">{content.welcome}</h1>
          <p className="text-gray-300 text-sm mb-1">{content.getInstantLoan}</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4 -mt-2 mb-10 relative z-20 bg-gray-100">
        {/* Check if loan options exist */}
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
          // Loan Options - Now dynamic from Supabase
          loanOptions.map((loan) => (
            <div
              key={loan.id}
              className="bg-white rounded-lg mb-4 p-2 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
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
                  className="text-yellow-600 cursor-pointer text-sm font-medium flex items-center gap-1"
                  onClick={() => handleKnowMore(loan.id)}
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

        {!isCheckingAuth && !user && (
          <div className="fixed bottom-4 left-4 right-4">
            <button
              onClick={handleLoginSignup}
              className="w-full bg-yellow-400 text-gray-800 font-bold cursor-pointer py-3 rounded-lg text-base shadow-lg"
            >
              {content.loginSignup}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoanDashboard;
