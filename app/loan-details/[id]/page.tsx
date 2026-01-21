"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ArrowLeft, X, AlertCircle, CheckCircle } from "lucide-react";

interface TenureOption {
  value: number;
  label: string;
  unit: string;
}

interface LoanConfiguration {
  id: string;
  disbursement_interest: number;
  repayment_interest: number;
  tenure_options: TenureOption[];
  payment_type: "weekly" | "monthly";
}

interface LoanOption {
  id: string;
  type: string;
  type_hindi: string;
  amount: string;
  icon: string;
  is_active: boolean;
  sort_order: number;

  login_payment_amount: string | null;
  payment_qr_url: string | null;
}

const LoanDetailsPage: React.FC = () => {
  const params = useParams();
  const router = useRouter();
  const loanId = params.id as string;

  const [loan, setLoan] = useState<LoanOption | null>(null);
  const [loanConfig, setLoanConfig] = useState<LoanConfiguration | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTenure, setSelectedTenure] = useState<number>(0);
  const [loanAmount, setLoanAmount] = useState(0);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [paymentScreenshot, setPaymentScreenshot] = useState<File | null>(null);
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);

  // Check if user already applied
  const [hasExistingApplication, setHasExistingApplication] = useState(false);
  const [existingApplicationStatus, setExistingApplicationStatus] =
    useState<string>("");
  const [existingLoanType, setExistingLoanType] = useState<string>("");

  useEffect(() => {
    fetchLoanDetailsAndConfig();
    checkExistingApplication();
  }, [loanId]);

  // Check if user has already applied for this loan
  const checkExistingApplication = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session || !session.user) {
        return;
      }

      const { data, error } = await supabase
        .from("loan_applications")
        .select("id, status, loan_type, applied_at")
        .eq("user_id", session.user.id)
        .in("status", ["pending", "processing", "approved", "disbursed"])
        .order("applied_at", { ascending: false })
        .limit(1);

      if (error) {
        console.error("Error checking existing application:", error);
        return;
      }

      if (data && data.length > 0) {
        setHasExistingApplication(true);
        setExistingApplicationStatus(data[0].status);
        setExistingLoanType(data[0].loan_type);
      }
    } catch (error) {
      console.error("Error in checkExistingApplication:", error);
    }
  };

  // Parse amount from string like "₹10 Lakhs" to number
  const parseAmount = (amountString: string): number => {
    const cleanString = amountString.replace(/[₹,\s]/g, "").toLowerCase();

    if (cleanString.includes("lakh")) {
      const value = parseFloat(
        cleanString.replace("lakhs", "").replace("lakh", ""),
      );
      return value * 100000;
    } else if (cleanString.includes("crore")) {
      const value = parseFloat(
        cleanString.replace("crores", "").replace("crore", ""),
      );
      return value * 10000000;
    } else {
      return parseFloat(cleanString) || 0;
    }
  };

  const fetchLoanDetailsAndConfig = async () => {
    try {
      setIsLoading(true);

      // Fetch loan details
      const { data: loanData, error: loanError } = await supabase
        .from("loan_options")
        .select("*, login_payment_amount, payment_qr_url")
        .eq("id", loanId)
        .single();

      if (loanError) throw loanError;

      // Fetch global loan configuration
      const { data: configData, error: configError } = await supabase
        .from("loan_configuration")
        .select("*")
        .single();

      if (configError) throw configError;

      setLoan(loanData);
      setLoanConfig(configData);

      // Parse and set the loan amount from database
      const parsedAmount = parseAmount(loanData.amount);
      setLoanAmount(parsedAmount);

      // Set default selected tenure to the first option
      if (configData.tenure_options && configData.tenure_options.length > 0) {
        setSelectedTenure(configData.tenure_options[0].value);
      }
    } catch (error) {
      console.error("Error fetching loan details or configuration:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateLoan = (
    principal: number,
    tenure: number,
    disbursementInterest: number,
    repaymentInterest: number,
  ) => {
    const disbursementDeduction = Math.round(
      principal * (disbursementInterest / 100),
    );
    const amountReceived = principal - disbursementDeduction;

    const repaymentAddition = Math.round(principal * (repaymentInterest / 100));
    const totalRepayable = principal + repaymentAddition;

    const totalInterest = disbursementDeduction + repaymentAddition;
    const installment = Math.round(totalRepayable / tenure);

    // Calculate last installment to balance the total
    const lastInstallment = totalRepayable - installment * (tenure - 1);

    return {
      amountReceived,
      totalRepayable,
      totalInterest,
      installment,
      lastInstallment,
      principal,
      disbursementDeduction,
      repaymentAddition,
    };
  };

  const handleApplyNow = () => {
    if (!loan || !loanConfig) return;

    if (hasExistingApplication) {
      setSubmitMessage({
        type: "error",
        text: `You already have a ${existingApplicationStatus} application for this loan.`,
      });
      setShowModal(true);
      return;
    }

    setShowModal(true);
    setSubmitMessage(null);
  };
  const uploadPaymentScreenshot = async (): Promise<string | null> => {
    if (!paymentScreenshot) return null;

    try {
      setUploadingScreenshot(true);

      const fileExt = paymentScreenshot.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random()}.${fileExt}`;
      const filePath = `login-payments/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("payment-qr-codes")
        .upload(filePath, paymentScreenshot);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("payment-qr-codes")
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (err) {
      console.error("Screenshot upload failed", err);
      return null;
    } finally {
      setUploadingScreenshot(false);
    }
  };
  const handleSubmitLoanRequest = async () => {
    if (!loan || !loanConfig) return;

    try {
      setIsSubmitting(true);
      setSubmitMessage(null);

      // Validate payment screenshot
      if (!paymentScreenshot) {
        setSubmitMessage({
          type: "error",
          text: "Please upload payment screenshot before submitting",
        });
        setIsSubmitting(false);
        return;
      }

      const loanDetails = calculateLoan(
        loanAmount,
        selectedTenure,
        loanConfig.disbursement_interest,
        loanConfig.repayment_interest,
      );

      // Get current session
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session || !session.user) {
        setSubmitMessage({
          type: "error",
          text: "Please login to apply for a loan",
        });
        setIsSubmitting(false);
        return;
      }

      const user = session.user;

      // Double-check if user already applied
      const { data: existingData, error: checkError } = await supabase
        .from("loan_applications")
        .select("id, status, loan_type")
        .eq("user_id", user.id)
        .in("status", ["pending", "processing", "approved", "disbursed"])
        .limit(1);

      if (checkError) {
        console.error("Error checking existing application:", checkError);
      }

      if (existingData && existingData.length > 0) {
        setSubmitMessage({
          type: "error",
          text: `You already have a ${existingData[0].status} loan (${existingData[0].loan_type}). Complete it first.`,
        });
        setHasExistingApplication(true);
        setExistingApplicationStatus(existingData[0].status);
        setExistingLoanType(existingData[0].loan_type);
        setIsSubmitting(false);
        return;
      }

      // Upload payment screenshot
      const screenshotUrl = await uploadPaymentScreenshot();
      if (!screenshotUrl) {
        setSubmitMessage({
          type: "error",
          text: "Failed to upload payment screenshot. Please try again.",
        });
        setIsSubmitting(false);
        return;
      }

      // Insert loan application into Supabase
      const { data, error } = await supabase
        .from("loan_applications")
        .insert([
          {
            user_id: user.id,
            loan_option_id: loanId,
            loan_type: loan.type,
            loan_amount: loanAmount,
            amount_received: loanDetails.amountReceived,
            tenure: selectedTenure,
            tenure_unit:
              loanConfig.tenure_options.find((t) => t.value === selectedTenure)
                ?.unit || "periods",
            disbursement_interest: loanConfig.disbursement_interest,
            repayment_interest: loanConfig.repayment_interest,
            payment_type: loanConfig.payment_type,
            installment_amount: loanDetails.installment,
            last_installment_amount: loanDetails.lastInstallment,
            total_payable: loanDetails.totalRepayable,
            total_interest: loanDetails.totalInterest,
            payment_screenshot_url: screenshotUrl,
            login_payment_amount: loan.login_payment_amount,
            status: "pending",
            applied_at: new Date().toISOString(),
          },
        ])
        .select();

      if (error) {
        console.error("Supabase error:", error);
        throw error;
      }

      setSubmitMessage({
        type: "success",
        text: "Loan request submitted successfully!",
      });

      setHasExistingApplication(true);
      setExistingApplicationStatus("pending");
      setTimeout(() => {
        setShowModal(false);
        router.push("/");
      }, 2000);
    } catch (error: any) {
      console.error("Error submitting loan request:", error);
      setSubmitMessage({
        type: "error",
        text:
          error.message || "Failed to submit loan request. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!loan || !loanConfig) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-8 text-center">
          <p className="text-gray-600 mb-4">
            {!loan ? "Loan not found" : "Configuration not found"}
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const {
    amountReceived,
    installment,
    lastInstallment,
    totalRepayable,
    totalInterest,
    principal,
  } = calculateLoan(
    loanAmount,
    selectedTenure,
    loanConfig.disbursement_interest,
    loanConfig.repayment_interest,
  );

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header - Matching Theme */}
      <div className="bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 shadow-sm">
        <div className="relative">
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

          <div className="relative max-w-2xl mx-auto px-4 py-4">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-white mb-3 hover:text-gray-200 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm">Back</span>
            </button>

            <div className="flex items-center gap-3 text-white">
              <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center text-2xl">
                {loan.icon}
              </div>
              <div>
                <h1 className="text-xl font-bold">{loan.type}</h1>
                <p className="text-sm text-gray-300">{loan.type_hindi}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-4">
        {/* Existing Application Warning */}
        {hasExistingApplication && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-orange-800 text-sm mb-0.5">
                Running Loan Detected
              </p>
              <p className="text-xs text-orange-700">
                You already have a running loan ({existingLoanType}). Complete
                it before applying for a new loan.
              </p>
            </div>
          </div>
        )}

        {/* Loan Amount Display */}
        <div className="bg-white rounded-lg p-3 mb-3 text-center shadow-sm">
          <p className="text-gray-500 text-xs mb-1">Loan Amount</p>
          <p className="text-2xl font-bold text-gray-800">{loan.amount}</p>
        </div>

        {/* Loan Application Section */}
        <div className="bg-white rounded-lg p-3 mb-3 shadow-sm">
          {/* Tenure Selection */}
          <div className="mb-3">
            <label className="block text-gray-700 font-medium mb-2 text-xs">
              Select Tenure
            </label>
            <div
              className={`grid gap-2 ${
                loanConfig.tenure_options.length <= 4
                  ? "grid-cols-4"
                  : loanConfig.tenure_options.length <= 6
                    ? "grid-cols-3"
                    : "grid-cols-2"
              }`}
            >
              {loanConfig.tenure_options.map((option, index) => (
                <button
                  key={`${option.value}-${option.unit}-${index}`}
                  onClick={() => setSelectedTenure(option.value)}
                  disabled={hasExistingApplication}
                  className={`py-2 px-2 rounded-lg font-semibold text-xs transition-all ${
                    selectedTenure === option.value
                      ? "bg-yellow-400 text-gray-800 shadow-sm"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  } ${
                    hasExistingApplication
                      ? "opacity-50 cursor-not-allowed"
                      : ""
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Loan Details - Ultra Minimal */}
          <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-3">
            {/* You Receive */}
            <div className="bg-white rounded-lg p-2 mb-2 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">You Receive</p>
                  <p className="text-xl font-bold text-green-600">
                    ₹{amountReceived.toLocaleString("en-IN")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">
                    -{loanConfig.disbursement_interest}% deducted
                  </p>
                </div>
              </div>
            </div>

            {/* EMI Amount - Highlighted */}
            <div className="bg-white rounded-lg p-2 mb-2 shadow-sm">
              <p className="text-xs text-gray-500 text-center">
                {loanConfig.payment_type === "weekly" ? "Weekly" : "Monthly"}{" "}
                EMI
              </p>
              <p className="text-2xl font-bold text-yellow-600 text-center">
                ₹{installment.toLocaleString("en-IN")}
              </p>
              {lastInstallment !== installment && (
                <p className="text-xs text-gray-500 text-center mt-1">
                  Last EMI: ₹{lastInstallment.toLocaleString("en-IN")}
                </p>
              )}
            </div>

            {/* Totals Grid */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white rounded-lg p-2 text-center shadow-sm">
                <p className="text-xs text-gray-500">Interest</p>
                <p className="text-xs font-bold text-orange-600">
                  {loanConfig.repayment_interest}%
                </p>
              </div>
              <div className="bg-white rounded-lg p-2 text-center shadow-sm">
                <p className="text-xs text-gray-500">Total Repay</p>
                <p className="text-xs font-bold text-gray-800">
                  ₹{totalRepayable.toLocaleString("en-IN")}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Apply Button */}
        <button
          onClick={handleApplyNow}
          disabled={hasExistingApplication}
          className={`w-full font-bold py-3 rounded-lg text-sm shadow-md transition-colors ${
            hasExistingApplication
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "bg-yellow-400 text-gray-800 hover:bg-yellow-500"
          }`}
        >
          {hasExistingApplication ? "Already Applied" : "Apply Now"}
        </button>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-5 relative max-h-[90vh] overflow-y-auto">
            {/* Close Button */}
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
              disabled={isSubmitting}
            >
              <X className="w-5 h-5" />
            </button>

            {hasExistingApplication ? (
              <div>
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-gray-800 mb-1">
                    Application Already Exists
                  </h3>
                </div>

                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-orange-800 text-sm mb-0.5">
                        Cannot Submit Application
                      </p>
                      <p className="text-xs text-orange-700">
                        You already have a{" "}
                        <span className="font-semibold">
                          {existingApplicationStatus}
                        </span>{" "}
                        application for this loan.
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setShowModal(false)}
                  className="w-full px-4 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors text-sm"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-gray-800 mb-1">
                    Confirm Application
                  </h3>
                  <p className="text-gray-600 text-xs">
                    Review your loan details
                  </p>
                </div>

                {/* Loan Summary - Minimal */}
                <div className="bg-gray-50 rounded-lg p-3 mb-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 text-xs">Loan Type:</span>
                    <span className="font-semibold text-gray-800 text-xs">
                      {loan.type}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 text-xs">Loan Amount:</span>
                    <span className="font-semibold text-gray-800 text-xs">
                      ₹{loanAmount.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-gray-600 text-xs">You Receive:</span>
                    <span className="font-bold text-green-600 text-sm">
                      ₹{amountReceived.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 text-xs">Tenure:</span>
                    <span className="font-semibold text-gray-800 text-xs">
                      {selectedTenure}{" "}
                      {loanConfig.tenure_options.find(
                        (t) => t.value === selectedTenure,
                      )?.unit || "periods"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 text-xs">
                      {loanConfig.payment_type === "weekly"
                        ? "Weekly"
                        : "Monthly"}{" "}
                      EMI:
                    </span>
                    <span className="font-bold text-yellow-600 text-sm">
                      ₹{installment.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-gray-600 text-xs">Total Repay:</span>
                    <span className="font-bold text-gray-800 text-sm">
                      ₹{totalRepayable.toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>

                {/* Login Payment */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                  <p className="text-xs text-gray-600 mb-1">Payment Required</p>

                  <p className="text-lg font-bold text-gray-900 mb-2">
                    ₹{loan.login_payment_amount}
                  </p>

                  {loan.payment_qr_url && (
                    <div className="flex justify-center mb-3">
                      <img
                        src={loan.payment_qr_url}
                        alt="Payment QR"
                        className="w-40 h-40 object-contain border rounded"
                      />
                    </div>
                  )}

                  <p className="text-xs text-gray-500 text-center mb-3">
                    Pay this amount before submitting the application
                  </p>

                  {/* Upload Payment Screenshot */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Upload Payment Screenshot *
                    </label>

                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) =>
                        setPaymentScreenshot(e.target.files?.[0] || null)
                      }
                      className="w-full text-xs border rounded p-2 bg-white"
                    />

                    {!paymentScreenshot && (
                      <p className="text-xs text-red-600 mt-1">
                        Screenshot is required to submit
                      </p>
                    )}
                  </div>
                </div>

                {/* Success/Error Message */}
                {submitMessage && (
                  <div
                    className={`mb-3 p-3 rounded-lg text-xs flex items-start gap-2 ${
                      submitMessage.type === "success"
                        ? "bg-green-50 text-green-800 border border-green-200"
                        : "bg-red-50 text-red-800 border border-red-200"
                    }`}
                  >
                    {submitMessage.type === "success" ? (
                      <CheckCircle className="w-4 h-4 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    )}
                    <span>{submitMessage.text}</span>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors text-sm"
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitLoanRequest}
                    className="flex-1 px-4 py-2 bg-yellow-400 text-gray-800 font-bold rounded-lg hover:bg-yellow-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    disabled={isSubmitting || !paymentScreenshot}
                  >
                    {isSubmitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-800"></div>
                        Submitting...
                      </span>
                    ) : (
                      "Submit"
                    )}
                  </button>
                </div>

                <p className="text-xs text-gray-500 text-center mt-3">
                  By submitting, you agree to our terms
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LoanDetailsPage;
