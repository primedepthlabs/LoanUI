"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  ArrowLeft,
  Calendar,
  CheckCircle,
  Clock,
  DollarSign,
  XCircle,
  QrCode,
  IndianRupee,
  Camera,
  Upload,
  Trash2,
  X,
} from "lucide-react";

// Interfaces
interface LoanApplication {
  id: string;
  loan_type: string;
  loan_amount: number;
  amount_received: number;
  tenure: number;
  tenure_unit: string;
  disbursement_interest: number;
  repayment_interest: number;
  payment_type: "weekly" | "monthly";
  installment_amount: number;
  last_installment_amount: number | null;
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
  paid_date?: string;
  payment_notes?: string;
  payment_screenshot_url?: string;
  payment_verification_status?: "pending" | "verified" | "rejected";
  payment_submitted_at?: string;
}
interface PaymentSettings {
  qr_code_url: string;
  payment_amount: number;
}
const MyLoanDetail = () => {
  const params = useParams();
  const router = useRouter();
  const loanId = params.loanId as string;

  const [loan, setLoan] = useState<LoanApplication | null>(null);
  const [emis, setEmis] = useState<LoanEMI[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedEMI, setSelectedEMI] = useState<LoanEMI | null>(null);
  const [paymentScreenshot, setPaymentScreenshot] = useState<File | null>(null);
  const [paymentSettings, setPaymentSettings] =
    useState<PaymentSettings | null>(null);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  useEffect(() => {
    if (loanId) {
      loadLoanDetails();
    }
  }, [loanId]);
  //
  useEffect(() => {
    if (!loanId) return;

    const channel = supabase
      .channel(`loan-emis-${loanId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "loan_emis",
          filter: `loan_application_id=eq.${loanId}`,
        },
        (payload) => {
          console.log("EMI updated:", payload);
          loadLoanDetails();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loanId]);

  // ✅ NEW: Realtime subscription for loan status
  useEffect(() => {
    if (!loanId) return;

    const channel = supabase
      .channel(`loan-application-${loanId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "loan_applications",
          filter: `id=eq.${loanId}`,
        },
        (payload) => {
          console.log("Loan updated:", payload);
          loadLoanDetails();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loanId]);
  //
  const loadLoanDetails = async () => {
    try {
      setIsLoading(true);

      // Get user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      // Get loan
      const { data: loanData, error: loanError } = await supabase
        .from("loan_applications")
        .select("*")
        .eq("id", loanId)
        .eq("user_id", user.id)
        .single();

      if (loanError) throw loanError;
      setLoan(loanData);

      // Get EMIs
      const { data: emisData, error: emisError } = await supabase
        .from("loan_emis")
        .select("*")
        .eq("loan_application_id", loanId)
        .order("emi_number", { ascending: true });

      if (emisError) throw emisError;

      // Auto-update overdue status
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const updatedEmis =
        emisData?.map((emi) => {
          const dueDate = new Date(emi.due_date);
          dueDate.setHours(0, 0, 0, 0);

          if (emi.status === "pending" && dueDate < today) {
            return { ...emi, status: "overdue" as const };
          }
          return emi;
        }) || [];

      setEmis(updatedEmis);
    } catch (err) {
      console.error("Load loan error:", err);
      setError("Failed to load loan details");
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case "paid":
        return "bg-green-100 text-green-800 border-green-200";
      case "pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "overdue":
        return "bg-red-100 text-red-800 border-red-200";
      case "partial":
        return "bg-blue-100 text-blue-800 border-blue-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "paid":
        return <CheckCircle className="w-4 h-4" />;
      case "pending":
        return <Clock className="w-4 h-4" />;
      case "overdue":
        return <XCircle className="w-4 h-4" />;
      case "partial":
        return <DollarSign className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const calculateProgress = () => {
    if (!emis.length || !loan)
      return {
        paidAmount: 0,
        remainingAmount: 0,
        percentage: 0,
        paidCount: 0,
        totalCount: 0,
      };

    const paidAmount = emis.reduce((sum, e) => sum + e.paid_amount, 0);
    const remainingAmount = loan.total_payable - paidAmount;
    const percentage = (paidAmount / loan.total_payable) * 100;
    const paidCount = emis.filter((e) => e.status === "paid").length;
    const totalCount = emis.length;

    return { paidAmount, remainingAmount, percentage, paidCount, totalCount };
  };

  const progress = calculateProgress();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading loan details...</p>
        </div>
      </div>
    );
  }

  if (error || !loan) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-sm p-8 max-w-md w-full text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Unable to Load Loan
          </h2>
          <p className="text-gray-600 mb-6">{error || "Loan not found"}</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-6 py-2 bg-yellow-400 text-gray-900 rounded-lg hover:bg-yellow-500 font-medium cursor-pointer"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }
  // Fetch payment settings
  const fetchPaymentSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("payment_settings")
        .select("qr_code_url, payment_amount")
        .single();
      if (error) throw error;
      setPaymentSettings(data as PaymentSettings);
    } catch (err) {
      console.error("Payment settings error:", err);
      setPaymentError("Failed to load payment settings");
    }
  };

  // Handle screenshot upload
  const handlePaymentScreenshotChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/jpg", "image/png"];
    const maxSize = 5 * 1024 * 1024;

    if (!validTypes.includes(file.type)) {
      setPaymentError("Please upload valid image (JPG, PNG)");
      return;
    }
    if (file.size > maxSize) {
      setPaymentError("File must be less than 5MB");
      return;
    }
    setPaymentScreenshot(file);
  };

  // Upload screenshot to storage
  const uploadPaymentScreenshot = async (
    file: File,
    userId: string
  ): Promise<string | null> => {
    try {
      const fileExtension = file.name.split(".").pop();
      const fileName = `${userId}/emi-payment-${Date.now()}.${fileExtension}`;

      const { data, error } = await supabase.storage
        .from("user-documents")
        .upload(fileName, file, { cacheControl: "3600", upsert: true });

      if (error) throw error;

      const { data: publicUrlData } = supabase.storage
        .from("user-documents")
        .getPublicUrl(fileName);

      return publicUrlData.publicUrl;
    } catch (err) {
      console.error("Upload error:", err);
      return null;
    }
  };

  // Submit payment
  const handleSubmitPayment = async () => {
    if (!paymentScreenshot || !selectedEMI) {
      setPaymentError("Please upload payment screenshot");
      return;
    }

    setIsSubmittingPayment(true);
    setPaymentError("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setPaymentError("User not authenticated");
        return;
      }

      // Upload screenshot
      const screenshotUrl = await uploadPaymentScreenshot(
        paymentScreenshot,
        user.id
      );
      if (!screenshotUrl) {
        setPaymentError("Failed to upload screenshot");
        return;
      }

      const { error } = await supabase
        .from("loan_emis")
        .update({
          payment_screenshot_url: screenshotUrl,
          payment_verification_status: "pending",
          payment_submitted_at: new Date().toISOString(),
          status: "pending", // Mark as pending only after user pays
        })
        .eq("id", selectedEMI.id);

      if (error) throw error;

      // Success - close modal and refresh
      setShowPaymentModal(false);
      setPaymentScreenshot(null);
      setSelectedEMI(null);
      loadLoanDetails();
    } catch (err) {
      console.error("Payment error:", err);
      setPaymentError("Failed to submit payment");
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Open/close modal
  const openPaymentModal = (emi: LoanEMI) => {
    setSelectedEMI(emi);
    setPaymentScreenshot(null);
    setPaymentError("");
    setShowPaymentModal(true);
    fetchPaymentSettings();
  };

  const closePaymentModal = () => {
    setShowPaymentModal(false);
    setSelectedEMI(null);
    setPaymentScreenshot(null);
    setPaymentError("");
  };
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

          <div className="relative max-w-4xl  mx-auto px-4 py-4">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-white mb-3 hover:text-gray-200 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm">Back</span>
            </button>

            <div className="text-white">
              <h1 className="text-xl font-bold">{loan.loan_type}</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-4 space-y-3">
        {/* Loan Summary Card - Ultra Minimal */}
        <div className="bg-white rounded-lg shadow-sm p-3">
          {/* Amount Received - Compact */}
          <div className="bg-green-50 rounded-lg p-2 mb-2">
            <p className="text-xs text-gray-600">You Received</p>
            <p className="text-2xl font-bold text-green-600">
              ₹{loan.amount_received.toLocaleString("en-IN")}
            </p>
          </div>

          {/* Total Payable - Compact */}
          <div className="bg-blue-50 rounded-lg p-2 mb-2">
            <p className="text-xs text-gray-600">Total Repay</p>
            <p className="text-2xl font-bold text-blue-600">
              ₹{loan.total_payable.toLocaleString("en-IN")}
            </p>
          </div>

          {/* Compact Grid */}
          <div className="grid grid-cols-3 gap-2 text-xs mb-2">
            <div className="text-center bg-gray-50 rounded p-2">
              <p className="text-gray-500">Disbursement</p>
              <p className="font-bold text-red-600">
                -{loan.disbursement_interest}%
              </p>
            </div>
            <div className="text-center bg-gray-50 rounded p-2">
              <p className="text-gray-500">Repayment</p>
              <p className="font-bold text-orange-600">
                +{loan.repayment_interest}%
              </p>
            </div>
            <div className="text-center bg-gray-50 rounded p-2">
              <p className="text-gray-500">Tenure</p>
              <p className="font-bold text-gray-800">
                {loan.tenure} {loan.payment_type === "weekly" ? "wks" : "mon"}
              </p>
            </div>
          </div>

          {/* EMI Info */}
          <div className="bg-yellow-50 rounded-lg p-2 mb-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600">
                  {loan.payment_type === "weekly" ? "Weekly" : "Monthly"} EMI
                </p>
                <p className="text-lg font-bold text-yellow-600">
                  ₹{loan.installment_amount.toLocaleString("en-IN")}
                </p>
              </div>
              {loan.last_installment_amount &&
                loan.last_installment_amount !== loan.installment_amount && (
                  <div className="text-right">
                    <p className="text-xs text-gray-600">Last EMI</p>
                    <p className="text-sm font-bold text-yellow-700">
                      ₹{loan.last_installment_amount.toLocaleString("en-IN")}
                    </p>
                  </div>
                )}
            </div>
          </div>

          {/* Progress - Minimal */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-600">
                {progress.paidCount}/{progress.totalCount} EMIs
              </span>
              <span className="font-semibold text-gray-800">
                {Math.round(progress.percentage)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
              <div
                className="bg-green-500 h-2 rounded-full transition-all"
                style={{ width: `${Math.min(progress.percentage, 100)}%` }}
              ></div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-green-600 font-semibold">
                ₹{progress.paidAmount.toLocaleString("en-IN")}
              </span>
              <span className="text-red-600 font-semibold">
                ₹{progress.remainingAmount.toLocaleString("en-IN")} left
              </span>
            </div>
          </div>
        </div>

        {/* EMI Schedule - Ultra Minimal */}
        <div className="bg-white rounded-lg shadow-sm p-3">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            EMI Schedule
          </h3>

          {emis.length === 0 ? (
            <p className="text-center text-gray-400 py-6 text-xs">No EMIs</p>
          ) : (
            <div className="space-y-2">
              {emis.map((emi, index) => {
                const isLastEMI = index === emis.length - 1;
                const isAdjustedLastEMI =
                  isLastEMI &&
                  loan.last_installment_amount &&
                  loan.last_installment_amount !== loan.installment_amount;

                return (
                  <div
                    key={emi.id}
                    className="border rounded-lg p-2 hover:shadow-md transition-shadow cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      {/* EMI Number - Compact */}
                      <div className="text-center min-w-[50px]">
                        <p className="text-lg font-bold text-gray-900">
                          {emi.emi_number}
                        </p>
                        {isAdjustedLastEMI && (
                          <span className="inline-block px-1.5 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded font-medium">
                            Last
                          </span>
                        )}
                      </div>

                      {/* Details - Compact */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs mb-1">
                          <Calendar className="w-3 h-3 text-gray-400" />
                          <p className="font-semibold text-gray-900">
                            {formatDate(emi.due_date)}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-gray-600">
                            ₹{emi.emi_amount.toLocaleString("en-IN")}
                          </span>
                          {emi.paid_amount > 0 && (
                            <span className="text-green-600 font-medium">
                              • Paid ₹{emi.paid_amount.toLocaleString("en-IN")}
                            </span>
                          )}
                        </div>

                        {emi.status === "partial" && (
                          <p className="text-xs text-blue-600 mt-1">
                            Left: ₹
                            {(emi.emi_amount - emi.paid_amount).toLocaleString(
                              "en-IN"
                            )}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Only show badge if payment screenshot exists OR emi is paid */}
                        {emi.payment_screenshot_url || emi.status === "paid" ? (
                          <>
                            {/* Show verification status if payment submitted */}
                            {emi.payment_screenshot_url &&
                            emi.payment_verification_status === "pending" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border bg-blue-100 text-blue-800 border-blue-200">
                                <Clock className="w-4 h-4" />
                                <span className="hidden sm:inline">
                                  Verifying...
                                </span>
                              </span>
                            ) : emi.payment_verification_status ===
                              "rejected" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border bg-red-100 text-red-800 border-red-200">
                                <XCircle className="w-4 h-4" />
                                <span className="hidden sm:inline">
                                  Rejected
                                </span>
                              </span>
                            ) : emi.status === "paid" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border bg-green-100 text-green-800 border-green-200">
                                <CheckCircle className="w-4 h-4" />
                                <span className="hidden sm:inline">Paid</span>
                              </span>
                            ) : null}
                          </>
                        ) : null}

                        {(emi.status === "pending" ||
                          emi.status === "overdue") &&
                          (!emi.payment_screenshot_url ||
                            emi.payment_verification_status === "rejected") && (
                            <button
                              onClick={() => openPaymentModal(emi)}
                              className="px-2 py-1 bg-yellow-500 hover:bg-yellow-600 text-white text-xs rounded font-medium transition-colors cursor-pointer"
                            >
                              {emi.payment_verification_status === "rejected"
                                ? "Retry"
                                : "Pay"}
                            </button>
                          )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Payment Instructions - Minimal */}
        <div className="bg-blue-50 rounded-lg p-2 border border-blue-200">
          <p className="text-xs text-blue-800 flex items-start gap-2">
            <DollarSign className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>Contact your loan officer to make EMI payments.</span>
          </p>
        </div>
      </div>
      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 sm:p-8 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                Pay EMI #{selectedEMI?.emi_number}
              </h2>
              <button
                onClick={closePaymentModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* EMI Amount */}
            <div className="mb-6 text-center bg-yellow-50 p-4 rounded-lg border-2 border-yellow-200">
              <p className="text-sm text-gray-600 mb-2">Amount to Pay</p>
              <div className="flex items-center justify-center text-4xl font-bold text-yellow-600">
                <IndianRupee className="w-8 h-8" />
                {selectedEMI?.emi_amount}
              </div>
            </div>

            {/* QR Code */}
            <div className="mb-6">
              <p className="text-sm font-medium text-gray-700 mb-3 text-center">
                Scan QR Code to Pay
              </p>
              <div className="border-2 border-yellow-200 rounded-lg p-4 bg-yellow-50 flex justify-center">
                {paymentSettings?.qr_code_url ? (
                  <img
                    src={paymentSettings.qr_code_url}
                    alt="QR Code"
                    className="w-64 h-64 object-contain"
                  />
                ) : (
                  <div className="w-64 h-64 flex items-center justify-center bg-white rounded">
                    <QrCode className="w-16 h-16 text-gray-300" />
                  </div>
                )}
              </div>
            </div>

            {/* Upload Screenshot */}
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
                  {paymentScreenshot ? "Change Screenshot" : "Click to upload"}
                </label>
                <p className="text-gray-500 text-xs mt-1">JPG, PNG up to 5MB</p>

                {paymentScreenshot && (
                  <div className="mt-3 bg-white p-3 rounded border-2 border-green-200 flex items-center justify-between">
                    <span className="text-xs text-gray-700 truncate">
                      {paymentScreenshot.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPaymentScreenshot(null)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Error Message */}
            {paymentError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-xs text-red-700">{paymentError}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              onClick={handleSubmitPayment}
              disabled={!paymentScreenshot || isSubmittingPayment}
              className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition-all ${
                !paymentScreenshot || isSubmittingPayment
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-yellow-500 hover:bg-yellow-600"
              }`}
            >
              {isSubmittingPayment ? (
                <div className="flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Processing...
                </div>
              ) : (
                <>
                  <CheckCircle className="inline w-5 h-5 mr-2" />
                  Submit Payment
                </>
              )}
            </button>

            <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="text-xs text-yellow-800 text-center">
                🔒 Payment will be verified by admin within 24 hours
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyLoanDetail;
