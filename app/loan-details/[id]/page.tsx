"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ArrowLeft, X, AlertCircle } from "lucide-react";

interface TenureOption {
  value: number;
  label: string;
  unit: string;
}

interface LoanConfiguration {
  id: string;
  interest_rate: number;
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

  // Check if user already applied
  const [hasExistingApplication, setHasExistingApplication] = useState(false);
  const [existingApplicationStatus, setExistingApplicationStatus] =
    useState<string>("");

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
        return; // User not logged in, skip check
      }

      // Check for existing applications for this loan
      const { data, error } = await supabase
        .from("loan_applications")
        .select("id, status, applied_at")
        .eq("user_id", session.user.id)
        .eq("loan_option_id", loanId)
        .in("status", ["pending", "processing", "approved"]) // Only check active applications
        .order("applied_at", { ascending: false })
        .limit(1);

      if (error) {
        console.error("Error checking existing application:", error);
        return;
      }

      if (data && data.length > 0) {
        setHasExistingApplication(true);
        setExistingApplicationStatus(data[0].status);
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
        cleanString.replace("lakhs", "").replace("lakh", "")
      );
      return value * 100000;
    } else if (cleanString.includes("crore")) {
      const value = parseFloat(
        cleanString.replace("crores", "").replace("crore", "")
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
        .select("*")
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

  /**
   * Calculate EMI using the standard EMI formula
   * EMI = [P × R × (1+R)^N] / [(1+R)^N - 1]
   *
   * For weekly: R = Annual Rate / 52 / 100
   * For monthly: R = Annual Rate / 12 / 100
   */
  const calculateEMI = (
    principal: number,
    tenure: number,
    annualRate: number,
    paymentType: "weekly" | "monthly" = "weekly"
  ) => {
    // Calculate period interest rate
    let periodRate: number;

    if (paymentType === "weekly") {
      // For weekly payments: Annual rate / 52 weeks
      periodRate = annualRate / 52 / 100;
    } else {
      // For monthly payments: Annual rate / 12 months
      periodRate = annualRate / 12 / 100;
    }

    // EMI Formula: [P × R × (1+R)^N] / [(1+R)^N - 1]
    const numerator = principal * periodRate * Math.pow(1 + periodRate, tenure);
    const denominator = Math.pow(1 + periodRate, tenure) - 1;

    const emi = numerator / denominator;

    // Calculate totals
    const totalPayable = emi * tenure;
    const totalInterest = totalPayable - principal;

    return {
      installment: Math.round(emi),
      totalPayable: Math.round(totalPayable),
      totalInterest: Math.round(totalInterest),
      principal: principal,
    };
  };

  const handleApplyNow = () => {
    if (!loan || !loanConfig) return;

    // Check if user already applied
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

  const handleSubmitLoanRequest = async () => {
    if (!loan || !loanConfig) return;

    try {
      setIsSubmitting(true);
      setSubmitMessage(null);

      const loanDetails = calculateEMI(
        loanAmount,
        selectedTenure,
        loanConfig.interest_rate,
        loanConfig.payment_type
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

      // Double-check if user already applied (in case they opened multiple tabs)
      const { data: existingData, error: checkError } = await supabase
        .from("loan_applications")
        .select("id, status")
        .eq("user_id", user.id)
        .eq("loan_option_id", loanId)
        .in("status", ["pending", "processing", "approved"])
        .limit(1);

      if (checkError) {
        console.error("Error checking existing application:", checkError);
      }

      if (existingData && existingData.length > 0) {
        setSubmitMessage({
          type: "error",
          text: `You already have a ${existingData[0].status} application for this loan.`,
        });
        setHasExistingApplication(true);
        setExistingApplicationStatus(existingData[0].status);
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
            tenure: selectedTenure,
            tenure_unit:
              loanConfig.tenure_options.find((t) => t.value === selectedTenure)
                ?.unit || "periods",
            interest_rate: loanConfig.interest_rate,
            payment_type: loanConfig.payment_type,
            installment_amount: loanDetails.installment,
            total_payable: loanDetails.totalPayable,
            total_interest: loanDetails.totalInterest,
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
        text: "Loan request submitted successfully! We'll review your application soon.",
      });

      // Update state to prevent re-application
      setHasExistingApplication(true);
      setExistingApplicationStatus("pending");

      // Close modal after 2 seconds and redirect
      setTimeout(() => {
        setShowModal(false);
        router.push("/dashboard");
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400"></div>
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
            className="px-6 py-2 bg-yellow-400 text-gray-800 font-semibold rounded-lg"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const { installment, totalPayable, totalInterest, principal } = calculateEMI(
    loanAmount,
    selectedTenure,
    loanConfig.interest_rate,
    loanConfig.payment_type
  );

  // Calculate interest rate percentage
  const interestPercentage = ((totalInterest / principal) * 100).toFixed(2);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 p-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-white mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>

        <div className="flex items-center gap-4 text-white">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center text-3xl">
            {loan.icon}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{loan.type}</h1>
            <p className="text-gray-300">{loan.type_hindi}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 max-w-2xl mx-auto">
        {/* Existing Application Warning */}
        {hasExistingApplication && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-orange-800 mb-1">
                Application Already Submitted
              </p>
              <p className="text-sm text-orange-700">
                You have a{" "}
                <span className="font-semibold">
                  {existingApplicationStatus}
                </span>{" "}
                application for this loan. You cannot apply again until this
                application is reviewed.
              </p>
            </div>
          </div>
        )}

        {/* Amount */}
        <div className="bg-white rounded-lg p-6 mb-4 text-center">
          <p className="text-gray-600 text-sm mb-2">Loan Amount</p>
          <p className="text-4xl font-bold text-gray-800">{loan.amount}</p>
        </div>

        {/* Loan Application Section */}
        <div className="bg-white rounded-lg p-6 mb-4">
          <h2 className="font-bold text-gray-800 mb-4 text-lg">
            Apply for Loan
          </h2>

          {/* Tenure Selection */}
          <div className="mb-6">
            <label className="block text-gray-700 font-medium mb-3">
              Select Payment Duration
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
              {loanConfig.tenure_options.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSelectedTenure(option.value)}
                  disabled={hasExistingApplication}
                  className={`py-3 px-2 rounded-lg font-semibold text-sm transition-all ${
                    selectedTenure === option.value
                      ? "bg-yellow-400 text-gray-800 shadow-md"
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

          {/* EMI Calculation Display */}
          <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-5 mb-4">
            {/* Principal Amount */}
            <div className="text-center mb-4 pb-4 border-b border-yellow-200">
              <p className="text-xs text-gray-600 mb-1">Principal Amount</p>
              <p className="text-xl font-bold text-gray-800">
                ₹{principal.toLocaleString("en-IN")}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="text-center">
                <p className="text-xs text-gray-600 mb-1">
                  Interest ({interestPercentage}%)
                </p>
                <p className="text-lg font-bold text-gray-800">
                  ₹{totalInterest.toLocaleString("en-IN")}
                </p>
              </div>
              <div className="text-center border-l border-yellow-200">
                <p className="text-xs text-gray-600 mb-1">Total Payable</p>
                <p className="text-lg font-bold text-gray-800">
                  ₹{totalPayable.toLocaleString("en-IN")}
                </p>
              </div>
            </div>

            {/* Installment - Highlighted */}
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="text-center">
                <p className="text-xs text-gray-600 mb-1">
                  {loanConfig.payment_type === "weekly"
                    ? "Weekly Installment (EMI)"
                    : "Monthly Installment (EMI)"}
                </p>
                <p className="text-3xl font-bold text-yellow-600">
                  ₹{installment.toLocaleString("en-IN")}
                </p>
              </div>
            </div>
          </div>

          {/* Installment Breakdown Preview */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <div className="text-xs text-blue-800">
              <p className="font-semibold mb-1">📋 Payment Schedule:</p>
              <p>
                Pay{" "}
                <span className="font-bold">
                  ₹{installment.toLocaleString("en-IN")}
                </span>{" "}
                per {loanConfig.payment_type === "weekly" ? "week" : "month"}{" "}
                for{" "}
                <span className="font-bold">
                  {selectedTenure}{" "}
                  {loanConfig.tenure_options.find(
                    (t) => t.value === selectedTenure
                  )?.unit || "periods"}
                </span>
              </p>
              <p className="mt-1 text-blue-600">
                Total of {selectedTenure} installments
              </p>
            </div>
          </div>

          {/* EMI Info */}
          <div className="text-xs text-gray-500 bg-gray-50 rounded p-3">
            <p className="font-semibold text-gray-700 mb-1">
              💡 About EMI Calculation:
            </p>
            <p>
              Interest is calculated on reducing balance at{" "}
              {loanConfig.interest_rate}% per annum. As you pay, your principal
              reduces and so does the interest.
            </p>
          </div>
        </div>

        {/* Features */}
        <div className="bg-white rounded-lg p-6 mb-4">
          <h2 className="font-bold text-gray-800 mb-3">Features</h2>
          <ul className="space-y-2 text-gray-700">
            <li>• Interest Rate: {loanConfig.interest_rate}% per annum</li>
            <li>
              • Tenure: {loanConfig.tenure_options[0]?.label} to{" "}
              {
                loanConfig.tenure_options[loanConfig.tenure_options.length - 1]
                  ?.label
              }
            </li>
            <li>• EMI based on reducing balance</li>
            <li>• Quick approval in 24-48 hours</li>
            <li>• Minimal documentation</li>
          </ul>
        </div>

        {/* Eligibility */}
        <div className="bg-white rounded-lg p-6 mb-4">
          <h2 className="font-bold text-gray-800 mb-3">Eligibility</h2>
          <ul className="space-y-2 text-gray-700">
            <li>• Age: 21 to 65 years</li>
            <li>• Monthly Income: Min ₹15,000</li>
            <li>• Valid KYC documents required</li>
            <li>• Good credit history preferred</li>
          </ul>
        </div>

        {/* Apply Button */}
        <button
          onClick={handleApplyNow}
          disabled={hasExistingApplication}
          className={`w-full font-bold py-4 rounded-lg text-lg shadow-md transition-colors ${
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
          <div className="bg-white rounded-lg max-w-md w-full p-6 relative">
            {/* Close Button */}
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              disabled={isSubmitting}
            >
              <X className="w-6 h-6" />
            </button>

            {/* Show error if already applied */}
            {hasExistingApplication ? (
              <div>
                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-gray-800 mb-2">
                    Application Already Exists
                  </h3>
                </div>

                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-orange-800 mb-1">
                        Cannot Submit Application
                      </p>
                      <p className="text-sm text-orange-700">
                        You already have a{" "}
                        <span className="font-semibold">
                          {existingApplicationStatus}
                        </span>{" "}
                        application for this loan. Please wait for it to be
                        reviewed before applying again.
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setShowModal(false)}
                  className="w-full px-4 py-3 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                {/* Modal Content */}
                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-gray-800 mb-2">
                    Confirm Loan Application
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Review your loan details before submitting
                  </p>
                </div>

                {/* Loan Details Summary */}
                <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Loan Type:</span>
                    <span className="font-semibold text-gray-800">
                      {loan.type}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Loan Amount:</span>
                    <span className="font-semibold text-gray-800">
                      ₹{loanAmount.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Tenure:</span>
                    <span className="font-semibold text-gray-800">
                      {selectedTenure}{" "}
                      {loanConfig.tenure_options.find(
                        (t) => t.value === selectedTenure
                      )?.unit || "periods"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">
                      {loanConfig.payment_type === "weekly"
                        ? "Weekly"
                        : "Monthly"}{" "}
                      EMI:
                    </span>
                    <span className="font-semibold text-yellow-600">
                      ₹{installment.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-3 mt-3">
                    <span className="text-gray-600">Total Payable:</span>
                    <span className="font-bold text-gray-800">
                      ₹{totalPayable.toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>

                {/* Success/Error Message */}
                {submitMessage && (
                  <div
                    className={`mb-4 p-3 rounded-lg text-sm ${
                      submitMessage.type === "success"
                        ? "bg-green-50 text-green-800 border border-green-200"
                        : "bg-red-50 text-red-800 border border-red-200"
                    }`}
                  >
                    {submitMessage.text}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowModal(false)}
                    className="flex-1 px-4 py-3 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors"
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitLoanRequest}
                    className="flex-1 px-4 py-3 bg-yellow-400 text-gray-800 font-bold rounded-lg hover:bg-yellow-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-800"></div>
                        Submitting...
                      </span>
                    ) : (
                      "Submit Request"
                    )}
                  </button>
                </div>

                {/* Info Text */}
                <p className="text-xs text-gray-500 text-center mt-4">
                  By submitting, you agree to our terms and conditions
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
