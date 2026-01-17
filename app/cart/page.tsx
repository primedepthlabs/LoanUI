"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { calculateCommissions } from "@/lib/commissionCalculation";

import {
  ArrowLeft,
  Shield,
  CheckCircle,
  X,
  Upload,
  Camera,
  QrCode,
  IndianRupee,
  Trash2,
} from "lucide-react";

interface Plan {
  id: string;
  plan_name: string;
  plan_name_hindi: string | null;
  amount: number;
  features: string[];
  is_active: boolean;
}

interface User {
  id: string;
  email?: string;
  // Add other user properties as needed
}

interface PaymentSettings {
  qr_code_url: string;
  payment_amount: number;
}

interface UploadResult {
  success: boolean;
  publicUrl?: string;
  error?: string;
}

// Loading component
const LoadingSpinner = () => (
  <div className="min-h-screen bg-white flex items-center justify-center">
    <div className="text-center">
      <div className="animate-spin rounded-full h-10 w-10 border-2 border-yellow-200 border-t-yellow-500 mx-auto mb-3"></div>
      <p className="text-sm text-gray-500">Loading...</p>
    </div>
  </div>
);

// Main CartContent component wrapped in Suspense
function CartContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = searchParams?.get("plan") ?? "";

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentScreenshot, setPaymentScreenshot] = useState<File | null>(null);
  const [paymentSettings, setPaymentSettings] =
    useState<PaymentSettings | null>(null);
  const [loadingPaymentSettings, setLoadingPaymentSettings] = useState(false);
  const [referralCode, setReferralCode] = useState<string>("");

  // 🔥 NEW: Agent check states
  const [isExistingAgent, setIsExistingAgent] = useState(false);
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(null);
  const [sponsorInfo, setSponsorInfo] = useState<{
    id: string;
    name: string;
  } | null>(null);
  // 🔥 Check if user is already an agent
  const checkIfUserIsAgent = async (authUserId: string) => {
    try {
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("auth_user_id", authUserId)
        .single();

      if (userError || !userData) return;

      const { data: agentData } = await supabase
        .from("agents")
        .select("id, sponsor_id")
        .eq("user_id", userData.id)
        .maybeSingle();

      if (agentData) {
        setIsExistingAgent(true);
        setCurrentAgentId(agentData.id);

        if (agentData.sponsor_id) {
          const { data: sponsorData } = await supabase
            .from("agents")
            .select("id, users(full_name)")
            .eq("id", agentData.sponsor_id)
            .single();

          if (sponsorData) {
            setSponsorInfo({
              id: sponsorData.id,
              name: (sponsorData.users as any)?.full_name || "Your Sponsor",
            });
          }
        }
      }
    } catch (error) {
      console.error("Error checking agent status:", error);
    }
  };
  // 🔥 Auto-fill referral code from URL
  useEffect(() => {
    const refFromUrl = searchParams?.get("ref") ?? "";
    if (refFromUrl) {
      setReferralCode(refFromUrl.toUpperCase());
    }
  }, [searchParams]);

  useEffect(() => {
    const checkAuth = async () => {
      setAuthLoading(true);
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const session = data?.session;
        setUser(session?.user ?? null);

        if (!session?.user) {
          router.push(
            `/login?returnTo=${encodeURIComponent(
              window.location.pathname + window.location.search
            )}`
          );
        } else {
          // 🔥 Check if user is an existing agent
          await checkIfUserIsAgent(session.user.id);
        }
      } catch (err) {
        console.error("Auth check failed:", err);
        setErrorMsg(
          "Unable to verify session. Please refresh or log in again."
        );
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  const getPaymentSettings = async (): Promise<{
    success: boolean;
    settings?: PaymentSettings;
    error?: string;
  }> => {
    try {
      const { data, error } = await supabase
        .from("payment_settings")
        .select("qr_code_url, payment_amount")
        .single();

      if (error) throw error;
      return { success: true, settings: data };
    } catch (error) {
      console.error("Payment settings fetch error:", error);
      return { success: false, error: (error as Error).message };
    }
  };

  useEffect(() => {
    if (showPaymentModal && !paymentSettings) {
      const fetchPaymentSettings = async () => {
        setLoadingPaymentSettings(true);
        try {
          const result = await getPaymentSettings();
          if (result.success && result.settings) {
            setPaymentSettings(result.settings);
          } else {
            alert("Failed to load payment settings. Please try again.");
            setShowPaymentModal(false);
          }
        } catch (error) {
          console.error("Error fetching payment settings:", error);
          alert("Failed to load payment settings. Please try again.");
          setShowPaymentModal(false);
        } finally {
          setLoadingPaymentSettings(false);
        }
      };

      fetchPaymentSettings();
    }
  }, [showPaymentModal, paymentSettings]);

  const handlePaymentScreenshotChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/jpg", "image/png"];
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (!validTypes.includes(file.type)) {
      alert("Please upload a valid image file (JPG, JPEG, PNG)");
      return;
    }

    if (file.size > maxSize) {
      alert("File must be less than 5MB");
      return;
    }

    setPaymentScreenshot(file);
  };

  // Upload payment screenshot to storage
  const uploadPaymentScreenshot = async (
    file: File,
    userId: string
  ): Promise<UploadResult> => {
    try {
      const fileExtension = file.name.split(".").pop();
      const fileName = `${userId}/course-payment-${Date.now()}.${fileExtension}`;

      const { data, error } = await supabase.storage
        .from("user-documents")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (error) throw error;

      const { data: publicUrlData } = supabase.storage
        .from("user-documents")
        .getPublicUrl(fileName);

      return {
        success: true,
        publicUrl: publicUrlData.publicUrl,
      };
    } catch (error) {
      console.error("Payment screenshot upload error:", error);
      return { success: false, error: (error as Error).message };
    }
  };

  // 🔥 UPDATED: Submit payment for admin verification
  const submitPaymentForVerification = async () => {
    setIsProcessing(true);
    setErrorMsg(null);

    if (!paymentScreenshot || !user || !selectedPlan) {
      alert("Missing required information");
      setIsProcessing(false);
      return;
    }

    // 🔥 Validate sponsor has this plan (for both existing agents and new users)
    let sponsorIdToUse = sponsorInfo?.id || null;

    if (!isExistingAgent && referralCode.trim()) {
      try {
        // Step 1: Find sponsor by referral code
        const { data: sponsorAgent, error: sponsorError } = await supabase
          .from("agents")
          .select("id")
          .eq("referral_code", referralCode.trim())
          .single();

        if (sponsorError || !sponsorAgent) {
          setErrorMsg("Invalid referral code. Please check and try again.");
          setIsProcessing(false);
          return;
        }

        sponsorIdToUse = sponsorAgent.id;

        // Step 2: Check if sponsor has this plan
        const { data: sponsorPlan, error: planCheckError } = await supabase
          .from("agent_plans")
          .select("id")
          .eq("agent_id", sponsorAgent.id)
          .eq("plan_id", selectedPlan.id)
          .eq("is_active", true)
          .maybeSingle();

        if (planCheckError) {
          console.error("Plan check error:", planCheckError);
          setErrorMsg("Failed to validate sponsor's plan. Please try again.");
          setIsProcessing(false);
          return;
        }

        if (!sponsorPlan) {
          setErrorMsg(
            "Your sponsor doesn't have this plan. Please choose a different plan or contact your sponsor."
          );
          setIsProcessing(false);
          return;
        }
      } catch (error) {
        console.error("Validation error:", error);
        setErrorMsg("Failed to validate referral. Please try again.");
        setIsProcessing(false);
        return;
      }
    }

    setErrorMsg(null);

    try {
      // 1. Upload payment screenshot
      const uploadResult = await uploadPaymentScreenshot(
        paymentScreenshot,
        user.id
      );

      if (!uploadResult.success || !uploadResult.publicUrl) {
        throw new Error("Failed to upload payment screenshot");
      }

      // 2. Create payment record in database
      const { data, error: paymentError } = await supabase
        .from("course_payments")
        .insert([
          {
            user_id: user.id,
            plan_id: selectedPlan.id,
            payment_screenshot_url: uploadResult.publicUrl,
            payment_amount: selectedPlan.amount,
            payment_status: "pending",
            referral_code: isExistingAgent ? null : referralCode.trim() || null,
            submitted_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (paymentError) throw paymentError;

      // 🔥 3. NEW: Calculate commissions immediately if user is existing agent
      if (isExistingAgent && currentAgentId) {
        console.log("Creating immediate commissions for existing agent...");

        const commissionResult = await calculateCommissions(
          data.id,
          currentAgentId,
          selectedPlan.id,
          selectedPlan.amount
        );

        if (commissionResult.success) {
          console.log(`✅ ${commissionResult.message}`);
        } else {
          console.error(
            "⚠️ Commission calculation failed:",
            commissionResult.message
          );
          // Don't block payment - admin can recalculate later
        }
      }

      // 4. Show success and redirect

      // 3. Show success and redirect
      setIsProcessing(false);
      setPaymentSuccess(true);
      setShowPaymentModal(false);

      setTimeout(() => {
        router.push("/");
      }, 2000);
    } catch (error) {
      console.error("Payment submission error:", error);
      setIsProcessing(false);
      setErrorMsg(
        error instanceof Error
          ? error.message
          : "Failed to submit payment. Please try again."
      );
    }
  };

  useEffect(() => {
    const fetchPlan = async () => {
      if (!planId) {
        setPlanLoading(false);
        return;
      }

      try {
        setPlanLoading(true);
        const { data, error } = await supabase
          .from("plans")
          .select("*")
          .eq("id", planId)
          .eq("is_active", true)
          .single();

        if (error) throw error;

        if (data) {
          setSelectedPlan(data);
        } else {
          setErrorMsg("Plan not found or no longer available");
        }
      } catch (err) {
        console.error("Error fetching plan:", err);
        setErrorMsg("Failed to load plan details");
      } finally {
        setPlanLoading(false);
      }
    };

    fetchPlan();
  }, [planId]);

  const handleBack = () => router.back();

  const handlePayment = () => {
    setErrorMsg(null);

    if (!user) {
      router.push(
        `/login?returnTo=${encodeURIComponent(
          window.location.pathname + window.location.search
        )}`
      );
      return;
    }

    if (!selectedPlan) {
      setErrorMsg("No plan selected");
      return;
    }

    setShowPaymentModal(true);
  };

  if (authLoading || planLoading) {
    return <LoadingSpinner />;
  }

  if (!selectedPlan) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Plan not found</p>
          <button
            onClick={() => router.push("/agent-courses")}
            className="bg-yellow-500 hover:bg-yellow-600 text-gray-900 px-6 py-2 rounded-lg font-medium transition-colors"
          >
            Back to Courses
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-3">
          <h1 className="text-lg font-semibold text-gray-900">Checkout</h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-6">
        {/* 🔥 NEW: Show agent status banner */}
        {isExistingAgent && sponsorInfo && (
          <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm font-medium text-yellow-900">
              ✓ You're an existing agent under:{" "}
              <span className="font-bold">{sponsorInfo.name}</span>
            </p>
            <p className="text-xs text-yellow-700 mt-1">
              No referral code needed for this purchase
            </p>
          </div>
        )}

        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {/* Order Summary */}
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900 mb-4">
              Order Summary
            </h2>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-gray-900 font-medium">
                    {selectedPlan.plan_name}
                  </span>
                  <span className="font-semibold text-gray-900">
                    ₹{selectedPlan.amount.toLocaleString()}
                  </span>
                </div>
                {selectedPlan.plan_name_hindi && (
                  <span className="text-xs text-gray-500">
                    {selectedPlan.plan_name_hindi}
                  </span>
                )}
              </div>

              <div className="border-t border-gray-100 pt-3">
                <div className="flex justify-between items-center text-base font-semibold">
                  <span className="text-gray-900">Total</span>
                  <span className="text-gray-900">
                    ₹{selectedPlan.amount.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Plan Features */}
          {selectedPlan.features && selectedPlan.features.length > 0 && (
            <div className="p-6 border-b border-gray-100 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                What&apos;s Included:
              </h3>
              <ul className="space-y-2">
                {selectedPlan.features.map((feature, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2 text-sm text-gray-600"
                  >
                    <CheckCircle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Security Notice */}
          <div className="bg-gray-50 p-4 border-b border-gray-100">
            <div className="flex items-center gap-2 text-gray-600 text-sm">
              <Shield className="w-4 h-4" />
              <span>Your payment is secure and encrypted</span>
            </div>
          </div>

          {/* Errors */}
          {errorMsg && (
            <div className="p-4 text-red-700 bg-red-50 border-b border-red-100 text-sm">
              {errorMsg}
            </div>
          )}

          {/* Pay Button */}
          <div className="p-6">
            <button
              onClick={handlePayment}
              disabled={isProcessing}
              className="w-full bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-300 text-gray-900 font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-yellow-200 border-t-gray-900" />
                  <span className="text-sm">Processing...</span>
                </>
              ) : (
                <span className="text-sm">
                  Pay ₹{selectedPlan.amount.toLocaleString()}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 sm:p-8 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                Complete Payment
              </h2>
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setPaymentScreenshot(null);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {loadingPaymentSettings ? (
              <div className="flex justify-center items-center py-12">
                <div className="w-8 h-8 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              <>
                {/* Payment Amount */}
                <div className="mb-6 text-center bg-yellow-50 p-4 rounded-lg border-2 border-yellow-200">
                  <p className="text-sm text-gray-600 mb-2">Amount to Pay</p>
                  <div className="flex items-center justify-center text-4xl font-bold text-yellow-600">
                    <IndianRupee className="w-8 h-8" />
                    {selectedPlan.amount}
                  </div>
                </div>

                {/* QR Code */}
                <div className="mb-6">
                  <p className="text-sm font-medium text-gray-700 mb-3 text-center">
                    Scan QR Code to Pay
                  </p>
                  <div className="border-2 border-yellow-200 rounded-lg p-4 bg-yellow-50 flex justify-center">
                    {paymentSettings?.qr_code_url ? (
                      // Replace img with div or use next/image if configured
                      <div
                        className="w-64 h-64 bg-contain bg-center bg-no-repeat"
                        style={{
                          backgroundImage: `url(${paymentSettings.qr_code_url})`,
                        }}
                      />
                    ) : (
                      <div className="w-64 h-64 flex items-center justify-center bg-white rounded">
                        <QrCode className="w-16 h-16 text-gray-300" />
                      </div>
                    )}
                  </div>
                </div>
                {/* Referral Code Input */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Referral Code (Optional)
                  </label>
                  <input
                    type="text"
                    value={referralCode}
                    onChange={(e) =>
                      setReferralCode(e.target.value.toUpperCase())
                    }
                    placeholder="Enter referral code"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-sm"
                    maxLength={8}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Leave empty if you don&apos;t have a referral code
                  </p>
                </div>
                {/* Upload Payment Screenshot */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Camera className="inline w-4 h-4 mr-1" />
                    Upload Payment Screenshot *
                  </label>
                  <div className="border-2 border-dashed border-yellow-300 rounded-lg p-4 text-center hover:border-yellow-400 hover:bg-yellow-50 transition-colors">
                    <Upload className="mx-auto w-8 h-8 text-gray-400 mb-2" />
                    <input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png"
                      onChange={handlePaymentScreenshotChange}
                      className="hidden"
                      id="paymentScreenshot"
                    />
                    <label
                      htmlFor="paymentScreenshot"
                      className="cursor-pointer text-yellow-600 hover:text-yellow-500 font-medium text-sm"
                    >
                      {paymentScreenshot
                        ? "Change Screenshot"
                        : "Click to upload screenshot"}
                    </label>
                    <p className="text-gray-500 text-xs mt-1">
                      JPG, PNG up to 5MB
                    </p>

                    {paymentScreenshot && (
                      <div className="mt-3 bg-white p-3 rounded border-2 border-yellow-200 flex items-center justify-between">
                        <div className="flex items-center">
                          <CheckCircle className="w-4 h-4 text-yellow-500 mr-2" />
                          <span className="text-xs text-gray-700 truncate">
                            {paymentScreenshot.name}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPaymentScreenshot(null)}
                          className="text-red-500 hover:text-red-700 ml-2"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Error in Modal */}
                {errorMsg && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-xs text-red-700">{errorMsg}</p>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  onClick={submitPaymentForVerification}
                  disabled={!paymentScreenshot || isProcessing}
                  className={`w-full py-3 sm:py-4 px-4 sm:px-6 rounded-lg font-semibold text-white text-sm sm:text-base transition-all duration-200 ${
                    !paymentScreenshot || isProcessing
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-yellow-500 hover:bg-yellow-600 focus:ring-4 focus:ring-yellow-300 shadow-lg hover:shadow-xl"
                  }`}
                >
                  {isProcessing ? (
                    <div className="flex items-center justify-center">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                      Submitting...
                    </div>
                  ) : (
                    <>
                      <CheckCircle className="inline w-5 h-5 mr-2" />
                      Submit for Verification
                    </>
                  )}
                </button>

                <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                  <p className="text-xs text-yellow-800 text-center">
                    🔒 Your payment will be verified by admin within 24 hours
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Success Modal */}
      {paymentSuccess && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg p-8 text-center max-w-md">
            <div className="w-16 h-16 bg-yellow-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-yellow-500" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Payment Submitted Successfully!
            </h2>
            <p className="text-gray-600 text-sm mb-2">
              Your payment for {selectedPlan.plan_name} has been submitted for
              verification.
            </p>
            <p className="text-gray-500 text-xs mb-4">
              You will receive a notification once the admin verifies your
              payment.
            </p>
            {selectedPlan.plan_name_hindi && (
              <p className="text-gray-500 text-xs">
                {selectedPlan.plan_name_hindi}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Main page component with Suspense
export default function CartPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <CartContent />
    </Suspense>
  );
}
